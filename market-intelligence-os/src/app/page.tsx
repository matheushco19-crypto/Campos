import { AlertCircle, ArrowRight, BookOpen, CheckCircle2, Clapperboard, Clock, Film, GalleryHorizontalEnd, Lightbulb, MessageSquareQuote, XCircle } from 'lucide-react'
import Link from 'next/link'
import { ASSETS } from '../../config/assets'
import { CompareChart } from '@/components/CompareChart'
import { DateNav } from '@/components/DateNav'
import { HistorySearch } from '@/components/HistorySearch'
import { Change, MarketsTable } from '@/components/MarketsTable'
import { NewsList } from '@/components/NewsList'
import { ResearchPanel, RunNowButton } from '@/components/ResearchPanel'
import { SectionNav } from '@/components/SectionNav'
import { cn, Empty, Panel, Pill, Section } from '@/components/ui'
import { VerificationBadge } from '@/components/VerificationBadge'
import type { ContentIdea, IntelligenceSnapshot, VerifiedFact } from '@/core/schemas'
import { loadDashboard } from '@/lib/dashboard-data'
import { fmtDate, fmtDateTimeBRT, fmtShortDate, fmtTimeBRT, fmtValue, fmtWeekday, REGION_LABEL } from '@/lib/format'
import { clusterProvenance, eventProvenance, factProvenance } from '@/lib/provenance'

export const dynamic = 'force-dynamic'

type SP = Promise<{ date?: string; v?: string; compare?: string }>

const MODE_LABEL: Record<string, string> = { anthropic_api: 'Claude API', claude_code: 'Claude Code', deterministic: 'Somente fatos' }
const SNAP_STATUS: Record<string, { label: string; tone: 'ok' | 'warn' | 'crit' | 'accent' }> = {
  PUBLISHED: { label: 'Publicado', tone: 'ok' },
  DRAFT_FACTS_ONLY: { label: 'Somente fatos', tone: 'warn' },
  AWAITING_ANALYSIS: { label: 'Aguardando análise', tone: 'accent' },
  FAILED_QC: { label: 'Falhou no QC', tone: 'crit' },
}
const PULSE = ['IBOV', 'SPX', 'NASDAQ', 'USDBRL', 'US10Y', 'BTCUSD']

export default async function Page({ searchParams }: { searchParams: SP }) {
  const params = await searchParams
  const d = await loadDashboard(params)
  const s = d.snapshot
  const factById = new Map(d.facts.map((f) => [f.id, f]))
  const clusterById = new Map((s?.news_snapshot ?? []).map((c) => [c.id, c]))

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-navy/95 backdrop-blur supports-[backdrop-filter]:bg-navy/85">
        <div className="mx-auto max-w-[1320px] px-4 pt-3 pb-2 sm:px-6">
          <div className="mb-2 flex items-center gap-3">
            <span aria-hidden className="grid size-6 place-items-center rounded-md bg-white text-[11px] font-black text-navy">MI</span>
            <span className="text-[11.5px] font-extrabold tracking-[0.22em] text-white/90">MARKET INTELLIGENCE OS</span>
            {s && (
              <span className="ml-auto flex items-center gap-2">
                <Pill tone={SNAP_STATUS[s.status].tone} className="bg-white/10 text-white">
                  {SNAP_STATUS[s.status].label}
                </Pill>
                <span className="hidden text-[11px] text-white/55 sm:inline">{MODE_LABEL[s.analysis_mode]} · v{s.version}</span>
              </span>
            )}
          </div>
          <DateNav date={d.date} today={d.today} prevDate={d.prevDate} nextDate={d.nextDate} availableDates={d.availableDates} generatedAt={s?.generated_at ?? null} versions={d.versions} version={params.v ? Number(params.v) : null} />
          <div className="mt-2.5">
            <SectionNav />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1320px] space-y-12 px-4 py-6 sm:px-6 sm:py-8">
        {d.error && (
          <Panel className="flex items-start gap-3 border-crit/40 p-4 text-[13px] text-crit">
            <AlertCircle className="mt-0.5 size-4 shrink-0" /> Erro ao carregar dados: {d.error}
          </Panel>
        )}
        {!s ? <NoBrief date={d.date} prevDate={d.prevDate} /> : <Brief d={d} s={s} factById={factById} clusterById={clusterById} />}
        <ResearchAndHistory d={d} />
        <footer className="border-t border-line pt-6 pb-10 text-[11.5px] text-ink-3">
          Market Intelligence OS · horários em America/Sao_Paulo (BRT) · armazenamento: {d.storage}. Dados vêm antes das interpretações: todo número tem fonte, e opinião é sempre sinalizada.
        </footer>
      </main>
    </div>
  )
}

