import type { Region } from '../src/core/schemas'

/**
 * MONITORED MARKETS — fully configurable.
 * `sources` is ordered by priority: the first source that answers is the
 * displayed value, the next independent one validates it.
 */
export interface SourceMapping {
  sourceId: 'brapi' | 'stooq' | 'fred' | 'us-treasury' | 'bcb-ptax' | 'ecb-fx' | 'coingecko' | 'coinbase' | 'kraken' | 'bitstamp' | 'gemini' | 'bok-ecos' | 'twelvedata' | 'fmp' | 'yahoo' | 'b3-arquivos'
  symbol: string
  /** The source is the instrument's official publisher (PTAX = BCB, Treasury curve = US Treasury, DI1 settlement = B3). */
  official?: boolean
  /** The value is an approximation of the instrument (e.g. DXY computed from ECB rates). Never counts as confirmation. */
  proxy?: boolean
  /** Who originally produced the number, when it differs from the source's default lineage (FRED DGS* = US Treasury). */
  lineage?: string
}

export interface AssetConfig {
  metric: string
  label: string
  group: 'Brasil' | 'EUA' | 'Europa' | 'Ásia' | 'Câmbio' | 'Juros' | 'Cripto' | 'Commodities'
  region: Region
  unit: 'pts' | 'BRL' | 'USD' | '%' | '% a.a.' | 'idx'
  /** Exchange timezone and regular session, used to derive market_status. */
  exchange: { timezone: string; open: string; close: string; weekdaysOnly: boolean; always?: boolean }
  /** Relative tolerance for cross-source validation (0.005 = 0.5%). Yields use absolute bps. */
  tolerance: { relative?: number; absolute?: number }
  /** Calendar days after which the latest observation is considered stale. */
  maxAgeDays: number
  showInBrief: boolean
  /** Core market for the "Core Markets Verified: X/8" indicator. */
  core?: boolean
  enabled: boolean
  sources: SourceMapping[]
  notes?: string
}

const B3 = { timezone: 'America/Sao_Paulo', open: '10:00', close: '17:00', weekdaysOnly: true }
const NYSE = { timezone: 'America/New_York', open: '09:30', close: '16:00', weekdaysOnly: true }
const XETRA = { timezone: 'Europe/Berlin', open: '09:00', close: '17:30', weekdaysOnly: true }
const LSE = { timezone: 'Europe/London', open: '08:00', close: '16:30', weekdaysOnly: true }
const TSE = { timezone: 'Asia/Tokyo', open: '09:00', close: '15:30', weekdaysOnly: true }
const HKEX = { timezone: 'Asia/Hong_Kong', open: '09:30', close: '16:00', weekdaysOnly: true }
const SSE = { timezone: 'Asia/Shanghai', open: '09:30', close: '15:00', weekdaysOnly: true }
const KRX = { timezone: 'Asia/Seoul', open: '09:00', close: '15:30', weekdaysOnly: true }
const FX = { timezone: 'America/New_York', open: '00:00', close: '23:59', weekdaysOnly: true }
/** DI1 bucket → target calendar days. The contract with the nearest maturity is used (tie → shorter). */
export const DI_BUCKETS: [string, number][] = [
  ['1M', 30],
  ['3M', 91],
  ['6M', 182],
  ['12M', 365],
  ['24M', 730],
  ['36M', 1095],
  ['60M', 1826],
]

/** Deterministic spreads (bps) computed from two verified vertices of the same reference date. No LLM. */
export const DERIVED_SPREADS = [
  { metric: 'US_SPREAD_2S10S', label: 'Spread 2s10s', long: 'US10Y', short: 'US_UST_2Y' },
  { metric: 'US_SPREAD_5S30S', label: 'Spread 5s30s', long: 'US_UST_30Y', short: 'US_UST_5Y' },
] as const

export const CORE_MARKETS = ['IBOV', 'SPX', 'NASDAQ', 'DJI', 'USDBRL', 'EURBRL', 'US10Y', 'BTCUSD'] as const

const CRYPTO = { timezone: 'UTC', open: '00:00', close: '23:59', weekdaysOnly: false, always: true }

const Y = (symbol: string): SourceMapping => ({ sourceId: 'yahoo', symbol })

