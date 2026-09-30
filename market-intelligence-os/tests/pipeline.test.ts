import { beforeEach, describe, expect, it, vi } from 'vitest'
import { collectMarkets } from '../src/agents/market-intelligence/collectors/market'
import { runMorningIntelligence, submitAnalysis } from '../src/agents/orchestrator'
import { opportunitiesFromEvents, preEventReviewDue } from '../src/agents/social-strategist'
import type { CollectionBundle } from '../src/agents/market-intelligence'
import { assetByMetric } from '../config/assets'
import { brazilHolidays, easter, parseIbgeCalendar, seedEvents } from '../src/engines/event-engine'
import { createResearchRequest, processResearchRequest, resolveMetric } from '../src/engines/research-broker'
import { auditSnapshot } from '../src/engines/audit'
import { detectPatterns, parseSocialImport } from '../src/social/metrics'
import { DATE, NOW, fact, freshRepo, news, obs } from './helpers'
import { goodAnalysis } from './fixtures/analysis'
import { toLocalDate } from '../src/core/time'

function bundle(): CollectionBundle {
  return {
    version: 1,
    collected_at: NOW.toISOString(),
    brief_date: DATE,
    collector_host: 'test',
    observations: [
      obs({ sourceId: 'stooq', metric: 'SPX', value: 6550, previousValue: 6472.3, changePct: 1.2 }),
      obs({ sourceId: 'fred', metric: 'SPX', value: 6550.4 }),
      obs({ sourceId: 'stooq', metric: 'NASDAQ', value: 22000 }),
      obs({ sourceId: 'bcb-sgs', metric: 'BR_SELIC_TARGET', category: 'MACRO', unit: '% a.a.', value: 15, referencePeriod: '2026-09-17', asOf: '2026-09-17T03:00:00Z' }),
    ],
    news: [
      news({ id: 'n1', headline: 'Fed holds interest rates steady', source_id: 'rss-bbc-business', source: 'BBC' }),
      news({ id: 'n2', headline: 'Fed mantém juros inalterados', source_id: 'rss-g1-economia', source: 'g1' }),
    ],
    health: [{ source_id: 'stooq:^spx', ok: true, items: 1, latency_ms: 10, error: null }, { source_id: 'rss-exame', ok: false, items: 0, latency_ms: 10, error: 'HTTP 403' }],
    errors: [{ step: 'collect_news', source: 'rss-exame', message: 'HTTP 403', at: NOW.toISOString() }],
    skipped: [],
    calendar: [],
  }
}

describe('failed / missing sources do not stop the system', () => {
  it('collector records failures and continues', async () => {
    const failing = (async () => {
      throw new Error('ECONNRESET')
    }) as unknown as typeof fetch
    const res = await collectMarkets(NOW, [assetByMetric('SPX')!], { fetchImpl: failing, retries: 0, backoffMs: 1 })
    expect(res.observations).toHaveLength(0)
    expect(res.errors.length).toBeGreaterThan(0)
    expect(res.health.every((h) => !h.ok)).toBe(true)
  })
})

