import { AlertTriangle, ArrowRight, CheckCircle2, Clapperboard, Clock, Film, GalleryHorizontalEnd, History, MessageSquareQuote, XCircle } from 'lucide-react'
import Link from 'next/link'
import type { AgendaItem, IntelligenceSnapshot, MarketRow } from '@/core/schemas'
import { agendaTimeBRT } from '@/lib/agenda'
import { fmtDate, fmtShortDate, fmtTimeBRT, fmtValue } from '@/lib/format'
import { clusterProvenance, eventProvenance, factProvenance } from '@/lib/provenance'
import { Change } from '../MarketsTable'
import { NewsList } from '../NewsList'
import { cn, Kicker, Panel, Pill } from '../ui'
import { VerificationBadge } from '../VerificationBadge'
import { type ClusterMap, FactChips, type FactMap, longDate, MODE_LABEL, SNAP_STATUS } from './shared'

const PULSE = ['IBOV', 'USDBRL', 'SPX', 'NASDAQ', 'US10Y', 'DXY', 'BTCUSD']

export function Overview(props: {
  s: IntelligenceSnapshot
  date: string
  today: string
  factById: FactMap
  clusterById: ClusterMap
  previous: IntelligenceSnapshot | null
  prevDate: string | null
  newerUnpublished: { version: number; status: string } | null
}) {
  const { s, factById, clusterById } = props
  const d = longDate(s.date)
  const pulse = PULSE.map((m) => s.market_snapshot.find((r) => r.metric === m)).filter((r): r is MarketRow => !!r)
  const today = s.agenda.filter((a) => a.bucket === 'today')
  const status = SNAP_STATUS[s.status]
  const blockingFailed = s.qc.checks.filter((c) => !c.passed && c.severity !== 'warn')

  return (
    <section id="overview" className="scroll-mt-28" aria-labelledby="overview-title">
      {/* 1. Que dia é hoje? */}
      <div className="rise flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11.5px] font-semibold text-ink-3">
        <span className="eyebrow text-accent">Morning Intelligence</span>
        <Pill tone={status.tone}>{status.label}</Pill>
        <span className="tnum">
          v{s.version} · {MODE_LABEL[s.analysis_mode]} · atualizado {fmtTimeBRT(s.generated_at)}
        </span>
        <span className="inline-flex items-center gap-1 tnum">
          <Clock className="size-3.5" aria-hidden /> {s.qc.reading_minutes.toLocaleString('pt-BR')} min
        </span>
        <span className={cn('inline-flex items-center gap-1', s.qc.passed ? 'text-ok' : 'text-crit')}>
          {s.qc.passed ? <CheckCircle2 className="size-3.5" aria-hidden /> : <XCircle className="size-3.5" aria-hidden />}
          QC {s.qc.passed ? 'aprovado' : 'reprovado'}
        </span>
      </div>
      <h1 id="overview-title" className="rise mt-2 text-[30px] leading-[1.08] font-extrabold tracking-tight text-ink sm:text-[40px]">
        {d.weekday}, <span className="text-ink-3">{d.rest}</span>
      </h1>

      {props.date !== props.today && (
        <p className="mt-2 inline-flex flex-wrap items-center gap-2 rounded-lg bg-accent-soft px-3 py-1.5 text-[12.5px] font-semibold text-accent">
          <History className="size-3.5" aria-hidden /> Você está vendo o briefing de {fmtDate(props.date)}.
          <Link href="/" className="underline underline-offset-2">
            Ir para hoje ({fmtShortDate(props.today)})
          </Link>
        </p>
      )}
      {props.newerUnpublished && (
        <p className="mt-2 flex items-start gap-2 rounded-lg bg-warn-soft px-3 py-2 text-[12.5px] text-warn">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            Existe uma versão mais recente (v{props.newerUnpublished.version}, {SNAP_STATUS[props.newerUnpublished.status]?.label.toLowerCase() ?? props.newerUnpublished.status}) que não foi publicada. Aqui está a última versão aprovada.{' '}
            <Link href={`/?date=${props.date}&v=${props.newerUnpublished.version}`} className="font-semibold underline underline-offset-2">
              Ver v{props.newerUnpublished.version}
            </Link>
          </span>
        </p>
      )}
      {s.status !== 'PUBLISHED' && blockingFailed.length > 0 && (
        <p className="mt-2 rounded-lg bg-crit-soft px-3 py-2 text-[12.5px] text-crit">Reprovado no QC: {blockingFailed.map((c) => c.label).join(' · ')}.</p>
      )}

      <div className="mt-6 grid gap-8 lg:grid-cols-12 lg:gap-10">
        <div className="min-w-0 lg:col-span-8">
          {/* 2. O que aconteceu? */}
          <div className="rise border-l-2 border-accent pl-4 sm:pl-5">
            <Kicker>O que aconteceu</Kicker>
            {s.lede ? (
              <>
                <p className="mt-1.5 text-[18px] leading-[1.5] font-semibold text-ink sm:text-[21px]">{s.lede.text}</p>
                <FactChips ids={s.lede.fact_ids} factById={factById} />
              </>
            ) : (
              <p className="mt-1.5 text-[16px] leading-relaxed font-semibold text-ink-2">{s.what_matters[0]?.headline ?? 'Sem resumo nesta versão.'}</p>
            )}
          </div>

          {/* 4. O que importa? */}
          <div className="mt-8">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <h2 className="text-[15px] font-extrabold tracking-tight text-ink">O que importa hoje</h2>
              <span className="text-[11.5px] font-semibold text-ink-3">{s.what_matters.length} acontecimentos</span>
            </div>
            <ol className="divide-y divide-line border-y border-line">
              {s.what_matters.map((w, i) => {
                const c = w.cluster_ids.map((id) => clusterById.get(id)).find(Boolean)
                return (
                  <li key={i} className="group flex gap-4 py-4">
                    <span className="w-6 shrink-0 pt-0.5 text-[12px] font-extrabold text-accent tnum">{String(i + 1).padStart(2, '0')}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="text-[15.5px] leading-snug font-bold text-ink">{w.headline}</h3>
                        {c && <VerificationBadge p={clusterProvenance(c)} compact />}
                      </div>
                      <p className="prose-brief mt-1">{w.why_it_matters}</p>
                      <FactChips ids={w.fact_ids} factById={factById} />
                    </div>
                  </li>
                )
              })}
              {!s.what_matters.length && <li className="py-6 text-center text-[13px] text-ink-3">Nenhum acontecimento verificado.</li>}
            </ol>
            {s.news_snapshot.length > 0 && (
              <details className="group mt-3">
                <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-[12.5px] font-bold text-accent hover:underline">
                  Todos os eventos do dia, deduplicados ({s.news_snapshot.length})
                  <ArrowRight className="size-3.5 transition-transform group-open:rotate-90" aria-hidden />
                </summary>
                <div className="mt-3">
                  <NewsList clusters={s.news_snapshot} />
                </div>
              </details>
            )}
          </div>
        </div>

        <aside className="min-w-0 space-y-4 lg:col-span-4" aria-label="Resumo do dia">
          {/* 3. Como estão os mercados? */}
          <Panel className="overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
              <Kicker>Mercados</Kicker>
              <a href="#markets" className="text-[11.5px] font-bold text-accent hover:underline">
                Tabela completa
              </a>
            </div>
            <ul className="divide-y divide-line">
              {pulse.map((r) => {
                const f = factById.get(r.fact_id)
                const bps = r.unit === '%' && f?.previous_value != null && r.value != null ? (r.value - f.previous_value) * 100 : null
                return (
                  <li key={r.metric} className="flex items-center gap-2 px-4 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-bold text-ink">{r.label}</span>
                      <span className="block text-[10.5px] text-ink-3 tnum">{r.market_status === 'OPEN' ? 'em negociação' : r.reference ? `ref. ${fmtShortDate(r.reference)}` : 'sem dado'}</span>
                    </span>
                    <span className={cn('text-[13.5px] font-extrabold tnum', r.value === null ? 'text-ink-3' : 'text-ink')}>{fmtValue(r.value, r.unit)}</span>
                    <span className="w-[70px] text-right text-[12px]">{bps !== null ? <Change v={bps} unit="bps" /> : <Change v={r.change_pct} />}</span>
                    <VerificationBadge p={factProvenance(f, r.verification_status)} compact />
                  </li>
                )
              })}
            </ul>
          </Panel>

          {/* 5. O que isso pode significar para patrimônio? */}
          {s.uhnw_lens.length > 0 && (
            <Panel className="p-4">
              <div className="flex items-center justify-between">
                <Kicker>Para o patrimônio</Kicker>
                <a href="#uhnw" className="text-[11.5px] font-bold text-accent hover:underline">
                  UHNW Lens
                </a>
              </div>
              <ul className="mt-2 space-y-2.5">
                {s.uhnw_lens.slice(0, 2).map((u, i) => (
                  <li key={i} className="text-[13px] leading-relaxed text-ink-2">
                    {u.theme && <span className="mr-1.5 text-[10.5px] font-extrabold tracking-wide text-accent uppercase">{u.theme}</span>}
                    {u.text}
                  </li>
                ))}
              </ul>
              <p className="mt-2.5 text-[10.5px] text-ink-3">Informação para a conversa, não recomendação individualizada.</p>
            </Panel>
          )}

          {/* 6. O que eu poderia publicar? */}
          {s.content_lab && (
            <Panel className="p-4">
              <div className="flex items-center justify-between">
                <Kicker>Para publicar</Kicker>
                <a href="#content" className="text-[11.5px] font-bold text-accent hover:underline">
                  Content Lab
                </a>
              </div>
              <ul className="mt-2 space-y-2">
                {(
                  [
                    ['Story', Film, s.content_lab.story.title],
                    ['Carrossel', GalleryHorizontalEnd, s.content_lab.carousel.title],
                    ['Reel', Clapperboard, s.content_lab.reel.title],
                    ['Take', MessageSquareQuote, s.content_lab.take.title],
                  ] as const
                ).map(([k, Icon, title]) => (
                  <li key={k} className="flex items-start gap-2.5 text-[13px]">
                    <Icon className="mt-0.5 size-3.5 shrink-0 text-ink-3" aria-hidden />
                    <span className="w-[62px] shrink-0 text-[10.5px] font-extrabold tracking-wide text-ink-3 uppercase">{k}</span>
                    <span className="min-w-0 font-semibold text-ink">{title}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          {/* 7. O que acontece hoje? */}
          <Panel className="p-4">
            <div className="flex items-center justify-between">
              <Kicker>Hoje</Kicker>
              <a href="#calendar" className="text-[11.5px] font-bold text-accent hover:underline">
                Agenda
              </a>
            </div>
            {today.length ? <TodayList items={today} /> : <p className="mt-2 text-[13px] text-ink-3">Sem eventos relevantes na agenda de hoje.</p>}
          </Panel>

          {/* 8. O que aconteceu ontem? */}
          {props.previous && props.prevDate && (
            <Panel className="p-4">
              <div className="flex items-center justify-between">
                <Kicker>Ontem · {fmtDate(props.prevDate)}</Kicker>
                <Link href={`/?date=${props.prevDate}`} className="text-[11.5px] font-bold text-accent hover:underline">
                  Abrir
                </Link>
              </div>
              {props.previous.lede && <p className="mt-2 line-clamp-3 text-[13px] leading-relaxed text-ink-2">{props.previous.lede.text}</p>}
              <ul className="mt-2 space-y-1.5 text-[12.5px] text-ink-2">
                {props.previous.what_matters.slice(0, props.previous.lede ? 2 : 3).map((w, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-ink-3">·</span>
                    <span className="line-clamp-2">{w.headline}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </aside>
      </div>
    </section>
  )
}

function TodayList({ items }: { items: AgendaItem[] }) {
  return (
    <ul className="mt-2 space-y-2">
      {items.map((a) => {
        const t = agendaTimeBRT(a)
        return (
          <li key={a.event_id} className="flex items-start gap-2 text-[13px]">
            <span className="w-11 shrink-0 font-bold text-ink-2 tnum">{t.time ?? '—'}</span>
            <span className="min-w-0 flex-1 text-ink">{a.name}</span>
            <VerificationBadge p={eventProvenance(a)} compact />
          </li>
        )
      })}
    </ul>
  )
}
