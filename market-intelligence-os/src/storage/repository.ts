import { getEnv, storageMode } from '../core/env'
import type {
  AgentRun,
  CalendarEvent,
  ContentOpportunity,
  EventCluster,
  IntelligenceSnapshot,
  NewsItem,
  RawObservation,
  ResearchRequest,
  SocialPostMetrics,
  VerifiedFact,
} from '../core/schemas'
import { FileStore } from './file-store'
import { MemoryStore, type Row, type Store } from './store'
import { SupabaseStore } from './supabase-store'

export interface AnalysisPacket {
  id: string
  date: string
  run_id: string
  created_at: string
  status: 'PENDING' | 'SUBMITTED' | 'EXPIRED'
  packet: Record<string, unknown>
  submitted_at: string | null
}

export interface StrategyReport {
  id: string
  week_start: string
  generated_at: string
  mode: 'deterministic' | 'anthropic_api' | 'claude_code'
  report: Record<string, unknown>
}

export type RawObservationRow = RawObservation & { id: string; run_id: string; brief_date: string }

/** Typed repository over the storage layer. All timestamps are UTC ISO strings. */
export class Repository {
  constructor(readonly store: Store) {}

  /* facts */
  upsertFacts(facts: VerifiedFact[]) {
    return this.store.upsert('verified_facts', facts as unknown as Row[])
  }
  getFactsForDate(briefDate: string) {
    return this.store.select<VerifiedFact>('verified_facts', { eq: { brief_date: briefDate } })
  }
  /** Latest fact per metric for a brief date (several runs may exist for the same day). */
  async getLatestFactsForDate(briefDate: string): Promise<VerifiedFact[]> {
    const rows = await this.getFactsForDate(briefDate)
    const byMetric = new Map<string, VerifiedFact>()
    for (const r of rows) {
      const cur = byMetric.get(r.metric)
      if (!cur || r.updated_at > cur.updated_at) byMetric.set(r.metric, r)
    }
    return [...byMetric.values()]
  }
  getFactsByIds(ids: string[]) {
    return ids.length ? this.store.select<VerifiedFact>('verified_facts', { in: ['id', ids] }) : Promise.resolve([])
  }
  /** Latest VERIFIED/UNVERIFIED fact for a metric strictly before `beforeDate` (used for change calc & staleness). */
  async getPreviousFact(metric: string, beforeDate: string): Promise<VerifiedFact | null> {
    const rows = await this.store.select<VerifiedFact>('verified_facts', {
      eq: { metric },
      lte: ['brief_date', beforeDate],
      order: { field: 'brief_date', ascending: false },
      limit: 10,
    })
    return rows.find((r) => r.brief_date < beforeDate && r.value !== null) ?? null
  }
  getFactHistory(metric: string, limit = 90) {
    return this.store.select<VerifiedFact>('verified_facts', { eq: { metric }, order: { field: 'brief_date', ascending: false }, limit })
  }

  /* raw observations (audit trail, never used directly by agents 2/3) */
  insertRawObservations(rows: RawObservationRow[]) {
    return this.store.upsert('raw_observations', rows as unknown as Row[])
  }
  getRawObservations(briefDate: string) {
    return this.store.select<RawObservationRow>('raw_observations', { eq: { brief_date: briefDate } })
  }

  /* news */
  upsertNews(items: NewsItem[]) {
    return this.store.upsert('news_items', items as unknown as Row[])
  }
  getNews(briefDate: string) {
    return this.store.select<NewsItem>('news_items', { eq: { brief_date: briefDate } })
  }
  upsertClusters(clusters: EventCluster[]) {
    return this.store.upsert('event_clusters', clusters as unknown as Row[])
  }
  getClusters(briefDate: string) {
    return this.store.select<EventCluster>('event_clusters', { eq: { brief_date: briefDate }, order: { field: 'importance', ascending: false } })
  }

  /* calendar */
  upsertEvents(events: CalendarEvent[]) {
    return this.store.upsert('calendar_events', events as unknown as Row[])
  }
  getEvents(from: string, to: string) {
    return this.store.select<CalendarEvent>('calendar_events', { gte: ['date', from], lte: ['date', to], order: { field: 'date', ascending: true } })
  }

  /* research */
  saveResearchRequest(r: ResearchRequest) {
    return this.store.upsert('research_requests', [r as unknown as Row])
  }
  getResearchRequests(status?: ResearchRequest['status']) {
    return this.store.select<ResearchRequest>('research_requests', { eq: status ? { status } : undefined, order: { field: 'created_at', ascending: false }, limit: 200 })
  }

