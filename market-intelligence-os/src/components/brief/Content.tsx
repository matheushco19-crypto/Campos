import { BarChart3, Clapperboard, Film, GalleryHorizontalEnd, MessageSquareQuote } from 'lucide-react'
import type { ContentIdea, ContentOpportunity, IntelligenceSnapshot, ReelIdea } from '@/core/schemas'
import type { PerformanceSummary } from '@/lib/dashboard-data'
import { fmtDate, fmtShortDate, fmtWeekday } from '@/lib/format'
import type { StrategyReport } from '@/storage/repository'
import { cn, Empty, Kicker, Panel, Pill, Section } from '../ui'

/** Social Strategy and Performance are hidden for now (backend and data kept); flip to re-enable. */
const SHOW_STRATEGY_AND_PERFORMANCE = false

const FORMAT_PT: Record<string, string> = { story: 'Story', carousel: 'Carrossel', reel: 'Reel', take: 'Post', post: 'Post' }
const STATUS_PT: Record<string, { label: string; tone: 'neutral' | 'accent' | 'ok' }> = { IDEA: { label: 'Ideia', tone: 'neutral' }, PLANNED: { label: 'Planejado', tone: 'accent' }, PUBLISHED: { label: 'Publicado', tone: 'ok' } }

export function Content(props: {
  s: IntelligenceSnapshot
  date: string
  pipeline: (ContentOpportunity & { event_name: string | null })[]
  performance: PerformanceSummary
  strategy: StrategyReport | null
}) {
  const cl = props.s.content_lab
  return (
    <Section id="content" index="04" eyebrow="Content Lab" title="O que publicar" lead="Quatro peças do dia, cada uma na estrutura do seu formato. Nada é publicado automaticamente.">
      {cl ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <IdeaCard kind="Story" Icon={Film} idea={cl.story} steps={cl.story.frames?.length ? cl.story.frames.map((t, i) => [`Tela ${i + 1}`, t] as [string, string]) : null} />
          <IdeaCard kind="Carrossel" Icon={GalleryHorizontalEnd} idea={cl.carousel} steps={cl.carousel.slides?.length ? cl.carousel.slides.map((t, i) => [SLIDE_LABELS[i] ?? `Slide ${i + 1}`, t] as [string, string]) : null} />
          <IdeaCard kind="Post" Icon={MessageSquareQuote} idea={cl.take} body={cl.take.post_text} />
          <ReelCard idea={cl.reel} />
        </div>
      ) : (
        <Empty>Content Lab disponível depois da etapa de interpretação.</Empty>
      )}

      {SHOW_STRATEGY_AND_PERFORMANCE && (
      <div className="mt-10 grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <div className="mb-3">
            <Kicker className="text-accent">Social Strategy</Kicker>
            <h3 className="mt-1 text-[17px] font-extrabold tracking-tight text-ink">O que produzir nos próximos 7 dias</h3>
          </div>
          {props.pipeline.length ? (
            <ol className="space-y-3">
              {groupPipeline(props.pipeline).map((g) => (
                <li key={g.key}>
                  <Panel className="card-lift p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h4 className="text-[13.5px] font-extrabold tracking-wide text-accent uppercase">{g.name}</h4>
                      {g.priority === 'HIGH' && <Pill tone="accent">Prioridade alta</Pill>}
                    </div>
                    <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">
                      <span className="font-bold text-ink-3">Ângulo editorial · </span>
                      {g.angle}
                    </p>
                    <ul className="mt-3 divide-y divide-line rounded-lg border border-line">
                      {g.items.map((o) => (
                        <li key={o.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-[12.5px]">
                          <span className="w-[84px] shrink-0 font-extrabold text-ink tnum">
                            {fmtShortDate(o.target_date)} <span className="font-semibold text-ink-3 capitalize">{fmtWeekday(o.target_date)}</span>
                          </span>
                          <Pill tone="solid">{FORMAT_PT[o.format]}</Pill>
                          <span className="min-w-0 flex-1 text-ink-2">{stageOf(o)}</span>
                          <Pill tone={STATUS_PT[o.status]?.tone ?? 'neutral'}>{STATUS_PT[o.status]?.label ?? o.status}</Pill>
                        </li>
                      ))}
                    </ul>
                  </Panel>
                </li>
              ))}
            </ol>
          ) : (
            <Empty>Nenhuma oportunidade editorial nos próximos 7 dias. O Agent 3 cria as oportunidades a partir da agenda e dos eventos verificados.</Empty>
          )}
        </div>

        <div>
          <div className="mb-3">
            <Kicker className="text-accent">Performance</Kicker>
            <h3 className="mt-1 text-[17px] font-extrabold tracking-tight text-ink">Métricas importadas</h3>
          </div>
          <Performance p={props.performance} />
          {props.strategy && <StrategyNote report={props.strategy} />}
        </div>
      </div>
      )}
    </Section>
  )
}

