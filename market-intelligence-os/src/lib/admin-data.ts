import 'server-only'
import type { AgentRun, IntelligenceSnapshot, ResearchRequest, VerifiedFact } from '../core/schemas'
import { toLocalDate, toLocalTime } from '../core/time'
import { diagnoseBrief, type Diagnosis } from '../engines/diagnosis'
import { computeSystemHealth, type SystemHealth } from '../engines/system-health'
import { getRepository } from '../storage/repository'

const AGENTS = ['market-intelligence', 'financial-intelligence', 'social-strategist', 'orchestrator'] as const
export type AgentKey = (typeof AGENTS)[number]

export interface AdminData {
  today: string
  date: string
  diagnosis: Diagnosis
  lastRuns: Record<AgentKey, AgentRun | null>
  runsForDate: AgentRun[]
  recentRuns: AgentRun[]
  lastPublished: IntelligenceSnapshot | null
  lastPublishedDate: string | null
  latestForDate: IntelligenceSnapshot | null
  versions: { id: string; version: number; generated_at: string; status: string }[]
  packetStatus: 'PENDING' | 'SUBMITTED' | 'EXPIRED' | null
  unavailableSources: { source: string; error: string }[]
  skippedSources: string[]
  unavailableFacts: VerifiedFact[]
  research: ResearchRequest[]
  storage: string
  health: SystemHealth
  error: string | null
}

export async function loadDiagnosis(date: string): Promise<Diagnosis | null> {
  try {
    const repo = getRepository()
    const today = toLocalDate(new Date())
    const [runs, versions, latest, packet] = await Promise.all([repo.getRuns({ briefDate: date, limit: 40 }), repo.getSnapshotVersions(date), repo.getLatestSnapshot(date), repo.getAnalysisPacket(date)])
    return diagnoseBrief({ date, nowLocal: toLocalTime(new Date()), isToday: date === today, runs, versions, latest, packetStatus: packet?.status ?? null })
  } catch {
    return null
  }
}

export async function loadAdmin(dateParam?: string): Promise<AdminData> {
  const today = toLocalDate(new Date())
  const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : today
  const repo = getRepository()
  const [recentRuns, runsForDate, versions, latestForDate, packet, dates, research, facts] = await Promise.all([
    repo.getRuns({ limit: 200 }),
    repo.getRuns({ briefDate: date, limit: 60 }),
    repo.getSnapshotVersions(date),
    repo.getLatestSnapshot(date),
    repo.getAnalysisPacket(date),
    repo.listSnapshotDates(),
    repo.getResearchRequests(),
    repo.getLatestFactsForDate(date),
  ])
  const lastRuns = Object.fromEntries(AGENTS.map((a) => [a, recentRuns.find((r) => r.agent === a) ?? null])) as Record<AgentKey, AgentRun | null>

  // Last published snapshot across dates (newest date first).
  let lastPublished: IntelligenceSnapshot | null = null
  let lastPublishedDate: string | null = null
  for (const d of dates.slice(0, 30)) {
    const s = await repo.getLatestPublishedSnapshot(d)
    if (s) {
      lastPublished = s
      lastPublishedDate = d
      break
    }
  }

  // Sources: latest Agent 1 run for the date (fallback: latest overall).
  const a1 = runsForDate.find((r) => r.agent === 'market-intelligence') ?? lastRuns['market-intelligence']
  const unavailableSources = (a1?.sources ?? []).filter((s) => !s.ok).map((s) => ({ source: s.source_id, error: s.error ?? 'sem resposta' }))
  const skippedSources = ((a1?.execution_metadata?.skipped_sources as string[] | undefined) ?? []).slice(0, 60)
  const diagnosis = diagnoseBrief({ date, nowLocal: toLocalTime(new Date()), isToday: date === today, runs: runsForDate, versions, latest: latestForDate, packetStatus: packet?.status ?? null })

  const healthFacts = facts.length ? facts : lastPublishedDate ? await repo.getLatestFactsForDate(lastPublishedDate) : []
  const health = computeSystemHealth({ now: new Date(), runs: recentRuns, lastPublished, facts: healthFacts, packetStatus: packet?.status ?? null })

  return {
    today,
    date,
    diagnosis,
    health,
    lastRuns,
    runsForDate,
    recentRuns: recentRuns.slice(0, 40),
    lastPublished,
    lastPublishedDate,
    latestForDate,
    versions,
    packetStatus: packet?.status ?? null,
    unavailableSources,
    skippedSources,
    unavailableFacts: facts.filter((f) => f.verification_status === 'UNAVAILABLE' || f.verification_status === 'REJECTED' || f.verification_status === 'CONFLICT'),
    research: research.slice(0, 20),
    storage: repo.store.kind,
    error: null,
  }
}
