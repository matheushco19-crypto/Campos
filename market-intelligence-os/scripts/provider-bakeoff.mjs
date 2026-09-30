/**
 * MARKET DATA PROVIDER BAKEOFF (read-only, run manually, ~60 requests).
 *   node scripts/provider-bakeoff.mjs > bakeoff.json
 * Twelve Data: symbols discovered through its own reference endpoints (/symbol_search,
 * /indices, /forex_pairs, /cryptocurrencies); quotes only if TWELVEDATA_API_KEY is set.
 * FMP: only if FMP_API_KEY is set (batch quote). Yahoo: technical PoC via the JSON chart
 * endpoint (no HTML scraping); never a primary institutional source.
 */
const TD = process.env.TWELVEDATA_API_KEY
const FMP = process.env.FMP_API_KEY
const ASSETS = [
  { key: 'IBOV', group: 'core', td: { type: 'index', q: ['BVSP', 'IBOV'] }, fmp: '^BVSP', yahoo: '^BVSP' },
  { key: 'SPX', group: 'core', td: { type: 'index', q: ['SPX', 'GSPC'] }, fmp: '^GSPC', yahoo: '^GSPC' },
  { key: 'NASDAQ', group: 'core', td: { type: 'index', q: ['IXIC'] }, fmp: '^IXIC', yahoo: '^IXIC' },
  { key: 'DJI', group: 'core', td: { type: 'index', q: ['DJI'] }, fmp: '^DJI', yahoo: '^DJI' },
  { key: 'USDBRL', group: 'core', td: { type: 'forex', q: ['USD/BRL'] }, fmp: 'USDBRL', yahoo: 'BRL=X' },
  { key: 'EURBRL', group: 'core', td: { type: 'forex', q: ['EUR/BRL'] }, fmp: 'EURBRL', yahoo: 'EURBRL=X' },
  { key: 'BTCUSD', group: 'core', td: { type: 'crypto', q: ['BTC/USD'] }, fmp: 'BTCUSD', yahoo: 'BTC-USD' },
  { key: 'DXY', group: 'extended', td: { type: 'index', q: ['DXY', 'DX'] }, fmp: 'DX-Y.NYB', yahoo: 'DX-Y.NYB' },
  { key: 'EUROSTOXX50', group: 'extended', td: { type: 'index', q: ['SX5E', 'STOXX50E'] }, fmp: '^STOXX50E', yahoo: '^STOXX50E' },
  { key: 'DAX', group: 'extended', td: { type: 'index', q: ['GDAXI', 'DAX'] }, fmp: '^GDAXI', yahoo: '^GDAXI' },
  { key: 'FTSE100', group: 'extended', td: { type: 'index', q: ['FTSE', 'UKX'] }, fmp: '^FTSE', yahoo: '^FTSE' },
  { key: 'NIKKEI', group: 'extended', td: { type: 'index', q: ['N225'] }, fmp: '^N225', yahoo: '^N225' },
  { key: 'HANGSENG', group: 'extended', td: { type: 'index', q: ['HSI'] }, fmp: '^HSI', yahoo: '^HSI' },
  { key: 'SHANGHAI', group: 'extended', td: { type: 'index', q: ['000001', 'SSEC'] }, fmp: '000001.SS', yahoo: '000001.SS' },
  { key: 'KOSPI', group: 'extended', td: { type: 'index', q: ['KS11', 'KOSPI'] }, fmp: '^KS11', yahoo: '^KS11' },
]
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function get(url, headers = {}) {
  const t0 = Date.now()
  try {
    const res = await fetch(url, { headers: { 'user-agent': 'market-intelligence-os/bakeoff', ...headers }, signal: AbortSignal.timeout(20000) })
    const text = await res.text()
    let json = null
    try { json = JSON.parse(text) } catch {}
    return { status: res.status, ms: Date.now() - t0, json, text: json ? undefined : text.slice(0, 200) }
  } catch (e) {
    return { status: 0, ms: Date.now() - t0, error: String(e) }
  }
}
const redact = (u) => u.replace(/(apikey=)[^&]+/, '$1***')

