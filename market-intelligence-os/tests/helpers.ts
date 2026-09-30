import type { EventCluster, NewsItem, RawObservation, VerifiedFact } from '../src/core/schemas'
import { MemoryStore } from '../src/storage/store'
import { Repository, setRepository } from '../src/storage/repository'

export const NOW = new Date('2026-09-29T08:00:00Z') // 05:00 BRT
export const DATE = '2026-09-29'

export function freshRepo() {
  const repo = new Repository(new MemoryStore())
  setRepository(repo)
  return repo
}

export function obs(p: Partial<RawObservation> & Pick<RawObservation, 'sourceId' | 'metric' | 'value'>): RawObservation {
  return {
    category: 'MARKET',
    unit: 'pts',
    referencePeriod: '2026-09-28',
    asOf: '2026-09-28T20:00:00Z',
    retrievedAt: NOW.toISOString(),
    url: `https://example.org/${p.sourceId}/${p.metric}`,
    ...p,
  }
}

export function news(p: Partial<NewsItem> & Pick<NewsItem, 'id' | 'headline' | 'source_id'>): NewsItem {
  return {
    original_summary: '',
    published_at: '2026-09-28T22:00:00Z',
    retrieved_at: NOW.toISOString(),
    source: p.source_id,
    url: `https://news.example/${p.id}`,
    topic: 'monetary_policy',
    region: 'US',
    importance: 60,
    market_relevance: 60,
    uhnw_relevance: 30,
    social_relevance: 40,
    verification_status: 'UNVERIFIED',
    event_cluster_id: null,
    brief_date: DATE,
    ...p,
  }
}

export function fact(p: Partial<VerifiedFact> & Pick<VerifiedFact, 'id' | 'metric'>): VerifiedFact {
  return {
    category: 'MARKET',
    label: p.metric,
    region: 'US',
    value: 100,
    unit: 'pts',
    reference_period: '2026-09-28',
    as_of: '2026-09-28T20:00:00Z',
    retrieved_at: NOW.toISOString(),
    primary_source: 'stooq',
    secondary_source: 'fred',
    primary_url: 'https://a.example',
    secondary_url: 'https://b.example',
    verification_status: 'VERIFIED',
    confidence: 'HIGH',
    notes: null,
    change_pct: null,
    previous_value: null,
    market_status: 'CLOSED',
    timezone: 'America/New_York',
    source_fallback: true,
    single_source: false,
    is_stale: false,
    verification_method: 'independent_crosscheck',
    session: null,
    released_at: null, instrument: null,
    brief_date: DATE,
    run_id: 'run_test',
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
    ...p,
  }
}

export function cluster(p: Partial<EventCluster> & Pick<EventCluster, 'id' | 'title'>): EventCluster {
  return {
    topic: 'monetary_policy',
    region: 'US',
    first_published_at: '2026-09-28T20:00:00Z',
    last_published_at: '2026-09-28T21:00:00Z',
    item_ids: [],
    sources: [{ source: 'BBC', url: 'https://bbc.example/1', headline: p.title }],
    importance: 70,
    market_relevance: 70,
    uhnw_relevance: 40,
    social_relevance: 60,
    verification_status: 'VERIFIED',
    relevance_score: 70,
    relevance_components: {},
    hard_override: false,
    hard_override_reason: null,
    geography: 'US',
    domain: 'monetary',
    metric_target: null,
    market_signals: [],
    rank_bucket: 'top',
    brief_date: DATE,
    ...p,
  }
}
