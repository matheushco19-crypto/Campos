import type { AssetConfig } from '../../../../config/assets'
import type { MarketStatus, SessionInfo } from '../../../core/schemas'
import { localWeekday, toLocalDate, toLocalTime } from '../../../core/time'

/**
 * Is the exchange's regular session open at `now`? (Holidays are not modelled:
 * on a holiday the latest observation simply keeps the previous reference date,
 * and is labelled CLOSED with that date.)
 */
export function isSessionOpen(exchange: AssetConfig['exchange'], now: Date): boolean {
  if (exchange.always) return true
  const wd = localWeekday(now, exchange.timezone)
  if (exchange.weekdaysOnly && (wd === 0 || wd === 6)) return false
  const hhmm = toLocalTime(now, exchange.timezone)
  return hhmm >= exchange.open && hhmm < exchange.close
}

/**
 * Status of an observation:
 *  - OPEN: value is intraday (reference date = exchange's today and the session is open).
 *    It must never be shown as a close.
 *  - CLOSED: value is the close of `referenceDate`.
 *  - PRE_MARKET: the exchange's day has started but the session has not opened yet, so the value is the previous close.
 */
export function observationStatus(exchange: AssetConfig['exchange'], referenceDate: string, now: Date): MarketStatus {
  if (exchange.always) return 'OPEN'
  const exchangeToday = toLocalDate(now, exchange.timezone)
  const open = isSessionOpen(exchange, now)
  if (referenceDate === exchangeToday && open) return 'OPEN'
  if (referenceDate < exchangeToday) {
    const hhmm = toLocalTime(now, exchange.timezone)
    const wd = localWeekday(now, exchange.timezone)
    const tradingDay = !(exchange.weekdaysOnly && (wd === 0 || wd === 6))
    if (tradingDay && hhmm < exchange.open) return 'PRE_MARKET'
    if (open) return 'OPEN' // exchange is trading now, but our value is the previous close
    return 'CLOSED'
  }
  return 'CLOSED'
}

/**
 * SESSION NORMALIZATION (docs/sessions.md). One rule per market, applied to every
 * observation so a value is never presented as a close when it is intraday.
 */
export const SESSION_RULES: Record<string, string> = {
  fixing: 'Fixing oficial (PTAX do BCB ≈13:30 BRT; referência do ECB ≈14:15 CET): valor final do dia de referência.',
  official_close: 'Fechamento oficial publicado pelo emissor (US Treasury: par yield curve do dia, publicada no fim da tarde de NY).',
  settlement: 'Taxa de ajuste da B3 do pregão de referência (publicada após o fechamento).',
  continuous: 'Mercado 24/7 (cripto): não existe fechamento; o valor é o instantâneo em observed_at e a variação é de 24h.',
  regular_close: 'Fechamento do pregão regular da bolsa na data de referência.',
  intraday: 'Pregão aberto no momento da coleta: valor intradiário, nunca exibido como fechamento.',
}

export function describeSession(
  asset: AssetConfig,
  sourceId: string,
  referenceDate: string,
  asOf: string,
  status: MarketStatus,
): SessionInfo {
  const base = { observed_at: asOf, reference_date: referenceDate, timezone: asset.exchange.timezone, source: sourceId, session_of: referenceDate }
  const mk = (session: SessionInfo['session'], is_close: boolean, is_intraday: boolean): SessionInfo => ({ ...base, session, is_close, is_intraday, rule: SESSION_RULES[session] })
  if (sourceId === 'bcb-ptax' || sourceId === 'ecb-fx') return mk('fixing', true, false)
  if (sourceId === 'b3-arquivos') return mk('settlement', true, false)
  if (sourceId === 'us-treasury' || (sourceId === 'fred' && asset.unit === '%')) return mk('official_close', true, false)
  if (asset.exchange.always) return mk('continuous', false, false)
  if (status === 'OPEN') return mk('intraday', false, true)
  return mk('regular_close', true, false)
}
