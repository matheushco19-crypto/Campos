import { describe, expect, it } from 'vitest'
import { collectMacro } from '../src/agents/market-intelligence/collectors/macro'
import { collectMarkets } from '../src/agents/market-intelligence/collectors/market'
import { MACRO_INDICATORS } from '../config/macro'
import { assetByMetric } from '../config/assets'

const fakeFetch = (body: string) => (async () => new Response(body, { status: 200 })) as unknown as typeof fetch

describe('collector regressions found in the first real run', () => {
  it('SGS forward-filled meeting series (Selic 432) only yields points up to today', async () => {
    const selic = MACRO_INDICATORS.find((m) => m.metric === 'BR_SELIC_TARGET')!
    const body = JSON.stringify([
      { data: '28/09/2026', valor: '13.75' },
      { data: '29/09/2026', valor: '13.75' },
      { data: '04/11/2026', valor: '13.75' },
    ])
    const res = await collectMacro(new Date('2026-09-29T15:00:00Z'), [selic], { fetchImpl: fakeFetch(body), retries: 0 })
    expect(res.observations[0].referencePeriod).toBe('2026-09-29')
  })

  it('SGS meeting series query a date window ending today (ultimos/N may be all future points)', async () => {
    const selic = MACRO_INDICATORS.find((m) => m.metric === 'BR_SELIC_TARGET')!
    const urls: string[] = []
    const spy = (async (u: string) => (urls.push(String(u)), new Response(JSON.stringify([{ data: '29/09/2026', valor: '13.75' }]), { status: 200 }))) as unknown as typeof fetch
    await collectMacro(new Date('2026-09-29T15:00:00Z'), [selic], { fetchImpl: spy, retries: 0 })
    expect(urls[0]).toContain('dataFinal=29/09/2026')
    expect(urls[0]).not.toContain('ultimos')
  })

  it('official fixings (PTAX) are labelled CLOSED, never "em negociação"', async () => {
    const usd = { ...assetByMetric('USDBRL')!, sources: [{ sourceId: 'bcb-ptax' as const, symbol: '1' }] }
    const body = JSON.stringify([{ data: '28/09/2026', valor: '5.2132' }, { data: '29/09/2026', valor: '5.2204' }])
    const res = await collectMarkets(new Date('2026-09-29T18:00:00Z'), [usd], { fetchImpl: fakeFetch(body), retries: 0 })
    expect(res.observations[0]).toMatchObject({ value: 5.2204, marketStatus: 'CLOSED', changePct: 0.14 })
  })

  it('ECB FX derives USD/BRL as EUR/BRL ÷ EUR/USD for the same date', async () => {
    const usd = { ...assetByMetric('USDBRL')!, sources: [{ sourceId: 'ecb-fx' as const, symbol: 'USD' }] }
    const csv = 'KEY,CURRENCY,TIME_PERIOD,OBS_VALUE\nX,BRL,2026-09-29,5.9177\nX,USD,2026-09-29,1.1355\nX,BRL,2026-09-28,5.9186\nX,USD,2026-09-28,1.1378\n'
    const res = await collectMarkets(new Date('2026-09-29T18:00:00Z'), [usd], { fetchImpl: fakeFetch(csv), retries: 0 })
    expect(res.observations[0].value).toBeCloseTo(5.9177 / 1.1355, 3)
    expect(res.observations[0].referencePeriod).toBe('2026-09-29')
  })
})
