import 'server-only'
import { ASSETS } from '../../config/assets'
import type { CalendarEvent, ContentOpportunity, IntelligenceSnapshot, VerifiedFact } from '../core/schemas'
import { addDays, isIsoDate, toLocalDate } from '../core/time'
import { summarize } from '../social/metrics'
import { getRepository, type StrategyReport } from '../storage/repository'
import { diffVersions, type VersionDiff } from './version-diff'

export interface PerformanceSummary {
  posts: number
  lastPublished: string | null
  medianReach: number | null
  medianEngagementRate: number | null
  medianSaveRate: number | null
  byFormat: { format: string; n: number; efficiency: number | null }[]
}

export interface DashboardData {
  date: string
  today: string
  availableDates: string[]
  prevDate: string | null
  nextDate: string | null
  snapshot: IntelligenceSnapshot | null
  /** Set when the shown version is not the newest one (e.g. a newer FAILED_QC or AWAITING_ANALYSIS). */
  newerUnpublished: { version: number; status: string } | null
  /** Agent 2 hand-off state for the date: PENDING = waiting for the Claude Code routine. */
  analysisPacketStatus: 'PENDING' | 'SUBMITTED' | null
  versions: { id: string; version: number; generated_at: string; status: string }[]
  versionDiff: VersionDiff | null
  facts: VerifiedFact[]
  history: Record<string, { date: string; value: number }[]>
  compare: { date: string; snapshot: IntelligenceSnapshot | null } | null
  previous: IntelligenceSnapshot | null
  events: CalendarEvent[]
  pipeline: (ContentOpportunity & { event_name: string | null })[]
  performance: PerformanceSummary
  strategy: StrategyReport | null
  storage: string
  error: string | null
}

type Params = { date?: string; v?: string; compare?: string; cv?: string }

export async function loadDashboard(params: Params): Promise<DashboardData> {
  const today = toLocalDate(new Date())
  const empty = (error: string | null): DashboardData => ({
    date: params.date && isIsoDate(params.date) ? params.date : today,
    today,
    availableDates: [],
    prevDate: null,
    nextDate: null,
    snapshot: null,
    newerUnpublished: null,
    analysisPacketStatus: null,
    versions: [],
    versionDiff: null,
    facts: [],
    history: {},
    compare: null,
    previous: null,
    events: [],
    pipeline: [],
    performance: { posts: 0, lastPublished: null, medianReach: null, medianEngagementRate: null, medianSaveRate: null, byFormat: [] },
    strategy: null,
    storage: 'unknown',
    error,
  })
  let repo
  try {
    repo = getRepository()
  } catch (e) {
    return empty(e instanceof Error ? e.message : String(e))
  }
  try {
    const availableDates = await repo.listSnapshotDates()
    const requested = params.date && isIsoDate(params.date) ? params.date : null
    const date = requested ?? (availableDates.includes(today) ? today : availableDates[0] ?? today)
    const dayOfWeek = new Date(`${date}T12:00:00Z`).getUTCDay()
    const weekStart = addDays(date, -dayOfWeek)
    const idx = availableDates.indexOf(date)
    // availableDates is sorted descending.
    const prevDate = idx >= 0 ? availableDates[idx + 1] ?? null : availableDates.find((d) => d < date) ?? null
    const nextDate = idx > 0 ? availableDates[idx - 1] : idx === -1 ? [...availableDates].reverse().find((d) => d > date) ?? null : null
    const version = params.v ? Number(params.v) : null
    const [chosen, latest, versions, facts, events, strategy, posts] = await Promise.all([
      version ? repo.getSnapshot(date, version) : repo.getLatestPublishedSnapshot(date),
      repo.getLatestSnapshot(date),
      repo.getSnapshotVersions(date),
      repo.getLatestFactsForDate(date),
      repo.getEvents(weekStart, addDays(weekStart, 45)),
      repo.getLatestStrategyReport(),
      repo.getSocialPosts(),
    ])
    // Without an explicit version, show the latest published one; fall back to the newest version.
    const snapshot = chosen ?? (version ? null : latest)
    const newerUnpublished = !version && snapshot && latest && latest.version > snapshot.version ? { version: latest.version, status: latest.status } : null

    const history: DashboardData['history'] = {}
    await Promise.all(
      ASSETS.filter((a) => a.enabled).map(async (a) => {
        const rows = await repo.getFactHistory(a.metric, 120)
        const byDate = new Map<string, { date: string; value: number }>()
        for (const r of rows) if (r.value !== null && r.brief_date <= date && !byDate.has(r.brief_date)) byDate.set(r.brief_date, { date: r.brief_date, value: r.value })
        history[a.metric] = [...byDate.values()].sort((x, y) => x.date.localeCompare(y.date)).slice(-30)
      }),
    )
    const compare = params.compare && isIsoDate(params.compare) ? { date: params.compare, snapshot: await repo.getLatestSnapshot(params.compare) } : null
    const previous = prevDate ? (await repo.getLatestPublishedSnapshot(prevDate)) ?? (await repo.getLatestSnapshot(prevDate)) : null

    // Version comparison: explicit ?cv=, otherwise nothing (the History section offers the links).
    let versionDiff: VersionDiff | null = null
    if (snapshot && params.cv) {
      const other = await repo.getSnapshot(date, Number(params.cv))
      if (other && other.version !== snapshot.version) versionDiff = diffVersions(other, snapshot)
    }

    // Social pipeline: what should be produced in the next 7 days.
    const eventName = new Map(events.map((e) => [e.id, e.name]))
    const pipeline = (snapshot?.content_opportunities ?? [])
      .filter((o) => o.target_date >= date && o.target_date <= addDays(date, 7) && o.status !== 'DISCARDED')
      .sort((a, b) => a.target_date.localeCompare(b.target_date))
      .map((o) => ({ ...o, event_name: o.event_id ? eventName.get(o.event_id) ?? null : null }))

    const summary = posts.length ? summarize(posts) : null
    // Only imported metrics are shown; nothing is estimated when there is no import.
    const performance: PerformanceSummary = {
      posts: posts.length,
      lastPublished: posts[0]?.published_at ?? null,
      medianReach: summary?.median_reach ?? null,
      medianEngagementRate: summary?.median_engagement_rate ?? null,
      medianSaveRate: summary?.median_save_rate ?? null,
      byFormat: summary ? Object.entries(summary.by_format).filter(([, v]) => v.n > 0).map(([format, v]) => ({ format, n: v.n, efficiency: v.median_efficiency })) : [],
    }

    const packet = await repo.getAnalysisPacket(date).catch(() => null)
    const analysisPacketStatus = packet ? (packet.status === 'SUBMITTED' ? 'SUBMITTED' : 'PENDING') : null
    return { date, today, availableDates, prevDate, nextDate, snapshot, newerUnpublished, analysisPacketStatus, versions, versionDiff, facts, history, compare, previous, events, pipeline, performance, strategy, storage: repo.store.kind, error: null }
  } catch (e) {
    return { ...empty(e instanceof Error ? e.message : String(e)), storage: repo.store.kind }
  }
}
