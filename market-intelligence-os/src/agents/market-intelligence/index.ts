import { z } from 'zod'
import { SOURCES } from '../../../config/sources'
import { getEnv } from '../../core/env'
import { stableId } from '../../core/ids'
import { errorMessage } from '../../core/logger'
import { CalendarEvent, NewsItem, RawObservation, RunError, SourceHealth, type EventCluster, type JobName, type VerifiedFact } from '../../core/schemas'
import { clusterNews } from '../../engines/news-clustering'
import { RunLogger } from '../../observability/run-logger'
import type { Repository } from '../../storage/repository'
import { verifyAll } from '../../verification/engine'
import { collectMacro } from './collectors/macro'
import { collectMarkets } from './collectors/market'
import { collectNews } from './collectors/news'

export { MARKET_INTELLIGENCE_INSTRUCTIONS } from './instructions'

/**
 * AGENT 1 — MARKET INTELLIGENCE & RESEARCH
 * Guardian of factuality. 100% deterministic in the MVP: APIs, CSV, RSS and
 * parsers. No LLM is used to copy numbers into the database.
 */

/** A collection bundle lets collection run anywhere (Vercel, a sandbox, CI) and be verified elsewhere. */
export const CollectionBundle = z.object({
  version: z.literal(1),
  collected_at: z.string(),
  brief_date: z.string(),
  collector_host: z.string(),
  observations: z.array(RawObservation),
  news: z.array(NewsItem),
  health: z.array(SourceHealth),
  errors: z.array(RunError),
  skipped: z.array(z.string()).default([]),
  /** Official calendar events collected with the bundle (e.g. IBGE releases). */
  calendar: z.array(CalendarEvent).default([]),
})
export type CollectionBundle = z.infer<typeof CollectionBundle>

export const Agent1Input = z.object({
  briefDate: z.string(),
  now: z.date(),
  job: z.string().nullable().optional(),
  parentRunId: z.string().nullable().optional(),
  scope: z.array(z.enum(['markets', 'macro', 'news'])).default(['markets', 'macro', 'news']),
  bundle: CollectionBundle.optional(),
})
export type Agent1Input = z.input<typeof Agent1Input>

export interface Agent1Output {
  runId: string
  facts: VerifiedFact[]
  clusters: EventCluster[]
  newsCount: number
  errors: RunError[]
  health: SourceHealth[]
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED'
}

export async function collectBundle(briefDate: string, now: Date, scope: ('markets' | 'macro' | 'news')[] = ['markets', 'macro', 'news']): Promise<CollectionBundle> {
  const [markets, macro, news] = await Promise.all([
    scope.includes('markets') ? collectMarkets(now) : null,
    scope.includes('macro') ? collectMacro(now) : null,
    scope.includes('news') ? collectNews(briefDate, now) : null,
  ])
  return {
    version: 1,
    collected_at: now.toISOString(),
    brief_date: briefDate,
    collector_host: process.env.VERCEL ? 'vercel' : process.env.MI_COLLECTOR_HOST ?? 'local',
    observations: [...(markets?.observations ?? []), ...(macro?.observations ?? [])],
    news: news?.items ?? [],
    health: [...(markets?.health ?? []), ...(macro?.health ?? []), ...(news?.health ?? [])],
    errors: [...(markets?.errors ?? []), ...(macro?.errors ?? []), ...(news?.errors ?? [])],
    skipped: [...(markets?.skipped ?? []), ...(macro?.skipped ?? [])],
    calendar: [],
  }
}

export async function runMarketIntelligence(repo: Repository, rawInput: Agent1Input): Promise<Agent1Output> {
  const input = Agent1Input.parse(rawInput)
  const logger = await new RunLogger(repo, 'market-intelligence', { job: (input.job as JobName) ?? null, briefDate: input.briefDate, parentRunId: input.parentRunId ?? null }).start()
  try {
    const bundle = input.bundle ?? (await collectBundle(input.briefDate, input.now, input.scope))
    logger.sources(bundle.health)
    logger.errors(bundle.errors)
    logger.meta({ collector_host: bundle.collector_host, skipped_sources: bundle.skipped, from_bundle: Boolean(input.bundle) })

    // Raw audit trail.
    await repo.insertRawObservations(
      bundle.observations.map((o) => ({ ...o, id: stableId('raw', logger.id, o.sourceId, o.metric), run_id: logger.id, brief_date: input.briefDate })),
    )

    // Verification (markets + macro).
    const previousFacts = new Map<string, VerifiedFact>()
    await Promise.all(
      [...new Set(bundle.observations.map((o) => o.metric))].map(async (m) => {
        const prev = await repo.getPreviousFact(m, input.briefDate)
        if (prev) previousFacts.set(m, prev)
      }),
    )
    const scopeFilter = (cat: 'MARKET' | 'MACRO') => (cat === 'MARKET' ? input.scope.includes('markets') : input.scope.includes('macro'))
    const { facts: allFacts, rejected } = verifyAll(bundle.observations, {
      briefDate: input.briefDate,
      runId: logger.id,
      now: input.now,
      strictMacro: getEnv().MI_VERIFICATION_STRICT_MACRO === 'true',
      previousFacts,
    })
    const facts = allFacts.filter((f) => scopeFilter(f.category as 'MARKET' | 'MACRO'))
    for (const r of rejected) logger.error('validation', `${r.observation.metric}: ${r.reason}`, r.observation.sourceId)
    await repo.upsertFacts(facts)

    // News: dedupe + clustering.
    let clusters: EventCluster[] = []
    if (input.scope.includes('news')) {
      const official = new Set(SOURCES.filter((s) => s.kind === 'news' && s.authority === 'official').map((s) => s.id))
      const clustered = clusterNews(bundle.news, input.briefDate, { officialSourceIds: official })
      clusters = clustered.clusters
      await repo.upsertNews(clustered.items)
      await repo.upsertClusters(clusters)
    }

    const verified = facts.filter((f) => f.verification_status === 'VERIFIED').length
    logger.counts({ items_collected: bundle.observations.length + bundle.news.length, items_verified: verified, items_rejected: rejected.length })
    logger.meta({
      facts_by_status: facts.reduce<Record<string, number>>((acc, f) => ((acc[f.verification_status] = (acc[f.verification_status] ?? 0) + 1), acc), {}),
      news_items: bundle.news.length,
      event_clusters: clusters.length,
    })
    const anyData = bundle.observations.length > 0 || bundle.news.length > 0
    const status = !anyData ? 'FAILED' : bundle.errors.length ? 'PARTIAL' : 'SUCCESS'
    await logger.finish(status)
    return { runId: logger.id, facts, clusters, newsCount: bundle.news.length, errors: logger.run.errors, health: bundle.health, status }
  } catch (e) {
    logger.error('agent1', errorMessage(e))
    await logger.finish('FAILED')
    return { runId: logger.id, facts: [], clusters: [], newsCount: 0, errors: logger.run.errors, health: [], status: 'FAILED' }
  }
}