  /* observability */
  saveRun(run: AgentRun) {
    return this.store.upsert('agent_runs', [run as unknown as Row])
  }
  getRuns(opts: { briefDate?: string; parentRunId?: string; limit?: number } = {}) {
    const eq: Record<string, string> = {}
    if (opts.briefDate) eq.brief_date = opts.briefDate
    if (opts.parentRunId) eq.parent_run_id = opts.parentRunId
    return this.store.select<AgentRun>('agent_runs', { eq, order: { field: 'started_at', ascending: false }, limit: opts.limit ?? 50 })
  }
  async getRun(runId: string) {
    return (await this.store.select<AgentRun>('agent_runs', { eq: { run_id: runId } }))[0] ?? null
  }

  /* snapshots — append-only; every run creates a new version */
  async insertSnapshot(snapshot: Omit<IntelligenceSnapshot, 'version' | 'id'>): Promise<IntelligenceSnapshot> {
    const existing = await this.getSnapshotVersions(snapshot.date)
    const version = (existing[0]?.version ?? 0) + 1
    const full: IntelligenceSnapshot = { ...snapshot, version, id: `snap_${snapshot.date}_v${version}` }
    await this.store.insert('intelligence_snapshots', [full as unknown as Row])
    return full
  }
  async getLatestSnapshot(date: string): Promise<IntelligenceSnapshot | null> {
    return (await this.store.select<IntelligenceSnapshot>('intelligence_snapshots', { eq: { date }, order: { field: 'version', ascending: false }, limit: 1 }))[0] ?? null
  }
  async getSnapshot(date: string, version: number): Promise<IntelligenceSnapshot | null> {
    return (await this.store.select<IntelligenceSnapshot>('intelligence_snapshots', { eq: { date, version } }))[0] ?? null
  }
  getSnapshotVersions(date: string) {
    return this.store.select<Pick<IntelligenceSnapshot, 'id' | 'version' | 'generated_at' | 'status'>>('intelligence_snapshots', {
      eq: { date },
      order: { field: 'version', ascending: false },
      select: ['id', 'version', 'generated_at', 'status'],
    })
  }
  async listSnapshotDates(): Promise<string[]> {
    const rows = await this.store.select<{ date: string }>('intelligence_snapshots', { select: ['date'], order: { field: 'date', ascending: false }, limit: 2000 })
    return [...new Set(rows.map((r) => r.date))]
  }

  /* analysis handoff (Claude Code mode) */
  saveAnalysisPacket(p: AnalysisPacket) {
    return this.store.upsert('analysis_packets', [p as unknown as Row])
  }
  async getAnalysisPacket(date: string): Promise<AnalysisPacket | null> {
    return (await this.store.select<AnalysisPacket>('analysis_packets', { eq: { date }, order: { field: 'created_at', ascending: false }, limit: 1 }))[0] ?? null
  }
  getPendingPackets() {
    return this.store.select<AnalysisPacket>('analysis_packets', { eq: { status: 'PENDING' }, order: { field: 'created_at', ascending: false } })
  }

  /* social */
  upsertSocialPosts(posts: SocialPostMetrics[]) {
    return this.store.upsert('social_posts', posts as unknown as Row[])
  }
  getSocialPosts() {
    return this.store.select<SocialPostMetrics>('social_posts', { order: { field: 'published_at', ascending: false }, limit: 1000 })
  }
  upsertOpportunities(o: ContentOpportunity[]) {
    return this.store.upsert('content_opportunities', o as unknown as Row[])
  }
  getOpportunities(from: string, to: string) {
    return this.store.select<ContentOpportunity>('content_opportunities', { gte: ['target_date', from], lte: ['target_date', to], order: { field: 'target_date', ascending: true } })
  }
  saveStrategyReport(r: StrategyReport) {
    return this.store.upsert('strategy_reports', [r as unknown as Row])
  }
  async getLatestStrategyReport(): Promise<StrategyReport | null> {
    return (await this.store.select<StrategyReport>('strategy_reports', { order: { field: 'generated_at', ascending: false }, limit: 1 }))[0] ?? null
  }
}

let singleton: Repository | null = null

export function getRepository(): Repository {
  if (singleton) return singleton
  const env = getEnv()
  const mode = storageMode(env)
  if (mode === 'supabase') {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('MI_STORAGE=supabase requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
    singleton = new Repository(new SupabaseStore(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY))
  } else if (mode === 'memory') {
    singleton = new Repository(new MemoryStore())
  } else {
    singleton = new Repository(new FileStore(env.MI_DATA_DIR))
  }
  return singleton
}

/** Tests only. */
export function setRepository(repo: Repository | null) {
  singleton = repo
}
