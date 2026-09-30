import {
  AUTHORITY_SCORE,
  COVERAGE,
  COVERAGE_MIN_SCORE,
  DOMAIN_OF,
  HARD_OVERRIDES,
  NOVELTY_LADDER,
  RELEVANCE_WEIGHTS,
  SELECTION,
  SHOCK_THRESHOLDS,
  SOURCE_LADDER,
} from '../../config/relevance'
import { SOURCES } from '../../config/sources'
import type { CoverageCell, EventCluster, NewsItem, VerifiedFact } from '../core/schemas'
import { zonedToUtc } from '../core/time'
import { metricTarget } from './metric-alignment'
import { normalizeText } from './news-classifier'

/**
 * RELEVANCE ENGINE (deterministic, no LLM).
 *
 * collect → normalize → dedupe → classify → SCORE → OVERRIDES → top candidates
 * → cluster → COVERAGE → top clusters (Agent 2) / watchlist (persisted) / tail (persisted).
 *
 * The same scoring function runs on single items before clustering (to seed each
 * cluster with its most relevant story) and on the final clusters.
 */

export interface MarketSignal {
  metric: string
  label: string
  fact_id: string
  move: number
  unit: '%' | 'bps'
  threshold: number
  reference: string | null
  /** Neutral description: the move only, never a cause. */
  text: string
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))
const ladder = (steps: [number, number][], v: number, desc = true) => (desc ? steps.find(([min]) => v >= min)?.[1] : steps.find(([max]) => v <= max)?.[1]) ?? 0

/** Daily moves above the configured thresholds (VERIFIED or UNVERIFIED facts with a known previous value). */
export function marketSignals(facts: VerifiedFact[]): MarketSignal[] {
  const out: MarketSignal[] = []
  for (const t of SHOCK_THRESHOLDS) {
    const f = facts.find((x) => x.metric === t.metric)
    if (!f || f.value === null || f.is_stale || !['VERIFIED', 'UNVERIFIED'].includes(f.verification_status)) continue
    if (t.bps !== undefined && f.previous_value !== null) {
      const move = Math.round((f.value - f.previous_value) * 10000) / 100
      if (Math.abs(move) >= t.bps) out.push({ metric: f.metric, label: f.label, fact_id: f.id, move, unit: 'bps', threshold: t.bps, reference: f.reference_period, text: `${f.label}: ${move > 0 ? '+' : ''}${move} bps no dia (limiar ${t.bps} bps).` })
    } else if (t.pct !== undefined && f.change_pct !== null && Math.abs(f.change_pct) >= t.pct) {
      out.push({ metric: f.metric, label: f.label, fact_id: f.id, move: f.change_pct, unit: '%', threshold: t.pct, reference: f.reference_period, text: `${f.label}: ${f.change_pct > 0 ? '+' : ''}${f.change_pct}% no dia (limiar ${t.pct}%).` })
    }
  }
  return out
}

export function hardOverride(text: string): { id: string; label: string } | null {
  const t = normalizeText(text)
  const hit = HARD_OVERRIDES.find((o) => o.pattern.test(t))
  return hit ? { id: hit.id, label: hit.label } : null
}

const authorityOf = (sourceId: string) => AUTHORITY_SCORE[SOURCES.find((s) => s.id === sourceId)?.authority ?? 'press'] ?? 0.5

export interface ScoreInput {
  text: string
  importance: number
  market_relevance: number
  uhnw_relevance: number
  distinctSources: number
  sourceIds: string[]
  lastPublishedAt: string
  topic: string
  region: string
}

export function scoreRelevance(x: ScoreInput, briefDate: string, signals: MarketSignal[] = []) {
  const morning = Date.parse(zonedToUtc(briefDate, '05:00', 'America/Sao_Paulo'))
  const ageH = Math.max(0, (morning - Date.parse(x.lastPublishedAt)) / 3_600_000)
  const t = normalizeText(x.text)
  const related = signals.filter((s) => SHOCK_THRESHOLDS.find((th) => th.metric === s.metric)?.related.test(t))
  const override = hardOverride(x.text)
  const c = {
    materiality: clamp01(x.importance / 100 + (override ? 0.15 : 0)),
    sources: ladder(SOURCE_LADDER, x.distinctSources),
    market_impact: related.length ? 1 : clamp01(x.market_relevance / 100),
    novelty: ladder(NOVELTY_LADDER, ageH, false),
    authority: Math.max(0, ...x.sourceIds.map(authorityOf)),
    wealth: clamp01(x.uhnw_relevance / 100),
  }
  const components = Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Math.round(v * RELEVANCE_WEIGHTS[k as keyof typeof c] * 10) / 10]))
  const score = Math.round(Object.values(components).reduce((a, b) => a + b, 0))
  return { score: Math.min(100, score), components, override, related }
}

export const scoreItem = (n: NewsItem, briefDate: string, signals: MarketSignal[] = []) =>
  scoreRelevance(
    { text: n.headline, importance: n.importance, market_relevance: n.market_relevance, uhnw_relevance: n.uhnw_relevance, distinctSources: 1, sourceIds: [n.source_id], lastPublishedAt: n.published_at, topic: n.topic, region: n.region },
    briefDate,
    signals,
  ).score

