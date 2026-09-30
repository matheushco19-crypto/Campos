import { CORE_MARKETS } from '../../config/assets'
import { SOURCES } from '../../config/sources'
import type { AgentRun, IntelligenceSnapshot, VerifiedFact } from '../core/schemas'

/**
 * SYSTEM HEALTH (admin). Pure function over observability data.
 *  - FAILED: nothing usable — no snapshot published in 36h, or Agent 1 without a successful run in 36h,
 *    or no core market verified.
 *  - DEGRADED: something the user will notice — a core market UNAVAILABLE/CONFLICT, a stale snapshot,
 *    Agent 2/3 failing, or more than 25% of source calls failing.
 *  - A single secondary provider down is reported per provider, never as a global failure.
 */
export type HealthStatus = 'HEALTHY' | 'DEGRADED' | 'FAILED'

export interface ProviderHealth {
  source: string
  kind: string
  ok: number
  failed: number
  status: 'ok' | 'partial' | 'down'
  lastError: string | null
}

export interface SystemHealth {
  status: HealthStatus
  reasons: string[]
  lastSuccess: { agent1: string | null; agent2: string | null; agent3: string | null; markets: string | null; macro: string | null; news: string | null }
  lastPublished: { date: string; version: number; generated_at: string; mode: string; ageHours: number } | null
  facts: { VERIFIED: number; UNVERIFIED: number; UNAVAILABLE: number; CONFLICT: number }
  core: { verified: number; total: number; notVerified: { metric: string; status: string; method: string }[] }
  packet: { chars: number | null; estimatedTokens: number | null; status: string | null }
  marketProviders: { source: string; facts: number }[]
  providers: ProviderHealth[]
}

const OK_RUN = new Set(['SUCCESS', 'PARTIAL', 'AWAITING_ANALYSIS'])
/** Health ids are "<source>:<series>"; macro collectors use short prefixes. */
const PREFIX: Record<string, string> = { sgs: 'bcb-sgs', sidra: 'ibge-sidra', focus: 'bcb-focus' }
const sourceOf = (healthId: string) => {
  const p = healthId.split(':')[0]
  return PREFIX[p] ?? p
}
const kindOf = (healthId: string) => SOURCES.find((s) => s.id === sourceOf(healthId))?.kind ?? 'other'

