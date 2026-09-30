import { createHash } from 'node:crypto'
import { z } from 'zod'
import { llmMode } from '../../core/env'
import { stableId } from '../../core/ids'
import { errorMessage } from '../../core/logger'
import { AnalysisOutput, type AgendaItem, type CalendarEvent, type EventCluster, type IntelligenceSnapshot, type NewsItem, type QcReport, type VerifiedFact } from '../../core/schemas'
import { qualityControl } from '../../engines/quality-control'
import { marketSignals, scoreClusters, selectClusters } from '../../engines/relevance'
import { callStructured } from '../../llm/provider'
import { RunLogger } from '../../observability/run-logger'
import type { Repository } from '../../storage/repository'
import { buildAgenda, buildMacroRows, buildMarketRows, buildRates, buildSourceReferences, deterministicAnalysis, toStoredContentLab } from './brief'
import { FINANCIAL_INTELLIGENCE_INSTRUCTIONS } from './instructions'
import { buildAnalysisPacket, packetToPrompt, type AnalysisPacket } from './packet'

export { FINANCIAL_INTELLIGENCE_INSTRUCTIONS } from './instructions'

/**
 * AGENT 2 — FINANCIAL INTELLIGENCE + CFP/CFA ANALYST + COPYWRITER
 * Reads ONLY verified_facts (plus deduplicated event clusters and agenda),
 * produces the Morning Brief, UHNW Lens and Content Lab, and passes everything
 * through deterministic quality control before anything is saved.
 */

export const Agent2Input = z.object({
  date: z.string(),
  now: z.date(),
  parentRunId: z.string().nullable().optional(),
  mode: z.enum(['anthropic_api', 'claude_code', 'deterministic']).optional(),
  /** Analysis provided externally (Claude Code hand-off submission). */
  submittedAnalysis: z.unknown().optional(),
  /** HIGH events within 2 days flagged by Agent 3 (event-driven content requests). */
  eventRequestIds: z.array(z.string()).default([]),
})
export type Agent2Input = z.input<typeof Agent2Input>

export type BriefDraft = Omit<IntelligenceSnapshot, 'id' | 'version' | 'content_opportunities'>

export interface Agent2Output {
  runId: string
  draft: BriefDraft
  packet: AnalysisPacket
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'AWAITING_ANALYSIS'
}

export async function loadBriefInputs(repo: Repository, date: string) {
  const [facts, clusters, news, events] = await Promise.all([
    repo.getLatestFactsForDate(date),
    repo.getClusters(date),
    repo.getNews(date),
    repo.getEvents(date, addDaysLocal(date, 30)),
  ])
  return { facts, clusters, news, events }
}

const addDaysLocal = (d: string, n: number) => {
  const x = new Date(`${d}T12:00:00Z`)
  x.setUTCDate(x.getUTCDate() + n)
  return x.toISOString().slice(0, 10)
}

function clusterSummaries(clusters: EventCluster[], news: NewsItem[]): Map<string, string> {
  const byId = new Map(news.map((n) => [n.id, n]))
  const out = new Map<string, string>()
  for (const c of clusters) {
    const first = c.item_ids.map((id) => byId.get(id)).find((n) => n?.original_summary)
    if (first) out.set(c.id, first.original_summary)
  }
  return out
}

/** Canonical hash of a submitted analysis: the same submission for the same date is idempotent. */
export function analysisHash(date: string, analysis: unknown): string {
  const canon = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, canon((v as Record<string, unknown>)[k])])) : v
  return createHash('sha256').update(`${date}|${JSON.stringify(canon(analysis))}`).digest('hex').slice(0, 32)
}

/** Relevance selection for the brief: uses the ranking stored by Agent 1, or recomputes it (same deterministic rules). */
export function briefSelection(date: string, facts: VerifiedFact[], clusters: EventCluster[], news: NewsItem[]) {
  const signals = marketSignals(facts)
  const scored = clusters.some((c) => c.relevance_score > 0) ? clusters : scoreClusters(clusters, news, date, signals, facts)
  return { ...selectClusters(scored), signals }
}

