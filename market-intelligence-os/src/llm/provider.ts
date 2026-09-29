import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import type { z } from 'zod'
import { getEnv } from '../core/env'

/**
 * LLM access, used only for interpretation, synthesis, language and strategy.
 * Never for parsing, math, sorting, dedup or persistence.
 *
 * Modes:
 *  - anthropic_api: calls the Claude API (needs ANTHROPIC_API_KEY).
 *  - claude_code:   hand-off. The pipeline stores an analysis packet and a Claude Code
 *                   routine (Claude Pro/Max subscription) produces the analysis and submits it.
 *  - deterministic: no LLM. Facts-only brief.
 */
export type ModelTier = 'fast' | 'deep'

export interface StructuredCallResult<T> {
  output: T | null
  stopReason: string | null
  usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null } | null
  model: string
  error: string | null
}

let client: Anthropic | null = null
function getClient() {
  const env = getEnv()
  if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured')
  client ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, timeout: 240_000, maxRetries: 2 })
  return client
}

export function modelFor(tier: ModelTier): string {
  const env = getEnv()
  return tier === 'deep' ? env.MI_MODEL_DEEP : env.MI_MODEL_FAST
}

/**
 * One structured call. The system prompt is frozen, so the automatic prompt
 * cache covers it across daily runs. The per-day packet goes in the user turn.
 */
export async function callStructured<S extends z.ZodType>(opts: {
  system: string
  user: string
  schema: S
  tier: ModelTier
  maxTokens?: number
  effort?: 'low' | 'medium' | 'high'
}): Promise<StructuredCallResult<z.infer<S>>> {
  const model = modelFor(opts.tier)
  try {
    const anthropic = getClient()
    const isHaiku = model.includes('haiku')
    const response = await anthropic.messages.parse({
      model,
      max_tokens: opts.maxTokens ?? 16000,
      cache_control: { type: 'ephemeral' },
      system: opts.system,
      messages: [{ role: 'user', content: opts.user }],
      output_config: {
        format: zodOutputFormat(opts.schema),
        ...(isHaiku ? {} : { effort: opts.effort ?? (opts.tier === 'deep' ? 'high' : 'low') }),
      },
    })
    if (response.stop_reason === 'refusal') {
      return { output: null, stopReason: 'refusal', usage: response.usage, model, error: 'Model declined the request (refusal)' }
    }
    if (response.stop_reason === 'max_tokens') {
      return { output: null, stopReason: 'max_tokens', usage: response.usage, model, error: 'Output truncated (max_tokens)' }
    }
    return { output: (response.parsed_output ?? null) as z.infer<S> | null, stopReason: response.stop_reason, usage: response.usage, model, error: response.parsed_output ? null : 'Structured output failed to parse' }
  } catch (e) {
    return { output: null, stopReason: null, usage: null, model, error: e instanceof Error ? e.message : String(e) }
  }
}
