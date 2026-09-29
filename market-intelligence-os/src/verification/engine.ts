import { ASSETS, type AssetConfig } from '../../config/assets'
import { MACRO_INDICATORS, type MacroIndicator } from '../../config/macro'
import { SOURCES } from '../../config/sources'
import { stableId } from '../core/ids'
import type { Confidence, RawObservation, VerificationStatus, VerifiedFact } from '../core/schemas'
import { diffDays } from '../core/time'

/**
 * VERIFICATION ENGINE
 *
 * RAW DATA → NORMALIZATION → VALIDATION → VERIFICATION → VERIFIED_FACT
 *
 * Rules (docs/verification.md):
 *  - MARKET: two independent sources, same reference date, within tolerance → VERIFIED.
 *    One source only → UNVERIFIED. Disagreement → CONFLICT, and the conflict is never
 *    resolved by picking a number. No source → UNAVAILABLE.
 *  - MACRO: the official source is the authority. Official + secondary agreeing → VERIFIED/HIGH.
 *    Official alone → VERIFIED/MEDIUM (single_source), or UNVERIFIED in strict mode.
 *    Secondary alone → UNVERIFIED. Official vs secondary disagreement on the same period → CONFLICT.
 *  - Observations failing plausibility checks are REJECTED and never reach agents.
 */

export interface VerificationContext {
  briefDate: string
  runId: string | null
  now: Date
  strictMacro?: boolean
  /** Previous fact per metric (for change calculation when the source gives none). */
  previousFacts?: Map<string, VerifiedFact>
}

export interface VerificationOutput {
  facts: VerifiedFact[]
  rejected: { observation: RawObservation; reason: string }[]
}

/* ------------------------------ Validation ------------------------------ */

const PLAUSIBLE: Record<string, [number, number]> = {
  pts: [1, 10_000_000],
  BRL: [0.5, 50],
  USD: [0.0001, 10_000_000],
  idx: [0.01, 100_000],
  '%': [-50, 200],
  '% a.a.': [-5, 100],
  '% PIB': [0, 400],
  mil: [-30_000, 30_000],
}

export function validateObservation(o: RawObservation, now: Date): string | null {
  if (!Number.isFinite(o.value)) return 'valor não numérico'
  const range = PLAUSIBLE[o.unit]
  if (range && (o.value < range[0] || o.value > range[1])) return `valor ${o.value} fora da faixa plausível para ${o.unit}`
  const asOf = Date.parse(o.asOf)
  if (Number.isNaN(asOf)) return 'as_of inválido'
  if (asOf - now.getTime() > 36 * 3_600_000) return 'as_of no futuro'
  if (!/^https?:\/\//.test(o.url)) return 'URL de proveniência ausente'
  return null
}

/* ------------------------------ Helpers --------------------------------- */

const round = (v: number, d = 4) => Math.round(v * 10 ** d) / 10 ** d

export function withinTolerance(a: number, b: number, tol: { relative?: number; absolute?: number }): boolean {
  if (tol.absolute !== undefined && Math.abs(a - b) <= tol.absolute) return true
  if (tol.relative !== undefined && Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1e-9) <= tol.relative) return true
  return false
}

const periodAgeDays = (briefDate: string, period: string) => {
  const q = /^(\d{4})-Q([1-4])$/.exec(period)
  // A quarter is "as of" its last month.
  const date = q ? `${q[1]}-${String(Number(q[2]) * 3).padStart(2, '0')}-01` : period.length === 7 ? `${period}-01` : period
  return diffDays(briefDate, date)
}

function baseFact(ctx: VerificationContext, metric: string, label: string, region: VerifiedFact['region'], unit: string, category: 'MARKET' | 'MACRO'): VerifiedFact {
  const ts = ctx.now.toISOString()
  return {
    id: stableId('fact', ctx.briefDate, metric, ctx.runId ?? 'adhoc'),
    category,
    metric,
    label,
    region,
    value: null,
    unit,
    reference_period: null,
    as_of: null,
    retrieved_at: ts,
    primary_source: null,
    secondary_source: null,
    primary_url: null,
    secondary_url: null,
    verification_status: 'UNAVAILABLE',
    confidence: 'NONE',
    notes: null,
    change_pct: null,
    previous_value: null,
    market_status: 'UNKNOWN',
    timezone: 'UTC',
    source_fallback: false,
    single_source: false,
    is_stale: false,
    brief_date: ctx.briefDate,
    run_id: ctx.runId,
    created_at: ts,
    updated_at: ts,
  }
}

/* ------------------------------ Market ---------------------------------- */

