import type { Repository } from './repository'

/**
 * PERSISTENT JOB LOCK (table job_leases, unique on job_name + run_key).
 * A second request for the same run key never runs the job again: while the first
 * is RUNNING it is refused, and once COMPLETED it is skipped (cron duplicates).
 * An expired RUNNING lease or a FAILED one can be taken over, with compare-and-delete
 * so two takers can never both win.
 */
export interface JobLease {
  lease_id: string
  job_name: string
  run_key: string
  status: 'RUNNING' | 'COMPLETED' | 'FAILED'
  owner: string
  started_at: string
  expires_at: string
  completed_at: string | null
  result: Record<string, unknown> | null
}

export type LeaseResult = { acquired: true; lease: JobLease } | { acquired: false; reason: 'running' | 'completed'; lease: JobLease }

export const runKey = (job: string, date: string) => `${job}:${date}`
const leaseId = (job: string, key: string) => `${job}|${key}`

export async function acquireLease(
  repo: Repository,
  job: string,
  key: string,
  opts: { ttlMs?: number; now?: Date; owner?: string; allowRerunAfterComplete?: boolean } = {},
): Promise<LeaseResult> {
  const now = opts.now ?? new Date()
  const id = leaseId(job, key)
  const lease: JobLease = {
    lease_id: id,
    job_name: job,
    run_key: key,
    status: 'RUNNING',
    owner: opts.owner ?? `${process.pid}-${Math.random().toString(36).slice(2, 10)}`,
    started_at: now.toISOString(),
    expires_at: new Date(now.getTime() + (opts.ttlMs ?? 10 * 60_000)).toISOString(),
    completed_at: null,
    result: null,
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await repo.store.insert('job_leases', [lease as unknown as Record<string, unknown>])
      return { acquired: true, lease }
    } catch {
      const [current] = await repo.store.select<JobLease>('job_leases', { eq: { lease_id: id }, limit: 1 })
      if (!current) continue // released between insert and select: retry once
      const expired = current.status === 'RUNNING' && Date.parse(current.expires_at) < now.getTime()
      const takeover = expired || current.status === 'FAILED' || (current.status === 'COMPLETED' && opts.allowRerunAfterComplete)
      if (!takeover) return { acquired: false, reason: current.status === 'COMPLETED' ? 'completed' : 'running', lease: current }
      // Compare-and-delete on the exact lease we saw; losing the race means someone else took it.
      const removed = await repo.store.removeIf('job_leases', id, { owner: current.owner, started_at: current.started_at })
      if (!removed) {
        const [winner] = await repo.store.select<JobLease>('job_leases', { eq: { lease_id: id }, limit: 1 })
        if (winner) return { acquired: false, reason: 'running', lease: winner }
      }
    }
  }
  const [current] = await repo.store.select<JobLease>('job_leases', { eq: { lease_id: id }, limit: 1 })
  return { acquired: false, reason: 'running', lease: current ?? lease }
}

export async function releaseLease(repo: Repository, lease: JobLease, status: 'COMPLETED' | 'FAILED', result: Record<string, unknown> | null = null, now = new Date()) {
  await repo.store.upsert('job_leases', [{ ...lease, status, completed_at: now.toISOString(), result } as unknown as Record<string, unknown>])
}

/** Runs `fn` under the lease; returns null (and the reason) when another request holds or already completed it. */
export async function withJobLease<T extends Record<string, unknown>>(
  repo: Repository,
  job: string,
  key: string,
  fn: () => Promise<T>,
  opts: { ttlMs?: number; allowRerunAfterComplete?: boolean; isFailure?: (r: T) => boolean } = {},
): Promise<{ ran: true; result: T } | { ran: false; reason: 'running' | 'completed'; lease: JobLease }> {
  const got = await acquireLease(repo, job, key, opts)
  if (!got.acquired) return { ran: false, reason: got.reason, lease: got.lease }
  try {
    const result = await fn()
    await releaseLease(repo, got.lease, opts.isFailure?.(result) ? 'FAILED' : 'COMPLETED', result)
    return { ran: true, result }
  } catch (e) {
    await releaseLease(repo, got.lease, 'FAILED', { error: e instanceof Error ? e.message : String(e) })
    throw e
  }
}
