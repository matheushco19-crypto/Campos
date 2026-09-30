import { describe, expect, it } from 'vitest'
import { assetByMetric, DERIVED_SPREADS } from '../config/assets'
import { buildRates } from '../src/agents/financial-intelligence/brief'
import { buildAnalysisPacket } from '../src/agents/financial-intelligence/packet'
import { parseSidraReleases } from '../src/agents/market-intelligence/collectors/macro'
import { describeSession } from '../src/agents/market-intelligence/collectors/market-status'
import { completedBars, sessionOf } from '../src/agents/market-intelligence/collectors/market'
import { businessDaysBetween, diMaturity, selectDiBucket } from '../src/agents/market-intelligence/collectors/di-curve'
import { parseB3DiFile, parseYahooChart } from '../src/agents/market-intelligence/collectors/parsers'
import { runMorningIntelligence } from '../src/agents/orchestrator'
import type { CalendarEvent, VerifiedFact } from '../src/core/schemas'
import { hardOverride, marketSignals, scoreClusters, selectClusters } from '../src/engines/relevance'
import { acquireLease, runKey, withJobLease } from '../src/storage/leases'
import { deriveSpread, verifyAll, verifyMarket } from '../src/verification/engine'
import { cluster, DATE, fact, freshRepo, news, NOW, obs } from './helpers'

const ctx = { briefDate: DATE, runId: 'r1', now: NOW }
const asset = (m: string) => assetByMetric(m)!

/* ------------------------------ verification_method ------------------------------ */