export function verifyMarket(asset: AssetConfig, observations: RawObservation[], ctx: VerificationContext): VerifiedFact {
  const fact = baseFact(ctx, asset.metric, asset.label, asset.region, asset.unit, 'MARKET')
  fact.timezone = asset.exchange.timezone
  const investingIntegrated = SOURCES.find((s) => s.id === 'investing')?.access !== 'not_integrated'
  const order = asset.sources.map((s) => s.sourceId as string)
  const obs = observations.filter((o) => o.metric === asset.metric).sort((a, b) => order.indexOf(a.sourceId) - order.indexOf(b.sourceId))

  if (!obs.length) {
    fact.notes = 'Todas as fontes falharam ou estão indisponíveis. Nenhum valor foi estimado.'
    return fact
  }

  const primary = obs[0]
  fact.value = primary.value
  fact.reference_period = primary.referencePeriod
  fact.as_of = primary.asOf
  fact.retrieved_at = primary.retrievedAt
  fact.primary_source = primary.sourceId
  fact.primary_url = primary.url
  fact.market_status = primary.marketStatus ?? 'UNKNOWN'
  fact.source_fallback = !investingIntegrated || primary.sourceId !== 'investing'
  fact.previous_value = primary.previousValue ?? null
  fact.change_pct = primary.changePct ?? null
  if (fact.change_pct === null) {
    const prev = ctx.previousFacts?.get(asset.metric)
    if (prev?.value && prev.reference_period && prev.reference_period < primary.referencePeriod) {
      fact.previous_value = prev.value
      fact.change_pct = asset.unit === '%' ? null : round(((primary.value - prev.value) / prev.value) * 100, 2)
    }
  }
  fact.is_stale = diffDays(ctx.briefDate, primary.referencePeriod) > asset.maxAgeDays

  const notes: string[] = []
  if (primary.notes) notes.push(primary.notes)
  if (asset.notes) notes.push(asset.notes)

  // Secondary must be independent (different source) and refer to the same period.
  const candidates = obs.slice(1).filter((o) => o.sourceId !== primary.sourceId)
  const aligned = candidates.find((o) => o.referencePeriod === primary.referencePeriod || asset.exchange.always)
  if (!aligned) {
    fact.verification_status = 'UNVERIFIED'
    fact.confidence = 'LOW'
    fact.single_source = true
    if (candidates.length) notes.push(`Fonte secundária com data de referência diferente (${candidates.map((c) => `${c.sourceId}: ${c.referencePeriod}`).join(', ')}), sem validação cruzada possível.`)
    else notes.push('Apenas uma fonte respondeu.')
  } else {
    fact.secondary_source = aligned.sourceId
    fact.secondary_url = aligned.url
    if (withinTolerance(primary.value, aligned.value, asset.tolerance)) {
      fact.verification_status = 'VERIFIED'
      fact.confidence = 'HIGH'
      notes.push(`Validado por ${aligned.sourceId} (${aligned.value}).`)
    } else {
      fact.verification_status = 'CONFLICT'
      fact.confidence = 'LOW'
      notes.push(`CONFLITO: ${primary.sourceId}=${primary.value} vs ${aligned.sourceId}=${aligned.value}. Não resolvido automaticamente.`)
    }
  }
  if (fact.is_stale) notes.push(`Dado defasado: referência ${primary.referencePeriod}.`)
  fact.notes = notes.join(' ')
  return fact
}

/* ------------------------------ Macro ----------------------------------- */

