import { sourceName } from '../../config/sources'
import type { AgendaItem, CalendarEvent, EventCluster, VerifiedFact } from '../core/schemas'
import type { Provenance } from '@/components/VerificationBadge'

export function factProvenance(f: VerifiedFact | undefined, fallbackStatus: Provenance['status'] = 'UNAVAILABLE'): Provenance {
  if (!f) return { status: fallbackStatus, notes: 'Fato não encontrado para esta data.' }
  return {
    status: f.verification_status,
    label: f.label,
    primary: f.primary_source ? { name: sourceName(f.primary_source), url: f.primary_url } : null,
    secondary: f.secondary_source ? { name: sourceName(f.secondary_source), url: f.secondary_url } : null,
    reference: f.reference_period,
    asOf: f.as_of,
    retrievedAt: f.retrieved_at,
    confidence: f.confidence,
    notes: f.notes,
    fallback: f.source_fallback,
    stale: f.is_stale,
  }
}

export function clusterProvenance(c: EventCluster): Provenance {
  const names = [...new Set(c.sources.map((s) => s.source))]
  return {
    status: c.verification_status,
    label: 'Evento de notícia',
    extraSources: c.sources.map((s) => ({ name: `${s.source}: ${s.headline.slice(0, 70)}`, url: s.url })),
    asOf: c.last_published_at,
    notes: c.verification_status === 'VERIFIED' ? `Confirmado por ${names.length} fonte(s) independente(s) ou por fonte oficial.` : 'Fonte única: atribuir, não tratar como fato confirmado.',
  }
}

export function eventProvenance(e: AgendaItem | CalendarEvent): Provenance {
  return {
    status: e.verification_status,
    label: e.name,
    primary: { name: e.source, url: e.source_url },
    reference: e.date + (e.time ? ` ${e.time}` : ''),
    notes: 'notes' in e ? e.notes : null,
  }
}
