import { llmMode, missingRequiredEnv, storageMode } from '@/core/env'

export const dynamic = 'force-dynamic'

/** Public health probe: no secrets, no data. Lists missing required variables by name only; 503 while any is missing. */
export function GET() {
  const missing = missingRequiredEnv()
  return Response.json({ ok: missing.length === 0, storage: storageMode(), llm: llmMode(), missing_required_env: missing, time: new Date().toISOString() }, { status: missing.length ? 503 : 200 })
}
