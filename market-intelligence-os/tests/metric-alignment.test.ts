import { describe, expect, it } from 'vitest'
import { checkAlignment, mentionedAliases, metricTarget } from '../src/engines/metric-alignment'
import { extractNumbers, isExempt, numberSupported, qualityControl } from '../src/engines/quality-control'
import type { VerifiedFact } from '../src/core/schemas'
import { goodAnalysis } from './fixtures/analysis'
import { fact } from './helpers'

const macro = (id: string, metric: string, label: string, value: number, extra: Partial<VerifiedFact> = {}) =>
  fact({ id, metric, label, value, category: 'MACRO', region: 'BR', unit: '%', reference_period: '2026-09', verification_method: 'official_single', ...extra })

const IPCA = macro('f_ipca', 'BR_IPCA_MOM', 'IPCA (variação mensal)', -0.32, { reference_period: '2026-08' })
const IPCA15 = macro('f_ipca15', 'BR_IPCA15_MOM', 'IPCA-15 (variação mensal)', 0.7)
const IGPM = macro('f_igpm', 'BR_IGPM_MOM', 'IGP-M (variação mensal)', 1.57)
const PAYROLL = fact({ id: 'f_pay', metric: 'US_PAYROLLS_CHANGE', label: 'Payroll', value: 162, unit: 'mil', category: 'MACRO', reference_period: '2026-08' })
const FED = fact({ id: 'f_fed', metric: 'US_FED_FUNDS_UPPER', label: 'Fed Funds (teto)', value: 4, unit: '%', category: 'MACRO' })
const UST10 = fact({ id: 'f_ust', metric: 'US10Y', label: 'Treasury 10Y', value: 5.26, unit: '%' })
const SELIC = macro('f_selic', 'BR_SELIC_TARGET', 'Selic meta', 13.75, { unit: '% a.a.' })
const DI1 = fact({ id: 'f_di', metric: 'BR_DI1_12M', label: 'DI1 12M (DI1F27)', value: 13.55, unit: '% a.a.' })

const nums = (s: string) => extractNumbers(s).filter((t) => !isExempt(t)).map((t) => ({ raw: t.raw, supportedBy: (f: VerifiedFact) => numberSupported(t, [f]) }))
const run = (texts: string[], cited: string[], available: VerifiedFact[]) => {
  const byId = new Map(available.map((f) => [f.id, f]))
  return checkAlignment(texts, cited, byId, available, nums)
}

describe('metric alignment engine', () => {
  it('maps names to metric targets (IPCA-15 is never IPCA)', () => {
    expect(mentionedAliases('IPCA-15 surpreende em setembro').map((a) => a.id)).toEqual(['ipca15'])
    expect(mentionedAliases('O IPCA de agosto caiu').map((a) => a.id)).toEqual(['ipca'])
    expect(mentionedAliases('IGP-M sobe; Nonfarm Payrolls; FOMC; taxa de depósito do BCE; Selic').map((a) => a.id)).toEqual(['igpm', 'payroll', 'selic', 'fomc', 'ecb_rate'])
    expect(metricTarget('IPCA-15 surpreende e expõe fim da trégua dos alimentos')).toBe('BR_IPCA15_MOM')
    expect(metricTarget('Payroll americano')).toBe('US_PAYROLLS_CHANGE')
  })

  it('1. "IPCA-15 surpreende" backed by BR_IPCA_MOM → FAIL', () => {
    const r = run(['IPCA-15 surpreende em setembro'], ['f_ipca'], [IPCA])
    expect(r.issues.length).toBeGreaterThan(0)
    expect(r.issues.map((i) => i.kind)).toContain('metric_substitution')
  })
  it('2. "IPCA-15 surpreende" backed by BR_IPCA15_MOM = 0,70% → PASS', () => {
    expect(run(['IPCA-15 surpreende em setembro', 'A prévia subiu 0,70% em setembro.'], ['f_ipca15'], [IPCA15, IPCA]).issues).toEqual([])
  })
  it('3. no BR_IPCA15_MOM: PASS only when declared unavailable and no substitute is used', () => {
    expect(run(['IPCA-15 surpreende em setembro', 'O dado oficial do IPCA-15 ainda não está disponível na base verificada.'], [], [IPCA]).issues).toEqual([])
    expect(run(['IPCA-15 surpreende em setembro'], [], [IPCA]).issues.map((i) => i.kind)).toEqual(['metric_unavailable'])
    expect(run(['IPCA-15 surpreende em setembro', 'O dado do IPCA-15 ainda não está disponível.'], ['f_ipca'], [IPCA]).issues.map((i) => i.kind)).toContain('metric_substitution')
  })
  it('uses the correct fact when available (attached as primary evidence)', () => {
    const r = run(['IPCA-15 encerra a trégua dos alimentos', 'Depois de um IPCA de agosto em queda de 0,32%, a prévia surpreendeu.'], ['f_ipca'], [IPCA, IPCA15])
    expect(r.attach).toEqual(['f_ipca15'])
    expect(r.issues).toEqual([])
  })
  it('IGP-M vs IPCA mismatch → FAIL', () => {
    expect(run(['O IPCA subiu 1,57% em setembro.'], ['f_igpm'], [IGPM]).issues.map((i) => i.kind)).toContain('metric_substitution')
  })
  it('Payroll vs ADP mismatch → FAIL', () => {
    const r = run(['O ADP mostrou 162 mil vagas.'], ['f_pay'], [PAYROLL])
    expect(r.issues.map((i) => i.kind)).toContain('metric_substitution')
    expect(run(['O payroll mostrou 162 mil vagas.'], ['f_pay'], [PAYROLL]).issues).toEqual([])
  })
  it('FOMC vs Treasury mismatch → FAIL', () => {
    expect(run(['O FOMC levou a taxa a 5,26%.'], ['f_ust'], [UST10, FED]).issues.map((i) => i.kind)).toContain('metric_substitution')
  })
  it('Selic vs DI futuro mismatch → FAIL', () => {
    expect(run(['A Selic está em 13,55%.'], ['f_di'], [DI1, SELIC]).issues.map((i) => i.kind)).toContain('metric_substitution')
  })
  it('forward-looking mentions without a result claim do not require the fact', () => {
    expect(run(['Na sexta sai o payroll de setembro.'], [], []).issues).toEqual([])
  })
})

