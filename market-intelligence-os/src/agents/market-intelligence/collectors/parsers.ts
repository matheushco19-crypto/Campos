/**
 * Pure, deterministic parsers for every structured source.
 * No network here, so everything is unit-testable with fixtures.
 */

export interface SeriesPoint {
  period: string // YYYY-MM-DD (daily) or YYYY-MM (monthly) or YYYY-Qn
  value: number
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  if (s === '' || s === '.' || s === '-' || s === '...' || s.toUpperCase() === 'N/A' || s.toUpperCase() === 'ND') return null
  const n = Number(s.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** Minimal RFC4180 CSV parser (quoted fields, commas, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      if (row.some((f) => f !== '')) rows.push(row)
      row = []
      field = ''
    } else field += c
  }
  row.push(field)
  if (row.some((f) => f !== '')) rows.push(row)
  return rows
}

export function csvObjects(text: string): Record<string, string>[] {
  const [header, ...rows] = parseCsv(text)
  if (!header) return []
  return rows.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? '').trim()])))
}

/** dd/mm/yyyy → yyyy-mm-dd */
export const brDateToIso = (d: string) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d.trim())
  if (!m) throw new Error(`Invalid BR date "${d}"`)
  return `${m[3]}-${m[2]}-${m[1]}`
}

/** mm/dd/yyyy → yyyy-mm-dd */
export const usDateToIso = (d: string) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d.trim())
  if (!m) throw new Error(`Invalid US date "${d}"`)
  return `${m[3]}-${m[1]}-${m[2]}`
}

/* ------------------------------ BCB SGS ------------------------------ */
/** [{ data: "28/09/2026", valor: "15.00" }] → points (ascending). Monthly series use day 01. */
export function parseSgs(json: unknown, frequency: 'daily' | 'monthly' | string): SeriesPoint[] {
  if (!Array.isArray(json)) throw new Error('SGS: expected array')
  const out: SeriesPoint[] = []
  for (const row of json as { data?: string; valor?: string }[]) {
    const v = num(row.valor)
    if (v === null || !row.data) continue
    const iso = brDateToIso(row.data)
    out.push({ period: frequency === 'daily' || frequency === 'meeting' ? iso : iso.slice(0, 7), value: v })
  }
  return out.sort((a, b) => a.period.localeCompare(b.period))
}

/* ------------------------------ IBGE SIDRA --------------------------- */
/** SIDRA API v3 agregados → points. Period keys like "202608" (monthly) or "202602" trimester-moving. */
export function parseSidra(json: unknown): SeriesPoint[] {
  if (!Array.isArray(json) || !json.length) throw new Error('SIDRA: empty response')
  const serie = (json as { resultados?: { series?: { serie?: Record<string, string> }[] }[] }[])[0]?.resultados?.[0]?.series?.[0]?.serie
  if (!serie) throw new Error('SIDRA: unexpected shape')
  return Object.entries(serie)
    .map(([k, v]) => ({ period: /^\d{6}$/.test(k) ? `${k.slice(0, 4)}-${k.slice(4)}` : k, value: num(v) }))
    .filter((p): p is SeriesPoint => p.value !== null)
    .sort((a, b) => a.period.localeCompare(b.period))
}

/* ------------------------------ BCB Focus ---------------------------- */
export function parseFocus(json: unknown): { date: string; reference: string; median: number } | null {
  const rows = (json as { value?: { Data: string; DataReferencia: string; Mediana: number; baseCalculo?: number }[] })?.value
  if (!Array.isArray(rows) || !rows.length) return null
  // baseCalculo 0 = all respondents (default published figure).
  const sorted = rows.filter((r) => r.baseCalculo === undefined || r.baseCalculo === 0).sort((a, b) => b.Data.localeCompare(a.Data))
  const r = sorted[0]
  if (!r || typeof r.Mediana !== 'number') return null
  return { date: r.Data, reference: r.DataReferencia, median: r.Mediana }
}

