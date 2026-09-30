/** Client-safe formatting helpers (pt-BR). */
export function fmtValue(v: number | null, unit: string): string {
  if (v === null) return '—'
  const digits = unit === 'pts' ? 0 : unit === 'USD' && v > 1000 ? 0 : unit === 'mil' ? 0 : unit === 'idx' ? 2 : unit === 'BRL' ? 4 : 2
  const n = v.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })
  if (unit === 'BRL') return `R$ ${n}`
  if (unit === 'USD') return `US$ ${n}`
  if (unit.startsWith('%')) return `${n}%${unit.slice(1)}`
  if (unit === 'pts' || unit === 'idx') return n
  return `${n} ${unit}`
}

export function fmtPct(v: number | null): string {
  if (v === null || Number.isNaN(v)) return '—'
  const s = v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${v > 0 ? '+' : ''}${s}%`
}

const MONTHS = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ']
export function fmtDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return `${String(d).padStart(2, '0')} ${MONTHS[m - 1]} ${y}`
}
export function fmtShortDate(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split('-').map(Number)
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`
}
export function fmtWeekday(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('pt-BR', { weekday: 'short', timeZone: 'UTC' }).replace('.', '')
}

/** UTC instant → "05:42 BRT" in America/Sao_Paulo regardless of the viewer's timezone. */
export function fmtTimeBRT(utc: string | null): string {
  if (!utc) return '—'
  const t = new Date(utc).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  return `${t} BRT`
}
export function fmtDateTimeBRT(utc: string | null): string {
  if (!utc) return '—'
  return `${new Date(utc).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })} ${fmtTimeBRT(utc)}`
}

export const REGION_LABEL: Record<string, string> = { BR: 'Brasil', US: 'EUA', EU: 'Europa', CN: 'China', ASIA: 'Ásia', GLOBAL: 'Global' }
export const STATUS_LABEL: Record<string, string> = { OPEN: 'Em negociação', CLOSED: 'Fechado', PRE_MARKET: 'Pré-abertura', UNKNOWN: '—' }