describe('verification_method', () => {
  it('official cross-check: US Treasury + FRED DGS10 (same official lineage) on the same date', () => {
    const f = verifyMarket(asset('US10Y'), [obs({ sourceId: 'us-treasury', metric: 'US10Y', value: 5.26, unit: '%' }), obs({ sourceId: 'fred', metric: 'US10Y', value: 5.26, unit: '%' })], ctx)
    expect(f).toMatchObject({ verification_status: 'VERIFIED', confidence: 'HIGH', verification_method: 'official_crosscheck' })
  })

  it('official single: the official publisher alone is VERIFIED/MEDIUM, never "independent"', () => {
    const f = verifyMarket(asset('US10Y'), [obs({ sourceId: 'us-treasury', metric: 'US10Y', value: 5.26, unit: '%' })], ctx)
    expect(f).toMatchObject({ verification_status: 'VERIFIED', confidence: 'MEDIUM', verification_method: 'official_single' })
  })

  it('independent cross-check: PTAX (BCB) + ECB reference rate (different lineages)', () => {
    const f = verifyMarket(asset('USDBRL'), [obs({ sourceId: 'bcb-ptax', metric: 'USDBRL', value: 5.2, unit: 'BRL' }), obs({ sourceId: 'ecb-fx', metric: 'USDBRL', value: 5.21, unit: 'BRL' })], ctx)
    expect(f).toMatchObject({ verification_status: 'VERIFIED', verification_method: 'independent_crosscheck', secondary_source: 'ecb-fx' })
  })

  it('IBOV with BRAPI only stays UNVERIFIED single_source: no second source is invented', () => {
    const f = verifyMarket(asset('IBOV'), [obs({ sourceId: 'brapi', metric: 'IBOV', value: 183827 })], ctx)
    expect(f).toMatchObject({ verification_status: 'UNVERIFIED', verification_method: 'single_source', secondary_source: null })
  })

  it('proxy: DXY computed from ECB rates is "proxy", never VERIFIED, and never confirms a real value', () => {
    const only = verifyMarket(asset('DXY'), [obs({ sourceId: 'ecb-fx', metric: 'DXY', value: 101.2, unit: 'idx' })], ctx)
    expect(only).toMatchObject({ verification_status: 'UNVERIFIED', verification_method: 'proxy' })
    const withReal = verifyMarket(asset('DXY'), [obs({ sourceId: 'fmp', metric: 'DXY', value: 101.21, unit: 'idx' }), obs({ sourceId: 'ecb-fx', metric: 'DXY', value: 101.2, unit: 'idx' })], ctx)
    expect(withReal.verification_status).toBe('UNVERIFIED')
    expect(withReal.primary_source).toBe('fmp')
    expect(withReal.secondary_source).toBeNull()
  })

  it('unofficial vendor (Yahoo) never counts toward VERIFIED', () => {
    const only = verifyMarket(asset('SPX'), [obs({ sourceId: 'yahoo', metric: 'SPX', value: 7670.84 })], ctx)
    expect(only).toMatchObject({ verification_status: 'UNVERIFIED', verification_method: 'unofficial_vendor' })
    const pair = verifyMarket(asset('SPX'), [obs({ sourceId: 'fred', metric: 'SPX', value: 7670.84 }), obs({ sourceId: 'yahoo', metric: 'SPX', value: 7670.84 })], ctx)
    expect(pair).toMatchObject({ verification_status: 'UNVERIFIED', verification_method: 'single_source', secondary_source: null })
    expect(pair.notes).toMatch(/não conta para verificação/)
  })

  it('conflict: two independent sources disagree on the same date → CONFLICT, no number picked', () => {
    const f = verifyMarket(asset('USDBRL'), [obs({ sourceId: 'bcb-ptax', metric: 'USDBRL', value: 5.2, unit: 'BRL' }), obs({ sourceId: 'ecb-fx', metric: 'USDBRL', value: 5.6, unit: 'BRL' })], ctx)
    expect(f).toMatchObject({ verification_status: 'CONFLICT', verification_method: 'conflict' })
  })

  it('common reference date: last observations with different dates are never compared', () => {
    const f = verifyMarket(asset('SPX'), [obs({ sourceId: 'fmp', metric: 'SPX', value: 7670.84, referencePeriod: '2026-09-28' }), obs({ sourceId: 'fred', metric: 'SPX', value: 7600, referencePeriod: '2026-09-25' })], ctx)
    expect(f).toMatchObject({ verification_status: 'UNVERIFIED', verification_method: 'single_source', secondary_source: null })
    expect(f.notes).toMatch(/datas diferentes não são comparadas/)
  })

  it('macro: official + republication agreeing → official_crosscheck; official alone → official_single', () => {
    const { facts } = verifyAll(
      [
        obs({ sourceId: 'ibge-sidra', metric: 'BR_IPCA15_MOM', value: 0.7, unit: '%', category: 'MACRO', referencePeriod: '2026-09', releasedAt: '2026-09-25T12:00:00.000Z' }),
        obs({ sourceId: 'bcb-sgs', metric: 'BR_IPCA15_MOM', value: 0.7, unit: '%', category: 'MACRO', referencePeriod: '2026-09' }),
        obs({ sourceId: 'bcb-sgs', metric: 'BR_SELIC_EFFECTIVE', value: 13.65, unit: '% a.a.', category: 'MACRO', referencePeriod: '2026-09-28' }),
      ],
      ctx,
      [],
    )
    expect(facts.find((f) => f.metric === 'BR_IPCA15_MOM')).toMatchObject({ verification_status: 'VERIFIED', verification_method: 'official_crosscheck', released_at: '2026-09-25T12:00:00.000Z', reference_period: '2026-09' })
    expect(facts.find((f) => f.metric === 'BR_SELIC_EFFECTIVE')).toMatchObject({ verification_status: 'VERIFIED', verification_method: 'official_single' })
  })
})

/* ------------------------------ IPCA-15 release dates ------------------------------ */

describe('IPCA-15 (SIDRA 7062) release date', () => {
  it('reads the release date of each period from /periodos', () => {
    const m = parseSidraReleases([
      { id: '202608', literals: ['202608'], modificacao: '26/08/2026' },
      { id: '202609', literals: ['202609'], modificacao: '25/09/2026' },
    ])
    expect(m.get('2026-09')).toBe('2026-09-25')
    expect(m.get('2026-08')).toBe('2026-08-26')
  })
})

/* ------------------------------ Session normalization ------------------------------ */

