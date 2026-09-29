import type { Region } from '../src/core/schemas'

/**
 * MONITORED MARKETS — fully configurable.
 * `sources` is ordered by priority: the first source that answers is the
 * displayed value, the next independent one validates it.
 */
export interface SourceMapping {
  sourceId: 'brapi' | 'stooq' | 'fred' | 'us-treasury' | 'bcb-ptax' | 'coingecko' | 'coinbase' | 'kraken' | 'twelvedata'
  symbol: string
}

export interface AssetConfig {
  metric: string
  label: string
  group: 'Brasil' | 'EUA' | 'Europa' | 'Ásia' | 'Câmbio' | 'Juros' | 'Cripto' | 'Commodities'
  region: Region
  unit: 'pts' | 'BRL' | 'USD' | '%' | 'idx'
  /** Exchange timezone and regular session, used to derive market_status. */
  exchange: { timezone: string; open: string; close: string; weekdaysOnly: boolean; always?: boolean }
  /** Relative tolerance for cross-source validation (0.005 = 0.5%). Yields use absolute bps. */
  tolerance: { relative?: number; absolute?: number }
  /** Calendar days after which the latest observation is considered stale. */
  maxAgeDays: number
  showInBrief: boolean
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
const CRYPTO = { timezone: 'UTC', open: '00:00', close: '23:59', weekdaysOnly: false, always: true }

export const ASSETS: AssetConfig[] = [
  { metric: 'IBOV', label: 'Ibovespa', group: 'Brasil', region: 'BR', unit: 'pts', exchange: B3, tolerance: { relative: 0.005 }, maxAgeDays: 5, showInBrief: true, enabled: true,
    sources: [{ sourceId: 'brapi', symbol: '^BVSP' }, { sourceId: 'stooq', symbol: '^bvp' }] },
  { metric: 'SPX', label: 'S&P 500', group: 'EUA', region: 'US', unit: 'pts', exchange: NYSE, tolerance: { relative: 0.005 }, maxAgeDays: 5, showInBrief: true, enabled: true,
    sources: [{ sourceId: 'stooq', symbol: '^spx' }, { sourceId: 'fred', symbol: 'SP500' }, { sourceId: 'twelvedata', symbol: 'SPX' }] },
  { metric: 'NASDAQ', label: 'Nasdaq Composite', group: 'EUA', region: 'US', unit: 'pts', exchange: NYSE, tolerance: { relative: 0.005 }, maxAgeDays: 5, showInBrief: true, enabled: true,
    sources: [{ sourceId: 'stooq', symbol: '^ndq' }, { sourceId: 'fred', symbol: 'NASDAQCOM' }, { sourceId: 'twelvedata', symbol: 'IXIC' }] },
  { metric: 'DJI', label: 'Dow Jones', group: 'EUA', region: 'US', unit: 'pts', exchange: NYSE, tolerance: { relative: 0.005 }, maxAgeDays: 5, showInBrief: true, enabled: true,
    sources: [{ sourceId: 'stooq', symbol: '^dji' }, { sourceId: 'fred', symbol: 'DJIA' }, { sourceId: 'twelvedata', symbol: 'DJI' }] },
  { metric: 'US10Y', label: 'Treasury 10Y', group: 'Juros', region: 'US', unit: '%', exchange: NYSE, tolerance: { absolute: 0.03 }, maxAgeDays: 5, showInBrief: true, enabled: true,
    sources: [{ sourceId: 'us-treasury', symbol: '10 Yr' }, { sourceId: 'fred', symbol: 'DGS10' }] },
  { metric: 'DXY', label: 'DXY (Índice Dólar)', group: 'Câmbio', region: 'US', unit: 'idx', exchange: FX, tolerance: { relative: 0.004 }, maxAgeDays: 5, showInBrief: true, enabled: true,
    sources: [{ sourceId: 'stooq', symbol: 'dx.f' }, { sourceId: 'twelvedata', symbol: 'DXY' }],
    notes: 'O DXY é um índice proprietário da ICE. Via Stooq, usamos o contrato futuro contínuo (dx.f) como referência, o que pode divergir marginalmente do spot.' },
  { metric: 'EUROSTOXX50', label: 'Euro Stoxx 50', group: 'Europa', region: 'EU', unit: 'pts', exchange: XETRA, tolerance: { relative: 0.005 }, maxAgeDays: 5, showInBrief: true, enabled: true,
    sources: [{ sourceId: 'stooq', symbol: '^sx5e' }, { sourceId: 'twelvedata', symbol: 'SX5E' }] },
  { metric: 'DAX', label: 'DAX', group: 'Europa', region: 'EU', unit: 'pts', exchange: XETRA, tolerance: { relative: 0.005 }, maxAgeDays: 5, showInBrief: true, enabled: true,
    sources: [{ sourceId: 'stooq', symbol: '^dax' }, { sourceId: 'twelvedata', symbol: 'DAX' }] },
  { metric: 'FTSE100', label: 'FTSE 100', group: 'Europa', region: 'EU', unit: 'pts', exchange: LSE, tolerance: { relative: 0.005 }, maxAgeDays: 5, showInBrief: true, enabled: true,
    sources: [{ sourceId: 'stooq', symbol: '^ukx' }, { sourceId: 'twelvedata', symbol: 'FTSE' }] },
  { metric: 'NIKKEI', label: 'Nikkei 225', group: 'Ásia', region: 'ASIA', unit: 'pts', exchange: TSE, tolerance: { relative: 0.005 }, maxAgeDays: 5, showInBrief: true, enabled: true,
    sources: [{ sourceId: 'stooq', symbol: '^nkx' }, { sourceId: 'fred', symbol: 'NIKKEI225' }] },
  { metric: 'HANGSENG', label: 'Hang Seng', group: 'Ásia', region: 'ASIA', unit: 'pts', exchange: HKEX, tolerance: { relative: 0.005 }, maxAgeDays: 5, showInBrief: true, enabled: true,
    sources: [{ sourceId: 'stooq', symbol: '^hsi' }, { sourceId: 'twelvedata', symbol: 'HSI' }] },
  { metric: 'SHANGHAI', label: 'Shanghai Composite', group: 'Ásia', region: 'CN', unit: 'pts', exchange: SSE, tolerance: { relative: 0.005 }, maxAgeDays: 5, showInBrief: true, enabled: true,
    sources: [{ sourceId: 'stooq', symbol: '^shc' }, { sourceId: 'twelvedata', symbol: '000001' }] },
  { metric: 'KOSPI', label: 'Kospi', group: 'Ásia', region: 'ASIA', unit: 'pts', exchange: KRX, tolerance: { relative: 0.005 }, maxAgeDays: 5, showInBrief: true, enabled: true,
    sources: [{ sourceId: 'stooq', symbol: '^kospi' }, { sourceId: 'twelvedata', symbol: 'KS11' }] },
  { metric: 'USDBRL', label: 'USD/BRL', group: 'Câmbio', region: 'BR', unit: 'BRL', exchange: FX, tolerance: { relative: 0.01 }, maxAgeDays: 4, showInBrief: true, enabled: true,
    sources: [{ sourceId: 'stooq', symbol: 'usdbrl' }, { sourceId: 'bcb-ptax', symbol: '1' }, { sourceId: 'brapi', symbol: 'USD-BRL' }],
    notes: 'Spot (Stooq) validado contra a PTAX de venda do BCB, com tolerância de 1% porque a PTAX é um fixing.' },
  { metric: 'EURBRL', label: 'EUR/BRL', group: 'Câmbio', region: 'BR', unit: 'BRL', exchange: FX, tolerance: { relative: 0.01 }, maxAgeDays: 4, showInBrief: true, enabled: true,
    sources: [{ sourceId: 'stooq', symbol: 'eurbrl' }, { sourceId: 'bcb-ptax', symbol: '21619' }, { sourceId: 'brapi', symbol: 'EUR-BRL' }] },
  { metric: 'BTCUSD', label: 'BTC/USD', group: 'Cripto', region: 'GLOBAL', unit: 'USD', exchange: CRYPTO, tolerance: { relative: 0.01 }, maxAgeDays: 1, showInBrief: true, enabled: true,
    sources: [{ sourceId: 'coingecko', symbol: 'bitcoin' }, { sourceId: 'coinbase', symbol: 'BTC-USD' }, { sourceId: 'kraken', symbol: 'XBTUSD' }] },

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
