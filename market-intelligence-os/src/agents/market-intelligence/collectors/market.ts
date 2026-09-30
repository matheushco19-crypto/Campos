import { ASSETS, DI_BUCKETS, type AssetConfig, type SourceMapping } from '../../../../config/assets'
import { getEnv } from '../../../core/env'
import { fetchJson, fetchText, redactUrl, type FetchOptions } from '../../../core/http'
import type { Instrument, RawObservation } from '../../../core/schemas'
import { addDays, toLocalDate, toLocalTime, weekdayOf, zonedToUtc } from '../../../core/time'
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
  parseFmpQuote,
  parseYahooChart,
  parseYahooQuote,
  parseB3DiFile,
  pctChange,
  type DiContractRow,
  type SeriesPoint,
} from './parsers'
import { describeSession, observationStatus } from './market-status'
import { isBusinessDay, selectDiBucket } from './di-curve'
import type { CollectorResult } from './types'
import { pool } from '../../../core/pool'

type Fetched = { value: number; referenceDate: string; asOf: string; changePct: number | null; previous: number | null; url: string; notes?: string; instrument?: Instrument }

const lastTwo = (points: SeriesPoint[]) => {
  const last = points.at(-1)
  if (!last) throw new Error('no observations')
  const prev = points.at(-2)
  return { last, prev }
}

/** Close of a daily series, stamped at the exchange's closing time. */
const closeInstant = (asset: AssetConfig, date: string) => zonedToUtc(date, asset.exchange.close, asset.exchange.timezone)

/**
 * Quote APIs stamp the last feed update, not the session. A timestamp before the
 * open (or on a weekend) belongs to the previous session; after the close it is
 * the close of that day.
 */
export function sessionOf(asset: AssetConfig, instant: string): { referenceDate: string; asOf: string } {
  const tz = asset.exchange.timezone
  let date = toLocalDate(instant, tz)
  const hhmm = toLocalTime(instant, tz)
  const isWeekend = (d: string) => asset.exchange.weekdaysOnly && [0, 6].includes(weekdayOf(d))
  if (hhmm < asset.exchange.open || isWeekend(date)) {
    do date = addDays(date, -1)
    while (isWeekend(date))
    return { referenceDate: date, asOf: closeInstant(asset, date) }
  }
  return { referenceDate: date, asOf: hhmm > asset.exchange.close ? closeInstant(asset, date) : new Date(instant).toISOString() }
}

/**
 * Morning rule: daily series only use COMPLETED sessions. Today's bar is dropped
 * while the exchange has not closed yet (e.g. Europe at 05:00 BRT), so an intraday
 * value is never taken as a close.
 */
export function completedBars(asset: AssetConfig, bars: SeriesPoint[], now: Date): SeriesPoint[] {
  if (asset.exchange.always) return bars
  const today = toLocalDate(now, asset.exchange.timezone)
  const closed = toLocalTime(now, asset.exchange.timezone) >= asset.exchange.close
  return bars.filter((b) => b.period < today || (b.period === today && closed))
}

/* B3 consolidated trade files are immutable once "Final": cached per date for the process lifetime. */
const b3Cache = new Map<string, Promise<DiContractRow[]>>()
const B3_BASE = 'https://arquivos.b3.com.br/api/download'

export async function fetchB3DiRows(date: string, http: FetchOptions = {}): Promise<DiContractRow[]> {
  const cached = b3Cache.get(date)
  if (cached) return cached
  const p = (async () => {
    const meta = (await fetchJson(`${B3_BASE}/requestname?fileName=TradeInformationConsolidatedFile&date=${date}`, { timeoutMs: 20_000, ...http })) as { redirectUrl?: string; token?: string }
    const token = meta.token ?? /token=([^&]+)/.exec(meta.redirectUrl ?? '')?.[1]
    if (!token) throw new Error(`B3: no file for ${date}`)
    const { status, rows } = parseB3DiFile(await fetchText(`${B3_BASE}/?token=${encodeURIComponent(token)}`, { timeoutMs: 45_000, retries: 1, maxBytes: 15_000_000, ...http }))
    if (status && !/final/i.test(status)) throw new Error(`B3: file for ${date} is not final (${status})`)
    return rows
  })()
  b3Cache.set(date, p)
  p.catch(() => b3Cache.delete(date))
  return p
}

/** Latest final DI1 file on or before `now` (Brazil), plus the previous business day's file for the bps change. */
async function latestDiFiles(now: Date, http: FetchOptions): Promise<{ rows: DiContractRow[]; previous: DiContractRow[]; date: string }> {
  let d = toLocalDate(now, 'America/Sao_Paulo')
  let lastError: unknown = null
  for (let i = 0; i < 6; i++, d = addDays(d, -1)) {
    if (!isBusinessDay(d)) continue
    try {
      const rows = await fetchB3DiRows(d, http)
      let p = addDays(d, -1)
      while (!isBusinessDay(p)) p = addDays(p, -1)
      const previous = await fetchB3DiRows(p, http).catch(() => [] as DiContractRow[])
      return { rows, previous, date: d }
    } catch (e) {
      lastError = e
    }
  }
  throw lastError instanceof Error ? lastError : new Error('B3: no DI1 file found in the last 6 days')
}

