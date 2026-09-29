import { runWeeklySocialStrategy } from '@/agents/orchestrator'
import { authorizeMachine } from '@/lib/auth'
import { getRepository } from '@/storage/repository'

export const dynamic = 'force-dynamic'
export const maxDuration = 180

/** WEEKLY_SOCIAL_STRATEGY — Sundays 11:00 UTC (08:00 BRT). */
export async function GET(req: Request) {
  const denied = authorizeMachine(req)
  if (denied) return denied
  const r = await runWeeklySocialStrategy(getRepository())
  return Response.json({ run_id: r.runId, status: r.status, opportunities: r.opportunities.length })
}
