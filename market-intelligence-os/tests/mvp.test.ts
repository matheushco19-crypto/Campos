import { describe, expect, it } from 'vitest'
import { buildAgenda, endOfWeek, eventPriority } from '../src/agents/financial-intelligence/brief'
import type { CalendarEvent, IntelligenceSnapshot } from '../src/core/schemas'
import { IntelligenceSnapshot as SnapshotSchema } from '../src/core/schemas'
import { diagnoseBrief } from '../src/engines/diagnosis'
import { agendaTimeBRT } from '../src/lib/agenda'
import { diffVersions } from '../src/lib/version-diff'
import { normalizeSnapshot } from '../src/storage/repository'

const ev = (over: Partial<CalendarEvent>): CalendarEvent => ({
  id: over.name ?? 'e', name: 'Evento', category: 'MACRO', region: 'BR', date: '2026-09-30', time: null, timezone: 'America/Sao_Paulo', source: 'Fonte oficial', source_url: 'https://x.gov', importance: 'MEDIUM',
  market_relevance: 'MEDIUM', audience_relevance: 'MEDIUM', content_opportunity: null, verification_status: 'VERIFIED', notes: null, created_at: '', updated_at: '', ...over,
})

describe('agenda: buckets, priorities and editorial angle', () => {
  it('splits today / tomorrow / this week / upcoming', () => {
    // 2026-09-30 is a Wednesday → week ends Sunday 2026-10-04.
    expect(endOfWeek('2026-09-30')).toBe('2026-10-04')
    const agenda = buildAgenda([
      ev({ name: 'A', date: '2026-09-30' }),
      ev({ name: 'B', date: '2026-10-01' }),
      ev({ name: 'Payroll EUA', date: '2026-10-02', importance: 'HIGH' }),
      ev({ name: 'IBGE: IPCA', date: '2026-10-09', importance: 'HIGH' }),
    ], '2026-09-30')
    expect(agenda.map((a) => [a.name, a.bucket])).toEqual([['A', 'today'], ['B', 'tomorrow'], ['Payroll EUA', 'week'], ['IBGE: IPCA', 'upcoming']])
  })
  it('prioritises Copom, IPCA, Payroll, CPI, FOMC, ECB, PMI, fiscal, regulation, corporate', () => {
    const order = ['Copom — decisão', 'IBGE: IPCA', 'Payroll EUA', 'CPI EUA', 'FOMC — decisão', 'ECB — decisão', 'PMI industrial', 'Resultado primário do Tesouro', 'CVM: nova regra', 'Resultado trimestral']
    expect(order.map(eventPriority)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(eventPriority('Feriado')).toBe(20)
  })
  it('carries an editorial opportunity (event text or category angle), never for holidays', () => {
    const [a, h] = buildAgenda([ev({ name: 'FOMC', date: '2026-09-30' }), ev({ name: 'Feriado', category: 'HOLIDAY', date: '2026-09-30' })], '2026-09-30')
    expect(a.content_opportunity).toMatch(/mecanismo/)
    expect(h.content_opportunity).toBeNull()
  })
  it('converts event times to Brasília', () => {
    expect(agendaTimeBRT({ date: '2026-10-28', time: '14:00', timezone: 'America/New_York' })).toEqual({ time: '15:00', date: '2026-10-28', original: '14:00 NY' })
    expect(agendaTimeBRT({ date: '2026-10-01', time: '09:00', timezone: 'America/Sao_Paulo' }).original).toBeNull()
  })
})

const snap = (over: Partial<IntelligenceSnapshot>): IntelligenceSnapshot =>
  SnapshotSchema.parse({
    id: 's', date: '2026-09-30', version: 1, generated_at: '2026-09-30T08:10:00Z', run_id: 'r', status: 'PUBLISHED', analysis_mode: 'claude_code',
    market_snapshot: [], macro_snapshot: [], news_snapshot: [], what_matters: [], macro_watch: { BR: [], US: [], CN: [], EU: [] }, insights: [], uhnw_lens: [],
    content_lab: null, agenda: [], source_references: [], qc: { passed: true, checks: [], word_count: 1000, reading_minutes: 6.7, corrections: [] }, ...over,
  })

describe('history: append-only versions', () => {
  it('diffs two versions (headlines and data)', () => {
    const row = (value: number | null, status: string) => ({ metric: 'IBOV', label: 'Ibovespa', region: 'BR', value, unit: 'pts', change_pct: null, reference: '2026-09-29', market_status: 'CLOSED', verification_status: status, fact_id: 'f', is_stale: false, source_fallback: true })
    const v1 = snap({ version: 1, status: 'AWAITING_ANALYSIS', market_snapshot: [row(null, 'UNAVAILABLE')] as never, what_matters: [{ headline: 'Aaa', why_it_matters: 'x'.repeat(12), fact_ids: [], cluster_ids: [] }] })
    const v2 = snap({ version: 2, market_snapshot: [row(183827.6, 'UNVERIFIED')] as never, what_matters: [{ headline: 'Bbb', why_it_matters: 'y'.repeat(12), fact_ids: [], cluster_ids: [] }] })
    const d = diffVersions(v2, v1)
    expect(d.from.version).toBe(1)
    expect(d.headlinesAdded).toEqual(['Bbb'])
    expect(d.headlinesRemoved).toEqual(['Aaa'])
    expect(d.markets[0]).toMatchObject({ label: 'Ibovespa', from: null, to: 183827.6, statusFrom: 'UNAVAILABLE', statusTo: 'UNVERIFIED' })
  })
  it('older stored versions get the new optional fields without rewriting them', () => {
    const legacy = { ...snap({}), lede: undefined, content_lab: { story: { title: 'Ideia', hook: 'Um gancho', angle: 'Um ângulo qualquer', fact_ids: [], cluster_ids: [] }, carousel: { title: 'Ideia', hook: 'Um gancho', angle: 'Um ângulo qualquer', fact_ids: [], cluster_ids: [] }, reel: { title: 'Ideia', hook: 'Um gancho', angle: 'Um ângulo qualquer', fact_ids: [], cluster_ids: [] }, take: { title: 'Ideia', hook: 'Um gancho', angle: 'Um ângulo qualquer', fact_ids: [], cluster_ids: [] }, exceptional: null } } as unknown as IntelligenceSnapshot
    const n = normalizeSnapshot(legacy)!
    expect(n.lede).toBeNull()
    expect(n.content_lab!.reel.development).toBeNull()
    expect(n.content_lab!.story.hook).toBe('Um gancho')
  })
})

describe('diagnosis: why the brief did not appear', () => {
  const base = { date: '2026-09-30', nowLocal: '07:00', isToday: true, runs: [], versions: [], latest: null, packetStatus: null }
  it('published', () => {
    expect(diagnoseBrief({ ...base, versions: [{ version: 2, status: 'PUBLISHED', generated_at: '' }] }).state).toBe('PUBLISHED')
  })
  it('awaiting the interpretation step', () => {
    const latest = snap({ status: 'AWAITING_ANALYSIS' })
    expect(diagnoseBrief({ ...base, versions: [latest], latest, packetStatus: 'PENDING' }).state).toBe('AWAITING_ANALYSIS')
  })
  it('failed QC lists the blocking checks', () => {
    const latest = snap({ status: 'FAILED_QC', qc: { passed: false, word_count: 800, reading_minutes: 5, corrections: [], checks: [{ id: 'numbers_have_source', label: 'Todos os números têm fonte', passed: false, detail: 'número sem fonte: "3,7%"', severity: 'block' }] } })
    const d = diagnoseBrief({ ...base, versions: [latest], latest })
    expect(d.state).toBe('FAILED_QC')
    expect(d.detail.join(' ')).toMatch(/3,7%/)
  })
  it('before 05:00 it is scheduled; afterwards, no run is an error', () => {
    expect(diagnoseBrief({ ...base, nowLocal: '04:30' }).state).toBe('SCHEDULED')
    expect(diagnoseBrief(base).state).toBe('NOT_RUN')
  })
})
