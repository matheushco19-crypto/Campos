import { ExternalLink } from 'lucide-react'
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
    <section id="sources" className="scroll-mt-28" aria-labelledby="sources-title">
      <div className="mb-4 border-b border-line pb-3">
        <div className="eyebrow">Fontes</div>
        <h2 id="sources-title" className="mt-1 text-[17px] font-extrabold tracking-tight text-ink">
          Referências deste briefing
        </h2>
        <p className="mt-1 text-[12.5px] text-ink-3">Cada número acima tem um selo clicável com fonte primária, secundária, data de referência e horário de coleta.</p>
      </div>
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
    </section>
  )
}
