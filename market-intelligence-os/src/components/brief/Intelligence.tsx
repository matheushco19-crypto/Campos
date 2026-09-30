import { ArrowRight, Scale, ShieldAlert } from 'lucide-react'
import type { IntelligenceSnapshot } from '@/core/schemas'
import { Empty, Kicker, Panel, Section } from '../ui'
import { FactChips, type FactMap, SNAP_STATUS } from './shared'

const STEPS = [
  ['O que aconteceu', 'fato'],
  ['Por que aconteceu', 'mecanismo'],
  ['O que isso muda', 'leitura'],
] as const

export function Intelligence({ s, factById }: { s: IntelligenceSnapshot; factById: FactMap }) {
  return (
    <Section id="intelligence" index="03" eyebrow="Intelligence" title="O mecanismo por trás dos fatos" lead="Três leituras do dia. O fato vem das fontes verificadas; o mecanismo e a leitura são interpretação, sinalizada como tal.">
      {s.insights.length ? (
        <div className="space-y-4">
          {s.insights.map((ins, i) => (
            <Panel key={i} as="article" className="card-lift overflow-hidden">
              <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-5 py-3.5">
                <span className="text-[12px] font-extrabold text-accent tnum">{String(i + 1).padStart(2, '0')}</span>
                <h3 className="min-w-0 flex-1 text-[16.5px] leading-snug font-extrabold tracking-tight text-ink">{ins.title}</h3>
                {ins.lenses.length > 0 && (
                  <ul className="flex flex-wrap gap-1" aria-label="Lentes de análise">
                    {ins.lenses.map((l) => (
                      <li key={l} className="rounded-md border border-line px-1.5 py-0.5 text-[10.5px] font-bold text-ink-2">
                        {l}
                      </li>
                    ))}
                  </ul>
                )}
              </header>
              <div className="grid md:grid-cols-3">
                {[ins.what_happened, ins.why_it_happened, ins.what_it_changes].map((text, k) => (
                  <div key={k} className={k === 2 ? 'relative bg-accent-soft/55 px-5 py-4' : 'relative border-line px-5 py-4 max-md:border-b md:border-r'}>
                    <Kicker className={k === 2 ? 'text-accent' : ''}>
                      {STEPS[k][0]} <span className="font-semibold tracking-normal normal-case opacity-70">· {STEPS[k][1]}</span>
                    </Kicker>
                    <p className={k === 0 ? 'mt-1.5 text-[14px] leading-relaxed text-ink' : k === 1 ? 'mt-1.5 text-[14px] leading-relaxed text-ink-2' : 'mt-1.5 text-[14px] leading-relaxed font-semibold text-ink'}>{text}</p>
                    {k < 2 && (
                      <span aria-hidden className="absolute top-1/2 -right-2.5 z-10 hidden size-5 -translate-y-1/2 place-items-center rounded-full border border-line bg-surface text-ink-3 md:grid">
                        <ArrowRight className="size-3" />
                      </span>
                    )}
                  </div>
                ))}
              </div>
              {ins.fact_ids.length > 0 && (
                <div className="border-t border-line px-5 py-2.5">
                  <FactChips ids={ins.fact_ids} factById={factById} className="mt-0" />
                </div>
              )}
            </Panel>
          ))}
        </div>
      ) : (
        <Empty>Interpretação indisponível nesta versão ({SNAP_STATUS[s.status].label}). Os fatos verificados continuam acessíveis em Mercados.</Empty>
      )}

      <div id="uhnw" className="mt-10 scroll-mt-28">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <div className="eyebrow flex items-center gap-2">
              <Scale className="size-3.5 text-accent" aria-hidden /> UHNW Lens
            </div>
            <h3 className="mt-1 text-[17px] font-extrabold tracking-tight text-ink">O que muda na conversa sobre patrimônio</h3>
          </div>
        </div>
        {s.uhnw_lens.length ? (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              {s.uhnw_lens.map((u, i) => (
                <Panel key={i} className="card-lift flex flex-col p-4">
                  <Kicker className="text-accent">{u.theme ?? 'patrimônio'}</Kicker>
                  <p className="mt-1.5 text-[14px] leading-relaxed text-ink">{u.text}</p>
                  <FactChips ids={u.fact_ids} factById={factById} />
                </Panel>
              ))}
            </div>
            <p className="mt-3 flex items-start gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-[12px] text-ink-3">
              <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              Informação geral para orientar a conversa. Não é recomendação individualizada: não considera objetivos, perfil de risco, situação tributária ou dados de nenhum cliente.
            </p>
          </>
        ) : (
          <Empty>UHNW Lens disponível depois da etapa de interpretação.</Empty>
        )}
      </div>
    </Section>
  )
}