describe('end-to-end: morning pipeline (deterministic + hand-off)', () => {
  let repo: ReturnType<typeof freshRepo>
  beforeEach(() => {
    repo = freshRepo()
  })

  it('runs Agent 1 → verification → Agent 3 → Agent 2 → snapshot, with observability', async () => {
    const res = await runMorningIntelligence(repo, { now: NOW, bundle: bundle(), mode: 'deterministic', skipNetworkCalendar: true, processResearch: false })
    expect(res.snapshot).not.toBeNull()
    const snap = res.snapshot!
    expect(snap.status).toBe('PUBLISHED') // daily deterministic snapshot is always published
    expect(snap.analysis_mode).toBe('deterministic')
    expect(snap.market_snapshot.find((r) => r.metric === 'SPX')).toMatchObject({ verification_status: 'VERIFIED', value: 6550 })
    expect(snap.market_snapshot.find((r) => r.metric === 'NASDAQ')!.verification_status).toBe('UNVERIFIED')
    expect(snap.market_snapshot.find((r) => r.metric === 'DAX')!.verification_status).toBe('UNAVAILABLE')
    expect(snap.news_snapshot).toHaveLength(1) // 2 stories → 1 event
    expect(snap.agenda.length).toBeGreaterThan(0)
    expect(snap.agenda.every((a) => a.source)).toBe(true)
    expect(snap.qc.passed).toBe(true)
    const runs = await repo.getRuns({ briefDate: DATE })
    expect(runs.map((r) => r.agent).sort()).toEqual(['financial-intelligence', 'market-intelligence', 'orchestrator', 'social-strategist'])
    expect(runs.find((r) => r.agent === 'market-intelligence')!.status).toBe('PARTIAL')
    const audit = auditSnapshot(snap, await repo.getLatestFactsForDate(DATE), runs)
    expect(audit.verdict).not.toBe('FAIL')
  })

  it('historical snapshots are append-only (never overwritten)', async () => {
    const a = await runMorningIntelligence(repo, { now: NOW, bundle: bundle(), mode: 'deterministic', skipNetworkCalendar: true, processResearch: false })
    const b = await runMorningIntelligence(repo, { now: NOW, bundle: bundle(), mode: 'deterministic', skipNetworkCalendar: true, processResearch: false })
    expect(a.snapshot!.version).toBe(1)
    expect(b.snapshot!.version).toBe(2)
    expect((await repo.getSnapshotVersions(DATE)).map((v) => v.version)).toEqual([2, 1])
    await expect(repo.store.insert('intelligence_snapshots', [{ ...a.snapshot! }])).rejects.toThrow(/append-only/)
    expect(await repo.listSnapshotDates()).toEqual([DATE])
  })

  it('Claude Code hand-off: packet → submitted analysis → published version with QC', async () => {
    const first = await runMorningIntelligence(repo, { now: NOW, bundle: bundle(), mode: 'claude_code', skipNetworkCalendar: true, processResearch: false })
    expect(first.status).toBe('AWAITING_ANALYSIS')
    // The deterministic snapshot is published right away; the packet waits for enrichment.
    expect(first.snapshot!.status).toBe('PUBLISHED')
    expect(first.snapshot!.analysis_mode).toBe('deterministic')
    const packet = await repo.getAnalysisPacket(DATE)
    expect(packet?.status).toBe('PENDING')
    const citable = (packet!.packet as { citable_facts: { id: string; label: string }[] }).citable_facts
    expect(citable.map((c) => c.label)).toContain('S&P 500')
    expect(citable.map((c) => c.label)).not.toContain('Nasdaq Composite') // UNVERIFIED never reaches Agent 2 as citable

    const spxId = citable.find((c) => c.label === 'S&P 500')!.id
    const selicId = citable.find((c) => c.label === 'Selic meta')!.id
    const clusterId = (packet!.packet as { clusters: { id: string }[] }).clusters[0].id
    const analysis = JSON.parse(JSON.stringify(goodAnalysis()).replaceAll('f_spx', spxId).replaceAll('f_selic', selicId).replaceAll('c_fed', clusterId))
    const snap = await submitAnalysis(repo, DATE, analysis, NOW)
    expect(snap.version).toBe(2)
    expect(snap.status).toBe('PUBLISHED')
    expect(snap.content_lab).not.toBeNull()
    expect(snap.qc.passed).toBe(true)
    expect((await repo.getAnalysisPacket(DATE))!.status).toBe('SUBMITTED')
    // Idempotent enrichment: the same submission returns the same version, no duplicate snapshot.
    const again = await submitAnalysis(repo, DATE, JSON.parse(JSON.stringify(analysis)), NOW)
    expect(again.id).toBe(snap.id)
    expect((await repo.getSnapshotVersions(DATE)).map((v) => v.version)).toEqual([2, 1])
    expect((await repo.getLatestPublishedSnapshot(DATE))!.analysis_mode).toBe('claude_code')
    await expect(submitAnalysis(repo, DATE, { nope: true }, NOW)).rejects.toThrow()
  })

  it('anthropic_api mode uses one structured call and survives LLM failure', async () => {
    const provider = await import('../src/llm/provider')
    const spy = vi.spyOn(provider, 'callStructured').mockResolvedValue({ output: null, stopReason: null, usage: null, model: 'm', error: 'boom' })
    const res = await runMorningIntelligence(repo, { now: NOW, bundle: bundle(), mode: 'anthropic_api', skipNetworkCalendar: true, processResearch: false })
    expect(spy).toHaveBeenCalledTimes(1)
    expect(res.snapshot!.status).toBe('PUBLISHED') // deterministic fallback, Agent 1 data preserved
    expect(res.snapshot!.analysis_mode).toBe('deterministic')
    expect(res.snapshot!.limitations.join(' ')).toMatch(/Interpretação indisponível/)
    spy.mockRestore()
  })
})