/* ------------------------------ FRED --------------------------------- */
export function parseFredJson(json: unknown): SeriesPoint[] {
  const obs = (json as { observations?: { date: string; value: string }[] })?.observations
  if (!Array.isArray(obs)) throw new Error('FRED: unexpected shape')
  return obs
    .map((o) => ({ period: o.date, value: num(o.value) }))
    .filter((p): p is SeriesPoint => p.value !== null)
    .sort((a, b) => a.period.localeCompare(b.period))
}

/** fredgraph.csv: "observation_date,SERIES" (older: "DATE,SERIES"). */
export function parseFredCsv(text: string): SeriesPoint[] {
  const rows = parseCsv(text)
  if (rows.length < 2) throw new Error('FRED CSV: empty')
  return rows
    .slice(1)
    .map((r) => ({ period: r[0], value: num(r[1]) }))
    .filter((p): p is SeriesPoint => p.value !== null && /^\d{4}-\d{2}-\d{2}$/.test(p.period))
    .sort((a, b) => a.period.localeCompare(b.period))
}

/* ------------------------------ BLS ---------------------------------- */
export function parseBls(json: unknown, seriesId: string): SeriesPoint[] {
  const j = json as { status?: string; message?: string[]; Results?: { series?: { seriesID: string; data: { year: string; period: string; value: string }[] }[] } }
  if (j.status && j.status !== 'REQUEST_SUCCEEDED') throw new Error(`BLS: ${j.status} ${(j.message ?? []).join('; ')}`)
  const s = j.Results?.series?.find((x) => x.seriesID === seriesId)
  if (!s) throw new Error(`BLS: series ${seriesId} missing`)
  return s.data
    .filter((d) => /^M(0[1-9]|1[0-2])$/.test(d.period))
    .map((d) => ({ period: `${d.year}-${d.period.slice(1)}`, value: num(d.value) }))
    .filter((p): p is SeriesPoint => p.value !== null)
    .sort((a, b) => a.period.localeCompare(b.period))
}

/* ------------------------------ ECB ---------------------------------- */
export function parseEcbCsv(text: string): SeriesPoint[] {
  const rows = csvObjects(text)
  if (!rows.length) throw new Error('ECB: empty')
  return rows
    .map((r) => ({ period: r.TIME_PERIOD, value: num(r.OBS_VALUE) }))
    .filter((p): p is SeriesPoint => !!p.period && p.value !== null)
    .sort((a, b) => a.period.localeCompare(b.period))
}

/** ECB EXR CSV with several currencies → rows. */
export function parseEcbFx(text: string): { date: string; currency: string; value: number }[] {
  return csvObjects(text)
    .map((r) => ({ date: r.TIME_PERIOD, currency: r.CURRENCY, value: num(r.OBS_VALUE) }))
    .filter((r): r is { date: string; currency: string; value: number } => !!r.date && !!r.currency && r.value !== null)
}

/* ------------------------------ US Treasury -------------------------- */
export function parseTreasuryCsv(text: string, column: string): SeriesPoint[] {
  const rows = csvObjects(text)
  if (!rows.length) throw new Error('Treasury: empty CSV')
  if (!(column in rows[0])) throw new Error(`Treasury: column "${column}" missing`)
  return rows
    .map((r) => ({ period: usDateToIso(r.Date), value: num(r[column]) }))
    .filter((p): p is SeriesPoint => p.value !== null)
    .sort((a, b) => a.period.localeCompare(b.period))
}

/* ------------------------------ Stooq -------------------------------- */
/** Daily history CSV: Date,Open,High,Low,Close,Volume */
export function parseStooqHistory(text: string): SeriesPoint[] {
  if (/no data|exceeded|captcha|<html/i.test(text.slice(0, 500))) throw new Error('Stooq: no data or access limited')
  const rows = csvObjects(text)
  return rows
    .map((r) => ({ period: r.Date, value: num(r.Close) }))
    .filter((p): p is SeriesPoint => p.value !== null && /^\d{4}-\d{2}-\d{2}$/.test(p.period))
    .sort((a, b) => a.period.localeCompare(b.period))
}

