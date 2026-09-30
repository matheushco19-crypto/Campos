import { ASSETS, type AssetConfig, type SourceMapping } from '../../../../config/assets'
import { getEnv } from '../../../core/env'
import { fetchJson, fetchText, redactUrl, type FetchOptions } from '../../../core/http'
import type { RawObservation } from '../../../core/schemas'
import { addDays, toLocalDate, zonedToUtc } from '../../../core/time'
import {
  parseBrapiCurrency,
  parseBrapiQuote,
  parseCoinbaseSpot,
  parseCoingecko,
  parseEcbFx,
  parseBitstamp,
  parseGemini,
  parseEcos,
  dxyFromEcb,
  parseFredCsv,
  parseFredJson,
  parseKraken,
  parseSgs,
  parseStooqHistory,
  parseTreasuryCsv,
  parseTwelveData,
  pctChange,
  type SeriesPoint,
} from './parsers'
import { observationStatus } from './market-status'
import type { CollectorResult } from './types'
import { pool } from '../../../core/pool'

type Fetched = { value: number; referenceDate: string; asOf: string; changePct: number | null; previous: number | null; url: string; notes?: string }

const lastTwo = (points: SeriesPoint[]) => {
  const last = points.at(-1)
  if (!last) throw new Error('no observations')
  const prev = points.at(-2)
  return { last, prev }
}

/** Close of a daily series, stamped at the exchange's closing time. */
const closeInstant = (asset: AssetConfig, date: string) => zonedToUtc(date, asset.exchange.close, asset.exchange.timezone)