describe('session normalization', () => {
  const at = (iso: string) => new Date(iso)
  it('US: at 05:00 BRT the S&P value is the previous regular close, not intraday', () => {
    const s = sessionOf(asset('SPX'), '2026-09-29T08:00:00Z') // 04:00 New York
    expect(s.referenceDate).toBe('2026-09-28')
    const info = describeSession(asset('SPX'), 'fmp', s.referenceDate, s.asOf, 'PRE_MARKET')
    expect(info).toMatchObject({ session: 'regular_close', is_close: true, is_intraday: false, session_of: '2026-09-28', timezone: 'America/New_York' })
  })
  it('Brazil: B3 closed at 05:00 BRT → previous close; DI1 is a settlement', () => {
    expect(sessionOf(asset('IBOV'), '2026-09-29T08:00:00Z').referenceDate).toBe('2026-09-28')
    expect(describeSession(asset('BR_DI1_12M'), 'b3-arquivos', '2026-09-28', '2026-09-28T21:00:00Z', 'CLOSED')).toMatchObject({ session: 'settlement', is_close: true })
  })
  it('Europe: open at 05:00 BRT → today’s bar is dropped from daily series (never shown as close)', () => {
    const bars = [
      { period: '2026-09-28', value: 25300 },
      { period: '2026-09-29', value: 25343 },
    ]
    expect(completedBars(asset('DAX'), bars, at('2026-09-29T08:00:00Z')).map((b) => b.period)).toEqual(['2026-09-28'])
    expect(completedBars(asset('DAX'), bars, at('2026-09-29T16:00:00Z')).map((b) => b.period)).toEqual(['2026-09-28', '2026-09-29'])
    expect(describeSession(asset('DAX'), 'twelvedata', '2026-09-29', '2026-09-29T08:00:00Z', 'OPEN')).toMatchObject({ session: 'intraday', is_close: false, is_intraday: true })
  })
  it('Asia: after the Tokyo close, today’s bar is the close of today', () => {
    const bars = [{ period: '2026-09-29', value: 66753 }]
    expect(completedBars(asset('NIKKEI'), bars, at('2026-09-29T08:00:00Z'))).toHaveLength(1) // 17:00 Tokyo
    expect(describeSession(asset('NIKKEI'), 'twelvedata', '2026-09-29', '2026-09-29T06:30:00Z', 'CLOSED').session).toBe('regular_close')
  })
  it('FX: PTAX and ECB are fixings (final values)', () => {
    expect(describeSession(asset('USDBRL'), 'bcb-ptax', '2026-09-28', '2026-09-28T16:30:00Z', 'CLOSED')).toMatchObject({ session: 'fixing', is_close: true, is_intraday: false })
    expect(describeSession(asset('EURBRL'), 'ecb-fx', '2026-09-28', '2026-09-28T12:15:00Z', 'CLOSED').session).toBe('fixing')
  })
  it('crypto: continuous market, no close', () => {
    expect(describeSession(asset('BTCUSD'), 'coinbase', '2026-09-29', NOW.toISOString(), 'OPEN')).toMatchObject({ session: 'continuous', is_close: false, is_intraday: false })
  })
  it('verified facts carry the session of the primary observation', () => {
    const session = describeSession(asset('USDBRL'), 'bcb-ptax', '2026-09-28', '2026-09-28T16:30:00Z', 'CLOSED')
    const f = verifyMarket(asset('USDBRL'), [obs({ sourceId: 'bcb-ptax', metric: 'USDBRL', value: 5.2, unit: 'BRL', session })], ctx)
    expect(f.session?.session).toBe('fixing')
  })
})

/* ------------------------------ Curves ------------------------------ */

const B3_FILE = [
  'Status do Arquivo: Final',
  'RptDt;TckrSymb;ISIN;SgmtNm;MinPric;MaxPric;TradAvrgPric;LastPric;OscnPctg;AdjstdQt;AdjstdQtTax;RefPric;TradQty;FinInstrmQty;NtlFinVol',
  '2026-09-29;DI1V26;X;FINANCIAL;;;;;;99900,1;13,65;;0;0;0',
  '2026-09-29;DI1X26;X;FINANCIAL;;;;;;98800,1;13,66;;10;0;0',
  '2026-09-29;DI1F27;X;FINANCIAL;13,545;13,56;13,551;13,55;-0,06;96824,27;13,55;;3043;369715;0',
  '2026-09-29;DI1J27;X;FINANCIAL;;;;;;93000,1;13,40;;100;0;0',
  '2026-09-29;DI1V27;X;FINANCIAL;;;;;;88000,1;13,10;;1000;0;0',
  '2026-09-29;DI1F28;X;FINANCIAL;;;;;;85000,1;12,95;;900;0;0',
  '2026-09-29;DI1F29;X;FINANCIAL;;;;;;75000,1;12,80;;500;0;0',
  '2026-09-29;DI1F31;X;FINANCIAL;;;;;;60000,1;12,90;;300;0;0',
  '2026-09-29;PETR4;X;EQUITY;;;;;;;;;1;0;0',
].join('\n')

