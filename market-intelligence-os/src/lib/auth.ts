import 'server-only'
import { timingSafeEqual } from 'node:crypto'
import { getEnv } from '../core/env'

const safeEq = (a: string, b: string) => {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

/**
 * Machine endpoints (cron, analysis hand-off) require `Authorization: Bearer $CRON_SECRET`.
 * Vercel Cron sends this header automatically when CRON_SECRET is set.
 * Without CRON_SECRET, only local development (non-production) is allowed.
 */
export function authorizeMachine(req: Request): Response | null {
  const secret = getEnv().CRON_SECRET
  if (!secret) {
    if (process.env.NODE_ENV === 'production' || process.env.VERCEL) return Response.json({ error: 'CRON_SECRET not configured' }, { status: 503 })
    return null
  }
  const header = req.headers.get('authorization') ?? ''
  if (!safeEq(header, `Bearer ${secret}`)) return Response.json({ error: 'unauthorized' }, { status: 401 })
  return null
}

export { safeEq }