/** Scores every cluster and fills relevance_score, components, override, geography, domain, metric_target and signals. */
export function scoreClusters(clusters: EventCluster[], items: NewsItem[], briefDate: string, signals: MarketSignal[] = []): EventCluster[] {
  const byId = new Map(items.map((n) => [n.id, n]))
  return clusters.map((c) => {
    const members = c.item_ids.map((id) => byId.get(id)).filter((n): n is NewsItem => !!n)
    const headlines = [c.title, ...c.sources.map((s) => s.headline)].join(' · ')
    const r = scoreRelevance(
      {
        text: headlines,
        importance: c.importance,
        market_relevance: c.market_relevance,
        uhnw_relevance: c.uhnw_relevance,
        distinctSources: new Set(c.sources.map((s) => s.source)).size,
        sourceIds: members.map((m) => m.source_id),
        lastPublishedAt: c.last_published_at,
        topic: c.topic,
        region: c.region,
      },
      briefDate,
      signals,
    )
    const shock = r.related.length ? { id: 'market_shock', label: 'Movimento extraordinário de mercado' } : null
    const override = r.override ?? shock
    return {
      ...c,
      relevance_score: r.score,
      relevance_components: r.components,
      hard_override: !!override,
      hard_override_reason: override?.label ?? null,
      geography: c.region,
      domain: DOMAIN_OF[c.topic] ?? 'other',
      metric_target: metricTarget(c.title),
      market_signals: r.related.map((s) => s.text),
    }
  })
}

const matches = (cell: (typeof COVERAGE)[number], c: EventCluster) =>
  (!cell.regions || cell.regions.includes(c.region)) && (!cell.notRegions || !cell.notRegions.includes(c.region)) && (!cell.topics || cell.topics.includes(c.topic))

export interface Selection {
  top: EventCluster[]
  watchlist: EventCluster[]
  tail: EventCluster[]
  coverage: CoverageCell[]
  /** All clusters with rank_bucket set (persist these). */
  all: EventCluster[]
}

/**
 * Selection: overrides first (best cluster of each override class), then by score with
 * topic diversity, then the coverage floor promotes the best eligible cluster of each
 * uncovered category. Overrides that do not fit the top go to the watchlist (never lost).
 */
export function selectClusters(scored: EventCluster[], limits: { topMax?: number; watchlistMax?: number } = {}): Selection {
  const topMax = limits.topMax ?? SELECTION.topMax
  const watchMax = limits.watchlistMax ?? SELECTION.watchlistMax
  const sorted = [...scored].sort((a, b) => b.relevance_score - a.relevance_score || b.sources.length - a.sources.length || a.id.localeCompare(b.id))
  const top: EventCluster[] = []
  const perTopic = new Map<string, number>()
  const add = (c: EventCluster) => {
    top.push(c)
    perTopic.set(c.topic, (perTopic.get(c.topic) ?? 0) + 1)
  }
  const inTop = (c: EventCluster) => top.includes(c)

  // 1. One cluster per override class (highest score), so no class is lost.
  const seenClass = new Set<string>()
  for (const c of sorted) {
    if (!c.hard_override || !c.hard_override_reason || seenClass.has(c.hard_override_reason) || top.length >= topMax) continue
    seenClass.add(c.hard_override_reason)
    add(c)
  }
  // 2. Fill by score, with topic diversity. Reserve room for the coverage floor.
  const reserve = SELECTION.coverageReserve
  for (const c of sorted) {
    if (top.length >= topMax - reserve) break
    if (inTop(c) || c.relevance_score < SELECTION.topMinScore) continue
    if ((perTopic.get(c.topic) ?? 0) >= SELECTION.maxPerTopic) continue
    add(c)
  }
  // 3. Coverage floor: promote the best eligible cluster for each uncovered cell.
  const coverage: CoverageCell[] = COVERAGE.map((cell) => {
    let hits = top.filter((c) => matches(cell, c))
    if (!hits.length) {
      const cand = sorted.find((c) => !inTop(c) && matches(cell, c) && c.relevance_score >= COVERAGE_MIN_SCORE)
      if (cand && top.length < topMax) {
        add(cand)
        hits = [cand]
      }
    }
    return {
      scope: cell.scope,
      id: cell.id,
      label: cell.label,
      covered: hits.length > 0,
      cluster_ids: hits.map((c) => c.id),
      note: hits.length ? null : `Nenhum evento coletado com relevância ≥ ${COVERAGE_MIN_SCORE} nesta categoria. Não preenchido artificialmente.`,
    }
  })
  // 4. Fill any remaining slots by score.
  for (const c of sorted) {
    if (top.length >= topMax) break
    if (!inTop(c) && c.relevance_score >= SELECTION.topMinScore) add(c)
  }
  top.sort((a, b) => b.relevance_score - a.relevance_score)
  const rest = sorted.filter((c) => !inTop(c))
  // Overrides that did not fit the top lead the watchlist.
  const watchlist = [...rest.filter((c) => c.hard_override), ...rest.filter((c) => !c.hard_override)].slice(0, watchMax)
  const tail = rest.filter((c) => !watchlist.includes(c))
  const bucket = new Map<string, EventCluster['rank_bucket']>([...top.map((c) => [c.id, 'top'] as const), ...watchlist.map((c) => [c.id, 'watchlist'] as const)])
  const all = sorted.map((c) => ({ ...c, rank_bucket: bucket.get(c.id) ?? 'tail' }))
  const withBucket = (list: EventCluster[]) => list.map((c) => all.find((x) => x.id === c.id)!)
  return { top: withBucket(top), watchlist: withBucket(watchlist), tail: withBucket(tail), coverage, all }
}

/** Convenience for Agent 1: score + select. */
export function rankClusters(clusters: EventCluster[], items: NewsItem[], facts: VerifiedFact[], briefDate: string) {
  const signals = marketSignals(facts)
  const selection = selectClusters(scoreClusters(clusters, items, briefDate, signals))
  return { ...selection, signals }
}
