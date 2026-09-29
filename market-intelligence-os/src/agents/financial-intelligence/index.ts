import { z } from 'zod'
import { llmMode } from '../../core/env'
import { stableId } from '../../core/ids'
import { errorMessage } from '../../core/logger'
import { AnalysisOutput, type AgendaItem, type CalendarEvent, type EventCluster, type IntelligenceSnapshot, type NewsItem, type QcReport, type VerifiedFact } from '../../core/schemas'
import { qualityControl } from '../../engines/quality-control'
import { callStructured } from '../../llm/provider'
import { RunLogger } from '../../observability/run-logger'
import type { Repository } from '../../storage/repository'
import { buildAgenda, buildMacroRows, buildMarketRows, buildSourceReferences, deterministicAnalysis } from './brief'
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
}): { draft: BriefDraft; qc: QcReport } {
  const marketRows = buildMarketRows(args.facts)
  const agenda: AgendaItem[] = buildAgenda(args.events, args.date)
  const { analysis, report } = qualityControl({ analysis: args.analysis, facts: args.facts, marketRows, agenda })
  const usedClusters = new Set([
    ...analysis.what_matters.flatMap((w) => w.cluster_ids),
    ...analysis.insights.flatMap((i) => i.cluster_ids),
  ])
  const draft: BriefDraft = {
    date: args.date,
    generated_at: args.now.toISOString(),
    run_id: args.runId,
    status: args.status,
    analysis_mode: args.mode,
    market_snapshot: marketRows,
    macro_snapshot: buildMacroRows(args.facts),
    news_snapshot: args.clusters.slice(0, 25),
    what_matters: analysis.what_matters,
    macro_watch: analysis.macro_watch,
    insights: analysis.insights,
    uhnw_lens: analysis.uhnw_lens,
    content_lab: args.mode === 'deterministic' || args.status === 'AWAITING_ANALYSIS' ? null : analysis.content_lab,
    agenda,
    source_references: buildSourceReferences(args.facts, args.clusters, agenda, usedClusters),
    qc: report,
    limitations: args.limitations,
  }
  return { draft, qc: report }
}

export async function runFinancialIntelligence(repo: Repository, rawInput: Agent2Input): Promise<Agent2Output> {
  const input = Agent2Input.parse(rawInput)
  const mode = input.mode ?? llmMode()
  const logger = await new RunLogger(repo, 'financial-intelligence', { job: 'MORNING_INTELLIGENCE', briefDate: input.date, parentRunId: input.parentRunId ?? null }).start()
  const { facts, clusters, news, events } = await loadBriefInputs(repo, input.date)
  const eventRequests = events.filter((e) => input.eventRequestIds.includes(e.id))
  const packet = buildAnalysisPacket(input.date, facts, clusters, events, clusterSummaries(clusters, news), eventRequests)
  logger.meta({ mode, citable_facts: packet.citable_facts.length, non_citable: packet.non_citable.length, clusters_sent: packet.clusters.length, packet_chars: JSON.stringify(packet).length })

  const limitations: string[] = []
  let analysis: AnalysisOutput | null = null
  let usedMode: BriefDraft['analysis_mode'] = 'deterministic'
  let status: BriefDraft['status'] = 'DRAFT_FACTS_ONLY'

  try {
    if (input.submittedAnalysis !== undefined) {
      const parsed = AnalysisOutput.safeParse(input.submittedAnalysis)
      if (!parsed.success) throw new Error(`Análise submetida inválida: ${parsed.error.message.slice(0, 500)}`)
      analysis = parsed.data
      usedMode = 'claude_code'
      status = 'PUBLISHED'
    } else if (mode === 'anthropic_api') {
      const res = await callStructured({ system: FINANCIAL_INTELLIGENCE_INSTRUCTIONS, user: packetToPrompt(packet), schema: AnalysisOutput, tier: 'deep', maxTokens: 16000 })
      logger.meta({ model: res.model, usage: res.usage, stop_reason: res.stopReason })
      if (res.output) {
        analysis = res.output
        usedMode = 'anthropic_api'
        status = 'PUBLISHED'
      } else {
        logger.error('llm', res.error ?? 'unknown LLM error')
        limitations.push(`Interpretação indisponível: falha na chamada ao modelo (${res.error}). Exibindo briefing apenas com fatos.`)
      }
    } else if (mode === 'claude_code') {
      await repo.saveAnalysisPacket({
        id: stableId('pkt', input.date, logger.id),
        date: input.date,
        run_id: input.parentRunId ?? logger.id,
        created_at: input.now.toISOString(),
        status: 'PENDING',
        packet: packet as unknown as Record<string, unknown>,
        submitted_at: null,
      })
      status = 'AWAITING_ANALYSIS'
      limitations.push('Aguardando a etapa de interpretação (rotina Claude Code). Os fatos verificados já estão disponíveis.')
    } else {
      limitations.push('Execução sem LLM: briefing contém apenas fatos verificados, sem interpretação.')
    }
  } catch (e) {
    logger.error('analysis', errorMessage(e))
    limitations.push(`Interpretação indisponível: ${errorMessage(e)}`)
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
  })
  logger.meta({ qc_passed: qc.passed, qc_corrections: qc.corrections.length, word_count: qc.word_count, reading_minutes: qc.reading_minutes })
  logger.counts({ items_collected: facts.length + clusters.length, items_verified: packet.citable_facts.length, items_rejected: qc.corrections.length })
  const runStatus = status === 'AWAITING_ANALYSIS' ? 'AWAITING_ANALYSIS' : logger.run.errors.length ? 'PARTIAL' : 'SUCCESS'
  await logger.finish(runStatus)
  return { runId: logger.id, draft, packet, status: runStatus }
}
