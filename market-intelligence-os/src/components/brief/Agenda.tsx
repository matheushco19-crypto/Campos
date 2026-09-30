import type { CalendarEvent, IntelligenceSnapshot } from '@/core/schemas'
import { agendaTimeBRT } from '@/lib/agenda'
import { fmtShortDate, fmtWeekday, REGION_LABEL } from '@/lib/format'
import { eventProvenance } from '@/lib/provenance'
import { addDays } from '@/core/time'
import { cn, Panel, Pill, Section } from '../ui'
import { VerificationBadge } from '../VerificationBadge'

const WEEKDAYS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado']

export function Agenda({ s, events }: { s: IntelligenceSnapshot; events: CalendarEvent[] }) {
  const day = new Date(`${s.date}T12:00:00Z`).getUTCDay()
  const weekStart = addDays(s.date, -day)
  const weekEnd = addDays(weekStart, 6)
  const weekEvents = events
    .filter((e) => e.date >= weekStart && e.date <= weekEnd)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '99').localeCompare(b.time ?? '99'))

  return (
    <Section id="calendar" index="05" eyebrow="Agenda" title="Agenda da semana" lead="De domingo a sábado, em Brasília. Apenas os eventos relevantes da semana atual, sem o calendário de 45 dias ocupando espaço como se fosse um aeroporto.">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 7 }, (_, i) => {
          const date = addDays(weekStart, i)
          const items = weekEvents.filter((e) => e.date === date)
          return (
            <Panel key={date} className={cn('min-w-0 overflow-hidden', date === s.date && 'border-accent/40')}>
              <div className="border-b border-line px-4 py-3">
                <div className="text-[10.5px] font-extrabold tracking-[0.14em] text-accent uppercase">{WEEKDAYS[i]}</div>
                <div className="mt-0.5 text-[12px] font-semibold text-ink-3 tnum">{fmtShortDate(date)}</div>
              </div>
              {items.length ? (
                <ul className="divide-y divide-line">
                  {items.map((e) => <EventRow key={e.id} e={e} />)}
                </ul>
              ) : (
                <p className="px-4 py-4 text-[12px] text-ink-3">Sem eventos relevantes.</p>
              )}
            </Panel>
          )
        })}
      </div>
    </Section>
  )
}

function EventRow({ e }: { e: CalendarEvent }) {
  const t = agendaTimeBRT(e)
  return (
    <li className="px-4 py-3">
      <div className="flex items-start gap-2.5">
        <div className="w-11 shrink-0">
          <div className="text-[11px] font-extrabold text-ink tnum">{t.time ?? '—'}</div>
          <div className="mt-0.5 text-[10px] text-ink-3">{fmtWeekday(t.date)}</div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] leading-snug font-bold text-ink">{e.name}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <Pill tone={e.importance === 'HIGH' && e.category !== 'HOLIDAY' ? 'accent' : 'neutral'}>{e.category === 'HOLIDAY' ? 'Feriado' : e.importance}</Pill>
            <span className="text-[10px] font-semibold text-ink-3">{REGION_LABEL[e.region]}</span>
          </div>
        </div>
        <VerificationBadge p={eventProvenance(e)} compact />
      </div>
    </li>
  )
}
