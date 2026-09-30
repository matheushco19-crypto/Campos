import type { EventCluster, IntelligenceSnapshot, VerifiedFact } from '@/core/schemas'
import { fmtValue } from '@/lib/format'
import { factProvenance } from '@/lib/provenance'
import { VerificationBadge } from '../VerificationBadge'

export type Snapshot = IntelligenceSnapshot
export type FactMap = Map<string, VerifiedFact>
export type ClusterMap = Map<string, EventCluster>

/** Verified numbers behind a sentence, each with its provenance badge. */
export function FactChips({ ids, factById, className }: { ids: string[]; factById: FactMap; className?: string }) {
  const facts = ids.map((id) => factById.get(id)).filter((f): f is VerifiedFact => !!f)
  if (!facts.length) return null
  return (
    <span className={`mt-2 flex flex-wrap gap-1.5 ${className ?? ''}`}>
      {facts.map((f) => (
        <span key={f.id} className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface-2 py-0.5 pr-0.5 pl-2 text-[11px] font-semibold text-ink-2">
          {f.label}
          <span className="text-ink tnum">{fmtValue(f.value, f.unit)}</span>
          <VerificationBadge p={factProvenance(f)} compact />
        </span>
      ))}
    </span>
  )
}

export const SNAP_STATUS: Record<string, { label: string; tone: 'ok' | 'warn' | 'crit' | 'accent' }> = {
  PUBLISHED: { label: 'Publicado', tone: 'ok' },
  DRAFT_FACTS_ONLY: { label: 'Somente fatos', tone: 'warn' },
  AWAITING_ANALYSIS: { label: 'Aguardando análise', tone: 'accent' },
  FAILED_QC: { label: 'Reprovado no QC', tone: 'crit' },
}
export const MODE_LABEL: Record<string, string> = { anthropic_api: 'Claude API', claude_code: 'Claude Code', deterministic: 'Somente fatos' }

const WEEKDAYS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado']
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

/** "Terça-feira, 29 de setembro de 2026" */
export function longDate(iso: string): { weekday: string; rest: string } {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  const wd = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()
  return { weekday: WEEKDAYS[wd], rest: `${d} de ${MONTHS[m - 1]} de ${y}` }
}
