import { describe, expect, it } from 'vitest'
import { extractNumbers, isPortuguese, numberSupported, qualityControl, stripFillers } from '../src/engines/quality-control'
import { goodAnalysis } from './fixtures/analysis'
import { fact } from './helpers'

const facts = [
  fact({ id: 'f_spx', metric: 'SPX', label: 'S&P 500', value: 6550, change_pct: 1.2, previous_value: 6472.3 }),
  fact({ id: 'f_selic', metric: 'BR_SELIC_TARGET', category: 'MACRO', region: 'BR', label: 'Selic meta', value: 15, unit: '% a.a.', reference_period: '2026-09-17' }),
  fact({ id: 'f_dax', metric: 'DAX', label: 'DAX', value: 24000, market_status: 'OPEN', reference_period: '2026-09-29' }),
  fact({ id: 'f_conf', metric: 'NIKKEI', label: 'Nikkei', value: 44000, verification_status: 'CONFLICT' }),
]

describe('unsupported claim detection', () => {
  it('extracts pt-BR numbers', () => {
    const nums = extractNumbers('Fechou em 6.550 pontos (+1,2%), Selic 15,00% e dólar R$ 5,40; 129 mil pontos em 2026.')
    expect(nums.map((n) => n.candidates[0])).toEqual([6550, 1.2, 15, 5.4, 129, 2026])
    expect(nums.find((n) => n.raw.includes('129'))!.scale).toBe(1000)
  })
  it('accepts numbers backed by facts and flags invented ones', () => {
    const [n1] = extractNumbers('6.550 pontos')
    expect(numberSupported(n1, facts)).toBe(true)
    const [n2] = extractNumbers('subiu 3,7%')
    expect(numberSupported(n2, facts)).toBe(false)
    const [year] = extractNumbers('em 2026')
    expect(numberSupported(year, [])).toBe(true)
  })
})

