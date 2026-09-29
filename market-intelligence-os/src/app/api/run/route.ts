import { runMorningIntelligence } from '@/agents/orchestrator'
import { toLocalDate } from '@/core/time'
import { getRepository } from '@/storage/repository'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

let running = false

/** Manual "RUN MORNING INTELLIGENCE NOW" from the dashboard (protected by dashboard auth). */
export async function POST(req: Request) {
  if (req.headers.get('origin') && new URL(req.headers.get('origin')!).host !== new URL(req.url).host) return Response.json({ error: 'forbidden' }, { status: 403 })
  if (running) return Response.json({ error: 'Já existe uma execução em andamento' }, { status: 409 })
  running = true
  try {
    const repo = getRepository()
    const recent = (await repo.getRuns({ briefDate: toLocalDate(new Date()), limit: 5 })).find((r) => r.agent === 'orchestrator' && Date.now() - Date.parse(r.started_at) < 120_000)
    if (recent) return Response.json({ error: 'Execução iniciada há menos de 2 minutos' }, { status: 429 })
    const res = await runMorningIntelligence(repo, { job: 'MORNING_INTELLIGENCE' })
    return Response.json({ run_id: res.runId, status: res.status, snapshot: res.snapshot ? `v${res.snapshot.version}` : null, stages: res.stages })
  } finally {
    running = false
  }
}