function NoBrief({ date, prevDate }: { date: string; prevDate: string | null }) {
  return (
    <section id="overview" className="scroll-mt-32">
      <Panel className="p-8 text-center">
        <div className="eyebrow">Overview</div>
        <h1 className="mt-2 text-xl font-bold">Nenhum briefing para {fmtDate(date)}</h1>
        <p className="mx-auto mt-2 max-w-lg text-[13.5px] text-ink-2">O histórico nunca é sobrescrito. Cada execução cria uma nova versão. Rode o pipeline agora ou navegue para uma data com conteúdo.</p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <RunNowButton />
          {prevDate && (
            <Link href={`/?date=${prevDate}`} className="inline-flex items-center gap-1 text-[13px] font-semibold text-accent hover:underline">
              Ver {fmtDate(prevDate)} <ArrowRight className="size-3.5" />
            </Link>
          )}
        </div>
      </Panel>
    </section>
  )
}

type D = Awaited<ReturnType<typeof loadDashboard>>

function FactChips({ ids, factById }: { ids: string[]; factById: Map<string, VerifiedFact> }) {
  const facts = ids.map((id) => factById.get(id)).filter((f): f is VerifiedFact => !!f)
  if (!facts.length) return null
  return (
    <span className="mt-2 flex flex-wrap gap-1.5">
      {facts.map((f) => (
        <span key={f.id} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 py-0.5 pr-0.5 pl-2 text-[11px] font-semibold text-ink-2">
          {f.label} <span className="text-ink tnum">{fmtValue(f.value, f.unit)}</span>
          <VerificationBadge p={factProvenance(f)} compact />
        </span>
      ))}
    </span>
  )
}