/* ------------------------------ brapi -------------------------------- */
export function parseBrapiQuote(json: unknown) {
  const r = (json as { results?: { symbol: string; regularMarketPrice?: number; regularMarketChangePercent?: number; regularMarketPreviousClose?: number; regularMarketTime?: string }[] })?.results?.[0]
  if (!r || typeof r.regularMarketPrice !== 'number') throw new Error('brapi: no price')
  return {
    value: r.regularMarketPrice,
    changePct: typeof r.regularMarketChangePercent === 'number' ? r.regularMarketChangePercent : null,
    previous: typeof r.regularMarketPreviousClose === 'number' ? r.regularMarketPreviousClose : null,
    time: r.regularMarketTime ?? null,
  }
}

export function parseBrapiCurrency(json: unknown) {
  const r = (json as { currency?: { bidPrice?: string; pctChange?: string; updatedAtDate?: string }[] })?.currency?.[0]
  const v = num(r?.bidPrice)
  if (!r || v === null) throw new Error('brapi currency: no price')
  return { value: v, changePct: num(r.pctChange), time: r.updatedAtDate ?? null }
}

/* ------------------------------ Crypto ------------------------------- */
export function parseCoingecko(json: unknown, id: string) {
  const r = (json as Record<string, { usd?: number; usd_24h_change?: number; last_updated_at?: number }>)?.[id]
  if (!r || typeof r.usd !== 'number') throw new Error('CoinGecko: no price')
  return { value: r.usd, changePct: r.usd_24h_change ?? null, time: r.last_updated_at ? new Date(r.last_updated_at * 1000).toISOString() : null }
}

export function parseCoinbaseSpot(json: unknown) {
  const v = num((json as { data?: { amount?: string } })?.data?.amount)
  if (v === null) throw new Error('Coinbase: no price')
  return { value: v }
}

export function parseKraken(json: unknown) {
  const j = json as { error?: string[]; result?: Record<string, { c?: string[]; o?: string }> }
  if (j.error?.length) throw new Error(`Kraken: ${j.error.join('; ')}`)
  const first = j.result ? Object.values(j.result)[0] : undefined
  const v = num(first?.c?.[0])
  const open = num(first?.o)
  if (v === null) throw new Error('Kraken: no price')
  return { value: v, changePct: open ? ((v - open) / open) * 100 : null }
}

export function parseBitstamp(json: unknown) {
  const j = json as { last?: string; open?: string; timestamp?: string }
  const v = num(j?.last)
  if (v === null) throw new Error('Bitstamp: no price')
  const open = num(j.open)
  return { value: v, changePct: open ? ((v - open) / open) * 100 : null, time: j.timestamp ? new Date(Number(j.timestamp) * 1000).toISOString() : null }
}

export function parseGemini(json: unknown) {
  const j = json as { last?: string; volume?: { timestamp?: number } }
  const v = num(j?.last)
  if (v === null) throw new Error('Gemini: no price')
  return { value: v, time: j.volume?.timestamp ? new Date(j.volume.timestamp).toISOString() : null }
}

/** Bank of Korea ECOS StatisticSearch → points (TIME = YYYYMMDD). */
export function parseEcos(json: unknown): SeriesPoint[] {
  const j = json as { StatisticSearch?: { row?: { TIME: string; DATA_VALUE: string }[] }; RESULT?: { CODE: string; MESSAGE: string } }
  if (!j.StatisticSearch?.row) throw new Error(`ECOS: ${j.RESULT?.MESSAGE ?? 'no rows'}`)
  return j.StatisticSearch.row
    .map((r) => ({ period: `${r.TIME.slice(0, 4)}-${r.TIME.slice(4, 6)}-${r.TIME.slice(6, 8)}`, value: num(String(r.DATA_VALUE).replace(/,/g, '')) }))
    .filter((p): p is SeriesPoint => p.value !== null)
    .sort((a, b) => a.period.localeCompare(b.period))
}

