import { runMorningIntelligence } from '@/agents/orchestrator'
import { toLocalDate } from '@/core/time'
import { runKey, withJobLease } from '@/storage/leases'
import { getRepository } from '@/storage/repository'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Manual "RUN MORNING INTELLIGENCE NOW" (protected by dashboard auth). Shares the persistent
 * job_leases lock with the cron: a run already in progress (any instance) is refused. After a
 * completed run a manual re-run is allowed and creates a new snapshot version (append-only).
 */
export async function POST(req: Request) {
  if (req.headers.get('origin') && new URL(req.headers.get('origin')!).host !== new URL(req.url).host) return Response.json({ error: 'forbidden' }, { status: 403 })
  const repo = getRepository()
  const date = toLocalDate(new Date())
  const liveQuote = new URL(req.url).searchParams.get('live') === '1'
  const out = await withJobLease(repo, 'MORNING_INTELLIGENCE', runKey('MORNING_INTELLIGENCE', date), async () => {
    const res = await runMorningIntelligence(repo, { job: 'MORNING_INTELLIGENCE', date, liveQuote })
    return { run_id: res.runId, status: res.status, snapshot: res.snapshot ? `v${res.snapshot.version}` : null, stages: res.stages }
  }, { allowRerunAfterComplete: true, isFailure: (r) => r.status === 'FAILED' })
  if (!out.ran) return Response.json({ error: `Já existe uma execução em andamento (desde ${out.lease.started_at})` }, { status: 409 })
  return Response.json(out.result)
}