/*
 * Source order = priority. Rules (docs/provider-bakeoff.md):
 *  - Twelve Data symbols come from its /indices, /forex_pairs and /cryptocurrencies reference lists
 *    (S&P 500, Nasdaq Composite, Dow Jones and DXY are NOT in its index catalog, so they are not mapped).
 *  - Yahoo is an unofficial vendor: last in every list, display-only (on by default; MI_ENABLE_YAHOO_FALLBACK=false), and
 *    never counts toward VERIFIED.
 */
export const ASSETS: AssetConfig[] = [
  { metric: 'IBOV', label: 'Ibovespa', group: 'Brasil', region: 'BR', unit: 'pts', exchange: B3, tolerance: { relative: 0.005 }, maxAgeDays: 5, showInBrief: true, core: true, enabled: true,
    sources: [{ sourceId: 'brapi', symbol: '^BVSP' }, { sourceId: 'twelvedata', symbol: 'BVSP' }, { sourceId: 'stooq', symbol: '^bvp' }, Y('^BVSP')],
    notes: 'BRAPI (dados da B3) é a fonte primária. Sem segunda fonte gratuita e permitida para o índice no plano atual: a série SGS 7 do BCB foi descontinuada em 2019, e ETFs (BOVA11) não são o índice.' },
  { metric: 'IFIX', label: 'IFIX', group: 'Brasil', region: 'BR', unit: 'pts', exchange: B3, tolerance: { relative: 0.005 }, maxAgeDays: 5, showInBrief: true, enabled: true,
    sources: [{ sourceId: 'brapi', symbol: 'IFIX.SA' }, Y('IFIX.SA')],
    notes: 'Índice de Fundos Imobiliários da B3. BRAPI lista IFIX.SA no catálogo de índices; Yahoo é apenas fallback não oficial.' },
  { metric: 'SPX', label: 'S&P 500', group: 'EUA', region: 'US', unit: 'pts', exchange: NYSE, tolerance: { relative: 0.005 }, maxAgeDays: 5, showInBrief: true, core: true, enabled: true,
    sources: [{ sourceId: 'fmp', symbol: '^GSPC' }, { sourceId: 'stooq', symbol: '^spx' }, { sourceId: 'fred', symbol: 'SP500' }, Y('^GSPC')] },
  { metric: 'NASDAQ', label: 'Nasdaq Composite', group: 'EUA', region: 'US', unit: 'pts', exchange: NYSE, tolerance: { relative: 0.005 }, maxAgeDays: 5, showInBrief: true, core: true, enabled: true,
    sources: [{ sourceId: 'fmp', symbol: '^IXIC' }, { sourceId: 'stooq', symbol: '^ndq' }, { sourceId: 'fred', symbol: 'NASDAQCOM' }, Y('^IXIC')] },
  { metric: 'DJI', label: 'Dow Jones', group: 'EUA', region: 'US', unit: 'pts', exchange: NYSE, tolerance: { relative: 0.005 }, maxAgeDays: 5, showInBrief: true, core: true, enabled: true,
    sources: [{ sourceId: 'fmp', symbol: '^DJI' }, { sourceId: 'stooq', symbol: '^dji' }, { sourceId: 'fred', symbol: 'DJIA' }, Y('^DJI')] },
  { metric: 'US10Y', label: 'Treasury 10Y', group: 'Juros', region: 'US', unit: '%', exchange: NYSE, tolerance: { absolute: 0.03 }, maxAgeDays: 5, showInBrief: true, core: true, enabled: true,
    sources: [{ sourceId: 'us-treasury', symbol: '10 Yr', official: true }, { sourceId: 'fred', symbol: 'DGS10', lineage: 'us-treasury' }] },
  { metric: 'DXY', label: 'DXY (Índice Dólar)', group: 'Câmbio', region: 'US', unit: 'idx', exchange: FX, tolerance: { relative: 0.004 }, maxAgeDays: 5, showInBrief: true, enabled: true,
    sources: [{ sourceId: 'fmp', symbol: 'DX-Y.NYB' }, { sourceId: 'ecb-fx', symbol: 'DXY', proxy: true }, { sourceId: 'stooq', symbol: 'dx.f' }, Y('DX-Y.NYB')],
    notes: 'O DXY é um índice proprietário da ICE. Sem fornecedor direto configurado, o valor é calculado com a fórmula pública da ICE sobre as taxas de referência do ECB (≈14:15 CET): DXY proxy, nunca VERIFIED.' },
  { metric: 'EUROSTOXX50', label: 'Euro Stoxx 50', group: 'Europa', region: 'EU', unit: 'pts', exchange: XETRA, tolerance: { relative: 0.005 }, maxAgeDays: 5, showInBrief: true, enabled: true,
    sources: [{ sourceId: 'twelvedata', symbol: 'STOXX50E' }, { sourceId: 'stooq', symbol: '^sx5e' }, Y('^STOXX50E')] },
  { metric: 'DAX', label: 'DAX', group: 'Europa', region: 'EU', unit: 'pts', exchange: XETRA, tolerance: { relative: 0.005 }, maxAgeDays: 5, showInBrief: true, enabled: true,
    sources: [{ sourceId: 'twelvedata', symbol: 'GDAXI' }, { sourceId: 'stooq', symbol: '^dax' }, Y('^GDAXI')] },
  { metric: 'FTSE100', label: 'FTSE 100', group: 'Europa', region: 'EU', unit: 'pts', exchange: LSE, tolerance: { relative: 0.005 }, maxAgeDays: 5, showInBrief: true, enabled: true,
    sources: [{ sourceId: 'twelvedata', symbol: 'FTSE' }, { sourceId: 'stooq', symbol: '^ukx' }, Y('^FTSE')] },
  { metric: 'NIKKEI', label: 'Nikkei 225', group: 'Ásia', region: 'ASIA', unit: 'pts', exchange: TSE, tolerance: { relative: 0.005 }, maxAgeDays: 5, showInBrief: true, enabled: true,
    sources: [{ sourceId: 'twelvedata', symbol: 'N225' }, { sourceId: 'fred', symbol: 'NIKKEI225' }, { sourceId: 'stooq', symbol: '^nkx' }, Y('^N225')] },
  { metric: 'HANGSENG', label: 'Hang Seng', group: 'Ásia', region: 'ASIA', unit: 'pts', exchange: HKEX, tolerance: { relative: 0.005 }, maxAgeDays: 5, showInBrief: true, enabled: true,
    sources: [{ sourceId: 'twelvedata', symbol: 'HSI' }, { sourceId: 'stooq', symbol: '^hsi' }, Y('^HSI')] },
  { metric: 'SHANGHAI', label: 'Shanghai Composite', group: 'Ásia', region: 'CN', unit: 'pts', exchange: SSE, tolerance: { relative: 0.005 }, maxAgeDays: 5, showInBrief: true, enabled: true,
    sources: [{ sourceId: 'twelvedata', symbol: '000001' }, { sourceId: 'stooq', symbol: '^shc' }, Y('000001.SS')] },
  { metric: 'KOSPI', label: 'Kospi', group: 'Ásia', region: 'ASIA', unit: 'pts', exchange: KRX, tolerance: { relative: 0.005 }, maxAgeDays: 5, showInBrief: true, enabled: true,
    sources: [{ sourceId: 'bok-ecos', symbol: '802Y001/0001000' }, { sourceId: 'twelvedata', symbol: 'KOSPI' }, { sourceId: 'stooq', symbol: '^kospi' }, Y('^KS11')] },
  { metric: 'USDBRL', label: 'USD/BRL', group: 'Câmbio', region: 'BR', unit: 'BRL', exchange: FX, tolerance: { relative: 0.01 }, maxAgeDays: 4, showInBrief: true, core: true, enabled: true,
    sources: [{ sourceId: 'bcb-ptax', symbol: '1', official: true }, { sourceId: 'ecb-fx', symbol: 'USD' }, { sourceId: 'twelvedata', symbol: 'USD/BRL' }, { sourceId: 'stooq', symbol: 'usdbrl' }, Y('BRL=X')],
    notes: 'PTAX de venda (BCB, oficial) validada pela taxa de referência do ECB (EUR/BRL ÷ EUR/USD), com tolerância de 1% porque os dois são fixings em horários diferentes.' },
  { metric: 'EURBRL', label: 'EUR/BRL', group: 'Câmbio', region: 'BR', unit: 'BRL', exchange: FX, tolerance: { relative: 0.01 }, maxAgeDays: 4, showInBrief: true, core: true, enabled: true,
    sources: [{ sourceId: 'bcb-ptax', symbol: '21619', official: true }, { sourceId: 'ecb-fx', symbol: 'BRL' }, { sourceId: 'twelvedata', symbol: 'EUR/BRL' }, { sourceId: 'stooq', symbol: 'eurbrl' }, Y('EURBRL=X')],
    notes: 'PTAX de venda (BCB, oficial) validada pela taxa de referência do ECB. O câmbio da BRAPI (derivado da PTAX) exige plano pago e não é usado: a PTAX vem direto do BCB.' },
  { metric: 'BTCUSD', label: 'BTC/USD', group: 'Cripto', region: 'GLOBAL', unit: 'USD', exchange: CRYPTO, tolerance: { relative: 0.01 }, maxAgeDays: 1, showInBrief: true, core: true, enabled: true,
    sources: [{ sourceId: 'coinbase', symbol: 'BTC-USD' }, { sourceId: 'kraken', symbol: 'XBTUSD' }, { sourceId: 'bitstamp', symbol: 'btcusd' }, { sourceId: 'gemini', symbol: 'btcusd' }, { sourceId: 'coingecko', symbol: 'bitcoin' }, { sourceId: 'twelvedata', symbol: 'BTC/USD' }, Y('BTC-USD')] },

  /* US Treasury par yield curve (Daily Treasury Par Yield Curve Rates). FRED DGS* republishes the same data (lineage us-treasury). */
  ...([
    ['3M', '3 Mo', 'DGS3MO'],
    ['6M', '6 Mo', 'DGS6MO'],
    ['1Y', '1 Yr', 'DGS1'],
    ['2Y', '2 Yr', 'DGS2'],
    ['5Y', '5 Yr', 'DGS5'],
    ['20Y', '20 Yr', 'DGS20'],
    ['30Y', '30 Yr', 'DGS30'],
  ] as const).map(([tenor, column, fred]): AssetConfig => ({
    metric: `US_UST_${tenor}`, label: `Treasury ${tenor}`, group: 'Juros', region: 'US', unit: '%', exchange: NYSE, tolerance: { absolute: 0.03 }, maxAgeDays: 5, showInBrief: false, enabled: true,
    sources: [{ sourceId: 'us-treasury', symbol: column, official: true }, { sourceId: 'fred', symbol: fred, lineage: 'us-treasury' }],
  })),

  /* DI1 futures by bucket: the real contract nearest to each tenor, settlement rate from the B3 consolidated trade file. */
  ...DI_BUCKETS.map(([bucket]): AssetConfig => ({
    metric: `BR_DI1_${bucket}`, label: `DI1 ${bucket}`, group: 'Juros', region: 'BR', unit: '% a.a.', exchange: B3, tolerance: { absolute: 0.02 }, maxAgeDays: 5, showInBrief: false, enabled: true,
    sources: [{ sourceId: 'b3-arquivos', symbol: bucket, official: true }],
    notes: 'Taxa de ajuste (AdjstdQtTax) do contrato DI1 mais próximo do prazo, arquivo consolidado de negociação da B3. Não é a Selic nem o CDI.',
  })),

  /* Configurable future assets (disabled by default). */
  { metric: 'BRENT', label: 'Brent', group: 'Commodities', region: 'GLOBAL', unit: 'USD', exchange: { timezone: 'Europe/London', open: '01:00', close: '23:00', weekdaysOnly: true }, tolerance: { relative: 0.01 }, maxAgeDays: 5, showInBrief: true, enabled: false,
    sources: [{ sourceId: 'stooq', symbol: 'cb.f' }, { sourceId: 'fred', symbol: 'DCOILBRENTEU' }] },
  { metric: 'WTI', label: 'WTI', group: 'Commodities', region: 'US', unit: 'USD', exchange: NYSE, tolerance: { relative: 0.01 }, maxAgeDays: 5, showInBrief: true, enabled: false,
    sources: [{ sourceId: 'stooq', symbol: 'cl.f' }, { sourceId: 'fred', symbol: 'DCOILWTICO' }] },
  { metric: 'GOLD', label: 'Ouro', group: 'Commodities', region: 'GLOBAL', unit: 'USD', exchange: FX, tolerance: { relative: 0.01 }, maxAgeDays: 5, showInBrief: true, enabled: false,
    sources: [{ sourceId: 'stooq', symbol: 'xauusd' }, { sourceId: 'twelvedata', symbol: 'XAU/USD' }] },
  { metric: 'COPPER', label: 'Cobre', group: 'Commodities', region: 'GLOBAL', unit: 'USD', exchange: NYSE, tolerance: { relative: 0.015 }, maxAgeDays: 5, showInBrief: true, enabled: false,
    sources: [{ sourceId: 'stooq', symbol: 'hg.f' }] },
]

export const enabledAssets = () => ASSETS.filter((a) => a.enabled)
export const assetByMetric = (metric: string) => ASSETS.find((a) => a.metric === metric)
