import type { IntelligenceSnapshot } from '../core/schemas'

export interface DiffRow {
  label: string
  unit: string
  from: number | null
  to: number | null
  statusFrom: string
  statusTo: string
}

/** What changed between two versions of the same day's brief (history is append-only). */
export interface VersionDiff {
  from: { version: number; status: string; mode: string; generated_at: string; words: number; qcPassed: boolean }
  to: { version: number; status: string; mode: string; generated_at: string; words: number; qcPassed: boolean }
  headlinesAdded: string[]
  headlinesRemoved: string[]
  markets: DiffRow[]
  macro: DiffRow[]
  insightsChanged: boolean
  contentChanged: boolean
}

export function diffVersions(a: IntelligenceSnapshot, b: IntelligenceSnapshot): VersionDiff {
  const [from, to] = a.version <= b.version ? [a, b] : [b, a]
  const heads = (s: IntelligenceSnapshot) => new Set(s.what_matters.map((w) => w.headline))
  const hf = heads(from)
  const ht = heads(to)
  const rows = <T extends { metric: string; label: string; unit: string; value: number | null; verification_status: string }>(x: T[], y: T[]): DiffRow[] => {
    const byMetric = new Map(x.map((r) => [r.metric, r]))
    return y
      .map((r) => ({ r, o: byMetric.get(r.metric) }))
      .filter(({ r, o }) => !o || o.value !== r.value || o.verification_status !== r.verification_status)
      .map(({ r, o }) => ({ label: r.label, unit: r.unit, from: o?.value ?? null, to: r.value, statusFrom: o?.verification_status ?? '—', statusTo: r.verification_status }))
  }
  const meta = (s: IntelligenceSnapshot) => ({ version: s.version, status: s.status, mode: s.analysis_mode, generated_at: s.generated_at, words: s.qc.word_count, qcPassed: s.qc.passed })
  return {
    from: meta(from),
    to: meta(to),
    headlinesAdded: [...ht].filter((h) => !hf.has(h)),
    headlinesRemoved: [...hf].filter((h) => !ht.has(h)),
    markets: rows(from.market_snapshot, to.market_snapshot),
    macro: rows(from.macro_snapshot, to.macro_snapshot),
    insightsChanged: JSON.stringify(from.insights.map((i) => i.title)) !== JSON.stringify(to.insights.map((i) => i.title)),
    contentChanged: JSON.stringify(from.content_lab) !== JSON.stringify(to.content_lab),
  }
}
