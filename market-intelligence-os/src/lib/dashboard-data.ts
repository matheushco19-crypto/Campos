import 'server-only'
import { ASSETS } from '../../config/assets'
import type { AgentRun, CalendarEvent, IntelligenceSnapshot, ResearchRequest, VerifiedFact } from '../core/schemas'
import { addDays, isIsoDate, toLocalDate } from '../core/time'
import { getRepository, type StrategyReport } from '../storage/repository'

export interface DashboardData {
  date: string
  today: string
  availableDates: string[]
  prevDate: string | null
  nextDate: string | null
  snapshot: IntelligenceSnapshot | null
  versions: { id: string; version: number; generated_at: string; status: string }[]
  facts: VerifiedFact[]
  history: Record<string, { date: string; value: number }[]>
  compare: { date: string; snapshot: IntelligenceSnapshot | null } | null
  previous: IntelligenceSnapshot | null
  events: CalendarEvent[]
  runs: AgentRun[]
  research: ResearchRequest[]
  strategy: StrategyReport | null
  storage: string
  error: string | null
}

export async function loadDashboard(params: { date?: string; v?: string; compare?: string }): Promise<DashboardData> {
  const today = toLocalDate(new Date())
  const empty = (error: string | null): DashboardData => ({
    date: params.date && isIsoDate(params.date) ? params.date : today, today, availableDates: [], prevDate: null, nextDate: null, snapshot: null, versions: [],
    facts: [], history: {}, compare: null, previous: null, events: [], runs: [], research: [], strategy: null, storage: 'unknown', error,
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
    const idx = availableDates.indexOf(date)
    // availableDates is sorted descending.
    const prevDate = idx >= 0 ? availableDates[idx + 1] ?? null : availableDates.find((d) => d < date) ?? null
    const nextDate = idx > 0 ? availableDates[idx - 1] : idx === -1 ? [...availableDates].reverse().find((d) => d > date) ?? null : null
    const version = params.v ? Number(params.v) : null
    const [snapshot, versions, facts, events, runs, research, strategy] = await Promise.all([
      version ? repo.getSnapshot(date, version) : repo.getLatestSnapshot(date),
      repo.getSnapshotVersions(date),
      repo.getLatestFactsForDate(date),
      repo.getEvents(date, addDays(date, 45)),
      repo.getRuns({ briefDate: date, limit: 40 }),
      repo.getResearchRequests(),
      repo.getLatestStrategyReport(),
    ])
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
    const previous = prevDate ? await repo.getLatestSnapshot(prevDate) : null
    return { date, today, availableDates, prevDate, nextDate, snapshot, versions, facts, history, compare, previous, events, runs, research: research.slice(0, 30), strategy, storage: repo.store.kind, error: null }
  } catch (e) {
    return { ...empty(e instanceof Error ? e.message : String(e)), storage: repo.store.kind }
  }
}
