import type { CalendarEvent, IntelligenceSnapshot } from '@/core/schemas'
import { agendaTimeBRT } from '@/lib/agenda'
import { fmtShortDate, REGION_LABEL } from '@/lib/format'
import { eventProvenance } from '@/lib/provenance'
import { addDays } from '@/core/time'
import { cn, Panel, Section } from '../ui'
import { VerificationBadge } from '../VerificationBadge'

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

export function Agenda({ s, events }: { s: IntelligenceSnapshot; events: CalendarEvent[] }) {
  const day = new Date(`${s.date}T12:00:00Z`).getUTCDay()
  const weekStart = addDays(s.date, -day)
  const weekEnd = addDays(weekStart, 6)
  const weekEvents = events
    // Only relevant events: LOW importance is left out of the week view (holidays always stay).
    .filter((e) => e.date >= weekStart && e.date <= weekEnd && (e.importance !== 'LOW' || e.category === 'HOLIDAY'))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '99').localeCompare(b.time ?? '99'))

  return (
    <Section id="calendar" index="05" eyebrow="Agenda" title="Agenda da semana" lead="De domingo a sábado, em Brasília. Apenas os eventos relevantes da semana atual.">
      <Panel className="overflow-x-auto">
        <div data-testid="agenda-week" className="grid min-w-[840px] grid-cols-7 divide-x divide-line">
          {Array.from({ length: 7 }, (_, i) => {
            const date = addDays(weekStart, i)
            const items = weekEvents.filter((e) => e.date === date)
            const today = date === s.date
            return (
              <div key={date} data-testid="agenda-day" className={cn('min-w-0', today && 'bg-accent/5')}>
                <div className={cn('flex items-baseline justify-between border-b border-line px-2.5 py-2', today && 'border-accent/40')}>
                  <span className="text-[10.5px] font-extrabold tracking-[0.14em] text-accent uppercase">{WEEKDAYS[i]}</span>
                  <span className="text-[11px] font-semibold text-ink-3 tnum">{fmtShortDate(date)}</span>
                </div>
                {items.length ? (
                  <ul className="divide-y divide-line">
                    {items.map((e) => <EventCell key={e.id} e={e} />)}
                  </ul>
                ) : (
                  <p className="px-2.5 py-3 text-[11px] text-ink-3">Sem eventos relevantes</p>
                )}
              </div>
            )
          })}
        </div>
      </Panel>
    </Section>
  )
}

function EventCell({ e }: { e: CalendarEvent }) {
  const t = agendaTimeBRT(e)
  const holiday = e.category === 'HOLIDAY'
  return (
    <li className="px-2.5 py-2">
      <div className="flex items-center justify-between gap-1">
        <span className="text-[11px] font-extrabold text-ink tnum">{holiday ? 'Feriado' : (t.time ?? '—')}</span>
        <VerificationBadge p={eventProvenance(e)} compact />
      </div>
      <div className="mt-0.5 line-clamp-3 text-[11.5px] leading-snug font-bold text-ink" title={e.name}>{e.name}</div>
      <div className="mt-1 flex items-center gap-1.5 text-[10px] font-semibold text-ink-3">
        <span
          aria-label={`Relevância ${e.importance}`}
          title={`Relevância ${e.importance}`}
          className={cn('inline-block size-1.5 rounded-full', holiday ? 'bg-ink-3' : e.importance === 'HIGH' ? 'bg-accent' : 'bg-ink-3/50')}
        />
        <span>{REGION_LABEL[e.region]}</span>
        {!holiday && <span className="text-ink-3/80">· {e.importance === 'HIGH' ? 'alta' : 'média'}</span>}
      </div>
    </li>
  )
}
