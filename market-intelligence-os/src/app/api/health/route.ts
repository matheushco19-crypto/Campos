import { llmMode, missingRequiredEnv, storageMode } from '@/core/env'

export const dynamic = 'force-dynamic'

/** Public liveness probe: no secrets, no data. Lists missing required variables by name only. */
export function GET() {
  const missing = missingRequiredEnv()
  return Response.json({ ok: missing.length === 0, storage: storageMode(), llm: llmMode(), missing_required_env: missing, time: new Date().toISOString() }, { status: 200 })
}