export function assembleDraft(args: {
  date: string
  now: Date
  runId: string
  facts: VerifiedFact[]
  clusters: EventCluster[]
  events: CalendarEvent[]
  analysis: AnalysisOutput
  mode: BriefDraft['analysis_mode']
  status: BriefDraft['status']
  limitations: string[]
  watchlist?: EventCluster[]
  coverage?: BriefDraft['coverage_matrix']
  analysisHash?: string | null
}): { draft: BriefDraft; qc: QcReport } {
  const marketRows = buildMarketRows(args.facts)
  const agenda: AgendaItem[] = buildAgenda(args.events, args.date)
  // The deterministic brief is checked in facts-only mode (no event count / word target), with every other rule.
  const { analysis, report } = qualityControl({ analysis: args.analysis, facts: args.facts, marketRows, agenda, clusters: args.clusters, factsOnly: args.mode === 'deterministic' || args.status !== 'PUBLISHED' })
  // QC runs before any publication: a brief whose blocking checks still fail is not published.
  let status = args.status
  const limitations = [...args.limitations]
  if (status === 'PUBLISHED' && !report.passed) {
    status = 'FAILED_QC'
    const failed = report.checks.filter((c) => !c.passed && c.severity === 'block')
    limitations.push(`Não publicado: o controle de qualidade reprovou ${failed.map((c) => `${c.label} (${c.detail})`).join('; ')}.`)
  }
  const usedClusters = new Set([
    ...analysis.lede.cluster_ids,
    ...analysis.what_matters.flatMap((w) => w.cluster_ids),
    ...analysis.insights.flatMap((i) => i.cluster_ids),
  ])
  const draft: BriefDraft = {
    date: args.date,
    generated_at: args.now.toISOString(),
    run_id: args.runId,
    status,
    analysis_mode: args.mode,
    market_snapshot: marketRows,
    macro_snapshot: buildMacroRows(args.facts),
    news_snapshot: args.clusters.slice(0, 25),
    rates: buildRates(args.facts),
    watchlist_candidates: args.watchlist ?? [],
    coverage_matrix: args.coverage ?? [],
    analysis_hash: args.analysisHash ?? null,
    lede: args.mode === 'deterministic' || status === 'AWAITING_ANALYSIS' ? null : analysis.lede,
    what_matters: analysis.what_matters,
    macro_watch: analysis.macro_watch,
    insights: analysis.insights,
    uhnw_lens: analysis.uhnw_lens,
    content_lab: args.mode === 'deterministic' || status === 'AWAITING_ANALYSIS' ? null : toStoredContentLab(analysis.content_lab),
    agenda,
    source_references: buildSourceReferences(args.facts, args.clusters, agenda, usedClusters),
    qc: report,
    limitations,
  }
  return { draft, qc: report }
}

