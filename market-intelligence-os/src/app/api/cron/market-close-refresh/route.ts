import { runMarketCloseRefresh } from '@/agents/orchestrator'
import { toLocalDate } from '@/core/time'
import { authorizeMachine } from '@/lib/auth'
import { runKey, withJobLease } from '@/storage/leases'
import { getRepository } from '@/storage/repository'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/** MARKET_CLOSE_REFRESH — "30 21 * * 1-5" (UTC); on Hobby it fires inside the 21:00 UTC hour (18:00–18:59 BRT). No LLM. */
export async function GET(req: Request) {
  const denied = authorizeMachine(req)
  if (denied) return denied
  const repo = getRepository()
  const out = await withJobLease(repo, 'MARKET_CLOSE_REFRESH', runKey('MARKET_CLOSE_REFRESH', toLocalDate(new Date())), async () => {
    const res = await runMarketCloseRefresh(repo)
    return { run_id: res.runId, date: res.date, status: res.status, stages: res.stages, snapshot: res.snapshot?.id ?? null }
  }, { ttlMs: 5 * 60_000, isFailure: (r) => r.status === 'FAILED' })
  if (!out.ran) return Response.json({ skipped: true, reason: out.reason, run_key: out.lease.run_key })
  return Response.json(out.result)
}