describe('rate curves', () => {
  it('Treasury vertices + deterministic 2s10s / 5s30s spreads with daily bps change', () => {
    const t = (metric: string, value: number, previous: number) => fact({ id: `f_${metric}`, metric, label: metric, value, previous_value: previous, unit: '%', reference_period: '2026-09-29', verification_method: 'official_crosscheck' })
    const facts = [t('US_UST_3M', 4.25, 4.28), t('US_UST_2Y', 4.89, 4.92), t('US_UST_5Y', 5.06, 5.06), t('US10Y', 5.26, 5.24), t('US_UST_30Y', 5.59, 5.56)]
    const spreads = DERIVED_SPREADS.map((d) => deriveSpread(d, facts, ctx))
    expect(spreads[0]).toMatchObject({ metric: 'US_SPREAD_2S10S', value: 37, previous_value: 32, verification_status: 'VERIFIED', verification_method: 'derived', unit: 'bps' })
    expect(spreads[1]).toMatchObject({ metric: 'US_SPREAD_5S30S', value: 53, previous_value: 50 })
    expect(spreads[0].notes).toMatch(/Cálculo: US10Y 5.26% − US_UST_2Y 4.89% = 37 bps/)
    const rates = buildRates([...facts, ...spreads])
    expect(rates.treasury.map((v) => v.tenor)).toEqual(['3M', '2Y', '5Y', '10Y', '30Y'])
    expect(rates.treasury.find((v) => v.tenor === '10Y')).toMatchObject({ change_bps: 2, highlight: true })
    expect(rates.treasury.find((v) => v.tenor === '3M')).toMatchObject({ change_bps: -3, highlight: false })
    expect(rates.spreads.find((v) => v.metric === 'US_SPREAD_2S10S')!.change_bps).toBe(5)
  })

  it('spreads are not computed across different reference dates', () => {
    const facts = [fact({ id: 'a', metric: 'US10Y', value: 5.26, reference_period: '2026-09-29' }), fact({ id: 'b', metric: 'US_UST_2Y', value: 4.89, reference_period: '2026-09-28' })]
    expect(deriveSpread(DERIVED_SPREADS[0], facts, ctx)).toMatchObject({ value: null, verification_status: 'UNAVAILABLE' })
  })

  it('DI1: parses the B3 file and picks the real contract nearest to each bucket (tie → shorter)', () => {
    const { status, rows } = parseB3DiFile(B3_FILE)
    expect(status).toBe('Final')
    expect(rows).toHaveLength(8)
    expect(diMaturity('DI1F27')).toBe('2027-01-04') // 01/01 holiday, 02-03 weekend
    const prev = rows.map((r) => ({ ...r, date: '2026-09-28', rate: r.rate + 0.05 }))
    const pick12 = selectDiBucket(rows, '12M', 365, prev)!
    expect(pick12).toMatchObject({ code: 'DI1V27', rate: 13.1, previous: 13.15 })
    expect(pick12.business_days).toBe(businessDaysBetween('2026-09-29', pick12.maturity))
    expect(selectDiBucket(rows, '1M', 30)!.code).toBe('DI1X26')
    expect(selectDiBucket(rows, '3M', 91)!.code).toBe('DI1F27')
    expect(selectDiBucket(rows, '60M', 1826)!.code).toBe('DI1F31')
    // No contract near 36M (≈2029-09) within 25% → bucket left empty instead of inventing a vertex.
    const sparse = rows.filter((r) => !['DI1F29', 'DI1F31'].includes(r.code))
    expect(selectDiBucket(sparse, '36M', 1095)).toBeNull()
  })

  it('Yahoo chart JSON parses into daily bars (structured JSON only)', () => {
    const j = { chart: { result: [{ meta: { regularMarketTime: 1790726280, currency: 'USD', exchangeTimezoneName: 'America/New_York' }, timestamp: [1790602200, 1790688600], indicators: { quote: [{ close: [7600.1, 7670.84] }] } }], error: null } }
    const r = parseYahooChart(j)
    expect(r.bars.at(-1)!.value).toBe(7670.84)
    expect(r.currency).toBe('USD')
  })
})

/* ------------------------------ Relevance ------------------------------ */