export function computeSystemHealth(input: {
  now: Date
  runs: AgentRun[]
  lastPublished: IntelligenceSnapshot | null
  facts: VerifiedFact[]
  packetStatus: string | null
}): SystemHealth {
  const { now, runs } = input
  const byTime = [...runs].sort((a, b) => b.started_at.localeCompare(a.started_at))
  const lastOk = (agent: string) => byTime.find((r) => r.agent === agent && OK_RUN.has(r.status))?.started_at ?? null
  const a1Runs = byTime.filter((r) => r.agent === 'market-intelligence')
  const lastKindOk = (kind: string) => a1Runs.find((r) => r.sources.some((s) => s.ok && kindOf(s.source_id) === kind))?.started_at ?? null
  const hoursSince = (iso: string | null) => (iso ? (now.getTime() - Date.parse(iso)) / 3_600_000 : Infinity)

  const facts = { VERIFIED: 0, UNVERIFIED: 0, UNAVAILABLE: 0, CONFLICT: 0 }
  for (const f of input.facts) if (f.verification_status in facts) facts[f.verification_status as keyof typeof facts]++

  const coreFacts = CORE_MARKETS.map((m) => input.facts.find((f) => f.metric === m))
  const coreVerified = coreFacts.filter((f) => f?.verification_status === 'VERIFIED').length
  const notVerified = CORE_MARKETS.flatMap((m, i) => {
    const f = coreFacts[i]
    return f?.verification_status === 'VERIFIED' ? [] : [{ metric: m, status: f?.verification_status ?? 'UNAVAILABLE', method: f?.verification_method ?? 'unavailable' }]
  })

  const lastA1 = a1Runs[0]
  const providerMap = new Map<string, ProviderHealth>()
  for (const s of lastA1?.sources ?? []) {
    const id = sourceOf(s.source_id)
    const p = providerMap.get(id) ?? { source: id, kind: kindOf(id), ok: 0, failed: 0, status: 'ok' as const, lastError: null }
    if (s.ok) p.ok++
    else {
      p.failed++
      p.lastError = s.error
    }
    p.status = p.failed === 0 ? 'ok' : p.ok === 0 ? 'down' : 'partial'
    providerMap.set(id, p)
  }
  const providers = [...providerMap.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.source.localeCompare(b.source))
  const calls = providers.reduce((n, p) => n + p.ok + p.failed, 0)
  const failedCalls = providers.reduce((n, p) => n + p.failed, 0)

  const marketProviders = [...input.facts.filter((f) => f.category === 'MARKET' && f.primary_source).reduce((m, f) => m.set(f.primary_source!, (m.get(f.primary_source!) ?? 0) + 1), new Map<string, number>())]
    .map(([source, n]) => ({ source, facts: n }))
    .sort((a, b) => b.facts - a.facts)

  const lastFi = byTime.find((r) => r.agent === 'financial-intelligence')
  const meta = (lastFi?.execution_metadata ?? {}) as Record<string, unknown>
  const lp = input.lastPublished
  const age = lp ? hoursSince(lp.generated_at) : Infinity

  const failed: string[] = []
  const degraded: string[] = []
  if (!lp || age > 36) failed.push(lp ? `Último snapshot publicado há ${Math.round(age)} h.` : 'Nenhum snapshot publicado.')
  if (hoursSince(lastOk('market-intelligence')) > 36) failed.push('Agent 1 sem execução bem-sucedida nas últimas 36 h.')
  if (input.facts.length && coreVerified === 0) failed.push('Nenhum mercado core verificado.')
  if (lp && age > 26 && age <= 36) degraded.push(`Snapshot publicado há ${Math.round(age)} h (esperado: diário).`)
  const broken = notVerified.filter((n) => n.status === 'UNAVAILABLE' || n.status === 'CONFLICT' || n.status === 'REJECTED')
  if (broken.length) degraded.push(`Mercados core sem valor utilizável: ${broken.map((b) => `${b.metric} (${b.status})`).join(', ')}.`)
  for (const agent of ['financial-intelligence', 'social-strategist'] as const) {
    const last = byTime.find((r) => r.agent === agent)
    if (last?.status === 'FAILED') degraded.push(`Última execução de ${agent === 'financial-intelligence' ? 'Agent 2' : 'Agent 3'} falhou.`)
  }
  if (calls && failedCalls / calls > 0.25) degraded.push(`${failedCalls} de ${calls} consultas a fontes falharam na última coleta.`)

  return {
    status: failed.length ? 'FAILED' : degraded.length ? 'DEGRADED' : 'HEALTHY',
    reasons: [...failed, ...degraded],
    lastSuccess: {
      agent1: lastOk('market-intelligence'),
      agent2: lastOk('financial-intelligence'),
      agent3: lastOk('social-strategist'),
      markets: lastKindOk('market'),
      macro: lastKindOk('macro'),
      news: lastKindOk('news'),
    },
    lastPublished: lp ? { date: lp.date, version: lp.version, generated_at: lp.generated_at, mode: lp.analysis_mode, ageHours: Math.round(age * 10) / 10 } : null,
    facts,
    core: { verified: coreVerified, total: CORE_MARKETS.length, notVerified },
    packet: { chars: typeof meta.packet_chars === 'number' ? meta.packet_chars : null, estimatedTokens: typeof meta.packet_estimated_tokens === 'number' ? meta.packet_estimated_tokens : null, status: input.packetStatus },
    marketProviders,
    providers,
  }
}