/** ICE's published DXY formula applied to ECB reference rates (units of currency per EUR). */
export const DXY_WEIGHTS = { EUR: -0.576, JPY: 0.136, GBP: -0.119, CAD: 0.091, SEK: 0.042, CHF: 0.036 } as const
export function dxyFromEcb(perEur: Record<string, number>): number {
  const usd = perEur.USD
  for (const c of ['USD', 'JPY', 'GBP', 'CAD', 'SEK', 'CHF']) if (!perEur[c]) throw new Error(`DXY: missing ${c}`)
  const eurusd = usd
  const usdjpy = perEur.JPY / usd
  const gbpusd = usd / perEur.GBP
  const usdcad = perEur.CAD / usd
  const usdsek = perEur.SEK / usd
  const usdchf = perEur.CHF / usd
  const v = 50.14348112 * eurusd ** DXY_WEIGHTS.EUR * usdjpy ** DXY_WEIGHTS.JPY * gbpusd ** DXY_WEIGHTS.GBP * usdcad ** DXY_WEIGHTS.CAD * usdsek ** DXY_WEIGHTS.SEK * usdchf ** DXY_WEIGHTS.CHF
  return Math.round(v * 1000) / 1000
}

/* ------------------------------ Twelve Data -------------------------- */
export function parseTwelveData(json: unknown) {
  const j = json as { status?: string; message?: string; close?: string; previous_close?: string; percent_change?: string; datetime?: string; is_market_open?: boolean }
  if (j.status === 'error') throw new Error(`TwelveData: ${j.message}`)
  const v = num(j.close)
  if (v === null) throw new Error('TwelveData: no close')
  return { value: v, previous: num(j.previous_close), changePct: num(j.percent_change), date: j.datetime ?? null, open: j.is_market_open ?? null }
}

/* ------------------------------ Transforms --------------------------- */
/** Year-over-year % change for monthly index series. */
export function yoy(points: SeriesPoint[]): SeriesPoint[] {
  const byPeriod = new Map(points.map((p) => [p.period, p.value]))
  const out: SeriesPoint[] = []
  for (const p of points) {
    const [y, m] = p.period.split('-')
    const prev = byPeriod.get(`${Number(y) - 1}-${m}`)
    if (prev) out.push({ period: p.period, value: round(((p.value - prev) / prev) * 100, 2) })
  }
  return out
}

/** First difference (e.g. payroll level → monthly change). */
export function diff(points: SeriesPoint[]): SeriesPoint[] {
  const out: SeriesPoint[] = []
  for (let i = 1; i < points.length; i++) out.push({ period: points[i].period, value: round(points[i].value - points[i - 1].value, 1) })
  return out
}

export const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d

export const pctChange = (value: number, previous: number | null | undefined) =>
  previous ? round(((value - previous) / previous) * 100, 2) : null

/* ------------------------------ FMP ---------------------------------- */
/** /stable/quote → [{ symbol, price, previousClose, changePercentage, timestamp }] */
export function parseFmpQuote(json: unknown) {
  const arr = Array.isArray(json) ? json : []
  const j = arr[0] as { price?: number; previousClose?: number; changePercentage?: number; changesPercentage?: number; timestamp?: number } | undefined
  if (!j) throw new Error('FMP: empty response')
  const v = num(j.price)
  if (v === null) throw new Error('FMP: no price')
  return { value: v, previous: num(j.previousClose), changePct: num(j.changePercentage ?? j.changesPercentage), time: j.timestamp ? new Date(j.timestamp * 1000).toISOString() : null }
}

/* ------------------------------ Yahoo (unofficial) -------------------- */
/**
 * v8 chart JSON (range=5d, interval=1d) → daily bars in the exchange timezone,
 * plus the timestamp of the last trade. Structured JSON only, never HTML.
 */
export function parseYahooChart(json: unknown): { bars: SeriesPoint[]; lastTrade: string | null; currency: string | null; timezone: string | null } {
  const r = (json as { chart?: { result?: unknown[]; error?: { description?: string } | null } })?.chart
  if (r?.error) throw new Error(`Yahoo: ${r.error.description ?? 'error'}`)
  const res = r?.result?.[0] as
    | { meta?: { regularMarketTime?: number; currency?: string; exchangeTimezoneName?: string }; timestamp?: number[]; indicators?: { quote?: { close?: (number | null)[] }[] } }
    | undefined
  if (!res?.timestamp?.length) throw new Error('Yahoo: no data')
  const tz = res.meta?.exchangeTimezoneName ?? 'UTC'
  const closes = res.indicators?.quote?.[0]?.close ?? []
  const byDate = new Map<string, number>()
  res.timestamp.forEach((t, i) => {
    const c = closes[i]
    if (typeof c === 'number' && Number.isFinite(c)) byDate.set(new Date(t * 1000).toLocaleDateString('en-CA', { timeZone: tz }), c)
  })
  const bars = [...byDate.entries()].map(([period, value]) => ({ period, value })).sort((a, b) => a.period.localeCompare(b.period))
  if (!bars.length) throw new Error('Yahoo: no closes')
  return { bars, lastTrade: res.meta?.regularMarketTime ? new Date(res.meta.regularMarketTime * 1000).toISOString() : null, currency: res.meta?.currency ?? null, timezone: res.meta?.exchangeTimezoneName ?? null }
}


