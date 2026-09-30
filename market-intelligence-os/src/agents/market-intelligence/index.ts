import { z } from 'zod'
import { ASSETS } from '../../../config/assets'
import { SOURCES } from '../../../config/sources'
import { getEnv } from '../../core/env'
import { stableId } from '../../core/ids'
import { errorMessage } from '../../core/logger'
import { CalendarEvent, NewsItem, RawObservation, RunError, SourceHealth, type EventCluster, type JobName, type VerifiedFact } from '../../core/schemas'
import { httpStats } from '../../core/http'
import { classifyNews } from '../../engines/news-classifier'
import { clusterNews } from '../../engines/news-clustering'
import { marketSignals, scoreClusters, scoreItem, selectClusters } from '../../engines/relevance'
import { RunLogger } from '../../observability/run-logger'
import type { Repository } from '../../storage/repository'
import { verifyAll } from '../../verification/engine'
import { collectMacro } from './collectors/macro'
import { collectMarkets } from './collectors/market'
import { describeSession } from './collectors/market-status'
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
  /**
   * Observations fetched outside the backend collectors (e.g. the BRAPI MCP
   * connected to the Claude session). They keep full provenance, must name a
   * registered source and go through the same validation/verification.
   */
  extraObservations: z.array(RawObservation).default([]),
  liveQuote: z.boolean().default(false),
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

export async function collectBundle(briefDate: string, now: Date, scope: ('markets' | 'macro' | 'news')[] = ['markets', 'macro', 'news'], options: { liveQuote?: boolean } = {}): Promise<CollectionBundle> {
  const [markets, macro, news] = await Promise.all([
    scope.includes('markets') ? collectMarkets(now, undefined, {}, options) : null,
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

/**
 * Merge externally fetched observations into a bundle. Unknown sources are
 * refused; an external observation replaces a collector one only for the same
 * source + metric (never another source's number).
 */
export function mergeExtraObservations(bundle: CollectionBundle, extra: RawObservation[]): CollectionBundle {
  if (!extra.length) return bundle
  const known = new Set(SOURCES.map((s) => s.id))
  const accepted: RawObservation[] = []
  const errors = [...bundle.errors]
  for (const o of extra) {
    if (!known.has(o.sourceId)) {
      errors.push({ step: 'external', source: o.sourceId, message: `Fonte não registrada: ${o.metric} ignorado`, at: o.retrievedAt })
      continue
    }
    accepted.push(o)
  }
  const key = (o: RawObservation) => `${o.sourceId}|${o.metric}`
  const replaced = new Set(accepted.map(key))
  const health = [...bundle.health]
  for (const id of new Set(accepted.map((o) => o.sourceId))) {
    const items = accepted.filter((o) => o.sourceId === id).length
    const i = health.findIndex((h) => h.source_id === id)
    const entry: SourceHealth = { source_id: id, ok: true, items: (i >= 0 && health[i].ok ? health[i].items : 0) + items, latency_ms: i >= 0 ? health[i].latency_ms : 0, error: null }
    if (i >= 0) health[i] = entry
    else health.push(entry)
  }
  return {
    ...bundle,
    observations: [...bundle.observations.filter((o) => !replaced.has(key(o))), ...accepted],
    errors,
    health,
    skipped: bundle.skipped.filter((s) => !accepted.some((o) => s.startsWith(`${o.metric}@${o.sourceId}:`))),
  }
}

/**
 * Session labels are a pure function of (asset, source, reference date, observed time, market
 * status, collection time): re-derive them for an imported bundle so it is labelled by the
 * current rules (e.g. a previous close collected while the exchange trades is not intraday).
 */
function resessionBundle(bundle: CollectionBundle): CollectionBundle {
  const at = new Date(bundle.collected_at)
  return {
    ...bundle,
    observations: bundle.observations.map((o) => {
      const asset = ASSETS.find((a) => a.metric === o.metric)
      if (o.category !== 'MARKET' || !asset || !o.session || !o.marketStatus || !o.referencePeriod) return o
      return { ...o, session: describeSession(asset, o.sourceId, o.referencePeriod, o.asOf, o.marketStatus, at) }
    }),
  }
}

export async function runMarketIntelligence(repo: Repository, rawInput: Agent1Input): Promise<Agent1Output> {
  const input = Agent1Input.parse(rawInput)
  const logger = await new RunLogger(repo, 'market-intelligence', { job: (input.job as JobName) ?? null, briefDate: input.briefDate, parentRunId: input.parentRunId ?? null }).start()
  const started = Date.now()
  httpStats.reset()
  try {
    const collected = input.bundle ? resessionBundle(input.bundle) : await collectBundle(input.briefDate, input.now, input.scope, { liveQuote: input.liveQuote })
    const bundle = mergeExtraObservations(collected, input.extraObservations)
    logger.sources(bundle.health)
    logger.errors(bundle.errors)
    logger.meta({
      collector_host: bundle.collector_host,
      skipped_sources: bundle.skipped,
      from_bundle: Boolean(input.bundle),
      extra_observations: input.extraObservations.map((o) => `${o.sourceId}:${o.metric}`),
    })

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
      // Score items first (seeds each cluster with its most relevant story), cluster, then rank clusters.
      const factsForSignals = facts.length ? facts : await repo.getLatestFactsForDate(input.briefDate)
      const signals = marketSignals(factsForSignals)
      // Classification is a pure function of headline + summary + source: re-apply it so an imported
      // bundle (collected by older code, e.g. in a sandbox) is ranked with the current rules.
      const bySource = new Map(SOURCES.map((s) => [s.id, s]))
      const news = bundle.news.map((n) => {
        const src = bySource.get(n.source_id)
        return { ...n, ...classifyNews(n.headline, n.original_summary ?? '', { officialSource: src?.authority === 'official', defaultRegion: src?.regions[0] }) }
      })
      const clustered = clusterNews(news, input.briefDate, { officialSourceIds: official, rank: (n) => scoreItem(n, input.briefDate, signals) })
      const ranked = selectClusters(scoreClusters(clustered.clusters, clustered.items, input.briefDate, signals, factsForSignals))
      clusters = ranked.all
      // All raw news and every cluster (top, watchlist and tail) are persisted; only the top reaches Agent 2.
      await repo.upsertNews(clustered.items)
      await repo.upsertClusters(clusters)
      logger.meta({
        clusters_top: ranked.top.length,
        clusters_watchlist: ranked.watchlist.length,
        clusters_tail: ranked.tail.length,
        hard_overrides: ranked.all.filter((c) => c.hard_override).length,
        market_signals: signals.map((s) => s.text),
        coverage_uncovered: ranked.coverage.filter((c) => !c.covered).map((c) => c.label),
      })
    }

    const verified = facts.filter((f) => f.verification_status === 'VERIFIED').length
    logger.counts({ items_collected: bundle.observations.length + bundle.news.length, items_verified: verified, items_rejected: rejected.length })
    logger.meta({
      facts_by_status: facts.reduce<Record<string, number>>((acc, f) => ((acc[f.verification_status] = (acc[f.verification_status] ?? 0) + 1), acc), {}),
      news_items: bundle.news.length,
      event_clusters: clusters.length,
      // Source queries recorded in the bundle; HTTP calls/retries only when collected in this process.
      provider_calls: bundle.health.length,
      http_calls: httpStats.calls,
      retries: httpStats.retries,
      http_failures: httpStats.failures,
      elapsed_ms: Date.now() - started,
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
