import { storageMode, llmMode } from '@/core/env'

export const dynamic = 'force-dynamic'

export function GET() {
  return Response.json({ ok: true, storage: storageMode(), llm: llmMode(), time: new Date().toISOString() })
}