const SLIDE_LABELS = ['Hook', 'Contexto', 'Dado', 'Interpretação', 'Conclusão']

/**
 * Format-shaped card: Story screens, carousel slides or the post text lead; angle and main idea
 * move into a collapsed details block so the card keeps its size. Older versions (no structure)
 * fall back to angle + main idea.
 */
function IdeaCard({ kind, Icon, idea, steps = null, body = null }: { kind: string; Icon: typeof Film; idea: ContentIdea; steps?: [string, string][] | null; body?: string | null }) {
  const structured = !!steps?.length || !!body
  return (
    <Panel as="article" className="card-lift flex flex-col p-5">
      <div className="flex items-center gap-2 text-ink-3">
        <Icon className="size-4" aria-hidden />
        <span className="text-[10.5px] font-extrabold tracking-[0.16em] uppercase">{kind}</span>
      </div>
      <h4 className="mt-2 text-[16px] leading-snug font-extrabold tracking-tight text-ink">{idea.title}</h4>
      {steps?.length ? (
        <ol className="mt-3 space-y-1.5 text-[12.5px] leading-snug">
          {steps.map(([label, text], i) => (
            <li key={i} className="flex gap-2" title={text}>
              <span className="w-[90px] shrink-0 pt-px text-[9.5px] font-extrabold tracking-[0.1em] text-ink-3 uppercase">{label}</span>
              <span className={cn('min-w-0 flex-1 line-clamp-2', i === 0 ? 'font-bold text-ink' : 'text-ink-2')}>{text}</span>
            </li>
          ))}
        </ol>
      ) : body ? (
        <p className="mt-3 line-clamp-5 text-[13px] leading-relaxed text-ink-2">{body}</p>
      ) : null}
      {structured ? (
        <details className="group mt-3 text-[12.5px]">
          <summary className="cursor-pointer list-none text-[11px] font-bold text-accent hover:underline">Ângulo e ideia principal</summary>
          <p className="mt-1.5 leading-relaxed text-ink-2">{idea.angle}</p>
          {idea.main_idea && <p className="mt-1 leading-relaxed font-semibold text-ink">{idea.main_idea}</p>}
        </details>
      ) : (
        <dl className="mt-3 space-y-2.5 text-[13px] leading-relaxed">
          <div>
            <dt className="text-[10px] font-extrabold tracking-[0.16em] text-ink-3 uppercase">Ângulo</dt>
            <dd className="mt-0.5 text-ink-2">{idea.angle}</dd>
          </div>
          {(idea.main_idea ?? idea.hook) && (
            <div>
              <dt className="text-[10px] font-extrabold tracking-[0.16em] text-ink-3 uppercase">{idea.main_idea ? 'Ideia principal' : 'Gancho'}</dt>
              <dd className="mt-0.5 font-semibold text-ink">{idea.main_idea ?? idea.hook}</dd>
            </div>
          )}
        </dl>
      )}
    </Panel>
  )
}

function ReelCard({ idea }: { idea: ReelIdea }) {
  const script = [
    ['Hook · fala', idea.hook],
    ['Desenvolvimento · fala', idea.development],
    ['Na tela', idea.on_screen],
    ['Fechamento', idea.closing],
    ['CTA', idea.cta],
  ].filter((x): x is [string, string] => !!x[1])
  return (
    <Panel as="article" className="card-lift flex flex-col border-ink/15 p-5 md:col-span-2 xl:col-span-3">
      <div className="flex items-center gap-2 text-ink-3">
        <Clapperboard className="size-4" aria-hidden />
        <span className="text-[10.5px] font-extrabold tracking-[0.16em] uppercase">Reel · roteiro</span>
      </div>
      <div className="mt-2 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div>
          <h4 className="text-[18px] leading-snug font-extrabold tracking-tight text-ink">{idea.title}</h4>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
            <span className="font-semibold text-ink-3">Ângulo: </span>
            {idea.angle}
          </p>
          {idea.main_idea && (
            <p className="mt-2 text-[13px] leading-relaxed font-semibold text-ink">
              <span className="font-semibold text-ink-3">Ideia principal: </span>
              {idea.main_idea}
            </p>
          )}
        </div>
        {script.length ? (
          <ol className={cn('grid gap-3 sm:grid-cols-2', script.length > 4 && 'lg:grid-cols-3')}>
            {script.map(([k, v], i) => (
              <li key={k} className={cn('rounded-lg border border-line p-3', i === 0 && 'border-accent/40 bg-accent-soft/50')}>
                <div className="flex items-center gap-2">
                  <span className="grid size-5 place-items-center rounded-full bg-ink text-[10px] font-extrabold text-surface tnum">{i + 1}</span>
                  <span className="text-[10.5px] font-extrabold tracking-[0.14em] text-ink-3 uppercase">{k}</span>
                </div>
                <p className={cn('mt-1.5 line-clamp-4 text-[13px] leading-relaxed', i === 0 ? 'font-bold text-ink' : 'text-ink-2')} title={v}>{v}</p>
              </li>
            ))}
          </ol>
        ) : (
          idea.hook && <p className="text-[14px] font-semibold text-ink">“{idea.hook}”</p>
        )}
      </div>
    </Panel>
  )
}

