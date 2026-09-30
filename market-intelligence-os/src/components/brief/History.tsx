import { ArrowRight, GitCompare, Lock } from 'lucide-react'
import Link from 'next/link'
import type { IntelligenceSnapshot } from '@/core/schemas'
import { fmtDate, fmtShortDate, fmtTimeBRT, fmtValue } from '@/lib/format'
import type { VersionDiff } from '@/lib/version-diff'
import { HistorySearch } from '../HistorySearch'
import { cn, Kicker, Panel, Pill, Section } from '../ui'
import { SNAP_STATUS } from './shared'

export function History(props: {
  date: string
  availableDates: string[]
  versions: { id: string; version: number; generated_at: string; status: string }[]
  shown: IntelligenceSnapshot | null
  diff: VersionDiff | null
}) {
  const shownV = props.shown?.version
  return (
    <Section id="history" index="06" eyebrow="Histórico" title="Briefings anteriores e versões" lead="O histórico é append-only: cada execução cria uma nova versão e nenhuma é sobrescrita. Use ← → no teclado para navegar entre datas.">
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <HistorySearch />
          <Panel className="p-4">
            <Kicker className="mb-2.5">{props.availableDates.length} dias com conteúdo</Kicker>
            <ul className="flex max-h-56 flex-wrap gap-1.5 overflow-y-auto">
              {props.availableDates.map((x) => (
                <li key={x}>
                  <Link href={`/?date=${x}`} className={cn('block rounded-md px-2 py-1 text-[12px] font-bold tnum transition', x === props.date ? 'bg-ink text-surface' : 'bg-muted-soft text-ink-2 hover:bg-line')}>
                    {fmtShortDate(x)}
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        <Panel className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <Kicker>Versões de {fmtDate(props.date)}</Kicker>
            <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-ink-3">
              <Lock className="size-3" aria-hidden /> append-only
            </span>
          </div>
          <ul className="divide-y divide-line">
            {props.versions.map((v) => {
              const st = SNAP_STATUS[v.status]
              const isShown = v.version === shownV
              return (
                <li key={v.id} className={cn('flex items-center gap-2 px-4 py-2.5 text-[12.5px]', isShown && 'bg-surface-2')}>
                  <span className="w-8 font-extrabold text-ink tnum">v{v.version}</span>
                  <span className="text-ink-3 tnum">{fmtTimeBRT(v.generated_at)}</span>
                  <Pill tone={st?.tone ?? 'neutral'}>{st?.label ?? v.status}</Pill>
                  <span className="ml-auto flex items-center gap-2">
                    {isShown ? (
                      <span className="text-[11px] font-bold text-ink-3">exibida</span>
                    ) : (
                      <>
                        <Link href={`/?date=${props.date}&v=${v.version}`} className="font-bold text-accent hover:underline">
                          abrir
                        </Link>
                        {shownV && (
                          <Link href={`/?date=${props.date}${props.shown && props.versions[0]?.version !== shownV ? `&v=${shownV}` : ''}&cv=${v.version}#history`} className="inline-flex items-center gap-1 font-bold text-accent hover:underline" title={`Comparar v${v.version} com a versão exibida`}>
                            <GitCompare className="size-3.5" aria-hidden /> comparar
                          </Link>
                        )}
                      </>
                    )}
                  </span>
                </li>
              )
            })}
            {!props.versions.length && <li className="px-4 py-5 text-[12.5px] text-ink-3">Nenhuma versão para esta data.</li>}
          </ul>
        </Panel>
      </div>

      {props.diff && <DiffPanel d={props.diff} date={props.date} />}
    </Section>
  )
}

function DiffPanel({ d, date }: { d: VersionDiff; date: string }) {
  const nothing = !d.headlinesAdded.length && !d.headlinesRemoved.length && !d.markets.length && !d.macro.length && !d.insightsChanged && !d.contentChanged
  return (
    <Panel className="rise mt-5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[14px] font-extrabold text-ink">
          <GitCompare className="size-4 text-accent" aria-hidden />
          v{d.from.version} <ArrowRight className="size-3.5 text-ink-3" aria-hidden /> v{d.to.version}
        </div>
        <Link href={`/?date=${date}#history`} className="text-[12px] font-bold text-ink-3 hover:text-ink">
          fechar comparação
        </Link>
      </div>
      <dl className="mt-3 grid gap-3 text-[12.5px] sm:grid-cols-4">
        <Meta k="Status" a={SNAP_STATUS[d.from.status]?.label ?? d.from.status} b={SNAP_STATUS[d.to.status]?.label ?? d.to.status} />
        <Meta k="Horário" a={fmtTimeBRT(d.from.generated_at)} b={fmtTimeBRT(d.to.generated_at)} />
        <Meta k="Palavras" a={String(d.from.words)} b={String(d.to.words)} />
        <Meta k="QC" a={d.from.qcPassed ? 'aprovado' : 'reprovado'} b={d.to.qcPassed ? 'aprovado' : 'reprovado'} />
      </dl>
      {nothing ? (
        <p className="mt-4 text-[13px] text-ink-3">Nenhuma diferença de conteúdo entre as duas versões.</p>
      ) : (
        <div className="mt-4 grid gap-5 md:grid-cols-2">
          {(d.headlinesAdded.length > 0 || d.headlinesRemoved.length > 0) && (
            <div>
              <Kicker className="mb-1.5">O que importa</Kicker>
              <ul className="space-y-1 text-[12.5px]">
                {d.headlinesAdded.map((h) => (
                  <li key={`+${h}`} className="text-ok">
                    + {h}
                  </li>
                ))}
                {d.headlinesRemoved.map((h) => (
                  <li key={`-${h}`} className="text-crit line-through decoration-crit/50">
                    − {h}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {[...d.markets, ...d.macro].length > 0 && (
            <div>
              <Kicker className="mb-1.5">Dados que mudaram</Kicker>
              <ul className="space-y-1 text-[12.5px]">
                {[...d.markets, ...d.macro].slice(0, 14).map((r) => (
                  <li key={r.label} className="flex flex-wrap gap-x-2">
                    <span className="font-semibold text-ink">{r.label}</span>
                    <span className="text-ink-3 tnum">
                      {fmtValue(r.from, r.unit)} ({r.statusFrom}) → {fmtValue(r.to, r.unit)} ({r.statusTo})
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(d.insightsChanged || d.contentChanged) && (
            <p className="text-[12.5px] text-ink-2 md:col-span-2">
              {d.insightsChanged && 'Os insights mudaram. '}
              {d.contentChanged && 'O Content Lab mudou.'}
            </p>
          )}
        </div>
      )}
    </Panel>
  )
}

function Meta({ k, a, b }: { k: string; a: string; b: string }) {
  return (
    <div>
      <dt className="text-[10px] font-extrabold tracking-[0.14em] text-ink-3 uppercase">{k}</dt>
      <dd className="mt-0.5 font-semibold text-ink tnum">
        {a === b ? a : `${a} → ${b}`}
      </dd>
    </div>
  )
}
