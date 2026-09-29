import { runMarketCloseRefresh } from '@/agents/orchestrator'
import { authorizeMachine } from '@/lib/auth'
import { getRepository } from '@/storage/repository'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/** MARKET_CLOSE_REFRESH — 21:30 UTC (18:30 BRT), weekdays. No LLM. */
export async function GET(req: Request) {
  const denied = authorizeMachine(req)
  if (denied) return denied
  const res = await runMarketCloseRefresh(getRepository())
  return Response.json(res.snapshot ? { ...res, snapshot: res.snapshot.id } : res)
}
