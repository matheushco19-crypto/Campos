import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { assetByMetric } from '../config/assets'
import { attachLiveQuotes, buildMarketRows, deterministicAnalysis } from '../src/agents/financial-intelligence/brief'
import { guardFredgraph, resetFredBreaker } from '../src/agents/market-intelligence/collectors/fred-breaker'
import { parseYahooLive } from '../src/agents/market-intelligence/collectors/parsers'
import { liveQuotesFrom } from '../src/agents/market-intelligence'
import { verifyMarket } from '../src/verification/engine'
import { cluster, DATE, fact, news, NOW, obs } from './helpers'

const asset = (m: string) => assetByMetric(m)!

describe('live quotes ("Atualizar agora")', () => {
  // Real shape of the Yahoo v8 chart response (the v7 /quote endpoint answers 401 without a crumb).
  const chart = {
    chart: {
      result: [
        {
          meta: { regularMarketPrice: 7703.99, regularMarketTime: Date.parse('2026-09-30T18:13:02Z') / 1000, chartPreviousClose: 7650, exchangeTimezoneName: 'America/New_York', currency: 'USD' },
          timestamp: ['2026-09-28T13:30:00Z', '2026-09-29T13:30:00Z', '2026-09-30T13:30:00Z'].map((t) => Date.parse(t) / 1000),
          indicators: { quote: [{ close: [7640.1, 7706.03, 7703.99] }] },
        },
      ],
      error: null,
    },
  }

  it('reads the current price and uses the last daily close before the trade date as previous (not chartPreviousClose)', () => {
    const q = parseYahooLive(chart)
    expect(q.value).toBe(7703.99)
    expect(q.previous).toBe(7706.03)
    expect(q.lastTrade).toBe('2026-09-30T18:13:02.000Z')
    expect(q.changePct).toBeCloseTo(-0.03, 2)
  })

  it('a live quote newer than the official close is kept apart, never replacing the verified value', () => {
    const facts = [fact({ id: 'f_spx', metric: 'SPX', value: 7706.03, reference_period: '2026-09-29', primary_source: 'fred', verification_status: 'UNVERIFIED' })]
    const observations = [
      obs({ sourceId: 'fred', metric: 'SPX', value: 7706.03, referencePeriod: '2026-09-29' }),
      obs({ sourceId: 'yahoo', metric: 'SPX', value: 7703.99, referencePeriod: '2026-09-30', asOf: '2026-09-30T18:13:02Z', marketStatus: 'OPEN', changePct: -0.03 }),
    ]
    const live = liveQuotesFrom(observations, facts)
    expect(live).toEqual([{ metric: 'SPX', value: 7703.99, change_pct: -0.03, observed_at: '2026-09-30T18:13:02Z', reference_date: '2026-09-30', source: 'yahoo', is_intraday: true }])
    const rows = attachLiveQuotes(buildMarketRows(facts), live)
    const spx = rows.find((r) => r.metric === 'SPX')!
    expect(spx.value).toBe(7706.03)
    expect(spx.reference).toBe('2026-09-29')
    expect(spx.live).toMatchObject({ value: 7703.99, source: 'yahoo', is_intraday: true })
  })

  it('no live quote when the unofficial value is older, or already the displayed primary', () => {
    const facts = [
      fact({ id: 'a', metric: 'SPX', reference_period: '2026-09-29', primary_source: 'fred' }),
      fact({ id: 'b', metric: 'IBOV', reference_period: '2026-09-30', primary_source: 'yahoo', verification_status: 'UNVERIFIED' }),
    ]
    const observations = [obs({ sourceId: 'yahoo', metric: 'SPX', value: 1, referencePeriod: '2026-09-26' }), obs({ sourceId: 'yahoo', metric: 'IBOV', value: 2, referencePeriod: '2026-09-30' })]
    expect(liveQuotesFrom(observations, facts)).toEqual([])
  })
})

