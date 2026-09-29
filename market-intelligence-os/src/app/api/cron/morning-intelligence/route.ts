import { runMorningIntelligence } from '@/agents/orchestrator'
import { authorizeMachine } from '@/lib/auth'
import { getRepository } from '@/storage/repository'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** MORNING_INTELLIGENCE — Vercel Cron 08:00 UTC = 05:00 America/Sao_Paulo. */
export async function GET(req: Request) {
  const denied = authorizeMachine(req)
  if (denied) return denied
  const res = await runMorningIntelligence(getRepository(), { job: 'MORNING_INTELLIGENCE' })
  return Response.json({ run_id: res.runId, date: res.date, status: res.status, stages: res.stages, snapshot: res.snapshot?.id ?? null }, { status: res.status === 'FAILED' ? 500 : 200 })
}