describe('relevance, overrides, coverage and watchlist', () => {
  const items = [
    news({ id: 'n1', headline: 'Copom mantém Selic em 15%', source_id: 'rss-bcb-notas', topic: 'monetary_policy', region: 'BR', importance: 90, market_relevance: 90, uhnw_relevance: 70, published_at: '2026-09-29T01:00:00Z' }),
    news({ id: 'n2', headline: 'Empresa de varejo abre loja nova', source_id: 'rss-exame', topic: 'corporate', region: 'BR', importance: 20, market_relevance: 20, uhnw_relevance: 10, published_at: '2026-09-27T01:00:00Z' }),
  ]
  const c1 = cluster({ id: 'c1', title: items[0].headline, topic: 'monetary_policy', region: 'BR', item_ids: ['n1'], sources: [{ source: 'BCB', url: 'https://x/1', headline: items[0].headline }, { source: 'Valor', url: 'https://x/2', headline: 'Copom mantém a Selic' }], importance: 90, market_relevance: 90, uhnw_relevance: 70, last_published_at: '2026-09-29T01:00:00Z', relevance_score: 0 })
  const c2 = cluster({ id: 'c2', title: items[1].headline, topic: 'corporate', region: 'BR', item_ids: ['n2'], sources: [{ source: 'Exame', url: 'https://x/3', headline: items[1].headline }], importance: 20, market_relevance: 20, uhnw_relevance: 10, last_published_at: '2026-09-27T01:00:00Z', relevance_score: 0 })

  it('relevance_score 0–100 from the six weighted components', () => {
    const [a, b] = scoreClusters([c1, c2], items, DATE)
    expect(a.relevance_score).toBeGreaterThan(b.relevance_score)
    expect(Object.keys(a.relevance_components).sort()).toEqual(['authority', 'market_impact', 'materiality', 'novelty', 'sources', 'wealth'])
    expect(a.relevance_components.authority).toBe(10) // official source
    expect(a.relevance_score).toBeLessThanOrEqual(100)
    expect(a.metric_target).toBe('BR_SELIC_TARGET')
    expect(a.domain).toBe('monetary')
  })

  it('hard override: central bank / inflation / war / sanctions are flagged; a store opening is not', () => {
    expect(hardOverride('Copom mantém Selic em 15%')?.id).toBe('central_bank')
    expect(hardOverride('IPCA-15 surpreende em setembro')?.id).toBe('inflation')
    expect(hardOverride('EUA anunciam novas sanções à Rússia')?.id).toBe('geopolitics')
    expect(hardOverride('Empresa de varejo abre loja nova')).toBeNull()
  })

  it('an override is never lost even when its score is low; it is not forced to be the headline', () => {
    const low = cluster({ id: 'c_war', title: 'Guerra: ataque a navio no Mar Vermelho', topic: 'geopolitics', region: 'GLOBAL', relevance_score: 5, hard_override: true, hard_override_reason: 'Geopolítica / guerra / sanções' })
    const high = Array.from({ length: 20 }, (_, i) => cluster({ id: `c${i}`, title: `Evento ${i}`, topic: 'markets', region: 'US', relevance_score: 80 - i }))
    const sel = selectClusters([...high, low], { topMax: 14 })
    expect(sel.top.map((c) => c.id)).toContain('c_war')
    expect(sel.top[0].id).not.toBe('c_war')
    expect(sel.top.length).toBeLessThanOrEqual(14)
  })

  it('coverage matrix: floor promotes an eligible cluster, and uncovered categories stay flagged (never filled)', () => {
    const us = Array.from({ length: 16 }, (_, i) => cluster({ id: `u${i}`, title: `EUA ${i}`, topic: i % 2 ? 'markets' : 'economy', region: 'US', relevance_score: 90 - i }))
    const europe = cluster({ id: 'eu1', title: 'Zona do euro: PMI', topic: 'economy', region: 'EU', relevance_score: 40 })
    const sel = selectClusters([...us, europe])
    const cell = (id: string) => sel.coverage.find((c) => c.id === id)!
    expect(cell('europe')).toMatchObject({ covered: true, cluster_ids: ['eu1'] })
    expect(sel.top.map((c) => c.id)).toContain('eu1')
    expect(cell('asia').covered).toBe(false)
    expect(cell('asia').note).toMatch(/Não preenchido artificialmente/)
    expect(sel.coverage.filter((c) => c.scope === 'BR')).toHaveLength(4)
    expect(sel.coverage.filter((c) => c.scope === 'WORLD')).toHaveLength(6)
  })

  it('watchlist: the next 15–25 clusters are kept (persisted, no tokens); the rest is tail', () => {
    const many = Array.from({ length: 50 }, (_, i) => cluster({ id: `m${i}`, title: `Evento ${i}`, topic: (['markets', 'economy', 'fiscal', 'corporate', 'commodities'] as const)[i % 5], region: 'US', relevance_score: 95 - i }))
    const sel = selectClusters(many)
    expect(sel.top.length).toBe(14)
    expect(sel.watchlist.length).toBe(25)
    expect(sel.tail.length).toBe(11)
    expect(sel.all.filter((c) => c.rank_bucket === 'watchlist')).toHaveLength(25)
  })

  it('market shock signals: thresholds from config, text states the move only (no cause)', () => {
    const facts = [
      fact({ id: 'f_brl', metric: 'USDBRL', label: 'USD/BRL', value: 5.4, change_pct: 2.1, unit: 'BRL' }),
      fact({ id: 'f_ust', metric: 'US10Y', label: 'Treasury 10Y', value: 5.26, previous_value: 5.1, unit: '%' }),
      fact({ id: 'f_spx', metric: 'SPX', label: 'S&P 500', value: 7670, change_pct: 0.4 }),
    ]
    const s = marketSignals(facts)
    expect(s.map((x) => x.metric).sort()).toEqual(['US10Y', 'USDBRL'])
    expect(s.find((x) => x.metric === 'US10Y')).toMatchObject({ move: 16, unit: 'bps' })
    expect(s.map((x) => x.text).join(' ')).not.toMatch(/porque|devido|após|reflete|em razão/i)
    const scored = scoreClusters([cluster({ id: 'cb', title: 'Dólar dispara e fecha em alta', topic: 'markets', region: 'BR', market_relevance: 30 })], [], DATE, s)
    expect(scored[0]).toMatchObject({ hard_override: true, hard_override_reason: 'Movimento extraordinário de mercado' })
    expect(scored[0].market_signals[0]).toMatch(/USD\/BRL/)
  })
})

