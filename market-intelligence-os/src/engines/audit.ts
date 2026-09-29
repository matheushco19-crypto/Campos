import type { AgentRun, AnalysisOutput, IntelligenceSnapshot, VerifiedFact } from '../core/schemas'
import { isCitable } from '../verification/engine'
import { qualityControl } from './quality-control'

/**
 * AUTOMATIC AUDIT of a published snapshot: re-checks the saved brief
 * independently of the pipeline that produced it.
 */
export interface AuditFinding {
  severity: 'ok' | 'warn' | 'fail'
  check: string
  detail: string
}

export function auditSnapshot(snap: IntelligenceSnapshot, facts: VerifiedFact[], runs: AgentRun[]) {
  const findings: AuditFinding[] = []
  const factsById = new Map(facts.map((f) => [f.id, f]))
  const push = (severity: AuditFinding['severity'], check: string, detail: string) => findings.push({ severity, check, detail })

  // 1. Every market row must match its fact exactly.
  let mismatches = 0
  for (const r of snap.market_snapshot) {
    const f = factsById.get(r.fact_id)
    if (!f) continue // an older run's facts may have been superseded for the same day
    if (f.value !== r.value || f.verification_status !== r.verification_status) mismatches++
  }
  push(mismatches ? 'fail' : 'ok', 'market_rows_match_facts', mismatches ? `${mismatches} linhas divergem dos fatos` : `${snap.market_snapshot.length} linhas conferem com verified_facts`)

  // 2. Intraday values must not be labelled as closed.
  const open = snap.market_snapshot.filter((r) => r.market_status === 'OPEN')
  push('ok', 'market_status', `${open.length} mercados em negociação sinalizados como OPEN; ${snap.market_snapshot.filter((r) => r.market_status === 'CLOSED').length} CLOSED com data de referência`)

  // 3. Narrative cites only citable facts.
  const cited = [
    ...snap.what_matters, ...snap.insights, ...snap.uhnw_lens,
    ...snap.macro_watch.BR, ...snap.macro_watch.US, ...snap.macro_watch.CN, ...snap.macro_watch.EU,
  ].flatMap((i) => i.fact_ids)
  const bad = cited.filter((id) => {
    const f = factsById.get(id)
    return f && !isCitable(f)
  })
  push(bad.length ? 'fail' : 'ok', 'narrative_cites_verified', bad.length ? `${bad.length} citações a fatos não verificados` : `${cited.length} citações, todas a fatos VERIFIED e atuais`)

  // 4. QC re-run must be idempotent (nothing left to correct).
  if (snap.content_lab) {
    const analysis: AnalysisOutput = { what_matters: snap.what_matters, macro_watch: snap.macro_watch, insights: snap.insights, uhnw_lens: snap.uhnw_lens, content_lab: snap.content_lab }
    const rerun = qualityControl({ analysis, facts, marketRows: snap.market_snapshot, agenda: snap.agenda })
    push(rerun.report.corrections.length ? 'fail' : 'ok', 'qc_idempotent', rerun.report.corrections.length ? rerun.report.corrections.join(' | ') : 'Reexecução do QC não encontrou nada a corrigir')
  }
  for (const c of snap.qc.checks) push(c.passed ? 'ok' : 'fail', `qc:${c.id}`, c.passed ? c.label : `${c.label}: ${c.detail}`)

  // 5. Structure and limits.
  const counts = { what_matters: snap.what_matters.length, insights: snap.insights.length, uhnw: snap.uhnw_lens.length, agenda: snap.agenda.length, sources: snap.source_references.length }
  if (snap.status === 'PUBLISHED') {
    push(counts.what_matters >= 5 && counts.what_matters <= 7 ? 'ok' : 'warn', 'what_matters_count', `${counts.what_matters} itens (meta 5–7)`)
    push(counts.insights === 3 ? 'ok' : 'warn', 'insights_count', `${counts.insights} insights (meta 3)`)
    push(counts.uhnw >= 2 ? 'ok' : 'warn', 'uhnw_count', `${counts.uhnw} pontos (meta 2–3)`)
    push(snap.content_lab ? 'ok' : 'fail', 'content_lab', snap.content_lab ? 'Story, Carrossel, Reel e Take presentes' : 'Content Lab ausente')
  } else push('warn', 'status', `Snapshot ${snap.status}: ${snap.limitations.join(' ')}`)
  push(snap.qc.reading_minutes <= 10 ? 'ok' : 'fail', 'reading_time', `${snap.qc.word_count} palavras ≈ ${snap.qc.reading_minutes} min`)
  push(counts.sources > 0 ? 'ok' : 'fail', 'sources', `${counts.sources} referências de fonte`)

  // 6. Coverage & observability.
  const byStatus = facts.reduce<Record<string, number>>((a, f) => ((a[f.verification_status] = (a[f.verification_status] ?? 0) + 1), a), {})
  push(byStatus.VERIFIED ? 'ok' : 'warn', 'fact_coverage', JSON.stringify(byStatus))
  const failedRuns = runs.filter((r) => r.status === 'FAILED')
  push(failedRuns.length ? 'warn' : 'ok', 'agent_runs', failedRuns.length ? `Execuções com falha: ${failedRuns.map((r) => r.agent).join(', ')}` : `${runs.length} execuções registradas, nenhuma falha total`)
  const sourceFailures = runs.flatMap((r) => r.sources).filter((s) => !s.ok)
  if (sourceFailures.length) push('warn', 'source_failures', sourceFailures.slice(0, 12).map((s) => `${s.source_id}: ${s.error}`).join(' | '))

  const verdict = findings.some((f) => f.severity === 'fail') ? 'FAIL' : findings.some((f) => f.severity === 'warn') ? 'PASS_WITH_WARNINGS' : 'PASS'
  return { snapshot: snap.id, status: snap.status, analysis_mode: snap.analysis_mode, verdict, counts, facts_by_status: byStatus, findings }
}