export function verifyMacro(ind: MacroIndicator, observations: RawObservation[], ctx: VerificationContext): VerifiedFact {
  const fact = baseFact(ctx, ind.metric, ind.label, ind.region, ind.unit, 'MACRO')
  const obs = observations.filter((o) => o.metric === ind.metric)
  const official = ind.official ? obs.find((o) => o.sourceId === ind.official!.sourceId) : undefined
  const secondary = ind.secondary ? obs.find((o) => o.sourceId === ind.secondary!.sourceId && o !== official) : undefined
  const notes: string[] = []
  if (ind.notes) notes.push(ind.notes)

  const fill = (o: RawObservation, role: 'primary' | 'secondary') => {
    if (role === 'primary') {
      fact.value = o.value
      fact.reference_period = o.referencePeriod
      fact.as_of = o.asOf
      fact.retrieved_at = o.retrievedAt
      fact.primary_source = o.sourceId
      fact.primary_url = o.url
      fact.previous_value = o.previousValue ?? null
      if (o.notes) notes.push(o.notes)
    } else {
      fact.secondary_source = o.sourceId
      fact.secondary_url = o.url
    }
  }

  let status: VerificationStatus = 'UNAVAILABLE'
  let confidence: Confidence = 'NONE'

  if (official && secondary) {
    fill(official, 'primary')
    fill(secondary, 'secondary')
    if (official.referencePeriod === secondary.referencePeriod) {
      if (Math.abs(official.value - secondary.value) <= ind.tolerance) {
        status = 'VERIFIED'
        confidence = 'HIGH'
        notes.push(`Fonte oficial confirmada por ${secondary.sourceId}.`)
      } else {
        status = 'CONFLICT'
        confidence = 'LOW'
        notes.push(`CONFLITO: oficial ${official.sourceId}=${official.value} vs ${secondary.sourceId}=${secondary.value} (${official.referencePeriod}). Não resolvido automaticamente.`)
      }
    } else if (official.referencePeriod > secondary.referencePeriod) {
      status = ctx.strictMacro ? 'UNVERIFIED' : 'VERIFIED'
      confidence = 'MEDIUM'
      fact.single_source = true
      notes.push(`Fonte oficial mais recente (${official.referencePeriod}) que a secundária (${secondary.referencePeriod}); validação cruzada pendente.`)
    } else {
      // Secondary newer than official: the official has not been refreshed or failed partially. Keep the official, flag it.
      status = 'UNVERIFIED'
      confidence = 'LOW'
      notes.push(`Fonte secundária mais recente (${secondary.referencePeriod}: ${secondary.value}) que a oficial (${official.referencePeriod}). Verificar publicação oficial.`)
    }
  } else if (official) {
    fill(official, 'primary')
    status = ctx.strictMacro ? 'UNVERIFIED' : 'VERIFIED'
    confidence = 'MEDIUM'
    fact.single_source = true
    notes.push(ind.secondary ? 'Validação secundária indisponível nesta execução.' : 'Fonte oficial única (autoridade do dado).')
  } else if (secondary) {
    fill(secondary, 'primary')
    fact.primary_source = secondary.sourceId
    status = 'UNVERIFIED'
    confidence = 'LOW'
    fact.single_source = true
    fact.source_fallback = true
    notes.push(ind.official ? 'Fonte oficial indisponível; valor apenas da fonte secundária.' : 'Sem fonte oficial integrada; valor de fonte secundária.')
  } else {
    notes.push(ind.official || ind.secondary ? 'Todas as fontes falharam. Nenhum valor foi estimado.' : 'Sem fonte estruturada integrada. Requer importação manual com URL oficial.')
  }

  fact.verification_status = status
  fact.confidence = confidence
  if (fact.reference_period) {
    fact.is_stale = periodAgeDays(ctx.briefDate, fact.reference_period) > ind.maxAgeDays
    if (fact.is_stale) notes.push(`Dado defasado: referência ${fact.reference_period}.`)
  }
  fact.notes = notes.join(' ')
  return fact
}

/* ------------------------------ Entry point ----------------------------- */

export function verifyAll(observations: RawObservation[], ctx: VerificationContext, assets = ASSETS.filter((a) => a.enabled), indicators = MACRO_INDICATORS.filter((m) => m.enabled)): VerificationOutput {
  const rejected: VerificationOutput['rejected'] = []
  const valid: RawObservation[] = []
  for (const o of observations) {
    const reason = validateObservation(o, ctx.now)
    if (reason) rejected.push({ observation: o, reason })
    else valid.push(o)
  }
  const facts: VerifiedFact[] = []
  for (const a of assets) {
    const f = verifyMarket(a, valid, ctx)
    if (f.verification_status === 'UNAVAILABLE' && rejected.some((r) => r.observation.metric === a.metric)) {
      f.verification_status = 'REJECTED'
      f.notes = `Observações rejeitadas na validação: ${rejected.filter((r) => r.observation.metric === a.metric).map((r) => r.reason).join('; ')}`
    }
    facts.push(f)
  }
  for (const m of indicators) {
    const f = verifyMacro(m, valid, ctx)
    if (f.verification_status === 'UNAVAILABLE' && rejected.some((r) => r.observation.metric === m.metric)) {
      f.verification_status = 'REJECTED'
      f.notes = `Observações rejeitadas na validação: ${rejected.filter((r) => r.observation.metric === m.metric).map((r) => r.reason).join('; ')}`
    }
    facts.push(f)
  }
  return { facts, rejected }
}

/** Facts usable as factual claims in narrative text. */
export const isCitable = (f: VerifiedFact) => f.verification_status === 'VERIFIED' && !f.is_stale && f.value !== null
