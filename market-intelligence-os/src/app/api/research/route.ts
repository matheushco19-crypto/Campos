import { z } from 'zod'
import { AgentName, Level } from '@/core/schemas'
import { createResearchRequest, processResearchRequest } from '@/engines/research-broker'
import { getRepository } from '@/storage/repository'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const Body = z.object({
  question: z.string().trim().min(5).max(400),
  requested_by: AgentName.default('orchestrator'),
  metric: z.string().max(60).nullable().optional(),
  priority: Level.optional(),
})

export async function GET() {
  return Response.json({ requests: await getRepository().getResearchRequests() })
}

/** ON_DEMAND_RESEARCH: create + process immediately through Agent 1. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Pergunta inválida (5–400 caracteres).' }, { status: 400 })
  const repo = getRepository()
  const r = await createResearchRequest(repo, parsed.data)
  const done = await processResearchRequest(repo, r)
  return Response.json({ request: done })
}