function Performance({ p }: { p: PerformanceSummary }) {
  if (!p.posts) {
    return (
      <Panel className="p-5">
        <div className="flex items-center gap-2 text-ink-3">
          <BarChart3 className="size-4" aria-hidden />
          <span className="text-[13px] font-bold text-ink">Dados de performance ainda não importados.</span>
        </div>
        <p className="mt-2 text-[12.5px] leading-relaxed text-ink-3">
          Nenhuma métrica é estimada. Exporte os insights do Instagram em CSV ou JSON e importe com <code className="rounded bg-muted-soft px-1 text-[11.5px]">npm run mi -- import-social arquivo.csv</code> ou pelo endpoint <code className="rounded bg-muted-soft px-1 text-[11.5px]">POST /api/social/import</code>.
        </p>
      </Panel>
    )
  }
  const pct = (v: number | null) => (v === null ? '—' : `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`)
  return (
    <Panel className="p-5">
      <dl className="grid grid-cols-2 gap-4">
        <Stat k="Posts importados" v={p.posts.toLocaleString('pt-BR')} />
        <Stat k="Alcance mediano" v={p.medianReach === null ? '—' : p.medianReach.toLocaleString('pt-BR')} />
        <Stat k="Engajamento mediano" v={pct(p.medianEngagementRate)} />
        <Stat k="Salvamentos (mediana)" v={pct(p.medianSaveRate)} />
      </dl>
      {p.byFormat.length > 0 && (
        <ul className="mt-4 space-y-1 border-t border-line pt-3 text-[12.5px]">
          {p.byFormat.map((f) => (
            <li key={f.format} className="flex justify-between gap-2">
              <span className="text-ink-2">{FORMAT_PT[f.format] ?? f.format}</span>
              <span className="font-semibold text-ink tnum">{f.n} posts</span>
            </li>
          ))}
        </ul>
      )}
      {p.lastPublished && <p className="mt-3 text-[11px] text-ink-3">Post mais recente importado: {fmtDate(p.lastPublished)}</p>}
    </Panel>
  )
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-[10px] font-extrabold tracking-[0.14em] text-ink-3 uppercase">{k}</dt>
      <dd className="mt-0.5 text-[18px] font-extrabold text-ink tnum">{v}</dd>
    </div>
  )
}

function StrategyNote({ report }: { report: StrategyReport }) {
  const r = report.report as { strategy?: { positioning_note?: string; what_to_double_down?: string[] }; patterns?: { statement: string }[] }
  if (!r.strategy?.positioning_note && !r.patterns?.length) return null
  return (
    <Panel className="mt-4 p-4">
      <Kicker>Revisão semanal · {fmtDate(report.week_start)}</Kicker>
      {r.strategy?.positioning_note && <p className="mt-1.5 text-[13px] leading-relaxed text-ink">{r.strategy.positioning_note}</p>}
      {r.patterns && r.patterns.length > 0 && (
        <ul className="mt-2 list-disc space-y-1 pl-4 text-[12.5px] text-ink-2">
          {r.patterns.slice(0, 4).map((p, i) => (
            <li key={i}>{p.statement}</li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

type PipelineItem = ContentOpportunity & { event_name: string | null }

/** One card per event: angle once, then the pieces to produce (format · ideal date · status). */
function groupPipeline(items: PipelineItem[]) {
  const groups = new Map<string, { key: string; name: string; angle: string; priority: string; items: PipelineItem[] }>()
  for (const o of items) {
    const key = o.event_id ?? o.cluster_id ?? o.id
    const g = groups.get(key)
    if (g) g.items.push(o)
    else groups.set(key, { key, name: o.event_name ?? o.title, angle: o.angle.replace(/ Publicar só depois do dado verificado pelo Agent 1\.$/, ''), priority: o.priority, items: [o] })
  }
  return [...groups.values()].sort((a, b) => a.items[0].target_date.localeCompare(b.items[0].target_date)).slice(0, 8)
}

function stageOf(o: PipelineItem): string {
  if (o.title.startsWith('Antes de')) return 'Antes do evento: o que está em jogo'
  if (o.title.includes('leitura do dia seguinte')) return 'Depois do dado: a leitura (só com o fato verificado)'
  return o.title
}
