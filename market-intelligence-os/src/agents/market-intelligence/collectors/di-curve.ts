import { brazilHolidays } from '../../../engines/event-engine'
import { addDays, diffDays, weekdayOf } from '../../../core/time'
import type { DiContractRow } from './parsers'

/**
 * DI1 curve by bucket — deterministic, no interpolation.
 * Each bucket uses the REAL contract whose maturity is nearest to the target
 * (tie → shorter). A bucket with no contract within the allowed distance is
 * left empty instead of inventing a vertex.
 */

const MONTH_CODES = 'FGHJKMNQUVXZ'

const holidayCache = new Map<number, Set<string>>()
const holidays = (year: number) => {
  if (!holidayCache.has(year)) holidayCache.set(year, new Set(brazilHolidays(year).map((h) => h.date)))
  return holidayCache.get(year)!
}
export const isBusinessDay = (d: string) => ![0, 6].includes(weekdayOf(d)) && !holidays(Number(d.slice(0, 4))).has(d)

/** DI1 maturity: first business day of the contract month. */
export function diMaturity(code: string): string {
  const m = /^DI1([FGHJKMNQUVXZ])(\d{2})$/.exec(code)
  if (!m) throw new Error(`invalid DI1 code ${code}`)
  let d = `20${m[2]}-${String(MONTH_CODES.indexOf(m[1]) + 1).padStart(2, '0')}-01`
  while (!isBusinessDay(d)) d = addDays(d, 1)
  return d
}

/** Business days from `from` (inclusive) to `to` (exclusive), national calendar. */
export function businessDaysBetween(from: string, to: string): number {
  let n = 0
  for (let d = from; d < to; d = addDays(d, 1)) if (isBusinessDay(d)) n++
  return n
}

export interface DiBucketPick {
  bucket: string
  code: string
  maturity: string
  calendar_days: number
  business_days: number
  rate: number
  previous: number | null
  date: string
}

/** Maximum distance between the contract and the target: 25% of the tenor, at least 20 days. */
export const maxBucketDistance = (targetDays: number) => Math.max(20, Math.round(targetDays * 0.25))

export function selectDiBucket(rows: DiContractRow[], bucket: string, targetDays: number, previousRows: DiContractRow[] = []): DiBucketPick | null {
  if (!rows.length) return null
  const date = rows[0].date
  const candidates = rows
    .map((r) => ({ r, maturity: diMaturity(r.code) }))
    .filter((c) => c.maturity > date)
    .map((c) => ({ ...c, cd: diffDays(c.maturity, date) }))
    .sort((a, b) => Math.abs(a.cd - targetDays) - Math.abs(b.cd - targetDays) || a.cd - b.cd)
  const best = candidates[0]
  if (!best || Math.abs(best.cd - targetDays) > maxBucketDistance(targetDays)) return null
  const prev = previousRows.find((p) => p.code === best.r.code && p.date < date)
  return {
    bucket,
    code: best.r.code,
    maturity: best.maturity,
    calendar_days: best.cd,
    business_days: businessDaysBetween(date, best.maturity),
    rate: best.r.rate,
    previous: prev?.rate ?? null,
    date,
  }
}
