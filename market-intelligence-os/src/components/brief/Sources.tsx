import { ChevronRight, ExternalLink } from 'lucide-react'
import type { IntelligenceSnapshot } from '@/core/schemas'
import { Kicker, Panel } from '../ui'

/** Every source behind the brief: data sources first, then news, then calendar. */
export function Sources({ s }: { s: IntelligenceSnapshot }) {
  const news = s.source_references.filter((r) => r.used_for === 'Notícia')
  const agenda = s.source_references.filter((r) => r.used_for.startsWith('Agenda'))
  const data = s.source_references.filter((r) => !news.includes(r) && !agenda.includes(r))
  const groups: [string, typeof data][] = [
    ['Dados de mercado e macro', data],
    ['Notícias citadas', news],
    ['Agenda', agenda],
  ]
  return (
    <details id="sources" data-testid="sources" className="group scroll-mt-28 border-t border-line pt-3">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-[12.5px] font-bold text-ink-2 hover:text-ink [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-3.5 shrink-0 transition-transform group-open:rotate-90" aria-hidden />
        <span>Fontes e metodologia · {s.source_references.length}</span>
      </summary>
      <p className="mt-2 mb-3 text-[12.5px] text-ink-3">Cada número acima tem um selo clicável com fonte primária, secundária, data de referência e horário de coleta.</p>
      <div className="grid gap-4 lg:grid-cols-3">
        {groups
          .filter(([, list]) => list.length)
          .map(([title, list]) => (
            <Panel key={title} className="p-4">
              <Kicker className="mb-2">
                {title} · {list.length}
              </Kicker>
              <ul className="space-y-1.5 text-[12.5px]">
                {list.map((r, i) => (
                  <li key={i} className="min-w-0">
                    <a href={r.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex max-w-full items-center gap-1 font-bold text-accent hover:underline">
                      <span className="truncate">{r.name}</span>
                      <ExternalLink className="size-3 shrink-0" aria-hidden />
                    </a>
                    {r.used_for !== 'Notícia' && <span className="line-clamp-2 text-ink-3">{r.used_for.replace(/^Agenda: /, '')}</span>}
                  </li>
                ))}
              </ul>
            </Panel>
          ))}
      </div>
    </details>
  )
}
