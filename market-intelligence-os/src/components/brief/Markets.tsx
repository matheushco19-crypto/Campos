import Link from 'next/link'
import { ASSETS } from '../../../config/assets'
import type { IntelligenceSnapshot, VerifiedFact } from '@/core/schemas'
import { fmtShortDate, fmtValue, REGION_LABEL } from '@/lib/format'
import { factProvenance } from '@/lib/provenance'
import { CompareChart } from '../CompareChart'
import { MarketsTable } from '../MarketsTable'
import { cn, Kicker, Panel, Section } from '../ui'
import { VerificationBadge } from '../VerificationBadge'
import type { FactMap } from './shared'

export function Markets(props: {
  s: IntelligenceSnapshot
  date: string
  facts: VerifiedFact[]
  factById: FactMap
  history: Record<string, { date: string; value: number }[]>
  availableDates: string[]
  compare: { date: string; snapshot: IntelligenceSnapshot | null } | null
}) {
  const { s, factById } = props
  const compareRows = props.compare?.snapshot ? { date: props.compare.date, rows: props.compare.snapshot.market_snapshot } : null
  const verified = s.market_snapshot.filter((r) => r.verification_status === 'VERIFIED').length
  const others = props.availableDates.filter((x) => x !== props.date).slice(0, 6)

  return (
    <Section
      id="markets"
      index="02"
      eyebrow="Mercados"
      title="Como estão os mercados"
      lead={`${verified} de ${s.market_snapshot.length} ativos confirmados por duas fontes. Clique no selo para ver fonte, data de referência e horário de coleta.`}
      action={
        others.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1 text-[11.5px]">
            <span className="font-semibold text-ink-3">Comparar com</span>
            {others.map((o) => (
              <Link key={o} href={`/?date=${props.date}&compare=${o}#markets`} className={cn('rounded-md px-2 py-0.5 font-bold tnum', props.compare?.date === o ? 'bg-ink text-surface' : 'bg-muted-soft text-ink-2 hover:bg-line')}>
                {fmtShortDate(o)}
              </Link>
            ))}
            {props.compare && (
              <Link href={`/?date=${props.date}#markets`} className="px-1 font-semibold text-ink-3 hover:text-ink">
                limpar
              </Link>
            )}
          </div>
        ) : undefined
      }
    >
      <MarketsTable rows={s.market_snapshot} facts={props.facts} history={props.history} compare={compareRows} />

      <div className="mt-5 grid gap-5 xl:grid-cols-5">
        <Panel className="p-5 xl:col-span-2">
          <Kicker className="mb-3">Desempenho relativo · base 100</Kicker>
          <CompareChart options={ASSETS.filter((a) => a.enabled && a.unit !== '%').map((a) => ({ metric: a.metric, label: a.label }))} history={props.history} />
        </Panel>
        <div id="macro" className="grid scroll-mt-28 gap-4 sm:grid-cols-2 xl:col-span-3">
          {(['BR', 'US', 'EU', 'CN'] as const).map((r) => {
            const rows = s.macro_snapshot.filter((m) => m.region === r)
            const watch = s.macro_watch[r]
            return (
              <Panel key={r} className="flex flex-col p-4">
                <div className="mb-2.5 flex items-baseline justify-between">
                  <h3 className="text-[13.5px] font-extrabold text-ink">Macro · {REGION_LABEL[r]}</h3>
                  <span className="text-[10.5px] font-semibold text-ink-3 tnum">
                    {rows.filter((x) => x.verification_status === 'VERIFIED' && !x.is_stale).length}/{rows.length} verificados
                  </span>
                </div>
                <ul className="space-y-1.5">
                  {rows.map((m) => (
                    <li key={m.metric} className="flex items-center gap-2 text-[12.5px]">
                      <span className="min-w-0 flex-1 truncate text-ink-2" title={m.label}>
                        {m.label}
                      </span>
                      <span className={cn('font-bold tnum', m.value === null ? 'text-ink-3' : m.is_stale ? 'text-ink-3' : 'text-ink')}>{fmtValue(m.value, m.unit)}</span>
                      <VerificationBadge p={factProvenance(factById.get(m.fact_id), m.verification_status)} compact />
                    </li>
                  ))}
                  {!rows.length && <li className="text-[12.5px] text-ink-3">Sem indicadores integrados.</li>}
                </ul>
                {watch.length > 0 && (
                  <div className="mt-3 space-y-2 border-t border-line pt-3">
                    {watch.map((w, i) => (
                      <p key={i} className="text-[12.5px] leading-relaxed text-ink-2">
                        {w.text}
                      </p>
                    ))}
                  </div>
                )}
              </Panel>
            )
          })}
        </div>
      </div>
    </Section>
  )
}
