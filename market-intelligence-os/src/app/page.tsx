import { Activity, AlertCircle, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { Agenda } from '@/components/brief/Agenda'
import { Content } from '@/components/brief/Content'
import { Intelligence } from '@/components/brief/Intelligence'
import { Overview } from '@/components/brief/Overview'
import { longDate } from '@/components/brief/shared'
import { Sources } from '@/components/brief/Sources'
import { DateNav } from '@/components/DateNav'
import { MarketTape } from '@/components/MarketTape'
import { RunNowButton } from '@/components/ResearchPanel'
import { SectionNav } from '@/components/SectionNav'
import { cn, Panel } from '@/components/ui'
import type { Diagnosis } from '@/engines/diagnosis'
import { loadDiagnosis } from '@/lib/admin-data'
import { loadDashboard } from '@/lib/dashboard-data'
import { fmtDate } from '@/lib/format'

export const dynamic = 'force-dynamic'

type SP = Promise<{ date?: string; v?: string; compare?: string; cv?: string }>

export default async function Page({ searchParams }: { searchParams: SP }) {
  const params = await searchParams
  const d = await loadDashboard(params)
  const s = d.snapshot
  const factById = new Map(d.facts.map((f) => [f.id, f]))
  const clusterById = new Map((s?.news_snapshot ?? []).map((c) => [c.id, c]))
  const diagnosis = !s || s.status !== 'PUBLISHED' ? await loadDiagnosis(d.date) : null

  return (
    <div className="min-h-screen">
      <header className="bg-deck text-white">
        <div className="mx-auto max-w-[1320px] px-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
            <Link href="/" className="flex items-center gap-2.5" aria-label="Market Intelligence OS, briefing de hoje">
              <span aria-hidden className="grid size-7 place-items-center rounded-md bg-white text-[11px] font-black tracking-tight text-deck">
                MI
              </span>
              <span className="text-[11px] font-extrabold tracking-[0.24em] text-white/90">
                MARKET INTELLIGENCE <span className="text-accent">OS</span>
              </span>
            </Link>
            <div className="ml-auto flex min-w-0 items-center gap-1.5 sm:gap-2">
              <DateNav date={d.date} today={d.today} prevDate={d.prevDate} nextDate={d.nextDate} availableDates={d.availableDates} versions={d.versions} version={params.v ? Number(params.v) : null} />
              <Link href="/admin" className="grid size-8 place-items-center rounded-md border border-white/15 bg-white/5 text-white hover:bg-white/10" aria-label="Administração e observabilidade" title="Administração e observabilidade">
                <Activity className="size-4" />
              </Link>
            </div>
          </div>
          {s && (
            <div className="border-t border-white/10">
              <MarketTape rows={s.market_snapshot} facts={d.facts} />
            </div>
          )}
        </div>
      </header>
      <div className="sticky top-0 z-40 border-b border-white/10 bg-deck/95 backdrop-blur supports-[backdrop-filter]:bg-deck/85">
        <div className="mx-auto max-w-[1320px] px-4 sm:px-6">
          <SectionNav />
        </div>
      </div>

      <main className="mx-auto max-w-[1320px] space-y-16 px-4 pt-7 pb-10 sm:px-6 sm:pt-10">
        {d.error && (
          <Panel className="flex items-start gap-3 border-crit/40 p-4 text-[13px] text-crit">
            <AlertCircle className="mt-0.5 size-4 shrink-0" /> Erro ao carregar dados: {d.error}
          </Panel>
        )}
        {!s ? (
          <NoBrief date={d.date} today={d.today} prevDate={d.prevDate} diagnosis={diagnosis} />
        ) : (
          <>
            {diagnosis && s.status !== 'PUBLISHED' && <DiagnosisBar diagnosis={diagnosis} />}
            <Overview s={s} date={d.date} today={d.today} factById={factById} clusterById={clusterById} previous={d.previous} prevDate={d.prevDate} newerUnpublished={d.newerUnpublished} />
            <Intelligence s={s} factById={factById} />
            <Content s={s} date={d.date} pipeline={d.pipeline} performance={d.performance} strategy={d.strategy} />
            <Agenda s={s} events={d.events} />
          </>
        )}
        {s && <Sources s={s} />}
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6 text-[11.5px] text-ink-3">
          <span>Horários em America/Sao_Paulo (BRT). Dados antes das interpretações: todo número tem fonte e opinião é sempre sinalizada.</span>
          <Link href="/admin" className="inline-flex items-center gap-1 font-bold text-ink-2 hover:text-ink">
            <Activity className="size-3.5" aria-hidden /> Administração · armazenamento {d.storage}
          </Link>
        </footer>
      </main>
    </div>
  )
}

function DiagnosisBar({ diagnosis }: { diagnosis: Diagnosis }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-4 py-2.5 text-[12.5px]', diagnosis.tone === 'crit' ? 'bg-crit-soft text-crit' : 'bg-warn-soft text-warn')}>
      <AlertCircle className="size-4 shrink-0" aria-hidden />
      <span className="font-bold">{diagnosis.headline}</span>
      {diagnosis.nextStep && <span className="opacity-90">{diagnosis.nextStep}</span>}
      <Link href="/admin" className="ml-auto font-bold underline underline-offset-2">
        Diagnóstico
      </Link>
    </div>
  )
}

function NoBrief({ date, today, prevDate, diagnosis }: { date: string; today: string; prevDate: string | null; diagnosis: Diagnosis | null }) {
  const d = longDate(date)
  return (
    <section id="overview" className="scroll-mt-28">
      <div className="eyebrow text-accent">Morning Intelligence</div>
      <h1 className="mt-2 text-[30px] leading-tight font-extrabold tracking-tight text-ink sm:text-[40px]">
        {d.weekday}, <span className="text-ink-3">{d.rest}</span>
      </h1>
      <Panel className="mt-6 p-6">
        <h2 className="text-[17px] font-extrabold text-ink">{date === today ? 'O briefing de hoje ainda não está disponível.' : `Nenhum briefing para ${fmtDate(date)}.`}</h2>
        {diagnosis && (
          <div className="mt-3 text-[13.5px] text-ink-2">
            <p className="font-semibold text-ink">{diagnosis.headline}</p>
            {diagnosis.detail.length > 0 && (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-[12.5px]">
                {diagnosis.detail.slice(0, 5).map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            )}
            {diagnosis.nextStep && <p className="mt-2 text-[12.5px]">{diagnosis.nextStep}</p>}
          </div>
        )}
        <p className="mt-3 text-[12.5px] text-ink-3">O histórico nunca é sobrescrito: cada execução cria uma nova versão.</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <RunNowButton />
          {prevDate && (
            <Link href={`/?date=${prevDate}`} className="inline-flex items-center gap-1 text-[13px] font-bold text-accent hover:underline">
              Ver {fmtDate(prevDate)} <ArrowRight className="size-3.5" />
            </Link>
          )}
          <Link href="/admin" className="inline-flex items-center gap-1 text-[13px] font-bold text-ink-2 hover:text-ink">
            <Activity className="size-3.5" /> Diagnóstico completo
          </Link>
        </div>
      </Panel>
    </section>
  )
}
