import { llmMode } from '../../core/env'
import { errorMessage, log } from '../../core/logger'
import type { AnalysisOutput, ContentOpportunity, IntelligenceSnapshot, JobName } from '../../core/schemas'
import { addDays, toLocalDate } from '../../core/time'
import { processPendingResearch } from '../../engines/research-broker'
import { RunLogger } from '../../observability/run-logger'
import type { Repository } from '../../storage/repository'
import { buildAgenda, buildMarketRows, buildSourceReferences } from '../financial-intelligence/brief'
import { runFinancialIntelligence, type BriefDraft } from '../financial-intelligence'
import { runMarketIntelligence, type CollectionBundle } from '../market-intelligence'
import { runSocialStrategist } from '../social-strategist'

/**
 * MARKET INTELLIGENCE ORCHESTRATOR
 * Makes sure everything happens in the right order and that one failing
 * stage never destroys the output of the previous ones.
 *
 *  1  init run
 *  2-4 Agent 1: markets, news, macro (deterministic collectors)
 *  5-6 Verification Engine → verified_facts
 *  7  Agent 3 (daily, deterministic): Event Engine → calendar + opportunities + event-driven requests
 *  8-9 Agent 2: interpretation → Morning Brief → Content Lab (ONE LLM call, receives Agent 3's requests)
 *  10 Quality control (inside Agent 2), then the agenda is refreshed from the updated calendar
 *  11 Snapshot persisted (append-only), so the dashboard gets the new content
 *  12 Pending research requests processed
 *
 * Decision: Agent 3's deterministic calendar step runs BEFORE Agent 2, so the
 * event-driven content requests reach Agent 2 in the same (single) LLM call
 * instead of a second one. This saves tokens without changing responsibilities.
 */

export interface MorningOptions {
  now?: Date
  date?: string
  bundle?: CollectionBundle
  mode?: 'anthropic_api' | 'claude_code' | 'deterministic'
  job?: JobName
  skipNetworkCalendar?: boolean
  processResearch?: boolean
}

export interface MorningResult {
  runId: string
  date: string
  snapshot: IntelligenceSnapshot | null
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'AWAITING_ANALYSIS'
  stages: Record<string, string>
}

export async function runMorningIntelligence(repo: Repository, opts: MorningOptions = {}): Promise<MorningResult> {
  const now = opts.now ?? new Date()
  const date = opts.date ?? toLocalDate(now)
  const job = opts.job ?? 'MORNING_INTELLIGENCE'
  const orch = await new RunLogger(repo, 'orchestrator', { job, briefDate: date }).start()
  const stages: Record<string, string> = {}
  orch.meta({ llm_mode: opts.mode ?? llmMode(), storage: repo.store.kind })

  // Agent 1
  const a1 = await runMarketIntelligence(repo, { briefDate: date, now, job, parentRunId: orch.id, bundle: opts.bundle })
  stages.agent1 = a1.status
  if (a1.status === 'FAILED') orch.error('agent1', `Agent 1 falhou: ${a1.errors.slice(-1)[0]?.message ?? 'sem dados'}. Pipeline segue com dados disponíveis.`)

  // Agent 3 (daily, deterministic)
  let opportunities: ContentOpportunity[] = []
  let eventRequestIds: string[] = []
  try {
    const a3 = await runSocialStrategist(repo, { date, now, mode: 'daily', parentRunId: orch.id, clusters: a1.clusters, skipNetwork: opts.skipNetworkCalendar, extraEvents: opts.bundle?.calendar })
    stages.agent3 = a3.status
    opportunities = a3.opportunities
    eventRequestIds = a3.preEventReview.map((e) => e.id)
  } catch (e) {
    stages.agent3 = 'FAILED'
    orch.error('agent3', errorMessage(e))
  }

  // Agent 2
  let draft: BriefDraft | null = null
  try {
    const a2 = await runFinancialIntelligence(repo, { date, now, parentRunId: orch.id, mode: opts.mode, eventRequestIds })
    stages.agent2 = a2.status
    draft = a2.draft
  } catch (e) {
    stages.agent2 = 'FAILED'
    orch.error('agent2', `Agent 2 falhou: ${errorMessage(e)}. Dados do Agent 1 preservados.`)
  }

  // Snapshot (append-only)
  let snapshot: IntelligenceSnapshot | null = null
  if (draft) {
    try {
      const events = await repo.getEvents(date, addDays(date, 30))
      const agenda = buildAgenda(events, date)
      snapshot = await repo.insertSnapshot({
        ...draft,
        agenda,
        run_id: orch.id,
        content_opportunities: opportunities.filter((o) => o.target_date <= addDays(date, 14)).slice(0, 20),
        limitations: [...draft.limitations, ...limitationsFromRun(a1)],
      })
      stages.snapshot = `v${snapshot.version}`
    } catch (e) {
      stages.snapshot = 'FAILED'
      orch.error('snapshot', errorMessage(e))
    }
  }

  if (opts.processResearch !== false) {
    try {
      const done = await processPendingResearch(repo, now, { allowNetwork: !opts.bundle })
      stages.research = `${done.length} processed`
    } catch (e) {
      orch.error('research', errorMessage(e))
    }
  }

  const failed = !snapshot
  const status: MorningResult['status'] = failed ? 'FAILED' : stages.agent2 === 'AWAITING_ANALYSIS' ? 'AWAITING_ANALYSIS' : Object.values(stages).some((s) => s === 'FAILED' || s === 'PARTIAL') ? 'PARTIAL' : 'SUCCESS'
  orch.meta({ stages, snapshot_id: snapshot?.id ?? null })
  await orch.finish(status)
  log.info('morning.done', { date, status, stages })
  return { runId: orch.id, date, snapshot, status, stages }
}

