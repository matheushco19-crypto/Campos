import type { AssetConfig } from '../../../../config/assets'
import type { MarketStatus } from '../../../core/schemas'
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