/* ------------------------------ Packet budget ------------------------------ */

describe('Agent 2 packet budget', () => {
  it('respects the char/fact/cluster/agenda limits with deterministic truncation and priority', () => {
    const facts: VerifiedFact[] = [
      fact({ id: 'core', metric: 'IBOV', label: 'Ibovespa' }),
      ...Array.from({ length: 60 }, (_, i) => fact({ id: `x${i}`, metric: `EXTRA_${String(i).padStart(2, '0')}`, label: `Extra ${i}` })),
    ]
    const clusters = Array.from({ length: 30 }, (_, i) => cluster({ id: `c${i}`, title: `Evento ${i} `.repeat(8), rank_bucket: i < 14 ? 'top' : 'watchlist', relevance_score: 90 - i, hard_override: i === 13 }))
    const events = Array.from({ length: 40 }, (_, i) => ({ id: `e${i}`, date: DATE, time: null, name: `Evento de agenda ${i}`, region: 'BR', importance: i % 3 ? 'LOW' : 'HIGH', verification_status: 'VERIFIED' }) as unknown as CalendarEvent)
    const summaries = new Map(clusters.map((c) => [c.id, 'Resumo longo. '.repeat(40)]))
    const p = buildAnalysisPacket(DATE, facts, clusters, events, summaries, [], [], { maxChars: 12_000, maxFacts: 32, maxClusters: 14, maxAgenda: 12, summaryChars: 240 })
    expect(p.citable_facts.length).toBeLessThanOrEqual(32)
    expect(p.citable_facts[0].metric).toBe('IBOV') // core first
    expect(p.clusters.length).toBeLessThanOrEqual(14)
    expect(p.clusters[0].id).toBe('c13') // hard override first
    expect(p.clusters.map((c) => c.id)).toContain('c13') // never trimmed
    expect(p.agenda.length).toBeLessThanOrEqual(12)
    expect(p.budget.chars).toBeLessThanOrEqual(12_000)
    expect(p.budget.chars).toBe(JSON.stringify({ ...p, budget: { ...p.budget, chars: 0, estimated_tokens: 0 } }).length)
    expect(p.budget.estimated_tokens).toBe(Math.ceil(p.budget.chars / 4))
    expect(p.budget.truncated.length).toBeGreaterThan(0)
    expect(JSON.stringify(p)).not.toMatch(/<html|<p>|<div/i)
  })
})

/* ------------------------------ Persistent lock ------------------------------ */