export function parseYahooQuote(json: unknown): { value: number; previous: number | null; changePct: number | null; lastTrade: string | null; currency: string | null; timezone: string | null } {
  const r = (json as { quoteResponse?: { result?: unknown[]; error?: { description?: string } | null } })?.quoteResponse
  if (r?.error) throw new Error(`Yahoo quote: ${r.error.description ?? 'error'}`)
  const q = r?.result?.[0] as
    | { regularMarketPrice?: number; regularMarketPreviousClose?: number; regularMarketChangePercent?: number; regularMarketTime?: number; currency?: string; exchangeTimezoneName?: string }
    | undefined
  if (typeof q?.regularMarketPrice !== 'number' || !Number.isFinite(q.regularMarketPrice)) throw new Error('Yahoo quote: no current price')
  return {
    value: q.regularMarketPrice,
    previous: typeof q.regularMarketPreviousClose === 'number' && Number.isFinite(q.regularMarketPreviousClose) ? q.regularMarketPreviousClose : null,
    changePct: typeof q.regularMarketChangePercent === 'number' && Number.isFinite(q.regularMarketChangePercent) ? q.regularMarketChangePercent : null,
    lastTrade: q.regularMarketTime ? new Date(q.regularMarketTime * 1000).toISOString() : null,
    currency: q.currency ?? null,
    timezone: q.exchangeTimezoneName ?? null,
  }
}


/* ------------------------------ B3 Arquivos Públicos ------------------ */
export interface DiContractRow {
  code: string
  date: string
  /** Settlement rate, % a.a. (AdjstdQtTax). */
  rate: number
  trades: number
}

const brNum = (v: string | undefined): number | null => {
  if (!v) return null
  const n = Number(v.trim().replace(/\./g, '').replace(',', '.'))
  return v.trim() === '' || !Number.isFinite(n) ? null : n
}

/**
 * TradeInformationConsolidatedFile (semicolon CSV, pt-BR numbers):
 * "Status do Arquivo: Final" line, then RptDt;TckrSymb;…;AdjstdQt;AdjstdQtTax;…
 * Only DI1 futures with a settlement rate are kept.
 */
export function parseB3DiFile(text: string): { status: string | null; rows: DiContractRow[] } {
  const lines = text.split(/\r?\n/)
  const status = /Status do Arquivo:\s*(\S+)/i.exec(lines.slice(0, 3).join(' '))?.[1] ?? null
  const hi = lines.findIndex((l) => l.startsWith('RptDt;'))
  if (hi < 0) throw new Error('B3: header not found')
  const header = lines[hi].split(';').map((h) => h.trim())
  const col = (n: string) => header.indexOf(n)
  const [iDate, iSym, iRate, iTrades] = [col('RptDt'), col('TckrSymb'), col('AdjstdQtTax'), col('TradQty')]
  if ([iDate, iSym, iRate].some((i) => i < 0)) throw new Error('B3: required columns missing')
  const rows: DiContractRow[] = []
  for (const l of lines.slice(hi + 1)) {
    if (!l.startsWith('20') || !l.includes(';DI1')) continue
    const f = l.split(';')
    const code = f[iSym]?.trim()
    if (!code || !/^DI1[FGHJKMNQUVXZ]\d{2}$/.test(code)) continue
    const rate = brNum(f[iRate])
    if (rate === null) continue
    rows.push({ code, date: f[iDate].trim(), rate, trades: brNum(f[iTrades]) ?? 0 })
  }
  if (!rows.length) throw new Error('B3: no DI1 rows')
  return { status, rows }
}