async function twelveData() {
  // Reference lists (public, no key).
  const [indices, forex, crypto] = await Promise.all([get('https://api.twelvedata.com/indices'), get('https://api.twelvedata.com/forex_pairs'), get('https://api.twelvedata.com/cryptocurrencies')])
  const idx = indices.json?.data ?? []
  const out = []
  for (const a of ASSETS) {
    const r = { asset: a.key, group: a.group, tested: a.td.q, accepted: null, endpoint: null, http: null, value: null, timestamp: null, reference: null, market: null, currency: null, plan: null, delay_note: null, error: null }
    let found = null
    if (a.td.type === 'index') found = idx.find((x) => a.td.q.includes(x.symbol))
    if (a.td.type === 'forex') found = (forex.json?.data ?? []).find((x) => a.td.q.includes(x.symbol))
    if (a.td.type === 'crypto') found = (crypto.json?.data ?? []).find((x) => a.td.q.includes(x.symbol))
    if (!found) {
      for (const q of a.td.q) {
        const s = await get(`https://api.twelvedata.com/symbol_search?symbol=${encodeURIComponent(q)}&outputsize=10`)
        const hit = (s.json?.data ?? []).find((x) => x.symbol === q && /index|physical currency|digital currency/i.test(x.instrument_type ?? ''))
        if (hit) { found = { ...hit, via: 'symbol_search' }; break }
        await sleep(300)
      }
    }
    if (found) {
      r.accepted = found.symbol
      r.market = found.exchange ?? found.mic_code ?? null
      r.currency = found.currency ?? found.currency_quote ?? null
      r.reference = found.via ?? `/${a.td.type === 'index' ? 'indices' : a.td.type === 'forex' ? 'forex_pairs' : 'cryptocurrencies'}`
    } else r.error = 'símbolo não encontrado nos endpoints de referência'
    if (found && TD) {
      const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(found.symbol)}${found.mic_code ? `&mic_code=${found.mic_code}` : ''}&apikey=${TD}`
      const q = await get(url)
      r.endpoint = redact(url); r.http = q.status
      if (q.json?.status === 'error') { r.error = q.json.message?.slice(0, 160); r.plan = /plan|upgrade|grow|pro/i.test(q.json.message ?? '') ? 'não incluído no plano' : 'erro' }
      else if (q.json) { r.value = Number(q.json.close); r.timestamp = q.json.timestamp ? new Date(q.json.timestamp * 1000).toISOString() : null; r.reference = q.json.datetime; r.plan = 'incluído'; r.delay_note = q.json.is_market_open === false ? 'mercado fechado: último fechamento' : 'intraday (atraso conforme plano)' }
      await sleep(8000) // free plan: 8 requests/min
    } else if (found) {
      r.endpoint = 'https://api.twelvedata.com/quote'; r.plan = 'não testado: TWELVEDATA_API_KEY ausente (cotação exige chave própria; a chave demo retorna 401)'
    }
    out.push(r)
  }
  return { reference_lists: { indices: indices.status, indices_count: idx.length, forex_pairs: forex.status, cryptocurrencies: crypto.status }, results: out }
}

async function fmp() {
  if (!FMP) return { skipped: 'FMP_API_KEY ausente no ambiente' }
  const syms = ASSETS.map((a) => a.fmp).join(',')
  const url = `https://financialmodelingprep.com/stable/batch-quote?symbols=${encodeURIComponent(syms)}&apikey=${FMP}`
  const r = await get(url)
  return { endpoint: redact(url), http: r.status, results: r.json }
}

async function yahoo() {
  const out = []
  for (const a of ASSETS) {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(a.yahoo)}?range=5d&interval=1d`
    const r = await get(url, { 'user-agent': 'Mozilla/5.0' })
    const m = r.json?.chart?.result?.[0]?.meta
    const closes = r.json?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? []
    const ts = r.json?.chart?.result?.[0]?.timestamp ?? []
    out.push({
      asset: a.key, group: a.group, tested: a.yahoo, accepted: m?.symbol ?? null, endpoint: url, http: r.status,
      value: m?.regularMarketPrice ?? null, timestamp: m?.regularMarketTime ? new Date(m.regularMarketTime * 1000).toISOString() : null,
      last_daily_bar: ts.length ? new Date(ts.at(-1) * 1000).toISOString().slice(0, 10) : null, last_daily_close: closes.at(-1) ?? null,
      previous_close: m?.chartPreviousClose ?? null, market: m?.fullExchangeName ?? null, currency: m?.currency ?? null, timezone: m?.exchangeTimezoneName ?? null,
      error: r.status !== 200 ? (r.json?.chart?.error?.description ?? r.text ?? r.error) : null,
    })
    await sleep(400)
  }
  return { note: 'Endpoint JSON não documentado oficialmente; apenas prova de conceito técnica.', results: out }
}

const started = new Date().toISOString()
const [td, f, y] = [await twelveData(), await fmp(), await yahoo()]
console.log(JSON.stringify({ started, finished: new Date().toISOString(), twelvedata: td, fmp: f, yahoo: y }))