describe('job_leases: duplicate cron and concurrency', () => {
  it('two concurrent morning runs for the same day → one run, one snapshot', async () => {
    const repo = freshRepo()
    const key = runKey('MORNING_INTELLIGENCE', DATE)
    const run = () =>
      withJobLease(repo, 'MORNING_INTELLIGENCE', key, async () => {
        const r = await runMorningIntelligence(repo, { now: NOW, date: DATE, bundle: { version: 1, collected_at: NOW.toISOString(), brief_date: DATE, collector_host: 'test', observations: [obs({ sourceId: 'fred', metric: 'SPX', value: 7670 })], news: [], health: [], errors: [], skipped: [], calendar: [] }, mode: 'deterministic', skipNetworkCalendar: true, processResearch: false })
        return { status: r.status, snapshot: r.snapshot?.id ?? null }
      })
    const [a, b] = await Promise.all([run(), run()])
    expect([a.ran, b.ran].filter(Boolean)).toHaveLength(1)
    const loser = (a.ran ? b : a) as { ran: false; reason: string }
    expect(loser.reason).toBe('running')
    expect(await repo.getSnapshotVersions(DATE)).toHaveLength(1)
    expect((await repo.getRuns({ briefDate: DATE })).filter((r) => r.agent === 'orchestrator')).toHaveLength(1)
    // A late duplicate cron call after completion is skipped too.
    const late = await run()
    expect(late).toMatchObject({ ran: false, reason: 'completed' })
    expect(await repo.getSnapshotVersions(DATE)).toHaveLength(1)
  })

  it('an expired RUNNING lease can be taken over by exactly one caller', async () => {
    const repo = freshRepo()
    const key = runKey('MORNING_INTELLIGENCE', DATE)
    const first = await acquireLease(repo, 'MORNING_INTELLIGENCE', key, { ttlMs: 1000, now: new Date('2026-09-29T08:00:00Z') })
    expect(first.acquired).toBe(true)
    const later = new Date('2026-09-29T08:30:00Z')
    const [x, y] = await Promise.all([acquireLease(repo, 'MORNING_INTELLIGENCE', key, { now: later }), acquireLease(repo, 'MORNING_INTELLIGENCE', key, { now: later })])
    expect([x.acquired, y.acquired].filter(Boolean)).toHaveLength(1)
  })
})

/* ------------------------------ System health ------------------------------ */

import { computeSystemHealth } from '../src/engines/system-health'
import type { AgentRun, IntelligenceSnapshot } from '../src/core/schemas'

describe('system health', () => {
  const run = (agent: string, status: string, sources: AgentRun['sources'] = [], meta: Record<string, unknown> = {}) =>
    ({ run_id: `${agent}-1`, agent, job: 'MORNING_INTELLIGENCE', brief_date: DATE, started_at: '2026-09-29T08:01:00Z', finished_at: '2026-09-29T08:03:00Z', status, sources, errors: [], execution_metadata: meta }) as unknown as AgentRun
  const snapshot = { date: DATE, version: 1, generated_at: '2026-09-29T08:03:00Z', analysis_mode: 'deterministic' } as IntelligenceSnapshot
  const core = ['IBOV', 'SPX', 'NASDAQ', 'DJI', 'USDBRL', 'EURBRL', 'US10Y', 'BTCUSD'].map((m, i) => fact({ id: m, metric: m, verification_status: i < 4 ? 'UNVERIFIED' : 'VERIFIED' }))
  const now = new Date('2026-09-29T12:00:00Z')

  it('a single secondary provider down is not a global failure', () => {
    const sources = [
      { source_id: 'bcb-ptax:1', ok: true, items: 1, latency_ms: 1, error: null },
      { source_id: 'ecb-fx:USD', ok: true, items: 1, latency_ms: 1, error: null },
      { source_id: 'kraken:XBTUSD', ok: false, items: 0, latency_ms: 1, error: 'timeout' },
      { source_id: 'coinbase:BTC-USD', ok: true, items: 1, latency_ms: 1, error: null },
      { source_id: 'sgs:432', ok: true, items: 1, latency_ms: 1, error: null },
      { source_id: 'rss-g1-economia', ok: true, items: 5, latency_ms: 1, error: null },
    ]
    const h = computeSystemHealth({ now, runs: [run('market-intelligence', 'PARTIAL', sources), run('financial-intelligence', 'AWAITING_ANALYSIS', [], { packet_chars: 21000, packet_estimated_tokens: 5250 }), run('social-strategist', 'SUCCESS')], lastPublished: snapshot, facts: core, packetStatus: 'PENDING' })
    expect(h.status).toBe('HEALTHY')
    expect(h.core).toMatchObject({ verified: 4, total: 8 })
    expect(h.providers.find((p) => p.source === 'kraken')!.status).toBe('down')
    expect(h.lastSuccess.macro).not.toBeNull()
    expect(h.lastSuccess.news).not.toBeNull()
    expect(h.packet).toMatchObject({ chars: 21000, estimatedTokens: 5250, status: 'PENDING' })
  })
  it('DEGRADED when a core market has no usable value; FAILED with no published snapshot', () => {
    const broken = core.map((f) => (f.metric === 'USDBRL' ? { ...f, verification_status: 'UNAVAILABLE' as const } : f))
    expect(computeSystemHealth({ now, runs: [run('market-intelligence', 'SUCCESS')], lastPublished: snapshot, facts: broken, packetStatus: null }).status).toBe('DEGRADED')
    expect(computeSystemHealth({ now, runs: [run('market-intelligence', 'SUCCESS')], lastPublished: null, facts: core, packetStatus: null }).status).toBe('FAILED')
  })
})

