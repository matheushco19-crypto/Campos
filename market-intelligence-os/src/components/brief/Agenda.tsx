import { Lightbulb } from 'lucide-react'
import type { AgendaItem, CalendarEvent, IntelligenceSnapshot } from '@/core/schemas'
import { agendaTimeBRT, BUCKET_LABEL, IMPORTANCE_LABEL } from '@/lib/agenda'
import { fmtShortDate, fmtWeekday, REGION_LABEL } from '@/lib/format'
import { eventProvenance } from '@/lib/provenance'
import { cn, Panel, Pill, Section } from '../ui'
import { VerificationBadge } from '../VerificationBadge'

const BUCKETS: AgendaItem['bucket'][] = ['today', 'tomorrow', 'week', 'upcoming']

export function Agenda({ s, events }: { s: IntelligenceSnapshot; events: CalendarEvent[] }) {
  return (
    <Section id="calendar" index="05" eyebrow="Agenda" title="O que vem por aí" lead="Horários convertidos para Brasília. Eventos com data pela regra de divulgação aparecem como UNVERIFIED até a confirmação na fonte oficial.">
      <div className="grid gap-4 lg:grid-cols-2">
        {BUCKETS.map((b) => {
          const items = s.agenda.filter((a) => (b === 'upcoming' ? a.bucket === 'upcoming' : a.bucket === b))
          return (
            <Panel key={b} className="flex min-w-0 flex-col">
              <div className="flex items-baseline justify-between border-b border-line px-4 py-3">
                <h3 className="text-[14px] font-extrabold text-ink">{BUCKET_LABEL[b]}</h3>
                <span className="text-[11px] font-semibold text-ink-3 tnum">{items.length}</span>
              </div>
              {items.length ? (
                <ul className="divide-y divide-line">
                  {items.map((a) => (
                    <EventRow key={a.event_id} a={a} showDate={b === 'week' || b === 'upcoming'} />
                  ))}
                </ul>
              ) : (
                <p className="px-4 py-5 text-[12.5px] text-ink-3">Nada relevante.</p>
              )}
            </Panel>
          )
        })}
      </div>
      <details className="group mt-4 rounded-xl border border-line bg-surface">
        <summary className="cursor-pointer list-none px-5 py-3 text-[13px] font-bold text-ink">
          Calendário completo, 45 dias <span className="font-semibold text-ink-3">· {events.length} eventos</span>
        </summary>
        <ul className="divide-y divide-line border-t border-line">
          {events.map((e) => {
            const t = agendaTimeBRT(e)
            return (
              <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5 text-[12.5px]">
                <span className="w-24 shrink-0 font-bold text-ink-2 tnum">
                  {fmtShortDate(t.date)} {t.time ?? ''}
                </span>
                <Pill tone={e.importance === 'HIGH' && e.category !== 'HOLIDAY' ? 'accent' : 'neutral'}>{e.category === 'HOLIDAY' ? 'Feriado' : IMPORTANCE_LABEL[e.importance]}</Pill>
                <span className="min-w-0 flex-1 text-ink">{e.name}</span>
                <span className="text-[11px] text-ink-3">{REGION_LABEL[e.region]}</span>
                <VerificationBadge p={eventProvenance(e)} compact />
              </li>
            )
          })}
        </ul>
      </details>
    </Section>
  )
}

function EventRow({ a, showDate }: { a: AgendaItem; showDate: boolean }) {
  const t = agendaTimeBRT(a)
  return (
    <li className="px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="w-12 shrink-0 pt-0.5">
          {showDate && <div className="text-[12px] font-extrabold text-ink tnum">{fmtShortDate(t.date)}</div>}
          <div className={cn('tnum', showDate ? 'text-[10.5px] font-semibold text-ink-3' : 'text-[12.5px] font-extrabold text-ink')}>{t.time ?? (showDate ? fmtWeekday(t.date) : '—')}</div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] leading-snug font-bold text-ink">{a.name}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <Pill tone={a.importance === 'HIGH' ? 'accent' : 'neutral'}>{IMPORTANCE_LABEL[a.importance]}</Pill>
            <span className="text-[10.5px] font-semibold text-ink-3">{REGION_LABEL[a.region]}</span>
            {t.original && <span className="text-[10.5px] text-ink-3">· {t.original}</span>}
          </div>
          <div className="mt-0.5 truncate text-[10.5px] text-ink-3" title={a.source}>
            Fonte: {a.source}
          </div>
          {a.content_opportunity && (
            <p className="mt-1.5 flex gap-1.5 text-[12px] leading-relaxed text-ink-2">
              <Lightbulb className="mt-0.5 size-3 shrink-0 text-accent" aria-hidden />
              <span>
                <span className="sr-only">Oportunidade editorial: </span>
                {a.content_opportunity}
              </span>
            </p>
          )}
        </div>
        <VerificationBadge p={eventProvenance(a)} compact />
      </div>
    </li>
  )
}
