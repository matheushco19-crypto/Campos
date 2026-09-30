import type { MarketRow, VerifiedFact } from '@/core/schemas'
import { fmtPct, fmtValue } from '@/lib/format'
import { cn } from './ui'

const TAPE = ['IBOV', 'USDBRL', 'EURBRL', 'SPX', 'NASDAQ', 'DJI', 'US10Y', 'DXY', 'NIKKEI', 'KOSPI', 'BTCUSD']
const SHORT: Record<string, string> = { IBOV: 'IBOV', USDBRL: 'USD/BRL', EURBRL: 'EUR/BRL', SPX: 'S&P 500', NASDAQ: 'NASDAQ', DJI: 'DOW', US10Y: 'UST 10Y', DXY: 'DXY', NIKKEI: 'NIKKEI', KOSPI: 'KOSPI', BTCUSD: 'BTC' }
const DOT: Record<string, string> = { VERIFIED: 'bg-[#3fbf7f]', UNVERIFIED: 'bg-[#e2ab3d]', CONFLICT: 'bg-[#f2716a]', UNAVAILABLE: 'bg-white/25', REJECTED: 'bg-[#f2716a]' }

/** Terminal-style market strip. Colour dot = verification status (also in the title), never the only signal. */
export function MarketTape({ rows, facts }: { rows: MarketRow[]; facts: VerifiedFact[] }) {
  const byId = new Map(facts.map((f) => [f.id, f]))
  const items = TAPE.map((m) => rows.find((r) => r.metric === m)).filter((r): r is MarketRow => !!r)
  if (!items.length) return null
  return (
    <div className="no-scrollbar -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0" aria-label="Mercados">
      <ul className="relative flex min-w-max items-stretch divide-x divide-white/10">
        {items.map((r) => {
          const f = byId.get(r.fact_id)
          const bps = r.unit === '%' && f?.previous_value != null && r.value != null ? Math.round((r.value - f.previous_value) * 100) : null
          const ch = bps ?? r.change_pct
          return (
            <li key={r.metric} className="relative flex items-baseline gap-2 px-3 py-2 first:pl-0" title={`${r.label}: ${r.verification_status}${r.reference ? ` · ref. ${r.reference}` : ''}`}>
              <span className={cn('size-1.5 shrink-0 translate-y-[-1px] rounded-full', DOT[r.verification_status])} aria-hidden />
              <span className="text-[10.5px] font-extrabold tracking-[0.12em] text-white/55">{SHORT[r.metric] ?? r.label}</span>
              <span className={cn('text-[12.5px] font-bold tnum', r.value === null ? 'text-white/35' : 'text-white')}>{fmtValue(r.value, r.unit)}</span>
              {ch !== null && r.value !== null && (
                <span className={cn('text-[11.5px] font-bold tnum', ch > 0 ? 'text-[#46c28a]' : ch < 0 ? 'text-[#f5857e]' : 'text-white/50')}>
                  {bps !== null ? `${bps > 0 ? '+' : ''}${bps} bps` : fmtPct(ch)}
                </span>
              )}
              <span className="sr-only">{r.verification_status}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
