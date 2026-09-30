import { describe, expect, it } from 'vitest'
import { dxyFromEcb, parseBitstamp, parseEcos, parseGemini } from '../src/agents/market-intelligence/collectors/parsers'
import { collectMarkets } from '../src/agents/market-intelligence/collectors/market'
import { mergeExtraObservations, type CollectionBundle } from '../src/agents/market-intelligence'
import { verifyAll } from '../src/verification/engine'
import { assetByMetric, ASSETS } from '../config/assets'
import { getSource, SOURCES } from '../config/sources'
import type { RawObservation } from '../src/core/schemas'

const fakeFetch = (body: string) => (async () => new Response(body, { status: 200 })) as unknown as typeof fetch

describe('source coverage audit: new free adapters', () => {
  it('parses Bitstamp ticker (unix seconds, open → change)', () => {
    const r = parseBitstamp({ last: '112000.00', open: '110000.00', timestamp: '1790640000' })
    expect(r.value).toBe(112000)
    expect(r.changePct).toBeCloseTo(1.82, 2)
    expect(r.time).toBe(new Date(1790640000 * 1000).toISOString())
  })

  it('parses Gemini pubticker (volume.timestamp in ms)', () => {
    const r = parseGemini({ last: '111950.5', volume: { BTC: '1', USD: '1', timestamp: 1790640000000 } })
    expect(r).toEqual({ value: 111950.5, time: new Date(1790640000000).toISOString() })
  })

  it('parses BOK ECOS StatisticSearch (KOSPI) and sorts ascending', () => {
    const pts = parseEcos({ StatisticSearch: { list_total_count: 2, row: [{ TIME: '20260929', DATA_VALUE: '3,512.40' }, { TIME: '20260926', DATA_VALUE: '3498.1' }] } })
    expect(pts).toEqual([{ period: '2026-09-26', value: 3498.1 }, { period: '2026-09-29', value: 3512.4 }])
  })

  it('DXY from ECB reference rates lands in the plausible range', () => {
    // EUR-based rates (units of currency per 1 EUR), realistic magnitudes.
    const dxy = dxyFromEcb({ USD: 1.1355, JPY: 168.2, GBP: 0.8712, CAD: 1.5801, SEK: 11.02, CHF: 0.9395 })
    expect(dxy).toBeGreaterThan(90)
    expect(dxy).toBeLessThan(110)
  })

  it('bitstamp adapter yields a BTC observation with provenance', async () => {
    const btc = { ...assetByMetric('BTCUSD')!, sources: [{ sourceId: 'bitstamp' as const, symbol: 'btcusd' }] }
    const res = await collectMarkets(new Date('2026-09-30T08:00:00Z'), [btc], { fetchImpl: fakeFetch(JSON.stringify({ last: '112000', open: '111000', timestamp: '1790740000' })), retries: 0 })
    expect(res.observations[0]).toMatchObject({ sourceId: 'bitstamp', metric: 'BTCUSD', value: 112000 })
    expect(res.observations[0].url).toContain('bitstamp.net')
  })

  it('bok-ecos adapter never persists the API key in the URL', async () => {
    const kospi = { ...assetByMetric('KOSPI')!, sources: [{ sourceId: 'bok-ecos' as const, symbol: '802Y001/0001000' }] }
    const body = JSON.stringify({ StatisticSearch: { row: [{ TIME: '20260928', DATA_VALUE: '3490' }, { TIME: '20260929', DATA_VALUE: '3512.4' }] } })
    const res = await collectMarkets(new Date('2026-09-30T08:00:00Z'), [kospi], { fetchImpl: fakeFetch(body), retries: 0 })
    expect(res.observations[0]).toMatchObject({ value: 3512.4, referencePeriod: '2026-09-29' })
    expect(res.observations[0].url).toContain('/KEY/')
  })

  it('ECB DXY adapter uses only dates with all six currencies', async () => {
    const dxy = { ...assetByMetric('DXY')!, sources: [{ sourceId: 'ecb-fx' as const, symbol: 'DXY' }] }
    const rows = ['KEY,CURRENCY,TIME_PERIOD,OBS_VALUE']
    const rates = { USD: 1.1355, JPY: 168.2, GBP: 0.8712, CAD: 1.5801, SEK: 11.02, CHF: 0.9395 }
    for (const [c, v] of Object.entries(rates)) rows.push(`X,${c},2026-09-28,${v}`, `X,${c},2026-09-29,${v * 1.001}`)
    rows.push('X,USD,2026-09-30,1.14') // incomplete date: ignored
    const res = await collectMarkets(new Date('2026-09-30T18:00:00Z'), [dxy], { fetchImpl: fakeFetch(rows.join('\n') + '\n'), retries: 0 })
    expect(res.observations[0].referencePeriod).toBe('2026-09-29')
    expect(res.observations[0].notes).toMatch(/aproximação/)
  })
})

describe('source registry consistency', () => {
  it('every asset mapping points to a registered source', () => {
    for (const a of ASSETS) for (const m of a.sources) expect(getSource(m.sourceId), `${a.metric}@${m.sourceId}`).toBeTruthy()
  })
  it('Investing.com is manual reference only (no crawler)', () => {
    const inv = SOURCES.find((s) => s.id === 'investing')!
    expect(inv.access).toBe('manual')
    expect(ASSETS.some((a) => a.sources.some((m) => (m.sourceId as string) === 'investing'))).toBe(false)
  })
})

describe('external observations (BRAPI MCP bridge)', () => {
  const bundle: CollectionBundle = {
    version: 1, collected_at: '2026-09-30T08:00:00Z', brief_date: '2026-09-30', collector_host: 'test',
    observations: [], news: [], health: [{ source_id: 'brapi', ok: false, items: 0, latency_ms: 0, error: 'sem token' }], errors: [],
    skipped: ['IBOV@brapi: BRAPI_TOKEN ausente'], calendar: [],
  }
  const ibov: RawObservation = {
    sourceId: 'brapi', category: 'MARKET', metric: 'IBOV', value: 183827.6, unit: 'pts', referencePeriod: '2026-09-29',
    asOf: '2026-09-29T20:10:00.000Z', retrievedAt: '2026-09-30T08:00:00.000Z', url: 'https://brapi.dev/api/quote/%5EBVSP',
    previousValue: 182991.12, changePct: 0.46, marketStatus: 'CLOSED', notes: 'via MCP BRAPI',
  }

  it('merges registered-source observations and updates health/skipped', () => {
    const merged = mergeExtraObservations(bundle, [ibov])
    expect(merged.observations).toHaveLength(1)
    expect(merged.health.find((h) => h.source_id === 'brapi')).toMatchObject({ ok: true, items: 1 })
    expect(merged.skipped).toEqual([])
  })

  it('refuses observations from unregistered sources', () => {
    const merged = mergeExtraObservations(bundle, [{ ...ibov, sourceId: 'random-blog' }])
    expect(merged.observations).toHaveLength(0)
    expect(merged.errors[0].message).toMatch(/não registrada/)
  })

  it('a single external source is never promoted to VERIFIED', () => {
    const merged = mergeExtraObservations(bundle, [ibov])
    const { facts } = verifyAll(merged.observations, { briefDate: '2026-09-30', runId: 'r', now: new Date('2026-09-30T08:00:00Z'), previousFacts: new Map() })
    const f = facts.find((x) => x.metric === 'IBOV')!
    expect(f.verification_status).toBe('UNVERIFIED')
    expect(f.value).toBe(183827.6)
  })
})