describe('automatic morning: last official close instead of "unavailable"', () => {
  const ctx = (lastKnown?: Map<string, ReturnType<typeof fact>>) => ({ briefDate: '2026-09-30', runId: 'run_x', now: NOW, lastKnown })

  it('when every source fails, the last stored close is shown with its own reference date and labelled', () => {
    const last = fact({ id: 'f_old', metric: 'IBOV', value: 183827.6, reference_period: '2026-09-29', primary_source: 'brapi', verification_status: 'UNVERIFIED', verification_method: 'single_source', region: 'BR' })
    const f = verifyMarket(asset('IBOV'), [], ctx(new Map([['IBOV', last]])))
    expect(f.value).toBe(183827.6)
    expect(f.reference_period).toBe('2026-09-29')
    expect(f.verification_status).toBe('UNVERIFIED')
    expect(f.source_fallback).toBe(true)
    expect(f.market_status).toBe('CLOSED')
    expect(f.notes).toMatch(/Último fechamento oficial disponível \(referência 2026-09-29/)
  })

  it('beyond maxAgeDays nothing is carried: UNAVAILABLE, no estimate', () => {
    const old = fact({ id: 'f_older', metric: 'IBOV', value: 170000, reference_period: '2026-09-10' })
    const f = verifyMarket(asset('IBOV'), [], ctx(new Map([['IBOV', old]])))
    expect(f.verification_status).toBe('UNAVAILABLE')
    expect(f.value).toBeNull()
  })

  it('with a real observation the carry-forward is never used', () => {
    const last = fact({ id: 'f_old', metric: 'IBOV', value: 1, reference_period: '2026-09-29' })
    const f = verifyMarket(asset('IBOV'), [obs({ sourceId: 'brapi', metric: 'IBOV', value: 185000, referencePeriod: '2026-09-29' })], ctx(new Map([['IBOV', last]])))
    expect(f.value).toBe(185000)
    expect(f.source_fallback).toBe(false)
  })
})

describe('FRED keyless fail-fast', () => {
  it('after two timeouts the remaining keyless calls fail immediately; the keyed API is never skipped', async () => {
    resetFredBreaker()
    const timeout = () => Promise.reject(new Error('Timeout after 25000ms'))
    await expect(guardFredgraph(true, timeout)).rejects.toThrow(/Timeout/)
    await expect(guardFredgraph(true, timeout)).rejects.toThrow(/Timeout/)
    let called = false
    await expect(
      guardFredgraph(true, async () => {
        called = true
        return 1
      }),
    ).rejects.toThrow(/Cadastre FRED_API_KEY/)
    expect(called).toBe(false)
    await expect(guardFredgraph(false, async () => 'keyed')).resolves.toBe('keyed')
    resetFredBreaker()
    await expect(guardFredgraph(true, async () => 'ok')).resolves.toBe('ok')
  })
})

describe('scripts/routine.mjs (Claude Code Routine hand-off)', () => {
  const SECRET = 'test-secret-value-123'
  let server: Server
  let base = ''
  let packetStatus = 'PENDING'
  let postMode: 'ok' | 'reject' = 'ok'
  const posted: unknown[] = []

  beforeAll(async () => {
    server = createServer((req, res) => {
      const send = (code: number, body: unknown) => {
        res.writeHead(code, { 'content-type': 'application/json' })
        res.end(JSON.stringify(body))
      }
      if (req.headers.authorization !== `Bearer ${SECRET}`) return send(401, { error: 'unauthorized' })
      const url = new URL(req.url!, 'http://x')
      if (req.method === 'GET') {
        if (url.searchParams.get('date') === '2000-01-01') return send(404, { error: 'no packet for 2000-01-01' })
        return send(200, { date: url.searchParams.get('date'), status: packetStatus, instructions: 'i', output_schema: {}, packet: { budget: { chars: 23825, estimated_tokens: 5957 }, citable_facts: [1, 2], clusters: [1] } })
      }
      let raw = ''
      req.on('data', (c) => (raw += c))
      req.on('end', () => {
        posted.push(JSON.parse(raw))
        if (postMode === 'reject') return send(422, { error: 'Análise rejeitada (FAILED_QC): Metric Alignment' })
        packetStatus = 'SUBMITTED'
        send(200, { snapshot: 'snap_2026-09-30_v2', status: 'PUBLISHED', qc: { passed: true, corrections: [] } })
      })
    })
    await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok))
    const addr = server.address()
    base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`
  })
  afterAll(() => server.close())

  const run = (args: string[], env: Record<string, string>, cwd: string) =>
    new Promise<{ code: number; out: string }>((ok) => {
      const p = spawn(process.execPath, [join(process.cwd(), 'scripts/routine.mjs'), ...args], { cwd, env: { PATH: process.env.PATH ?? '', ...env } as unknown as NodeJS.ProcessEnv, stdio: ['ignore', 'pipe', 'pipe'] })
      let out = ''
      p.stdout.on('data', (d) => (out += d))
      p.stderr.on('data', (d) => (out += d))
      p.on('close', (code) => ok({ code: code ?? -1, out }))
    })

  it('covers auth, missing packet, publish, idempotent re-run and QC rejection; never prints the secret', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'routine-'))
    const env = { MI_BASE_URL: base, CRON_SECRET: SECRET }

    const noSecret = await run(['get'], { MI_BASE_URL: base }, dir)
    expect(noSecret.code).toBe(2)
    const wrong = await run(['get', '--date', DATE], { MI_BASE_URL: base, CRON_SECRET: 'wrong' }, dir)
    expect(wrong.code).toBe(2)
    expect(wrong.out).toMatch(/401/)
    const none = await run(['get', '--date', '2000-01-01'], env, dir)
    expect(none.code).toBe(3)

    const got = await run(['get', '--date', DATE, '--out', 'packet.json'], env, dir)
    expect(got.code).toBe(0)
    expect(JSON.parse(readFileSync(join(dir, 'packet.json'), 'utf8')).status).toBe('PENDING')

    writeFileSync(join(dir, 'analysis.json'), JSON.stringify({ lede: { text: 'x' } }))
    postMode = 'reject'
    const rejected = await run(['submit', '--date', DATE, '--file', 'analysis.json'], env, dir)
    expect(rejected.code).toBe(4)
    expect(rejected.out).toMatch(/Metric Alignment/)

    postMode = 'ok'
    const ok = await run(['submit', '--date', DATE, '--file', 'analysis.json'], env, dir)
    expect(ok.code).toBe(0)
    expect(ok.out).toMatch(/snap_2026-09-30_v2/)
    expect(ok.out).toMatch(/SUBMITTED/)
    expect(posted.at(-1)).toEqual({ date: DATE, analysis: { lede: { text: 'x' } } })

    const again = await run(['get', '--date', DATE], env, dir)
    expect(again.code).toBe(10)

    writeFileSync(join(dir, 'bad.json'), '{not json')
    expect((await run(['submit', '--file', 'bad.json'], env, dir)).code).toBe(4)

    for (const r of [noSecret, wrong, none, got, rejected, ok, again]) expect(r.out).not.toContain(SECRET)
  }, 60_000)
})

describe('deterministic "O que importa hoje" (no Agent 2 yet)', () => {
  it('explains the story from the summary, attributes it, cites the official data point and drops press numbers and boilerplate', () => {
    const ipca = fact({ id: 'f_ipca15', metric: 'BR_IPCA15_MOM', category: 'MACRO', label: 'IPCA-15 (variação mensal)', value: 0.7, unit: '%', reference_period: '2026-09', primary_source: 'ibge-sidra', region: 'BR' })
    const items = [
      news({ id: 'n1', headline: 'IPCA-15 surpreende e expõe fim da trégua dos alimentos', source_id: 'rss-estadao-economia', original_summary: 'IPCA-15 surpreende e expõe fim da trégua dos alimentos. Alimentação no domicílio voltou a subir e puxou a prévia da inflação de setembro para cima. Preços subiram 0,7% no mês, segundo o texto. Clique aqui para acessar a íntegra do relatório.' }),
    ]
    const c = cluster({ id: 'c1', title: 'IPCA-15 surpreende e expõe fim da trégua dos alimentos', item_ids: ['n1'], metric_target: 'BR_IPCA15_MOM', sources: [{ source: 'Estadão — Economia', url: 'https://e.example/1', headline: 'x' }], topic: 'economy', region: 'BR' })
    const a = deterministicAnalysis([ipca], [c], items)
    const w = a.what_matters[0]
    expect(w.why_it_matters).toBe('Alimentação no domicílio voltou a subir e puxou a prévia da inflação de setembro para cima, segundo Estadão. Dado oficial: IPCA-15 (variação mensal) em 0,70% (referência 2026-09, IBGE — SIDRA).')
    expect(w.fact_ids).toEqual(['f_ipca15'])
    expect(w.why_it_matters).not.toMatch(/Clique|0,7% no mês/)
    expect(w.why_it_matters.split(/(?<=[.!?])\s+/).length).toBeLessThanOrEqual(2)
  })

  it('without a usable summary it states only the attribution and topic (nothing invented)', () => {
    const c = cluster({ id: 'c2', title: 'Dólar abre em queda', item_ids: ['n2'], sources: [{ source: 'g1 Economia', url: 'https://g1.example/2', headline: 'x' }], topic: 'markets' })
    const a = deterministicAnalysis([], [c], [news({ id: 'n2', headline: 'Dólar abre em queda', source_id: 'rss-g1-economia', original_summary: 'O dólar caía 0,27% às 9h05, a R$ 5,20…' })])
    expect(a.what_matters[0].why_it_matters).toBe('Segundo g1 Economia (fonte única, não confirmada); tema: mercados.')
  })
})