function Brief({ d, s, factById, clusterById }: { d: D; s: IntelligenceSnapshot; factById: Map<string, VerifiedFact>; clusterById: Map<string, IntelligenceSnapshot['news_snapshot'][number]> }) {
  const pulse = PULSE.map((m) => s.market_snapshot.find((r) => r.metric === m)).filter(Boolean) as IntelligenceSnapshot['market_snapshot']
  const today = s.agenda.filter((a) => a.bucket === 'today')
  const qcPassed = s.qc.checks.filter((c) => c.passed).length
  const compareRows = d.compare?.snapshot ? { date: d.compare.date, rows: d.compare.snapshot.market_snapshot } : null

  return (
    <>
      {/* OVERVIEW — the 30-second answer */}
      <section id="overview" className="scroll-mt-32" aria-labelledby="overview-title">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="eyebrow">Morning Intelligence · {fmtWeekday(s.date)}</div>
            <h1 id="overview-title" className="mt-1 text-[26px] font-extrabold tracking-tight text-ink sm:text-[30px]">
              O que importa hoje
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-ink-3">
            <span className="inline-flex items-center gap-1"><Clock className="size-3.5" /> {s.qc.reading_minutes} min de leitura</span>
            <span>·</span>
            <span className={cn('inline-flex items-center gap-1 font-semibold', s.qc.passed ? 'text-ok' : 'text-warn')}>
              {s.qc.passed ? <CheckCircle2 className="size-3.5" /> : <AlertCircle className="size-3.5" />} QC {qcPassed}/{s.qc.checks.length}
            </span>
            <span>·</span>
            <span>{fmtDateTimeBRT(s.generated_at)}</span>
          </div>
        </div>

        {s.limitations.length > 0 && (
          <details className="mb-4 rounded-xl border border-warn/30 bg-warn-soft px-4 py-2.5 text-[12.5px] text-warn">
            <summary className="cursor-pointer font-semibold">Limitações desta execução ({s.limitations.length})</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {s.limitations.map((l, i) => <li key={i}>{l}</li>)}
            </ul>
          </details>
        )}

        <div className="grid gap-5 lg:grid-cols-12">
          <Panel className="lg:col-span-8">
            <ol className="divide-y divide-line">
              {s.what_matters.map((w, i) => {
                const c = w.cluster_ids.map((id) => clusterById.get(id)).find(Boolean)
                return (
                  <li key={i} className="flex gap-4 px-5 py-4">
                    <span className="mt-0.5 text-[13px] font-extrabold text-accent tnum">{String(i + 1).padStart(2, '0')}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="text-[15.5px] leading-snug font-bold text-ink">{w.headline}</h3>
                        {c && <VerificationBadge p={clusterProvenance(c)} compact />}
                      </div>
                      <p className="mt-1 text-[13.5px] leading-relaxed text-ink-2">{w.why_it_matters}</p>
                      <FactChips ids={w.fact_ids} factById={factById} />
                    </div>
                  </li>
                )
              })}
              {!s.what_matters.length && <li className="p-5"><Empty>Nenhum evento relevante verificado.</Empty></li>}
            </ol>
          </Panel>

          <div className="space-y-5 lg:col-span-4">
            <Panel className="p-4">
              <div className="eyebrow mb-3">Mercados em 60 segundos</div>
              <ul className="grid grid-cols-2 gap-2">
                {pulse.map((r) => (
                  <li key={r.metric} className="rounded-xl bg-surface-2 px-3 py-2.5">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[11.5px] font-semibold text-ink-3">{r.label}</span>
                      <VerificationBadge p={factProvenance(factById.get(r.fact_id), r.verification_status)} compact />
                    </div>
                    <div className="mt-0.5 text-[17px] font-extrabold text-ink">{fmtValue(r.value, r.unit)}</div>
                    <div className="text-[12px]">
                      <Change v={r.change_pct} />
                      <span className="ml-1 text-[10.5px] text-ink-3">{r.market_status === 'OPEN' ? 'em negociação' : r.reference ? `ref. ${fmtShortDate(r.reference)}` : ''}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel className="p-4">
              <div className="eyebrow mb-2">Hoje</div>
              {today.length ? (
                <ul className="space-y-2">
                  {today.map((a) => (
                    <li key={a.event_id} className="flex items-start gap-2 text-[13px]">
                      <span className="w-12 shrink-0 font-semibold text-ink-2 tnum">{a.time ?? '—'}</span>
                      <span className="flex-1 text-ink">{a.name}</span>
                      <VerificationBadge p={eventProvenance(a)} compact />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[13px] text-ink-3">Sem eventos relevantes na agenda de hoje.</p>
              )}
            </Panel>
            {s.content_lab && (
              <Panel className="p-4">
                <div className="eyebrow mb-2">Para publicar</div>
                <p className="text-[14px] font-bold text-ink">{s.content_lab.take.title}</p>
                <p className="mt-1 text-[12.5px] text-ink-2">{s.content_lab.take.hook}</p>
                <a href="#content" className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-accent hover:underline">Content Lab <ArrowRight className="size-3" /></a>
              </Panel>
            )}
            {d.previous && d.prevDate && (
              <Panel className="p-4">
                <div className="eyebrow mb-2">Ontem · {fmtDate(d.prevDate)}</div>
                <ul className="space-y-1.5 text-[13px] text-ink-2">
                  {d.previous.what_matters.slice(0, 3).map((w, i) => <li key={i} className="line-clamp-2">{w.headline}</li>)}
                </ul>
                <Link href={`/?date=${d.prevDate}`} className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-accent hover:underline">Abrir briefing <ArrowRight className="size-3" /></Link>
              </Panel>
            )}
          </div>
        </div>
      </section>

      {/* MARKETS */}
      <Section id="markets" eyebrow="Markets" title="Mercados" action={<CompareLinks d={d} />}>
        <MarketsTable rows={s.market_snapshot} facts={d.facts} history={d.history} compare={compareRows} />
        <Panel className="mt-5 p-5">
          <div className="eyebrow mb-3">Comparação de mercados · 30 dias</div>
          <CompareChart options={ASSETS.filter((a) => a.enabled && a.unit !== '%').map((a) => ({ metric: a.metric, label: a.label }))} history={d.history} />
        </Panel>
      </Section>

      {/* MACRO */}
      <Section id="macro" eyebrow="Macro Watch" title="Macroeconomia">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {(['BR', 'US', 'CN', 'EU'] as const).map((r) => {
            const rows = s.macro_snapshot.filter((m) => m.region === r)
            const watch = s.macro_watch[r]
            return (
              <Panel key={r} className="flex flex-col p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-[14px] font-bold text-ink">{REGION_LABEL[r]}</h3>
                  <span className="text-[11px] text-ink-3">{rows.filter((x) => x.verification_status === 'VERIFIED').length}/{rows.length} verificados</span>
                </div>
                <ul className="space-y-2">
                  {rows.map((m) => (
                    <li key={m.metric} className="flex items-center gap-2 text-[12.5px]">
                      <span className="min-w-0 flex-1 truncate text-ink-2" title={m.label}>{m.label}</span>
                      <span className={cn('font-bold tnum', m.value === null ? 'text-ink-3' : 'text-ink')}>{fmtValue(m.value, m.unit)}</span>
                      <VerificationBadge p={factProvenance(factById.get(m.fact_id), m.verification_status)} compact />
                    </li>
                  ))}
                </ul>
                {watch.length > 0 && (
                  <div className="mt-4 space-y-2 border-t border-line pt-3">
                    {watch.map((w, i) => <p key={i} className="text-[12.5px] leading-relaxed text-ink-2">{w.text}</p>)}
                  </div>
                )}
              </Panel>
            )
          })}
        </div>
      </Section>

      {/* NEWS */}
      <Section id="news" eyebrow="News" title="Eventos do dia (deduplicados)">
        <NewsList clusters={s.news_snapshot} />
      </Section>

      {/* INTELLIGENCE */}
      <Section id="intelligence" eyebrow="Intelligence Take" title="O mecanismo por trás dos fatos">
        {s.insights.length ? (
          <div className="grid gap-4 lg:grid-cols-3">
            {s.insights.map((ins, i) => (
              <Panel key={i} className="flex flex-col p-5">
                <div className="flex items-center gap-2 text-accent"><Lightbulb className="size-4" /><span className="text-[11px] font-bold tracking-wider uppercase">Insight {i + 1}</span></div>
                <h3 className="mt-2 text-[16px] leading-snug font-bold text-ink">{ins.title}</h3>
                <dl className="mt-3 space-y-3 text-[13px] leading-relaxed">
                  <div><dt className="eyebrow">O que aconteceu · fato</dt><dd className="mt-1 text-ink">{ins.what_happened}</dd></div>
                  <div><dt className="eyebrow">Por que aconteceu · mecanismo</dt><dd className="mt-1 text-ink-2">{ins.why_it_happened}</dd></div>
                  <div className="rounded-lg bg-accent-soft/60 p-3"><dt className="eyebrow text-accent">O que isso muda · leitura</dt><dd className="mt-1 text-ink">{ins.what_it_changes}</dd></div>
                </dl>
                <FactChips ids={ins.fact_ids} factById={factById} />
              </Panel>
            ))}
          </div>
        ) : (
          <Empty>Interpretação indisponível nesta versão ({SNAP_STATUS[s.status].label}). Fatos verificados continuam acessíveis acima.</Empty>
        )}
      </Section>

      {/* UHNW */}
      <Section id="uhnw" eyebrow="UHNW Lens" title="O que muda na conversa com um cliente de patrimônio elevado">
        {s.uhnw_lens.length ? (
          <Panel className="divide-y divide-line">
            {s.uhnw_lens.map((u, i) => (
              <div key={i} className="flex gap-4 px-5 py-4">
                <span className="mt-1 h-8 w-1 shrink-0 rounded-full bg-navy" aria-hidden />
                <div><p className="text-[14px] leading-relaxed text-ink">{u.text}</p><FactChips ids={u.fact_ids} factById={factById} /></div>
              </div>
            ))}
            <p className="px-5 py-3 text-[11.5px] text-ink-3">Leitura geral. Não é recomendação personalizada e não presume dados de nenhum cliente.</p>
          </Panel>
        ) : <Empty>UHNW Lens disponível após a etapa de interpretação.</Empty>}
      </Section>

      {/* CONTENT */}
      <Section id="content" eyebrow="Content Lab" title="O que publicar">
        {s.content_lab ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <IdeaCard kind="Story" Icon={Film} idea={s.content_lab.story} />
            <IdeaCard kind="Carrossel" Icon={GalleryHorizontalEnd} idea={s.content_lab.carousel} />
            <IdeaCard kind="Reel" Icon={Clapperboard} idea={s.content_lab.reel} />
            <IdeaCard kind="Opinião / Take" Icon={MessageSquareQuote} idea={s.content_lab.take} />
            {s.content_lab.exceptional && <IdeaCard kind="Oportunidade excepcional" Icon={BookOpen} idea={s.content_lab.exceptional} />}
          </div>
        ) : <Empty>Content Lab disponível após a etapa de interpretação.</Empty>}
        {s.content_opportunities.length > 0 && (
          <Panel className="mt-5">
            <div className="eyebrow px-5 pt-4">Oportunidades antecipadas pelo Agent 3</div>
            <ul className="divide-y divide-line">
              {s.content_opportunities.slice(0, 10).map((o) => (
                <li key={o.id} className="flex flex-wrap items-start gap-3 px-5 py-3 text-[13px]">
                  <span className="w-14 shrink-0 font-semibold text-ink-2 tnum">{fmtShortDate(o.target_date)}</span>
                  <Pill tone={o.priority === 'HIGH' ? 'accent' : 'neutral'}>{o.format}</Pill>
                  <div className="min-w-0 flex-1"><div className="font-semibold text-ink">{o.title}</div><div className="text-[12.5px] text-ink-2">{o.angle}</div></div>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </Section>

      {/* CALENDAR */}
      <Section id="calendar" eyebrow="Agenda" title="Hoje, amanhã e próximos eventos">
        <div className="grid gap-4 lg:grid-cols-3">
          {(['today', 'tomorrow', 'upcoming'] as const).map((b) => {
            const items = s.agenda.filter((a) => a.bucket === b)
            return (
              <Panel key={b} className="p-4">
                <h3 className="mb-3 text-[14px] font-bold text-ink">{b === 'today' ? 'Hoje' : b === 'tomorrow' ? 'Amanhã' : 'Próximos'}</h3>
                {items.length ? (
                  <ul className="space-y-2.5">
                    {items.map((a) => (
                      <li key={a.event_id} className="flex items-start gap-2 text-[13px]">
                        <span className="w-12 shrink-0 text-ink-3 tnum">{b === 'upcoming' ? fmtShortDate(a.date) : a.time ?? '—'}</span>
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-ink">{a.name}</div>
                          <div className="text-[11.5px] text-ink-3">{REGION_LABEL[a.region]} · {a.category}{a.importance === 'HIGH' ? ' · alta importância' : ''}</div>
                        </div>
                        <VerificationBadge p={eventProvenance(a)} compact />
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-[13px] text-ink-3">Nada relevante.</p>}
              </Panel>
            )
          })}
        </div>
        <details className="mt-4 rounded-2xl border border-line bg-surface">
          <summary className="cursor-pointer px-5 py-3 text-[13px] font-semibold text-ink">Calendário completo (45 dias) · {d.events.length} eventos</summary>
          <ul className="divide-y divide-line border-t border-line">
            {d.events.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5 text-[12.5px]">
                <span className="w-24 shrink-0 font-semibold text-ink-2 tnum">{fmtShortDate(e.date)} {e.time ?? ''}</span>
                <Pill tone={e.category === 'HOLIDAY' ? 'neutral' : e.importance === 'HIGH' ? 'accent' : 'neutral'}>{e.category}</Pill>
                <span className="min-w-0 flex-1 text-ink">{e.name}</span>
                <VerificationBadge p={eventProvenance(e)} compact />
              </li>
            ))}
          </ul>
        </details>
      </Section>

      {/* SOURCES */}
      <Section id="sources" eyebrow="Fontes" title="Referências do briefing">
        <Panel className="p-5">
          <ul className="grid gap-x-6 gap-y-1.5 text-[12.5px] sm:grid-cols-2 lg:grid-cols-3">
            {s.source_references.map((r, i) => (
              <li key={i} className="min-w-0 truncate">
                <a href={r.url} target="_blank" rel="noopener noreferrer nofollow" className="font-semibold text-accent hover:underline">{r.name}</a>
                <span className="text-ink-3"> · {r.used_for}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </Section>
    </>
  )
}

function IdeaCard({ kind, Icon, idea }: { kind: string; Icon: typeof Film; idea: ContentIdea }) {
  return (
    <Panel className="flex flex-col p-5">
      <div className="flex items-center gap-2 text-ink-3"><Icon className="size-4" /><span className="text-[11px] font-bold tracking-wider uppercase">{kind}</span></div>
      <h3 className="mt-2 text-[15px] leading-snug font-bold text-ink">{idea.title}</h3>
      <p className="mt-2 text-[13px] font-semibold text-navy dark:text-accent">“{idea.hook}”</p>
      <p className="mt-2 text-[12.5px] leading-relaxed text-ink-2">{idea.angle}</p>
    </Panel>
  )
}

function CompareLinks({ d }: { d: D }) {
  const others = d.availableDates.filter((x) => x !== d.date).slice(0, 5)
  if (!others.length) return null
  return (
    <div className="flex flex-wrap items-center gap-1 text-[12px]">
      <span className="text-ink-3">Comparar com:</span>
      {others.map((o) => (
        <Link key={o} href={`/?date=${d.date}&compare=${o}#markets`} className={cn('rounded-full px-2 py-0.5 font-semibold', d.compare?.date === o ? 'bg-navy text-white' : 'bg-muted-soft text-ink-2 hover:bg-line')}>{fmtShortDate(o)}</Link>
      ))}
      {d.compare && <Link href={`/?date=${d.date}#markets`} className="px-1 text-ink-3 hover:text-ink">limpar</Link>}
    </div>
  )
}

function ResearchAndHistory({ d }: { d: D }) {
  const s = d.snapshot
  const orchestrator = d.runs.filter((r) => r.agent === 'orchestrator')
  return (
    <>
      <Section id="research" eyebrow="Research & Observabilidade" title="Pesquisa entre agentes e saúde do pipeline" action={<RunNowButton />}>
        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 text-[13px] font-bold text-ink">Research Broker</h3>
            <ResearchPanel requests={d.research} />
          </div>
          <div className="space-y-5">
            <div>
              <h3 className="mb-2 text-[13px] font-bold text-ink">Execuções ({fmtDate(d.date)})</h3>
              <Panel className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-[12.5px]">
                  <thead><tr className="border-b border-line text-left text-[10.5px] tracking-wider text-ink-3 uppercase"><th className="px-3 py-2">Agente</th><th className="px-3 py-2">Início</th><th className="px-3 py-2">Status</th><th className="px-3 py-2 text-right">Coletado</th><th className="px-3 py-2 text-right">Verif.</th><th className="px-3 py-2 text-right">Erros</th></tr></thead>
                  <tbody>
                    {d.runs.slice(0, 14).map((r) => (
                      <tr key={r.run_id} className="border-b border-line last:border-0" title={r.errors.map((e) => `${e.step}${e.source ? ` (${e.source})` : ''}: ${e.message}`).join('\n')}>
                        <td className="px-3 py-2 font-semibold text-ink">{r.agent}</td>
                        <td className="px-3 py-2 text-ink-2 tnum">{fmtTimeBRT(r.started_at)}</td>
                        <td className="px-3 py-2"><Pill tone={r.status === 'SUCCESS' ? 'ok' : r.status === 'FAILED' ? 'crit' : r.status === 'PARTIAL' ? 'warn' : 'accent'}>{r.status}</Pill></td>
                        <td className="px-3 py-2 text-right tnum">{r.items_collected}</td>
                        <td className="px-3 py-2 text-right tnum">{r.items_verified}</td>
                        <td className="px-3 py-2 text-right tnum">{r.errors.length}</td>
                      </tr>
                    ))}
                    {!d.runs.length && <tr><td colSpan={6} className="px-3 py-5 text-center text-ink-3">Nenhuma execução registrada nesta data.{orchestrator.length === 0 ? ' Por isso não há briefing.' : ''}</td></tr>}
                  </tbody>
                </table>
              </Panel>
              {d.runs.some((r) => r.errors.length) && (
                <details className="mt-2 text-[12px] text-ink-2">
                  <summary className="cursor-pointer font-semibold">Erros e fontes com falha</summary>
                  <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto">
                    {d.runs.flatMap((r) => r.errors.map((e, i) => <li key={`${r.run_id}-${i}`} className="tnum"><span className="font-semibold">{r.agent}</span> · {e.step}{e.source ? ` · ${e.source}` : ''}: {e.message}</li>))}
                  </ul>
                </details>
              )}
            </div>
            {s && (
              <div>
                <h3 className="mb-2 text-[13px] font-bold text-ink">Quality control do briefing</h3>
                <Panel className="p-4">
                  <ul className="grid gap-1.5 text-[12.5px] sm:grid-cols-2">
                    {s.qc.checks.map((c) => (
                      <li key={c.id} className="flex items-start gap-1.5" title={c.detail ?? ''}>
                        {c.passed ? <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-ok" /> : <XCircle className="mt-0.5 size-3.5 shrink-0 text-crit" />}
                        <span className={c.passed ? 'text-ink-2' : 'font-semibold text-crit'}>{c.label}</span>
                      </li>
                    ))}
                  </ul>
                  {s.qc.corrections.length > 0 && (
                    <details className="mt-3 text-[12px] text-ink-3"><summary className="cursor-pointer font-semibold">{s.qc.corrections.length} correções aplicadas antes de salvar</summary><ul className="mt-1 list-disc pl-5">{s.qc.corrections.map((c, i) => <li key={i}>{c}</li>)}</ul></details>
                  )}
                </Panel>
              </div>
            )}
          </div>
        </div>
      </Section>

      <Section id="history" eyebrow="History" title="Briefings anteriores">
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2"><HistorySearch /></div>
          <Panel className="p-4">
            <div className="eyebrow mb-2">{d.availableDates.length} dias com conteúdo</div>
            <ul className="flex max-h-64 flex-wrap gap-1.5 overflow-y-auto">
              {d.availableDates.map((x) => (
                <li key={x}><Link href={`/?date=${x}`} className={cn('block rounded-md px-2 py-1 text-[12px] font-semibold tnum', x === d.date ? 'bg-navy text-white' : 'bg-muted-soft text-ink-2 hover:bg-line')}>{fmtShortDate(x)}</Link></li>
              ))}
            </ul>
          </Panel>
        </div>
        {d.strategy && (
          <Panel className="mt-5 p-5">
            <div className="eyebrow mb-2">Revisão semanal do Agent 3 · semana de {fmtDate(d.strategy.week_start)}</div>
            <StrategySummary report={d.strategy.report} />
          </Panel>
        )}
      </Section>
    </>
  )
}

function StrategySummary({ report }: { report: Record<string, unknown> }) {
  const patterns = (report.patterns as { statement: string }[] | undefined) ?? []
  const strategy = report.strategy as { positioning_note?: string; what_to_double_down?: string[] } | undefined
  const summary = report.summary as { posts?: number } | undefined
  return (
    <div className="space-y-2 text-[13px] text-ink-2">
      {strategy?.positioning_note && <p className="text-ink">{strategy.positioning_note}</p>}
      {patterns.length ? <ul className="list-disc space-y-1 pl-5">{patterns.map((p, i) => <li key={i}>{p.statement}</li>)}</ul> : <p>{summary?.posts ? 'Sem padrões estatisticamente relevantes ainda.' : 'Importe métricas do Instagram (CSV/JSON) para ativar a análise de performance.'}</p>}
      {strategy?.what_to_double_down?.length ? <p><span className="font-semibold text-ink">Dobrar a aposta:</span> {strategy.what_to_double_down.join(' · ')}</p> : null}
    </div>
  )
}

