import type { MarketRow, VerifiedFact } from '@/core/schemas'
import { fmtShortDate, fmtTimeBRT, fmtValue } from '@/lib/format'
import { sourceName } from '../../config/sources'
import { cn } from './ui'

/** Shared by server (Overview) and client (MarketsTable) components: no 'use client' here. */
const SHORT_SOURCE: Record<string, string> = { yahoo: 'Yahoo · não oficial', brapi: 'BRAPI', fred: 'FRED', 'us-treasury': 'US Treasury', 'bcb-ptax': 'PTAX/BCB', 'ecb-fx': 'ECB', coinbase: 'Coinbase', kraken: 'Kraken' }
const shortSource = (id: string | null | undefined) => (id ? SHORT_SOURCE[id] ?? sourceName(id) : '—')

/**
 * What the row shows first. A current (intraday) quote or a newer close wins visually over the
 * official close, always labelled with time and source; the official close stays underneath.
 */
export function quoteView(r: MarketRow, f?: VerifiedFact): { value: number | null; change: number | null; label: string; live: boolean; official: string | null } {
  if (r.live) {
    const q = r.live
    return {
      value: q.value,
      change: q.change_pct,
      label: q.is_intraday ? `AGORA · ${fmtTimeBRT(q.observed_at)} · ${shortSource(q.source)}` : `Fech. ${fmtShortDate(q.reference_date)} · ${shortSource(q.source)}`,
      live: true,
      official: r.value !== null && r.reference ? `oficial ${fmtShortDate(r.reference)}: ${fmtValue(r.value, r.unit)}` : null,
    }
  }
  const src = shortSource(f?.primary_source)
  const label = !r.reference
    ? 'fontes indisponíveis nesta execução'
    : r.session === 'intraday'
      ? `AGORA · ${fmtTimeBRT(f?.as_of ?? null)} · ${src}`
      : r.session === 'continuous'
        ? `24h · ${fmtTimeBRT(f?.as_of ?? null)} · ${src}`
        : r.session === 'fixing'
          ? `Fixing ${fmtShortDate(r.reference)} · ${src}`
          : `Último fech. ${fmtShortDate(r.reference)} · ${src}`
  return { value: r.value, change: r.change_pct, label, live: r.session === 'intraday', official: null }
}

/** Compact status line under a quote (AGORA / Último fech. / fixing), plus the official close when a live value leads. */
export function QuoteLabel({ v, className }: { v: ReturnType<typeof quoteView>; className?: string }) {
  return (
    <span className={cn('block text-[10.5px] tnum', className)}>
      <span className={cn(v.live ? 'font-bold text-accent' : 'text-ink-3')}>{v.label}</span>
      {v.official && <span className="block text-ink-3">{v.official}</span>}
    </span>
  )
}
