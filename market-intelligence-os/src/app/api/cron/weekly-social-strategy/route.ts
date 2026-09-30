import { runWeeklySocialStrategy } from '@/agents/orchestrator'
import { toLocalDate } from '@/core/time'
import { authorizeMachine } from '@/lib/auth'
import { runKey, withJobLease } from '@/storage/leases'
import { getRepository } from '@/storage/repository'

export const dynamic = 'force-dynamic'
export const maxDuration = 180

/** WEEKLY_SOCIAL_STRATEGY — "0 11 * * 0" (UTC); on Hobby it fires inside that hour (Sundays 08:00–08:59 BRT). */
export async function GET(req: Request) {
  const denied = authorizeMachine(req)
  if (denied) return denied
  const repo = getRepository()
  const out = await withJobLease(repo, 'WEEKLY_SOCIAL_STRATEGY', runKey('WEEKLY_SOCIAL_STRATEGY', toLocalDate(new Date())), async () => {
    const r = await runWeeklySocialStrategy(repo)
    return { run_id: r.runId, status: r.status, opportunities: r.opportunities.length }
  }, { isFailure: (r) => r.status === 'FAILED' })
  if (!out.ran) return Response.json({ skipped: true, reason: out.reason, run_key: out.lease.run_key })
  return Response.json(out.result)
}