function limitationsFromRun(a1: Awaited<ReturnType<typeof runMarketIntelligence>>): string[] {
  const out: string[] = []
  const failedSources = a1.health.filter((h) => !h.ok)
  if (failedSources.length) out.push(`${failedSources.length} de ${a1.health.length} consultas a fontes falharam nesta execução (detalhes em Observabilidade).`)
  const unavailable = a1.facts.filter((f) => f.verification_status === 'UNAVAILABLE').map((f) => f.label)
  if (unavailable.length) out.push(`Indisponíveis: ${unavailable.slice(0, 8).join(', ')}${unavailable.length > 8 ? '…' : ''}.`)
  const conflicts = a1.facts.filter((f) => f.verification_status === 'CONFLICT').map((f) => f.label)
  if (conflicts.length) out.push(`Em conflito (não usados como fato): ${conflicts.join(', ')}.`)
  if (a1.facts.some((f) => f.category === 'MARKET' && f.source_fallback)) out.push('Dados de mercado com source_fallback: Investing.com não integrado (ver docs/market-intelligence.md).')
  return out
}

/** Claude Code hand-off: validates a submitted analysis and publishes a new snapshot version. */
export async function submitAnalysis(repo: Repository, date: string, analysis: unknown, now = new Date()): Promise<IntelligenceSnapshot> {
  const packet = await repo.getAnalysisPacket(date)
  const latest = await repo.getLatestSnapshot(date)
  const a2 = await runFinancialIntelligence(repo, { date, now, parentRunId: packet?.run_id ?? latest?.run_id ?? null, submittedAnalysis: analysis })
  if (a2.draft.status !== 'PUBLISHED') throw new Error(`Análise rejeitada: ${a2.draft.limitations.join(' ')}`)
  const snapshot = await repo.insertSnapshot({
    ...a2.draft,
    content_opportunities: latest?.content_opportunities ?? [],
    limitations: a2.draft.limitations,
  })
  if (packet) await repo.saveAnalysisPacket({ ...packet, status: 'SUBMITTED', submitted_at: now.toISOString() })
  return snapshot
}

/** End-of-day refresh: new market facts, a new snapshot version with the same analysis. No LLM. */
export async function runMarketCloseRefresh(repo: Repository, now = new Date(), bundle?: CollectionBundle): Promise<MorningResult> {
  const date = toLocalDate(now)
  const orch = await new RunLogger(repo, 'orchestrator', { job: 'MARKET_CLOSE_REFRESH', briefDate: date }).start()
  const a1 = await runMarketIntelligence(repo, { briefDate: date, now, job: 'MARKET_CLOSE_REFRESH', parentRunId: orch.id, scope: ['markets'], bundle })
  const latest = await repo.getLatestSnapshot(date)
  let snapshot: IntelligenceSnapshot | null = null
  if (latest && a1.facts.length) {
    const facts = await repo.getLatestFactsForDate(date)
    const { id: _id, version: _v, ...rest } = latest
    snapshot = await repo.insertSnapshot({
      ...rest,
      generated_at: now.toISOString(),
      run_id: orch.id,
      market_snapshot: buildMarketRows(facts),
      source_references: buildSourceReferences(facts, latest.news_snapshot, latest.agenda),
      limitations: [...latest.limitations.filter((l) => !l.startsWith('Mercados atualizados')), `Mercados atualizados no fechamento (${now.toISOString()}). Análise mantida da versão anterior.`],
    })
  }
  await orch.finish(a1.status === 'FAILED' ? 'FAILED' : snapshot ? 'SUCCESS' : 'PARTIAL')
  return { runId: orch.id, date, snapshot, status: a1.status === 'FAILED' ? 'FAILED' : 'SUCCESS', stages: { agent1: a1.status, snapshot: snapshot ? `v${snapshot.version}` : 'skipped' } }
}

export async function runWeeklySocialStrategy(repo: Repository, now = new Date()) {
  const date = toLocalDate(now)
  return runSocialStrategist(repo, { date, now, mode: 'weekly' })
}

export type { AnalysisOutput }
