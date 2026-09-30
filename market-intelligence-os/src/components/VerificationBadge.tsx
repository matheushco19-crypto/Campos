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
  /** How the value was verified (verification_method) and which session it belongs to. */
  method?: string | null
  session?: string | null
  /** What kind of item this is (changes which rows are relevant). */
  kind?: 'fact' | 'news' | 'event'
}

const META: Record<VStatus, { label: string; explain: string; cls: string; Icon: typeof ShieldCheck }> = {
  VERIFIED: { label: 'Verified', explain: 'Confirmado por duas fontes independentes ou pela fonte oficial.', cls: 'bg-ok-soft text-ok', Icon: ShieldCheck },
  UNVERIFIED: { label: 'Unverified', explain: 'Uma única fonte respondeu. Mostrado, mas nunca citado como fato no texto.', cls: 'bg-warn-soft text-warn', Icon: HelpCircle },
  CONFLICT: { label: 'Conflict', explain: 'As fontes divergem além da tolerância. O valor não é usado.', cls: 'bg-crit-soft text-crit', Icon: AlertTriangle },
  UNAVAILABLE: { label: 'Unavailable', explain: 'Nenhuma fonte permitida respondeu. Nada foi estimado.', cls: 'bg-muted-soft text-ink-3', Icon: CircleDashed },
  REJECTED: { label: 'Rejected', explain: 'O dado falhou na validação (faixa, data ou formato).', cls: 'bg-crit-soft text-crit', Icon: CircleSlash },
}

const CONFIDENCE: Record<string, string> = { HIGH: 'Alta', MEDIUM: 'Média', LOW: 'Baixa', NONE: '—' }

