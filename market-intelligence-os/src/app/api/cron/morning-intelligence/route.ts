import { runMorningIntelligence } from '@/agents/orchestrator'
import { toLocalDate } from '@/core/time'
import { authorizeMachine } from '@/lib/auth'
import { runKey, withJobLease } from '@/storage/leases'
import { getRepository } from '@/storage/repository'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * MORNING_INTELLIGENCE — Vercel Cron "0 8 * * *" (UTC). On the Hobby plan the job fires at
 * some point inside that hour: a 05:00–05:59 BRT window, not exactly 05:00. Active only after a
 * production deploy. A duplicate invocation for the same day is skipped by the job_leases lock.
 */
export async function GET(req: Request) {
  const denied = authorizeMachine(req)
  if (denied) return denied
  const repo = getRepository()
  const date = toLocalDate(new Date())
  const out = await withJobLease(repo, 'MORNING_INTELLIGENCE', runKey('MORNING_INTELLIGENCE', date), async () => {
    const res = await runMorningIntelligence(repo, { job: 'MORNING_INTELLIGENCE', date })
    return { run_id: res.runId, date: res.date, status: res.status, stages: res.stages, snapshot: res.snapshot?.id ?? null }
  }, { isFailure: (r) => r.status === 'FAILED' })
  if (!out.ran) return Response.json({ skipped: true, reason: out.reason, run_key: out.lease.run_key, started_at: out.lease.started_at }, { status: 200 })
  return Response.json(out.result, { status: out.result.status === 'FAILED' ? 500 : 200 })
}