describe('morning brief quality control', () => {
  it('passes a clean brief without corrections', () => {
    const { report } = qualityControl({ analysis: goodAnalysis(), facts, marketRows: [], agenda: [] })
    expect(report.corrections).toEqual([])
    expect(report.passed).toBe(true)
    expect(report.reading_minutes).toBeLessThanOrEqual(10)
  })
  it('removes items with unsupported numbers or unverified facts, and dedupes events', () => {
    const a = goodAnalysis()
    a.what_matters.push({ headline: 'Ibovespa dispara 4,8%', why_it_matters: 'Número inventado sem fato de suporte algum no pacote.', fact_ids: [], cluster_ids: [] })
    a.what_matters.push({ headline: 'Nikkei renova recorde', why_it_matters: 'O índice chegou a 44.000 pontos segundo a fonte primária.', fact_ids: ['f_conf'], cluster_ids: [] })
    a.what_matters.push({ headline: 'Fed segura juros de novo', why_it_matters: 'Mesma notícia repetida em outro item, que deveria ser removida.', fact_ids: [], cluster_ids: ['c_fed'] })
    const { analysis, report } = qualityControl({ analysis: a, facts, marketRows: [], agenda: [] })
    expect(analysis.what_matters).toHaveLength(5)
    expect(report.corrections.join(' ')).toMatch(/número sem fonte/)
    expect(report.corrections.join(' ')).toMatch(/CONFLICT/)
    expect(report.corrections.join(' ')).toMatch(/evento repetido/)
    expect(report.passed).toBe(true)
  })
  it('auto-adds a missing citation when a number matches exactly one fact', () => {
    const a = goodAnalysis()
    a.what_matters[1].fact_ids = []
    const { analysis, report } = qualityControl({ analysis: a, facts, marketRows: [], agenda: [] })
    expect(analysis.what_matters[1].fact_ids).toContain('f_spx')
    expect(report.passed).toBe(true)
  })
  it('never lets an open market be described as closed', () => {
    const a = goodAnalysis()
    a.what_matters.push({ headline: 'DAX fechou em alta', why_it_matters: 'O índice alemão fechou em 24.000 pontos nesta manhã.', fact_ids: ['f_dax'], cluster_ids: [] })
    const { report } = qualityControl({ analysis: a, facts, marketRows: [], agenda: [] })
    expect(report.corrections.join(' ')).toMatch(/fechado um mercado em negociação/)
  })
  it('strips AI filler phrases and rejects invented experiences', () => {
    expect(stripFillers('Vale ressaltar que o dólar caiu.')).toBe('O dólar caiu.')
    const a = goodAnalysis()
    a.uhnw_lens.push({ theme: null, text: 'Ontem conversei com um cliente meu que estava preocupado com o câmbio.', fact_ids: [], cluster_ids: [] })
    a.uhnw_lens.push({ theme: null, text: 'Em um cenário cada vez mais volátil, a diversificação importa para a família.', fact_ids: [], cluster_ids: [] })
    const { analysis, report } = qualityControl({ analysis: a, facts, marketRows: [], agenda: [] })
    expect(analysis.uhnw_lens).toHaveLength(1)
    expect(report.corrections.join(' ')).toMatch(/experiência pessoal inventada/)
    expect(report.corrections.join(' ')).toMatch(/expressões proibidas/)
  })
  it('replaces generic content formats and enforces reading time', () => {
    const a = goodAnalysis()
    a.content_lab.carousel.title = '5 dicas para investir melhor'
    const long = 'palavra '.repeat(400)
    for (let i = 0; i < 3; i++) a.macro_watch.EU.push({ text: `A economia de ${long}`.slice(0, 420), fact_ids: [], cluster_ids: [] })
    const { analysis, report } = qualityControl({ analysis: a, facts, marketRows: [], agenda: [] })
    expect(analysis.content_lab.carousel.title).toMatch(/removida/)
    expect(report.reading_minutes).toBeLessThanOrEqual(10)
  })
  it('keeps each event to 1–2 sentences and requires 5–7 events', () => {
    const a = goodAnalysis()
    a.what_matters[3].why_it_matters = 'Primeira frase curta. Segunda frase curta. Terceira frase que sobra.'
    const { analysis, report } = qualityControl({ analysis: a, facts, marketRows: [], agenda: [] })
    expect(analysis.what_matters[3].why_it_matters).toBe('Primeira frase curta. Segunda frase curta.')
    expect(report.corrections.join(' ')).toMatch(/2 frases/)
    const few = goodAnalysis()
    few.what_matters = few.what_matters.slice(0, 3)
    const r2 = qualityControl({ analysis: few, facts, marketRows: [], agenda: [] })
    expect(r2.report.passed).toBe(false)
    expect(r2.report.checks.find((c) => c.id === 'event_count')!.passed).toBe(false)
  })
  it('requires attribution for single-source news and blocks individualized advice', () => {
    const cluster = { id: 'c_one', title: 'Banco X anuncia plano', topic: 'corporate', region: 'BR', item_ids: [], sources: [{ source: 'Valor Econômico', url: 'https://valor.globo.com/x', headline: 'x' }], importance: 50, market_relevance: 50, uhnw_relevance: 10, social_relevance: 10, verification_status: 'UNVERIFIED', brief_date: '2026-09-29' } as never
    const a = goodAnalysis()
    a.what_matters.push({ headline: 'Banco X anuncia plano', why_it_matters: 'O banco anunciou um plano de expansão para o interior do país.', fact_ids: [], cluster_ids: ['c_one'] })
    a.uhnw_lens.push({ theme: 'alocação', text: 'Você deve comprar títulos longos agora, antes que a curva feche de vez.', fact_ids: [], cluster_ids: [] })
    const { analysis, report } = qualityControl({ analysis: a, facts, marketRows: [], agenda: [], clusters: [cluster] })
    expect(analysis.what_matters.map((w) => w.headline)).not.toContain('Banco X anuncia plano')
    expect(report.corrections.join(' ')).toMatch(/fonte única sem atribuição/)
    expect(report.corrections.join(' ')).toMatch(/recomendação individualizada/)
    a.what_matters[5].why_it_matters = 'Segundo o Valor, o banco anunciou um plano de expansão para o interior.'
  })
  it('target length is advisory, reading time is blocking', () => {
    const { report } = qualityControl({ analysis: goodAnalysis(), facts, marketRows: [], agenda: [] })
    const target = report.checks.find((c) => c.id === 'brief_target')!
    expect(target.severity).toBe('warn')
    expect(report.passed).toBe(true)
  })
  it('detects Portuguese', () => {
    expect(isPortuguese('O Banco Central manteve os juros e isso muda a conta para quem tem dívida.')).toBe(true)
    expect(isPortuguese('The central bank held rates and this is what that means for the market.')).toBe(false)
  })
})