/* ------------------------------ Regressions from the real 30/09 run ------------------------------ */

import { freshRelease } from '../src/engines/relevance'
import { isPortuguese } from '../src/engines/quality-control'

describe('real-run regressions (30/09/2026)', () => {
  it('news naming a metric released within the window is the official release: ranked above generic mentions', () => {
    const ipca15 = fact({ id: 'f15', metric: 'BR_IPCA15_MOM', label: 'IPCA-15 (variação mensal)', value: 0.7, category: 'MACRO', released_at: '2026-09-25', reference_period: '2026-09' })
    expect(freshRelease('BR_IPCA15_MOM', [ipca15], '2026-09-30')?.id).toBe('f15')
    expect(freshRelease('BR_IPCA15_MOM', [ipca15], '2026-10-20')).toBeNull()
    const release = cluster({ id: 'r', title: 'IPCA-15 surpreende e expõe fim da trégua dos alimentos', topic: 'economy', region: 'BR', importance: 61, market_relevance: 60, sources: [{ source: 'Estadão', url: 'https://x/1', headline: 'IPCA-15 surpreende' }], relevance_score: 0 })
    const mention = cluster({ id: 'm', title: 'Dólar abre em queda, com inflação dos EUA e contas públicas no foco', topic: 'markets', region: 'US', importance: 55, market_relevance: 70, sources: [{ source: 'g1', url: 'https://x/2', headline: 'Dólar abre em queda' }], relevance_score: 0 })
    const [r, m] = scoreClusters([release, mention], [], DATE, [], [ipca15])
    expect(r.hard_override_reason).toBe('Divulgação oficial: IPCA-15 (variação mensal)')
    expect(r.relevance_score).toBeGreaterThan(m.relevance_score)
    const sel = selectClusters([r, m])
    expect(sel.top.map((c) => c.id)).toEqual(['r', 'm']) // different override classes: both kept
  })
  it('a physical "ataque" to a person is not a geopolitical override; war/nuclear alerts are', () => {
    expect(hardOverride('Deputado relata ter sofrido ataque a tiros')).toBeNull()
    expect(hardOverride('Rússia emite alerta nuclear à Otan')?.id).toBe('geopolitics')
  })
  it('short Portuguese headlines are recognized as Portuguese; English ones are not', () => {
    expect(isPortuguese('Briga entre pilotos faz voo com destino a Israel pousar na Arábia Saudita. Reportado por 3 fontes (CNN Brasil, InfoMoney, Valor Econômico).')).toBe(true)
    expect(isPortuguese('ECB amends monetary policy implementation guidelines as part of the regular review of the framework')).toBe(false)
  })
  it('roundup headlines ("Agenda do dia") lose materiality: they announce events, they are not the event', () => {
    const base = { topic: 'economy' as const, region: 'BR' as const, importance: 60, market_relevance: 50, sources: [{ source: 'A', url: 'https://x/a', headline: 'x' }], relevance_score: 0 }
    const [a, b] = scoreClusters([cluster({ id: 'a', title: 'Agenda do dia: PCE nos EUA é destaque', ...base }), cluster({ id: 'b', title: 'Vendas no varejo sobem no trimestre', ...base })], [], DATE)
    expect(a.relevance_components.materiality).toBeLessThan(b.relevance_components.materiality)
  })
})
