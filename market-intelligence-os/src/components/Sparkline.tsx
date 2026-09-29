'use client'

import { Line, LineChart, ResponsiveContainer, Tooltip, YAxis } from 'recharts'
import { fmtShortDate } from '@/lib/format'

/** 30-point sparkline: de-emphasised line, last point accented. Single series, no legend. */
export function Sparkline({ data, label }: { data: { date: string; value: number }[]; label: string }) {
  if (data.length < 2) return <span className="text-[11px] text-ink-3">histórico em formação</span>
  const up = data.at(-1)!.value >= data[0].value
  return (
    <div className="h-8 w-28" role="img" aria-label={`${label}: ${data.length} pontos, de ${data[0].value} a ${data.at(-1)!.value}`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
          <YAxis hide domain={['dataMin', 'dataMax']} />
          <Tooltip
            cursor={{ stroke: 'var(--line-strong)', strokeWidth: 1 }}
            content={({ active, payload }) =>
              active && payload?.[0] ? (
                <div className="rounded-md border border-line bg-surface px-2 py-1 text-[11px] text-ink shadow-sm tnum">
                  {fmtShortDate(String(payload[0].payload.date))}: {Number(payload[0].value).toLocaleString('pt-BR')}
                </div>
              ) : null
            }
          />
          <Line type="monotone" dataKey="value" stroke={up ? 'var(--up)' : 'var(--down)'} strokeWidth={1.75} dot={false} isAnimationActive={false} activeDot={{ r: 3, strokeWidth: 0 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
