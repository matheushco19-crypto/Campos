/**
 * Time utilities. The whole application reasons in America/Sao_Paulo but
 * persists UTC ISO timestamps. Never rely on the server's local timezone.
 */
export const APP_TIMEZONE = 'America/Sao_Paulo'

const MONTHS_PT = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ']

function parts(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  })
  const out: Record<string, string> = {}
  for (const p of fmt.formatToParts(date)) out[p.type] = p.value
  return out
}

/** YYYY-MM-DD of `date` as seen in São Paulo. */
export function toLocalDate(date: Date | string = new Date(), timeZone = APP_TIMEZONE): string {
  const p = parts(new Date(date), timeZone)
  return `${p.year}-${p.month}-${p.day}`
}

/** HH:MM of `date` as seen in São Paulo. */
export function toLocalTime(date: Date | string, timeZone = APP_TIMEZONE): string {
  const p = parts(new Date(date), timeZone)
  return `${p.hour}:${p.minute}`
}

/** Local hour (0-23) in a timezone. */
export function localHour(date: Date | string, timeZone: string): number {
  return Number(parts(new Date(date), timeZone).hour)
}

/** Local weekday 0=Sun..6=Sat in a timezone. */
export function localWeekday(date: Date | string, timeZone: string): number {
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return map[parts(new Date(date), timeZone).weekday]
}

/** "29 SET 2026" */
export function formatDisplayDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  return `${String(d).padStart(2, '0')} ${MONTHS_PT[m - 1]} ${y}`
}

/** "05:42 BRT" */
export function formatDisplayTime(utcIso: string): string {
  return `${toLocalTime(utcIso)} BRT`
}

export function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function diffDays(a: string, b: string): number {
  return Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86_400_000)
}

/** Weekday for a plain calendar date (0=Sun). */
export function weekdayOf(isoDate: string): number {
  return new Date(`${isoDate}T12:00:00Z`).getUTCDay()
}

/** Hours elapsed between two instants. */
export function hoursBetween(from: Date | string, to: Date | string): number {
  return (new Date(to).getTime() - new Date(from).getTime()) / 3_600_000
}

/**
 * Converts a local wall-clock time in `timeZone` to a UTC ISO string.
 * Works by iteratively correcting the offset (handles DST).
 */
export function zonedToUtc(isoDate: string, hhmm: string, timeZone: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  let guess = Date.UTC(+isoDate.slice(0, 4), +isoDate.slice(5, 7) - 1, +isoDate.slice(8, 10), h, m)
  for (let i = 0; i < 3; i++) {
    const p = parts(new Date(guess), timeZone)
    const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute)
    const target = Date.UTC(+isoDate.slice(0, 4), +isoDate.slice(5, 7) - 1, +isoDate.slice(8, 10), h, m)
    guess += target - asUtc
  }
  return new Date(guess).toISOString()
}
