import { sourceName } from '../../config/sources'
import type { AgendaItem, CalendarEvent, EventCluster, VerifiedFact } from '../core/schemas'
import type { Provenance } from '@/components/VerificationBadge'

const SESSION_LABEL: Record<string, string> = {
  regular_close: 'Fechamento do pregão',
  intraday: 'Intradiário (não é fechamento)',
  fixing: 'Fixing oficial',
  continuous: 'Mercado 24h (sem fechamento)',
  settlement: 'Ajuste B3',
  official_close: 'Fechamento oficial',
  release: 'Divulgação oficial',
}

export function factProvenance(f: VerifiedFact | undefined, fallbackStatus: Provenance['status'] = 'UNAVAILABLE'): Provenance {
  if (!f) return { kind: 'fact', status: fallbackStatus, notes: 'Fato não encontrado para esta data.' }
  return {
    kind: 'fact',
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
    method: f.verification_method,
    session: f.session ? SESSION_LABEL[f.session.session] ?? f.session.session : null,
    instrument: f.instrument ? `${f.instrument.code} · venc. ${f.instrument.maturity} · ${f.instrument.business_days} du` : null,
  }
}

export function clusterProvenance(c: EventCluster): Provenance {
  const names = [...new Set(c.sources.map((s) => s.source))]
  return {
    kind: 'news',
    status: c.verification_status,
    label: c.title,
    extraSources: c.sources.map((s) => ({ name: `${s.source}: ${s.headline.slice(0, 70)}`, url: s.url })),
    asOf: c.last_published_at,
    notes: c.verification_status === 'VERIFIED' ? `Confirmado por ${names.length} fonte(s) independente(s) ou por fonte oficial.` : 'Fonte única: atribuir, não tratar como fato confirmado.',
  }
}

export function eventProvenance(e: AgendaItem | CalendarEvent): Provenance {
  return {
    kind: 'event',
    status: e.verification_status,
    label: e.name,
    primary: { name: e.source, url: e.source_url },
    reference: e.date + (e.time ? ` ${e.time}` : ''),
    notes: 'notes' in e ? e.notes : null,
  }
}
