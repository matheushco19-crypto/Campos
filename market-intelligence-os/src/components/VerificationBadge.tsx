'use client'

import { AlertTriangle, CircleDashed, CircleSlash, ExternalLink, HelpCircle, ShieldCheck, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { fmtDateTimeBRT } from '@/lib/format'
import { cn } from './ui'

export type VStatus = 'VERIFIED' | 'UNVERIFIED' | 'CONFLICT' | 'UNAVAILABLE' | 'REJECTED'

export interface Provenance {
  status: VStatus
  label?: string
  primary?: { name: string; url: string | null } | null
  secondary?: { name: string; url: string | null } | null
  extraSources?: { name: string; url: string }[]
  reference?: string | null
  asOf?: string | null
  retrievedAt?: string | null
  confidence?: string | null
  notes?: string | null
  fallback?: boolean
  stale?: boolean
}

const META: Record<VStatus, { label: string; cls: string; Icon: typeof ShieldCheck }> = {
  VERIFIED: { label: 'Verified', cls: 'bg-ok-soft text-ok', Icon: ShieldCheck },
  UNVERIFIED: { label: 'Unverified', cls: 'bg-warn-soft text-warn', Icon: HelpCircle },
  CONFLICT: { label: 'Conflict', cls: 'bg-crit-soft text-crit', Icon: AlertTriangle },
  UNAVAILABLE: { label: 'Unavailable', cls: 'bg-muted-soft text-ink-3', Icon: CircleDashed },
  REJECTED: { label: 'Rejected', cls: 'bg-crit-soft text-crit', Icon: CircleSlash },
}

export function VerificationBadge({ p, compact = false }: { p: Provenance; compact?: boolean }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  const id = useId()
  const m = META[p.status]

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <span ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={id}
        title={`${m.label}: ver proveniência`}
        className={cn(
          'inline-flex items-center gap-1 rounded-full font-semibold transition-shadow hover:ring-2 hover:ring-line-strong focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none',
          compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]',
          m.cls,
        )}
      >
        <m.Icon aria-hidden className={compact ? 'size-3' : 'size-3.5'} strokeWidth={2.2} />
        <span className={compact ? 'sr-only sm:not-sr-only' : ''}>{m.label.toUpperCase()}</span>
      </button>
      {open && (
        <span
          id={id}
          role="dialog"
          aria-label="Proveniência do dado"
          className="absolute top-full right-0 z-50 mt-2 block w-[min(340px,86vw)] rounded-xl border border-line bg-surface p-4 text-left text-[12.5px] leading-relaxed text-ink-2 shadow-[0_18px_50px_-12px_rgba(10,22,40,0.35)]"
        >
          <span className="mb-2 flex items-center justify-between gap-2">
            <span className="font-semibold text-ink">{p.label ?? 'Proveniência'}</span>
            <button type="button" onClick={() => setOpen(false)} className="rounded p-0.5 text-ink-3 hover:text-ink" aria-label="Fechar">
              <X className="size-3.5" />
            </button>
          </span>
          <dl className="grid grid-cols-[92px_1fr] gap-x-2 gap-y-1">
            <dt className="text-ink-3">Status</dt>
            <dd className="font-semibold text-ink">
              {p.status}
              {p.confidence && p.confidence !== 'NONE' ? ` · confiança ${p.confidence}` : ''}
            </dd>
            {p.primary && (
              <>
                <dt className="text-ink-3">Fonte primária</dt>
                <dd>
                  <SourceLink s={p.primary} />
                </dd>
              </>
            )}
            {p.secondary && (
              <>
                <dt className="text-ink-3">Secundária</dt>
                <dd>
                  <SourceLink s={p.secondary} />
                </dd>
              </>
            )}
            {p.reference && (
              <>
                <dt className="text-ink-3">Referência</dt>
                <dd className="tnum">{p.reference}</dd>
              </>
            )}
            {p.asOf && (
              <>
                <dt className="text-ink-3">As of</dt>
                <dd className="tnum">{fmtDateTimeBRT(p.asOf)}</dd>
              </>
            )}
            {p.retrievedAt && (
              <>
                <dt className="text-ink-3">Coletado</dt>
                <dd className="tnum">{fmtDateTimeBRT(p.retrievedAt)}</dd>
              </>
            )}
          </dl>
          {p.extraSources && p.extraSources.length > 0 && (
            <span className="mt-2 block border-t border-line pt-2">
              <span className="mb-1 block text-ink-3">Fontes ({p.extraSources.length})</span>
              {p.extraSources.slice(0, 8).map((s, i) => (
                <span key={i} className="block truncate">
                  <SourceLink s={s} />
                </span>
              ))}
            </span>
          )}
          {(p.fallback || p.stale) && (
            <span className="mt-2 flex flex-wrap gap-1">
              {p.fallback && <span className="rounded bg-muted-soft px-1.5 py-0.5 text-[10.5px] font-semibold">source_fallback</span>}
              {p.stale && <span className="rounded bg-warn-soft px-1.5 py-0.5 text-[10.5px] font-semibold text-warn">defasado</span>}
            </span>
          )}
          {p.notes && <span className="mt-2 block border-t border-line pt-2 text-[12px] text-ink-3">{p.notes}</span>}
        </span>
      )}
    </span>
  )
}

function SourceLink({ s }: { s: { name: string; url: string | null } }) {
  if (!s.url) return <span>{s.name}</span>
  return (
    <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 font-medium text-accent hover:underline">
      {s.name}
      <ExternalLink aria-hidden className="size-3" />
    </a>
  )
}
