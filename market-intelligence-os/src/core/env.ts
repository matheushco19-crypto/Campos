import { z } from 'zod'

/**
 * Server-side environment. Secrets are read only here and never exposed to
 * client components (no NEXT_PUBLIC_ prefix on anything sensitive).
 */
const EnvSchema = z.object({
  MI_STORAGE: z.enum(['file', 'memory', 'supabase']).optional(),
  MI_DATA_DIR: z.string().default('data'),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  MI_LLM_PROVIDER: z.enum(['anthropic_api', 'claude_code', 'deterministic']).optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  MI_MODEL_FAST: z.string().default('claude-haiku-4-5'),
  MI_MODEL_DEEP: z.string().default('claude-opus-5-5'),
  CRON_SECRET: z.string().optional(),
  DASHBOARD_PASSWORD: z.string().optional(),
  BRAPI_TOKEN: z.string().optional(),
  FRED_API_KEY: z.string().optional(),
  COINGECKO_DEMO_KEY: z.string().optional(),
  TWELVEDATA_API_KEY: z.string().optional(),
  FMP_API_KEY: z.string().optional(),
  /** Yahoo chart endpoint: unofficial, display fallback only, never counts toward VERIFIED. Off by default. */
  MI_ENABLE_YAHOO_FALLBACK: z.enum(['true', 'false']).default('false'),
  BOK_ECOS_KEY: z.string().optional(),
  /** Stooq answers 403 to datacenter IPs (Vercel). Enable only where it responds (e.g. a home machine). */
  MI_ENABLE_STOOQ: z.enum(['true', 'false']).default('false'),
  MI_VERIFICATION_STRICT_MACRO: z.enum(['true', 'false']).default('false'),
})

export type Env = z.infer<typeof EnvSchema>

export function getEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env)
  if (!parsed.success) throw new Error(`Invalid environment: ${parsed.error.message}`)
  return parsed.data
}

/**
 * Names (never values) of variables a deployed instance needs. Reported by /api/health so a deploy
 * never depends silently on a missing variable.
 */
export function missingRequiredEnv(env = getEnv()): string[] {
  const missing: string[] = []
  if (storageMode(env) === 'supabase' || env.MI_STORAGE === 'supabase') {
    if (!env.SUPABASE_URL) missing.push('SUPABASE_URL')
    if (!env.SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY')
  }
  if (process.env.VERCEL) {
    if (!env.CRON_SECRET) missing.push('CRON_SECRET')
    if (!env.DASHBOARD_PASSWORD) missing.push('DASHBOARD_PASSWORD')
  }
  return missing
}

export function storageMode(env = getEnv()): 'file' | 'memory' | 'supabase' {
  if (env.MI_STORAGE) return env.MI_STORAGE
  return env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY ? 'supabase' : 'file'
}

export function llmMode(env = getEnv()): 'anthropic_api' | 'claude_code' | 'deterministic' {
  if (env.MI_LLM_PROVIDER) return env.MI_LLM_PROVIDER
  return env.ANTHROPIC_API_KEY ? 'anthropic_api' : 'claude_code'
}
