import { describe, expect, it } from 'vitest'
import { assetByMetric } from '../config/assets'
import { attachLiveQuotes, buildMarketRows } from '../src/agents/financial-intelligence/brief'
import { liveQuotesFrom } from '../src/agents/market-intelligence'
import { quoteView } from '../src/components/quote'
import { ContentLabInput } from '../src/core/schemas'
import { qualityControl } from '../src/engines/quality-control'
import { verifyMarket } from '../src/verification/engine'
import { goodAnalysis } from './fixtures/analysis'
import { cluster, fact, NOW, obs } from './helpers'

const asset = (m: string) => assetByMetric(m)!
const ctx = (lastKnown?: Map<string, ReturnType<typeof fact>>) => ({ briefDate: '2026-09-30', runId: 'run_x', now: NOW, lastKnown })

describe('market quote display, cases A–H', () => {
  const spxClose = fact({ id: 'f_spx', metric: 'SPX', value: 7706.03, reference_period: '2026-09-29', primary_source: 'fred', verification_status: 'UNVERIFIED' })

  it('A · open market with a live quote: live value leads, labelled AGORA · time · source, official close underneath', () => {
    const live = liveQuotesFrom(
      [obs({ sourceId: 'yahoo', metric: 'SPX', value: 7703.99, referencePeriod: '2026-09-30', asOf: '2026-09-30T18:13:02Z', marketStatus: 'OPEN', changePct: -0.03 })],
      [spxClose],
    )
    const row = attachLiveQuotes(buildMarketRows([spxClose]), live).find((r) => r.metric === 'SPX')!
    const v = quoteView(row, spxClose)
    expect(v.value).toBe(7703.99)
    expect(v.live).toBe(true)
    expect(v.label).toBe('AGORA · 15:13 BRT · Yahoo · não oficial')
    expect(v.official).toMatch(/^oficial 29\/09/)
    // The verified record is untouched.
    expect(row.value).toBe(7706.03)
    expect(row.verification_status).not.toBe('VERIFIED')
  })

  it('B · open market without a live quote: last close, never "indisponível"', () => {
    const row = buildMarketRows([{ ...spxClose, market_status: 'OPEN' }]).find((r) => r.metric === 'SPX')!
    const v = quoteView(row, spxClose)
    expect(v.value).toBe(7706.03)
    expect(v.live).toBe(false)
    expect(v.label).toBe('Último fech. 29/09 · FRED')
  })

  it('C · closed market: last official close', () => {
    const row = buildMarketRows([{ ...spxClose, market_status: 'CLOSED' }]).find((r) => r.metric === 'SPX')!
    expect(quoteView(row, spxClose).label).toMatch(/^Último fech\. 29\/09/)
  })

  it('D · today has no close yet: the previous close is used with its own date', () => {
    const f = verifyMarket(asset('IBOV'), [obs({ sourceId: 'brapi', metric: 'IBOV', value: 185000, referencePeriod: '2026-09-29' })], ctx())
    expect(f.reference_period).toBe('2026-09-29')
    const row = buildMarketRows([f]).find((r) => r.metric === 'IBOV')!
    expect(quoteView(row, f).label).toBe('Último fech. 29/09 · BRAPI')
  })

  it('E · primary source fails: the fallback supplies the value', () => {
    // SPX: FMP (keyless, not collected) → FRED.
    const f = verifyMarket(asset('SPX'), [obs({ sourceId: 'fred', metric: 'SPX', value: 7706.03, referencePeriod: '2026-09-29' })], ctx())
    expect(f.value).toBe(7706.03)
    expect(f.primary_source).toBe('fred')
  })

  it('F · every source fails: the persisted close within TTL is reused, same value and date', () => {
    const last = fact({ id: 'f_old', metric: 'IBOV', value: 183827.6, reference_period: '2026-09-29', primary_source: 'brapi', region: 'BR' })
    const f = verifyMarket(asset('IBOV'), [], ctx(new Map([['IBOV', last]])))
    expect(f.value).toBe(183827.6)
    expect(f.source_fallback).toBe(true)
    expect(quoteView(buildMarketRows([f]).find((r) => r.metric === 'IBOV')!, f).label).toMatch(/^Último fech\. 29\/09/)
  })

  it('G · beyond TTL: unavailable', () => {
    const old = fact({ id: 'f_older', metric: 'IBOV', value: 170000, reference_period: '2026-09-10' })
    const f = verifyMarket(asset('IBOV'), [], ctx(new Map([['IBOV', old]])))
    expect(f.verification_status).toBe('UNAVAILABLE')
    const v = quoteView(buildMarketRows([f]).find((r) => r.metric === 'IBOV')!, f)
    expect(v.value).toBeNull()
    expect(v.label).toBe('fontes indisponíveis nesta execução')
  })

  it('H · never estimates: no source and no history gives null, and an unofficial value never verifies', () => {
    const none = verifyMarket(asset('SPX'), [], ctx())
    expect(none.value).toBeNull()
    const yahooOnly = verifyMarket(asset('SPX'), [obs({ sourceId: 'yahoo', metric: 'SPX', value: 7700, referencePeriod: '2026-09-29' })], ctx())
    expect(yahooOnly.verification_status).not.toBe('VERIFIED')
  })
})

describe('Intelligence: at least 3 insights when 3 eligible events exist', () => {
  const facts = [fact({ id: 'f_selic', metric: 'BR_SELIC_TARGET', category: 'MACRO', region: 'BR', label: 'Selic meta', value: 15, unit: '% a.a.', reference_period: '2026-09-17' }), fact({ id: 'f_spx', metric: 'SPX', label: 'S&P 500', value: 6550, change_pct: 1.2, previous_value: 6472.3 })]
  const check = (clusters: ReturnType<typeof cluster>[]) => qualityControl({ analysis: goodAnalysis(), facts, marketRows: [], agenda: [], clusters }).report.checks.find((c) => c.id === 'insights_minimum')!

  it('blocks a brief with 1 insight when the packet has 3 eligible events', () => {
    const c = check([cluster({ id: 'c_fed', title: 'Fed' }), cluster({ id: 'c_2', title: 'Copom' }), cluster({ id: 'c_3', title: 'China' })])
    expect(c.passed).toBe(false)
    expect(c.severity).not.toBe('warn')
  })

  it('with a single eligible event, one insight is enough (nothing padded)', () => {
    expect(check([cluster({ id: 'c_fed', title: 'Fed' })]).passed).toBe(true)
  })
})

describe('Content Lab: structure per format', () => {
  const lab = goodAnalysis().content_lab
  it('accepts story screens, 5 carousel slides, a reel script with on-screen text and a post text', () => {
    expect(ContentLabInput.safeParse(lab).success).toBe(true)
  })
  it('rejects a carousel without exactly 5 slides and a story with too many screens', () => {
    expect(ContentLabInput.safeParse({ ...lab, carousel: { ...lab.carousel, slides: lab.carousel.slides.slice(0, 4) } }).success).toBe(false)
    expect(ContentLabInput.safeParse({ ...lab, story: { ...lab.story, frames: [...lab.story.frames, 'a mais', 'outra'] } }).success).toBe(false)
  })
  it('rejects a post without base text and a reel without on-screen direction', () => {
    expect(ContentLabInput.safeParse({ ...lab, take: { ...lab.take, post_text: undefined } }).success).toBe(false)
    expect(ContentLabInput.safeParse({ ...lab, reel: { ...lab.reel, on_screen: undefined } }).success).toBe(false)
  })
})