export async function fetchMarketFromSource(asset: AssetConfig, m: SourceMapping, now: Date, http: FetchOptions = {}): Promise<Fetched> {
  const env = getEnv()
  switch (m.sourceId) {
    case 'brapi': {
      if (!env.BRAPI_TOKEN) throw new Error('BRAPI_TOKEN not configured')
      if (m.symbol.includes('-')) {
        const url = `https://brapi.dev/api/v2/currency?currency=${encodeURIComponent(m.symbol)}&token=${env.BRAPI_TOKEN}`
        const r = parseBrapiCurrency(await fetchJson(url, http))
        const asOf = r.time ? new Date(r.time).toISOString() : now.toISOString()
        return { value: r.value, changePct: r.changePct, previous: null, referenceDate: toLocalDate(asOf, asset.exchange.timezone), asOf, url: redactUrl(url) }
      }
      const url = `https://brapi.dev/api/quote/${encodeURIComponent(m.symbol)}?token=${env.BRAPI_TOKEN}`
      const r = parseBrapiQuote(await fetchJson(url, http))
      const asOf = r.time ? new Date(r.time).toISOString() : now.toISOString()
      return { value: r.value, changePct: r.changePct, previous: r.previous, referenceDate: toLocalDate(asOf, asset.exchange.timezone), asOf, url: redactUrl(url) }
    }
    case 'stooq': {
      const d2 = toLocalDate(now, 'UTC').replace(/-/g, '')
      const d1 = addDays(toLocalDate(now, 'UTC'), -12).replace(/-/g, '')
      const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(m.symbol)}&i=d&d1=${d1}&d2=${d2}`
      const { last, prev } = lastTwo(parseStooqHistory(await fetchText(url, http)))
      return { value: last.value, previous: prev?.value ?? null, changePct: pctChange(last.value, prev?.value), referenceDate: last.period, asOf: closeInstant(asset, last.period), url }
    }
    case 'fred': {
      const start = addDays(toLocalDate(now, 'UTC'), -20)
      const url = env.FRED_API_KEY
        ? `https://api.stlouisfed.org/fred/series/observations?series_id=${m.symbol}&api_key=${env.FRED_API_KEY}&file_type=json&observation_start=${start}`
        : `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${m.symbol}&cosd=${start}`
      const fredHttp = { timeoutMs: 25_000, ...http }
      const points = env.FRED_API_KEY ? parseFredJson(await fetchJson(url, fredHttp)) : parseFredCsv(await fetchText(url, fredHttp))
      const { last, prev } = lastTwo(points)
      return { value: last.value, previous: prev?.value ?? null, changePct: asset.unit === '%' ? null : pctChange(last.value, prev?.value), referenceDate: last.period, asOf: closeInstant(asset, last.period), url: redactUrl(url) }
    }
    case 'us-treasury': {
      const year = toLocalDate(now, 'America/New_York').slice(0, 4)
      const url = `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${year}/all?type=daily_treasury_yield_curve&field_tdr_date_value=${year}&page&_format=csv`
      const { last, prev } = lastTwo(parseTreasuryCsv(await fetchText(url, http), m.symbol))
      return { value: last.value, previous: prev?.value ?? null, changePct: null, referenceDate: last.period, asOf: closeInstant(asset, last.period), url, notes: prev ? `Variação: ${Math.round((last.value - prev.value) * 100)} bps` : undefined }
    }
    case 'bcb-ptax': {
      const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${m.symbol}/dados/ultimos/5?formato=json`
      const { last, prev } = lastTwo(parseSgs(await fetchJson(url, http), 'daily'))
      return { value: last.value, previous: prev?.value ?? null, changePct: pctChange(last.value, prev?.value), referenceDate: last.period, asOf: zonedToUtc(last.period, '13:30', 'America/Sao_Paulo'), url, notes: 'PTAX venda (fixing do BCB)' }
    }
    case 'ecb-fx': {
      if (m.symbol === 'DXY') {
        // DXY approximation: ICE's public formula over ECB reference rates of the same date.
        const url = 'https://data-api.ecb.europa.eu/service/data/EXR/D.USD+JPY+GBP+CAD+SEK+CHF.EUR.SP00.A?lastNObservations=3&format=csvdata'
        const rows = parseEcbFx(await fetchText(url, http))
        const byDate = new Map<string, Record<string, number>>()
        for (const r of rows) byDate.set(r.date, { ...(byDate.get(r.date) ?? {}), [r.currency]: r.value })
        const complete = [...byDate.entries()].filter(([, v]) => Object.keys(v).length === 6).sort((a, b) => a[0].localeCompare(b[0]))
        const last = complete.at(-1)
        if (!last) throw new Error('ECB DXY: no complete date')
        const prev = complete.at(-2)
        const value = dxyFromEcb(last[1])
        const previous = prev ? dxyFromEcb(prev[1]) : null
        return { value, previous, changePct: pctChange(value, previous), referenceDate: last[0], asOf: zonedToUtc(last[0], '14:15', 'Europe/Berlin'), url, notes: 'DXY calculado (fórmula ICE) com taxas de referência do ECB: aproximação, não o índice oficial da ICE.' }
      }
      // ECB reference rates: EUR/BRL directly; USD/BRL = EUR/BRL ÷ EUR/USD (same date).
      const url = 'https://data-api.ecb.europa.eu/service/data/EXR/D.BRL+USD.EUR.SP00.A?lastNObservations=3&format=csvdata'
      const rows = parseEcbFx(await fetchText(url, http))
      const dates = [...new Set(rows.map((r) => r.date))].sort()
      const pick = (d: string) => {
        const brl = rows.find((r) => r.date === d && r.currency === 'BRL')?.value
        const usd = rows.find((r) => r.date === d && r.currency === 'USD')?.value
        if (!brl || !usd) return null
        return m.symbol === 'USD' ? Math.round((brl / usd) * 10000) / 10000 : brl
      }
      const last = [...dates].reverse().find((d) => pick(d) !== null)
      if (!last) throw new Error('ECB FX: no complete observation')
      const prevDate = [...dates].reverse().find((d) => d < last && pick(d) !== null)
      const value = pick(last)!
      const previous = prevDate ? pick(prevDate) : null
      return { value, previous, changePct: pctChange(value, previous), referenceDate: last, asOf: zonedToUtc(last, '14:15', 'Europe/Berlin'), url, notes: m.symbol === 'USD' ? 'Cruzamento EUR/BRL ÷ EUR/USD (ECB)' : 'Taxa de referência do ECB' }
    }
    case 'coingecko': {
      const key = env.COINGECKO_DEMO_KEY
      const url = `https://api.coingecko.com/api/v3/simple/price?ids=${m.symbol}&vs_currencies=usd&include_24hr_change=true&include_last_updated_at=true${key ? `&x_cg_demo_api_key=${key}` : ''}`
      const r = parseCoingecko(await fetchJson(url, http), m.symbol)
      const asOf = r.time ?? now.toISOString()
      return { value: r.value, previous: null, changePct: r.changePct !== null ? Math.round(r.changePct * 100) / 100 : null, referenceDate: toLocalDate(asOf, 'UTC'), asOf, url: redactUrl(url), notes: 'Variação em 24h' }
    }
    case 'coinbase': {
      const url = `https://api.coinbase.com/v2/prices/${m.symbol}/spot`
      const r = parseCoinbaseSpot(await fetchJson(url, http))
      return { value: r.value, previous: null, changePct: null, referenceDate: toLocalDate(now, 'UTC'), asOf: now.toISOString(), url }
    }
    case 'kraken': {
      const url = `https://api.kraken.com/0/public/Ticker?pair=${m.symbol}`
      const r = parseKraken(await fetchJson(url, http))
      return { value: r.value, previous: null, changePct: r.changePct !== null ? Math.round(r.changePct * 100) / 100 : null, referenceDate: toLocalDate(now, 'UTC'), asOf: now.toISOString(), url, notes: 'Variação desde a abertura UTC' }
    }
    case 'bitstamp': {
      const url = `https://www.bitstamp.net/api/v2/ticker/${m.symbol}/`
      const r = parseBitstamp(await fetchJson(url, http))
      const asOf = r.time ?? now.toISOString()
      return { value: r.value, previous: null, changePct: r.changePct !== null ? Math.round(r.changePct * 100) / 100 : null, referenceDate: toLocalDate(asOf, 'UTC'), asOf, url, notes: 'Variação em 24h' }
    }
    case 'gemini': {
      const url = `https://api.gemini.com/v1/pubticker/${m.symbol}`
      const r = parseGemini(await fetchJson(url, http))
      const asOf = r.time ?? now.toISOString()
      return { value: r.value, previous: null, changePct: null, referenceDate: toLocalDate(asOf, 'UTC'), asOf, url }
    }
    case 'bok-ecos': {
      const key = env.BOK_ECOS_KEY ?? 'sample'
      const [stat, item] = m.symbol.split('/')
      const end = toLocalDate(now, 'Asia/Seoul').replace(/-/g, '')
      const start = addDays(toLocalDate(now, 'Asia/Seoul'), -14).replace(/-/g, '')
      const url = `https://ecos.bok.or.kr/api/StatisticSearch/${key}/json/en/1/10/${stat}/D/${start}/${end}/${item}`
      const { last, prev } = lastTwo(parseEcos(await fetchJson(url, http)))
      return { value: last.value, previous: prev?.value ?? null, changePct: pctChange(last.value, prev?.value), referenceDate: last.period, asOf: closeInstant(asset, last.period), url: redactUrl(url.replace(`/${key}/`, '/KEY/')), notes: key === 'sample' ? 'Chave pública de exemplo do BOK (cadastre BOK_ECOS_KEY para produção).' : undefined }
    }
    case 'twelvedata': {
      if (!env.TWELVEDATA_API_KEY) throw new Error('TWELVEDATA_API_KEY not configured')
      const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(m.symbol)}&apikey=${env.TWELVEDATA_API_KEY}`
      const r = parseTwelveData(await fetchJson(url, http))
      const refDate = (r.date ?? toLocalDate(now, asset.exchange.timezone)).slice(0, 10)
      return { value: r.value, previous: r.previous, changePct: r.changePct, referenceDate: refDate, asOf: closeInstant(asset, refDate), url: redactUrl(url) }
    }
  }
}

/** Sources that need a missing credential are skipped (not counted as failures). */
function skipReason(m: SourceMapping): string | null {
  const env = getEnv()
  if (m.sourceId === 'brapi' && !env.BRAPI_TOKEN) return 'BRAPI_TOKEN ausente'
  if (m.sourceId === 'twelvedata' && !env.TWELVEDATA_API_KEY) return 'TWELVEDATA_API_KEY ausente'
  return null
}

export async function collectMarkets(now = new Date(), assets = ASSETS.filter((a) => a.enabled), http: FetchOptions = {}): Promise<CollectorResult> {
  const result: CollectorResult = { observations: [], health: [], errors: [], skipped: [] }
  const retrievedAt = now.toISOString()
  const tasks = assets.flatMap((asset) =>
    asset.sources.map((m) => async () => {
      const skip = skipReason(m)
      if (skip) {
        result.skipped.push(`${asset.metric}@${m.sourceId}: ${skip}`)
        return
      }
      const started = Date.now()
      try {
        const f = await fetchMarketFromSource(asset, m, now, http)
        const obs: RawObservation = {
          sourceId: m.sourceId,
          category: 'MARKET',
          metric: asset.metric,
          value: f.value,
          unit: asset.unit,
          referencePeriod: f.referenceDate,
          asOf: f.asOf,
          retrievedAt,
          url: f.url,
          previousValue: f.previous,
          changePct: f.changePct,
          // Official fixings (PTAX, ECB reference rates) are final once published.
          marketStatus: m.sourceId === 'bcb-ptax' || m.sourceId === 'ecb-fx' ? 'CLOSED' : observationStatus(asset.exchange, f.referenceDate, now),
          notes: f.notes,
        }
        result.observations.push(obs)
        result.health.push({ source_id: `${m.sourceId}:${m.symbol}`, ok: true, items: 1, latency_ms: Date.now() - started, error: null })
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        result.health.push({ source_id: `${m.sourceId}:${m.symbol}`, ok: false, items: 0, latency_ms: Date.now() - started, error: message })
        result.errors.push({ step: 'collect_markets', source: `${m.sourceId}:${asset.metric}`, message, at: new Date().toISOString() })
      }
    }),
  )
  await pool(tasks, 6)
  return result
}
