'use client'

import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { MarketRow, VerifiedFact } from '@/core/schemas'
import { fmtPct, fmtShortDate, fmtTimeBRT, fmtValue, STATUS_LABEL } from '@/lib/format'
import { factProvenance } from '@/lib/provenance'
import { QuoteLabel, quoteView } from './quote'
import { Sparkline } from './Sparkline'
import { cn } from './ui'
import { VerificationBadge } from './VerificationBadge'

const GROUPS: [string, string[]][] = [
  ['Todos', []],
  ['Brasil', ['BR']],
  ['EUA', ['US']],
  ['Europa', ['EU']],
  ['Ásia', ['ASIA', 'CN']],
  ['Global', ['GLOBAL']],
]

export function Change({ v, unit }: { v: number | null; unit?: string }) {
  if (v === null) return <span className="text-ink-3">—</span>
  const Icon = v > 0 ? ArrowUpRight : v < 0 ? ArrowDownRight : Minus
  return (
    <span className={cn('inline-flex items-center justify-end gap-0.5 font-semibold tnum', v > 0 ? 'text-up' : v < 0 ? 'text-down' : 'text-ink-3')}>
      <Icon aria-hidden className="size-3.5" />
      {unit === 'bps' ? `${v > 0 ? '+' : ''}${Math.round(v)} bps` : fmtPct(v)}
    </span>
  )
}

export function MarketsTable({ rows, facts, history, compare }: { rows: MarketRow[]; facts: VerifiedFact[]; history: Record<string, { date: string; value: number }[]>; compare?: { date: string; rows: MarketRow[] } | null }) {
  const [group, setGroup] = useState('Todos')
  const factById = useMemo(() => new Map(facts.map((f) => [f.id, f])), [facts])
  const compareBy = useMemo(() => new Map((compare?.rows ?? []).map((r) => [r.metric, r])), [compare])
  const regions = GROUPS.find(([g]) => g === group)![1]
  const visible = rows.filter((r) => !regions.length || regions.includes(r.region))

  return (
    <div>
      <div role="tablist" aria-label="Filtrar mercados" className="mb-3 flex flex-wrap gap-1">
        {GROUPS.map(([g]) => (
          <button key={g} role="tab" aria-selected={group === g} onClick={() => setGroup(g)} className={cn('rounded-full px-3 py-1 text-[12px] font-semibold transition', group === g ? 'bg-navy text-white' : 'bg-muted-soft text-ink-2 hover:bg-line')}>
            {g}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full min-w-[680px] text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-[11px] font-bold tracking-wider text-ink-3 uppercase">
              <th className="px-4 py-2.5 font-bold">Ativo</th>
              <th className="px-3 py-2.5 text-right font-bold">Último</th>
              <th className="px-3 py-2.5 text-right font-bold">Variação</th>
              {compare && <th className="px-3 py-2.5 text-right font-bold">vs {fmtShortDate(compare.date)}</th>}
              <th className="px-3 py-2.5 font-bold">30d</th>
              <th className="px-3 py-2.5 font-bold">Referência</th>
              <th className="px-3 py-2.5 font-bold">Status</th>
              <th className="px-4 py-2.5 text-right font-bold">Dado</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const f = factById.get(r.fact_id)
              const bps = r.unit === '%' && f?.previous_value != null && r.value != null ? (r.value - f.previous_value) * 100 : null
              const c = compareBy.get(r.metric)
              const vs = c?.value && r.value !== null ? ((r.value - c.value) / c.value) * 100 : null
              const view = quoteView(r, f)
              return (
                <tr key={r.metric} className="border-b border-line last:border-0 hover:bg-surface-2">
                  <td className="px-4 py-2.5 font-semibold text-ink">
                    {r.verification_method === 'proxy' ? `${r.label.replace(/ \(.*\)$/, '')} proxy` : r.label}
                    {r.core && <span className="ml-1.5 align-middle text-[9.5px] font-bold tracking-wider text-ink-3 uppercase">core</span>}
                    {r.session === 'intraday' && <span className="ml-1.5 rounded bg-accent-soft px-1 align-middle text-[9.5px] font-bold text-accent">INTRADIÁRIO</span>}
                  </td>
                  <td className={cn('px-3 py-2.5 text-right font-semibold tnum', view.value === null ? 'text-ink-3' : r.verification_status === 'CONFLICT' && !view.live ? 'text-ink-3 line-through decoration-crit/60' : 'text-ink')}>
                    {fmtValue(view.value, r.unit)}
                    <QuoteLabel v={view} className="font-normal" />
                  </td>
                  <td className="px-3 py-2.5 text-right">{bps !== null && !r.live ? <Change v={bps} unit="bps" /> : <Change v={view.change} />}</td>
                  {compare && <td className="px-3 py-2.5 text-right">{r.unit === '%' ? <span className="text-ink-3">—</span> : <Change v={vs} />}</td>}
                  <td className="px-3 py-1">
                    <Sparkline data={history[r.metric] ?? []} label={r.label} />
                  </td>
                  <td className="px-3 py-2.5 text-ink-2 tnum">
                    {r.reference ? fmtShortDate(r.reference) : '—'}
                    {r.is_stale && <span className="ml-1.5 rounded bg-warn-soft px-1 text-[10px] font-bold text-warn">DEFASADO</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={cn('inline-flex items-center gap-1.5 text-[12px] font-semibold', r.market_status === 'OPEN' ? 'text-accent' : 'text-ink-2')}>
                      <span aria-hidden className={cn('size-1.5 rounded-full', r.market_status === 'OPEN' ? 'animate-pulse bg-accent' : 'bg-ink-3')} />
                      {STATUS_LABEL[r.market_status]}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <VerificationBadge p={factProvenance(f, r.verification_status)} compact />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

