'use client'

import { useMemo, useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { fmtShortDate } from '@/lib/format'
import { cn } from './ui'

// Categorical slots 1–3 (validated all-pairs in both modes, see dataviz reference palette).
const SLOTS = ['var(--c1)', 'var(--c2)', 'var(--c3)']

/** Indexed performance (base 100 at the first common date), max 3 series, one axis. */
export function CompareChart({ options, history }: { options: { metric: string; label: string }[]; history: Record<string, { date: string; value: number }[]> }) {
  const withData = options.filter((o) => (history[o.metric]?.length ?? 0) >= 2)
  const [sel, setSel] = useState<string[]>(withData.slice(0, 3).map((o) => o.metric))
  const data = useMemo(() => {
    const dates = [...new Set(sel.flatMap((m) => (history[m] ?? []).map((p) => p.date)))].sort()
    const base: Record<string, number> = {}
    return dates.map((d) => {
      const row: Record<string, number | string> = { date: d }
      for (const m of sel) {
        const p = history[m]?.find((x) => x.date === d)
        if (!p) continue
        base[m] ??= p.value
        row[m] = Math.round((p.value / base[m]) * 10000) / 100
      }
      return row
    })
  }, [sel, history])

  if (withData.length === 0) {
    return <p className="rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-[13px] text-ink-3">A comparação aparece quando houver ao menos dois dias de histórico verificado.</p>
  }
  const toggle = (m: string) => setSel((s) => (s.includes(m) ? s.filter((x) => x !== m) : s.length >= 3 ? [...s.slice(1), m] : [...s, m]))
  const label = (m: string) => options.find((o) => o.metric === m)?.label ?? m

  return (
    <div className="[--c1:#2a78d6] [--c2:#eb6834] [--c3:#1baf7a] dark:[--c1:#3987e5] dark:[--c2:#d95926] dark:[--c3:#199e70]">
      <div className="mb-3 flex flex-wrap gap-1" aria-label="Selecionar até 3 mercados">
        {withData.map((o) => {
          const i = sel.indexOf(o.metric)
          return (
            <button key={o.metric} onClick={() => toggle(o.metric)} aria-pressed={i >= 0} className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold', i >= 0 ? 'border-line-strong bg-surface text-ink' : 'border-transparent bg-muted-soft text-ink-3')}>
              {i >= 0 && <span aria-hidden className="size-2 rounded-full" style={{ background: SLOTS[i] }} />}
              {o.label}
            </button>
          )
        })}
      </div>
      <div className="h-56 w-full" role="img" aria-label={`Performance indexada (base 100): ${sel.map(label).join(', ')}`}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -12 }}>
            <CartesianGrid stroke="var(--line)" vertical={false} />
            <XAxis dataKey="date" tickFormatter={(d) => fmtShortDate(String(d))} tick={{ fontSize: 11, fill: 'var(--ink-3)' }} axisLine={false} tickLine={false} minTickGap={24} />
            <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11, fill: 'var(--ink-3)' }} axisLine={false} tickLine={false} width={48} />
            <Tooltip
              content={({ active, payload, label: l }) =>
                active && payload?.length ? (
                  <div className="rounded-lg border border-line bg-surface px-3 py-2 text-[12px] shadow-md">
                    <div className="mb-1 font-semibold text-ink">{fmtShortDate(String(l))}</div>
                    {payload.map((p) => (
                      <div key={String(p.dataKey)} className="flex items-center gap-2 text-ink-2 tnum">
                        <span className="size-2 rounded-full" style={{ background: String(p.color) }} />
                        {label(String(p.dataKey))}: {Number(p.value).toFixed(2)}
                      </div>
                    ))}
                  </div>
                ) : null
              }
            />
            {sel.map((m, i) => (
              <Line key={m} dataKey={m} stroke={SLOTS[i]} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-[11.5px] text-ink-2">
        {sel.map((m, i) => (
          <span key={m} className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded" style={{ background: SLOTS[i] }} />
            {label(m)}
          </span>
        ))}
        <span className="text-ink-3">Base 100 = primeiro dia do período</span>
      </div>
    </div>
  )
}