export async function runFinancialIntelligence(repo: Repository, rawInput: Agent2Input): Promise<Agent2Output> {
  const input = Agent2Input.parse(rawInput)
  const mode = input.mode ?? llmMode()
  const logger = await new RunLogger(repo, 'financial-intelligence', { job: 'MORNING_INTELLIGENCE', briefDate: input.date, parentRunId: input.parentRunId ?? null }).start()
  const started = Date.now()
  const { facts, clusters: stored, news, events } = await loadBriefInputs(repo, input.date)
  const selection = briefSelection(input.date, facts, stored, news)
  const clusters = selection.top
  const eventRequests = events.filter((e) => input.eventRequestIds.includes(e.id))
  const packet = buildAnalysisPacket(input.date, facts, selection.all, events, clusterSummaries(clusters, news), eventRequests, selection.signals)
  logger.meta({
    mode,
    citable_facts: packet.citable_facts.length,
    non_citable: packet.non_citable.length,
    clusters_sent: packet.clusters.length,
    packet_chars: packet.budget.chars,
    packet_estimated_tokens: packet.budget.estimated_tokens,
    facts_count: packet.budget.facts,
    clusters_count: packet.budget.clusters,
    agenda_count: packet.budget.agenda,
    packet_truncated: packet.budget.truncated,
    watchlist_candidates: selection.watchlist.length,
    coverage_uncovered: selection.coverage.filter((c) => !c.covered).map((c) => c.label),
  })

  const limitations: string[] = []
  let analysis: AnalysisOutput | null = null
  let usedMode: BriefDraft['analysis_mode'] = 'deterministic'
  // The daily deterministic snapshot is always published (QC in facts-only mode); enrichment replaces it later.
  let status: BriefDraft['status'] = 'PUBLISHED'
  let llmCalls = 0
  let hash: string | null = null

  try {
    if (input.submittedAnalysis !== undefined) {
      const parsed = AnalysisOutput.safeParse(input.submittedAnalysis)
      if (!parsed.success) throw new Error(`Análise submetida inválida: ${parsed.error.message.slice(0, 500)}`)
      analysis = parsed.data
      usedMode = 'claude_code'
      status = 'PUBLISHED'
      hash = analysisHash(input.date, input.submittedAnalysis)
    } else if (mode === 'anthropic_api') {
      llmCalls++
      const res = await callStructured({ system: FINANCIAL_INTELLIGENCE_INSTRUCTIONS, user: packetToPrompt(packet), schema: AnalysisOutput, tier: 'deep', maxTokens: 16000 })
      logger.meta({ model: res.model, usage: res.usage, stop_reason: res.stopReason })
      if (res.output) {
        analysis = res.output
        usedMode = 'anthropic_api'
        status = 'PUBLISHED'
      } else {
        logger.error('llm', res.error ?? 'unknown LLM error')
        limitations.push(`Interpretação indisponível: falha na chamada ao modelo (${res.error}). Publicado o briefing determinístico (apenas fatos).`)
      }
    } else if (mode === 'claude_code') {
      await repo.saveAnalysisPacket({
        id: stableId('pkt', input.date, logger.id),
        date: input.date,
        run_id: input.parentRunId ?? logger.id,
        created_at: new Date().toISOString(),
        status: 'PENDING',
        packet: packet as unknown as Record<string, unknown>,
        submitted_at: null,
      })
      limitations.push('Briefing determinístico publicado (apenas fatos). A interpretação do Claude Code, quando enviada, substitui esta versão para a mesma data.')
    } else {
      limitations.push('Execução sem LLM: briefing contém apenas fatos verificados, sem interpretação.')
    }
  } catch (e) {
    logger.error('analysis', errorMessage(e))
    limitations.push(`Interpretação indisponível: ${errorMessage(e)}`)
    // A rejected submission never publishes anything (the deterministic version stays the published one).
    if (input.submittedAnalysis !== undefined) status = 'FAILED_QC'
  }

  const finalAnalysis = analysis ?? deterministicAnalysis(facts, clusters)
  const { draft, qc } = assembleDraft({
    date: input.date,
    now: new Date(),
    runId: input.parentRunId ?? logger.id,
    facts,
    clusters,
    events,
    analysis: finalAnalysis,
    mode: usedMode,
    status,
    limitations,
    watchlist: selection.watchlist,
    coverage: selection.coverage,
    analysisHash: hash,
  })
  logger.meta({ provider_calls: llmCalls, retries: 0, elapsed_ms: Date.now() - started })
  logger.meta({ qc_passed: qc.passed, qc_corrections: qc.corrections.length, word_count: qc.word_count, reading_minutes: qc.reading_minutes })
  logger.counts({ items_collected: facts.length + clusters.length, items_verified: packet.citable_facts.length, items_rejected: qc.corrections.length })
  const awaiting = mode === 'claude_code' && input.submittedAnalysis === undefined
  const runStatus = awaiting ? 'AWAITING_ANALYSIS' : logger.run.errors.length ? 'PARTIAL' : 'SUCCESS'
  await logger.finish(runStatus)
  return { runId: logger.id, draft, packet, status: runStatus }
}