export async function fetchMarketFromSource(asset: AssetConfig, m: SourceMapping, now: Date, http: FetchOptions = {}, options: { liveQuote?: boolean } = {}): Promise<Fetched> {
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
      const session = sessionOf(asset, r.time ? new Date(r.time).toISOString() : now.toISOString())
      return { value: r.value, changePct: r.changePct, previous: r.previous, ...session, url: redactUrl(url) }
    }
    case 'stooq': {
      const d2 = toLocalDate(now, 'UTC').replace(/-/g, '')
      const d1 = addDays(toLocalDate(now, 'UTC'), -12).replace(/-/g, '')
      const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(m.symbol)}&i=d&d1=${d1}&d2=${d2}`
      const { last, prev } = lastTwo(completedBars(asset, parseStooqHistory(await fetchText(url, http)), now))
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
    case 'fmp': {
      if (!env.FMP_API_KEY) throw new Error('FMP_API_KEY not configured')
      const url = `https://financialmodelingprep.com/stable/quote?symbol=${encodeURIComponent(m.symbol)}&apikey=${env.FMP_API_KEY}`
      const r = parseFmpQuote(await fetchJson(url, http))
      const session = sessionOf(asset, r.time ?? now.toISOString())
      return { value: r.value, previous: r.previous, changePct: r.changePct, ...session, url: redactUrl(url) }
    }
    case 'yahoo': {
      // Unofficial structured JSON (never HTML). Display fallback only: never counts toward VERIFIED.
      if (options.liveQuote) {
        const url = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(m.symbol)}`
        const q = parseYahooQuote(await fetchJson(url, { retries: 0, ...http }))
        const trade = q.lastTrade ?? now.toISOString()
        const session = sessionOf(asset, trade)
        return { value: q.value, previous: q.previous, changePct: q.changePct, ...session, url, notes: 'Yahoo Finance (fornecedor não oficial): cotação corrente para execução manual; não conta para VERIFIED.' }
      }
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(m.symbol)}?range=5d&interval=1d`
      const { bars } = parseYahooChart(await fetchJson(url, { retries: 0, ...http }))
      const { last, prev } = lastTwo(completedBars(asset, bars, now))
      return { value: last.value, previous: prev?.value ?? null, changePct: pctChange(last.value, prev?.value), referenceDate: last.period, asOf: closeInstant(asset, last.period), url, notes: 'Yahoo Finance (fornecedor não oficial): não conta para VERIFIED.' }
    }
    case 'b3-arquivos': {
      const target = DI_BUCKETS.find(([b]) => b === m.symbol)
      if (!target) throw new Error(`unknown DI bucket ${m.symbol}`)
      const { rows, previous, date } = await latestDiFiles(now, http)
      const pick = selectDiBucket(rows, target[0], target[1], previous)
      if (!pick) throw new Error(`DI1 ${m.symbol}: nenhum contrato dentro da distância permitida do prazo`)
      const url = `https://arquivos.b3.com.br/tabelas/TradeInformationConsolidated/${date}`
      return {
        value: pick.rate,
        previous: pick.previous,
        changePct: null,
        referenceDate: pick.date,
        asOf: zonedToUtc(pick.date, '18:00', 'America/Sao_Paulo'),
        url,
        instrument: { code: pick.code, maturity: pick.maturity, calendar_days: pick.calendar_days, business_days: pick.business_days, bucket: pick.bucket },
        notes: `Contrato ${pick.code} (vencimento ${pick.maturity}, ${pick.business_days} dias úteis). Taxa de ajuste B3.${pick.previous !== null ? ` Variação: ${Math.round((pick.rate - pick.previous) * 100)} bps.` : ''}`,
      }
    }
  }
}

/**
 * Sources that need a missing credential, or that block this host, are skipped
 * (recorded, not counted as failures). A source that refuses us is never retried
 * around its block.
 */
export function skipReason(m: SourceMapping, options: { liveQuote?: boolean } = {}): string | null {
  const env = getEnv()
  if (m.sourceId === 'brapi' && !env.BRAPI_TOKEN) return 'BRAPI_TOKEN ausente'
  if (m.sourceId === 'twelvedata' && !env.TWELVEDATA_API_KEY) return 'TWELVEDATA_API_KEY ausente'
  if (m.sourceId === 'fmp' && !env.FMP_API_KEY) return 'FMP_API_KEY ausente'
  if (m.sourceId === 'yahoo' && env.MI_ENABLE_YAHOO_FALLBACK !== 'true' && !options.liveQuote) return 'Yahoo (não oficial) desligado (MI_ENABLE_YAHOO_FALLBACK=false)'
  if (m.sourceId === 'coingecko' && !env.COINGECKO_DEMO_KEY) return 'COINGECKO_DEMO_KEY ausente (403 sem chave)'
  if (m.sourceId === 'stooq' && env.MI_ENABLE_STOOQ !== 'true') return 'Stooq bloqueia IPs de datacenter (MI_ENABLE_STOOQ=false)'
  return null
}

export async function collectMarkets(now = new Date(), assets = ASSETS.filter((a) => a.enabled), http: FetchOptions = {}, options: { liveQuote?: boolean } = {}): Promise<CollectorResult> {
  const result: CollectorResult = { observations: [], health: [], errors: [], skipped: [] }
  const retrievedAt = now.toISOString()
  const tasks = assets.flatMap((asset) =>
    asset.sources.map((m) => async () => {
      const skip = skipReason(m, options)
      if (skip) {
        result.skipped.push(`${asset.metric}@${m.sourceId}: ${skip}`)
        return
      }
      const started = Date.now()
      try {
        const f = await fetchMarketFromSource(asset, m, now, http, options)
        // Official fixings (PTAX, ECB reference rates) and B3 settlements are final once published.
        const marketStatus = ['bcb-ptax', 'ecb-fx', 'b3-arquivos'].includes(m.sourceId) ? 'CLOSED' : observationStatus(asset.exchange, f.referenceDate, now)
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
          marketStatus,
          session: describeSession(asset, m.sourceId, f.referenceDate, f.asOf, marketStatus, now),
          instrument: f.instrument,
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
