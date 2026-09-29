import { z } from 'zod'
import { FINANCIAL_INTELLIGENCE_INSTRUCTIONS } from '@/agents/financial-intelligence'
import { submitAnalysis } from '@/agents/orchestrator'
import { AnalysisOutput } from '@/core/schemas'
import { isIsoDate, toLocalDate } from '@/core/time'
import { authorizeMachine } from '@/lib/auth'
import { getRepository } from '@/storage/repository'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Claude Code hand-off (Claude Pro/Max, no API key):
 *  GET  → pending analysis packet + instructions + JSON schema
 *  POST → { date, analysis } → validated, QC'd and published as a new snapshot version
 */
export async function GET(req: Request) {
  const denied = authorizeMachine(req)
  if (denied) return denied
  const date = new URL(req.url).searchParams.get('date') ?? toLocalDate(new Date())
  if (!isIsoDate(date)) return Response.json({ error: 'invalid date' }, { status: 400 })
  const p = await getRepository().getAnalysisPacket(date)
  if (!p) return Response.json({ error: `no packet for ${date}` }, { status: 404 })
  return Response.json({ date, status: p.status, instructions: FINANCIAL_INTELLIGENCE_INSTRUCTIONS, output_schema: z.toJSONSchema(AnalysisOutput), packet: p.packet })
}

export async function POST(req: Request) {
  const denied = authorizeMachine(req)
  if (denied) return denied
  const body = (await req.json().catch(() => null)) as { date?: string; analysis?: unknown } | null
  const date = body?.date ?? toLocalDate(new Date())
  if (!isIsoDate(date) || !body?.analysis) return Response.json({ error: 'body must be { date, analysis }' }, { status: 400 })
  try {
    const snap = await submitAnalysis(getRepository(), date, body.analysis)
    return Response.json({ snapshot: snap.id, status: snap.status, qc: snap.qc })
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 422 })
  }
}