describe('QC blocks metric substitution in every block', () => {
  const facts = [IPCA, IGPM, fact({ id: 'f_spx', metric: 'SPX', label: 'S&P 500', value: 6550, change_pct: 1.2, previous_value: 6472.3 }), macro('f_selic', 'BR_SELIC_TARGET', 'Selic meta', 15, { unit: '% a.a.', reference_period: '2026-09-17' })]
  it('Content Lab "IPCA caiu, IPCA-15 subiu" with only the IPCA fact → blocked', () => {
    const a = goodAnalysis()
    a.content_lab.carousel = { title: 'IPCA caiu, IPCA-15 subiu: qual vale?', angle: 'Usar a queda do IPCA de agosto e a alta da prévia para explicar os índices.', main_idea: 'Índices medem períodos diferentes.', fact_ids: ['f_ipca'], cluster_ids: [] }
    const { analysis, report } = qualityControl({ analysis: a, facts, marketRows: [], agenda: [] })
    expect(report.corrections.join(' ')).toMatch(/IPCA-15/)
    expect(analysis.content_lab.carousel.title).toMatch(/removida/)
  })
  it('what_matters item "IPCA-15" backed by IPCA and IGP-M → removed; brief fails if count drops below 5', () => {
    const a = goodAnalysis()
    a.what_matters[4] = { headline: 'IPCA-15 encerra a trégua dos alimentos', why_it_matters: 'O IPCA-15 veio acima do esperado. O IGP-M subiu 1,57% em setembro.', fact_ids: ['f_ipca', 'f_igpm'], cluster_ids: [] }
    const { analysis, report } = qualityControl({ analysis: a, facts, marketRows: [], agenda: [] })
    expect(analysis.what_matters.map((w) => w.headline)).not.toContain('IPCA-15 encerra a trégua dos alimentos')
    expect(report.checks.find((c) => c.id === 'metric_alignment')!.passed).toBe(true) // removed, so the final text is clean
    expect(report.passed).toBe(false) // 4 events left
  })
  it('the correct fact is attached when available and the item survives', () => {
    const a = goodAnalysis()
    a.what_matters[4] = { headline: 'IPCA-15 encerra a trégua dos alimentos', why_it_matters: 'Segundo o Estadão, a prévia surpreendeu depois de um IPCA de agosto em queda de 0,32%.', fact_ids: ['f_ipca'], cluster_ids: [] }
    const { analysis, report } = qualityControl({ analysis: a, facts: [...facts, IPCA15], marketRows: [], agenda: [] })
    expect(analysis.what_matters[4].fact_ids[0]).toBe('f_ipca15')
    expect(report.corrections.join(' ')).toMatch(/evidência principal: IPCA-15/)
    expect(report.passed).toBe(true)
  })
})