describe('research broker', () => {
  it('maps questions to metrics and answers from verified_facts only', async () => {
    const repo = freshRepo()
    expect(resolveMetric('Qual a Selic hoje?')).toBe('BR_SELIC_TARGET')
    expect(resolveMetric('Qual foi a reação exata do mercado ao dado X?')).toBeNull()
    await repo.upsertFacts([fact({ id: 'f1', metric: 'BR_SELIC_TARGET', category: 'MACRO', label: 'Selic meta', value: 15, unit: '% a.a.', brief_date: toLocalDate(new Date()) })])
    const r = await createResearchRequest(repo, { requested_by: 'social-strategist', question: 'Qual a Selic hoje?' })
    const done = await processResearchRequest(repo, r, new Date(), { allowNetwork: false })
    expect(done.status).toBe('COMPLETED')
    expect(done.response!.fact_ids).toEqual(['f1'])
    const unknown = await processResearchRequest(repo, await createResearchRequest(repo, { requested_by: 'social-strategist', question: 'Qual foi a reação exata do mercado ao dado X?' }), new Date(), { allowNetwork: false })
    expect(unknown.status).toBe('FAILED') // never improvises
  })
})

describe('event calendar', () => {
  it('computes Easter-based holidays', () => {
    expect(easter(2026)).toBe('2026-04-05')
    const h = brazilHolidays(2026)
    expect(h.find((e) => e.name.includes('Sexta-feira Santa'))!.date).toBe('2026-04-03')
    expect(h.find((e) => e.name.includes('Carnaval (terça'))!.date).toBe('2026-02-17')
    expect(h.find((e) => e.name.includes('Corpus Christi'))!.verification_status).toBe('UNVERIFIED')
  })
  it('seed events have sources and create anticipated opportunities', () => {
    const events = seedEvents()
    expect(events.every((e) => e.source && e.source_url)).toBe(true)
    const opps = opportunitiesFromEvents(events, '2026-10-01')
    expect(opps.some((o) => o.title.includes('Eleições'))).toBe(true)
    expect(preEventReviewDue(events, '2026-10-02').map((e) => e.name)).toContain('Eleições gerais — 1º turno')
  })
  it('parses IBGE release calendar', () => {
    const ev = parseIbgeCalendar({ items: [{ titulo: 'IPCA - Setembro 2026', data_divulgacao: '09/10/2026 09:00:00' }, { titulo: 'Pesquisa irrelevante', data_divulgacao: '10/10/2026' }] })
    expect(ev).toHaveLength(1)
    expect(ev[0]).toMatchObject({ date: '2026-10-09', importance: 'HIGH', verification_status: 'VERIFIED' })
  })
})

describe('social analytics (manual import)', () => {
  it('imports CSV with aliases and detects patterns', () => {
    const rows = ['post_id,date,format,content_type,reach,likes,comments,shares,saves,profile_visits,follows']
    for (let i = 0; i < 4; i++) rows.push(`c${i},2026-09-0${i + 1},reel,contextual,1000,50,5,40,30,20,5`)
    for (let i = 0; i < 4; i++) rows.push(`n${i},2026-09-1${i},reel,news,1000,50,5,10,10,20,2`)
    const posts = parseSocialImport(rows.join('\n'), 'csv')
    expect(posts).toHaveLength(8)
    const patterns = detectPatterns(posts)
    expect(patterns[0].statement).toMatch(/explicação contextual/)
    expect(patterns[0].winner).toBe('contextual')
  })
})
