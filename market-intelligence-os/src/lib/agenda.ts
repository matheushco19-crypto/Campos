import type { AgendaItem } from '../core/schemas'
import { toLocalDate, toLocalTime, zonedToUtc } from '../core/time'

/** Event time converted to São Paulo, with the day shift when it crosses midnight. */
export function agendaTimeBRT(a: Pick<AgendaItem, 'date' | 'time' | 'timezone'>): { time: string | null; date: string; original: string | null } {
  if (!a.time) return { time: null, date: a.date, original: null }
  const tz = a.timezone || 'America/Sao_Paulo'
  if (tz === 'America/Sao_Paulo') return { time: a.time, date: a.date, original: null }
  const utc = zonedToUtc(a.date, a.time, tz)
  return { time: toLocalTime(utc), date: toLocalDate(utc), original: `${a.time} ${tzShort(tz)}` }
}

function tzShort(tz: string): string {
  return ({ 'America/New_York': 'NY', 'Europe/Berlin': 'Frankfurt', 'Europe/London': 'Londres', 'Asia/Tokyo': 'Tóquio', 'Asia/Shanghai': 'Pequim' } as Record<string, string>)[tz] ?? tz
}

export const BUCKET_LABEL: Record<AgendaItem['bucket'], string> = { today: 'Hoje', tomorrow: 'Amanhã', week: 'Esta semana', upcoming: 'Próximos eventos' }
export const IMPORTANCE_LABEL: Record<string, string> = { HIGH: 'Alta', MEDIUM: 'Média', LOW: 'Baixa' }