export const METHOD_LABEL: Record<string, string> = {
  independent_crosscheck: 'Duas fontes independentes, mesma data',
  official_crosscheck: 'Fonte oficial conferida com republicação da mesma origem',
  official_single: 'Fonte oficial única (publicador do dado)',
  single_source: 'Fonte única, sem validação cruzada',
  unofficial_vendor: 'Fornecedor não oficial (não conta para VERIFIED)',
  proxy: 'Aproximação (proxy), não é o valor oficial',
  derived: 'Cálculo determinístico sobre fatos verificados',
  unavailable: 'Indisponível',
  conflict: 'Fontes em conflito',
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

  const kind = p.kind ?? (p.extraSources ? 'news' : 'fact')
  const links = [p.primary, p.secondary, ...(p.extraSources ?? [])].filter((s): s is { name: string; url: string } => !!s?.url)

  return (
    <span ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={id}
        title={`${m.label}: ver proveniência`}
        className={cn(
          'inline-flex items-center gap-1 rounded-md font-bold tracking-wide transition hover:ring-2 hover:ring-line-strong',
          compact ? 'px-1.5 py-0.5 text-[9.5px]' : 'px-2 py-0.5 text-[10.5px]',
          m.cls,
        )}
      >
        <m.Icon aria-hidden className={compact ? 'size-3' : 'size-3.5'} strokeWidth={2.4} />
        <span className={compact ? 'sr-only sm:not-sr-only' : ''}>{m.label.toUpperCase()}</span>
      </button>
      {open && (
        <>
          <span aria-hidden className="fixed inset-0 z-40 bg-deck/40 sm:hidden" onClick={() => setOpen(false)} />
          <span
            id={id}
            role="dialog"
            aria-label="Proveniência do dado"
            className={cn(
              'rise z-50 block border border-line bg-surface p-4 text-left text-[12.5px] leading-relaxed text-ink-2 shadow-[0_24px_60px_-18px_rgba(7,13,24,0.45)]',
              // Mobile: bottom sheet. Desktop: anchored popover.
              'fixed inset-x-0 bottom-0 max-h-[78vh] overflow-y-auto rounded-t-2xl pb-6',
              'sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:bottom-auto sm:mt-2 sm:w-[360px] sm:rounded-xl sm:pb-4',
            )}
          >
            <span className="mb-3 flex items-start justify-between gap-3">
              <span className="min-w-0">
                <span className="block text-[10px] font-extrabold tracking-[0.16em] text-ink-3 uppercase">Proveniência</span>
                <span className="block font-bold text-ink">{p.label ?? 'Dado'}</span>
              </span>
              <button type="button" onClick={() => setOpen(false)} className="rounded p-1 text-ink-3 hover:bg-muted-soft hover:text-ink" aria-label="Fechar">
                <X className="size-4" />
              </button>
            </span>
            <span className={cn('mb-3 flex items-start gap-2 rounded-lg px-2.5 py-2', m.cls)}>
              <m.Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>
                <span className="block text-[11px] font-extrabold tracking-wide">{p.status}</span>
                <span className="block text-[11.5px] font-medium opacity-90">{m.explain}</span>
              </span>
            </span>
            <dl className="grid grid-cols-[112px_1fr] gap-x-3 gap-y-1.5">
              {kind !== 'news' && <Row k="Fonte primária" v={p.primary ? <SourceLink s={p.primary} /> : '—'} />}
              {kind === 'fact' && <Row k="Fonte secundária" v={p.secondary ? <SourceLink s={p.secondary} /> : 'sem segunda fonte'} />}
              {kind !== 'news' && <Row k={kind === 'event' ? 'Data do evento' : 'Data de referência'} v={<span className="tnum">{p.reference ?? '—'}</span>} />}
              {kind === 'fact' && <Row k="Válido em" v={<span className="tnum">{p.asOf ? fmtDateTimeBRT(p.asOf) : '—'}</span>} />}
              {kind === 'news' && <Row k="Publicado" v={<span className="tnum">{p.asOf ? fmtDateTimeBRT(p.asOf) : '—'}</span>} />}
              {kind === 'fact' && <Row k="Coletado em" v={<span className="tnum">{p.retrievedAt ? fmtDateTimeBRT(p.retrievedAt) : '—'}</span>} />}
              {kind === 'fact' && <Row k="Confiança" v={CONFIDENCE[p.confidence ?? 'NONE'] ?? p.confidence} />}
              {kind === 'fact' && p.method && <Row k="Método" v={METHOD_LABEL[p.method] ?? p.method} />}
              {kind === 'fact' && p.session && <Row k="Sessão" v={p.session} />}
            </dl>
            {(kind === 'news' || links.length > 0) && (
              <span className="mt-3 block border-t border-line pt-2.5">
                <span className="mb-1 block text-[10px] font-extrabold tracking-[0.16em] text-ink-3 uppercase">Links ({links.length})</span>
                {links.length ? (
                  links.slice(0, 10).map((s, i) => (
                    <span key={i} className="block truncate">
                      <SourceLink s={s} />
                    </span>
                  ))
                ) : (
                  <span className="text-ink-3">Sem link público.</span>
                )}
              </span>
            )}
            {p.stale && (
              <span className="mt-2.5 flex flex-wrap gap-1">
                <span className="rounded bg-warn-soft px-1.5 py-0.5 text-[10.5px] font-semibold text-warn">defasado: fora do texto</span>
              </span>
            )}
            {p.notes && <span className="mt-2.5 block border-t border-line pt-2.5 text-[12px] text-ink-3">{p.notes}</span>}
          </span>
        </>
      )}
    </span>
  )
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <>
      <dt className="text-ink-3">{k}</dt>
      <dd className="min-w-0 font-medium text-ink">{v}</dd>
    </>
  )
}

function SourceLink({ s }: { s: { name: string; url: string | null } }) {
  if (!s.url) return <span>{s.name}</span>
  return (
    <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex max-w-full items-center gap-1 font-semibold text-accent hover:underline">
      <span className="truncate">{s.name}</span>
      <ExternalLink aria-hidden className="size-3 shrink-0" />
    </a>
  )
}
