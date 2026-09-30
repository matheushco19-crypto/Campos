import { ASSETS, DERIVED_SPREADS, type AssetConfig } from '../../config/assets'
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
  bps: [-2_000, 2_000],
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
  // created/updated = processing time (orders runs); retrieved_at = when the source was read.
  const processedAt = new Date().toISOString()
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
    verification_method: 'unavailable',
    session: null,
    released_at: null,
    instrument: null,
    brief_date: ctx.briefDate,
    run_id: ctx.runId,
    created_at: processedAt,
    updated_at: processedAt,
  }
}

/* ------------------------------ Market ---------------------------------- */

/** Lineages whose publisher is the official producer of the number: two feeds of it agree = official cross-check. */
const OFFICIAL_LINEAGES = new Set(['b3', 'us-treasury', 'bcb', 'ecb', 'ibge', 'fed', 'bls', 'bea', 'krx'])

const sourceDef = (id: string) => SOURCES.find((s) => s.id === id)
export const isUnofficialSource = (id: string) => sourceDef(id)?.authority === 'unofficial_vendor'
const lineageOf = (asset: AssetConfig, sourceId: string) => asset.sources.find((m) => m.sourceId === sourceId)?.lineage ?? sourceDef(sourceId)?.lineage ?? sourceId
const mappingOf = (asset: AssetConfig, sourceId: string) => asset.sources.find((m) => m.sourceId === sourceId)

/**
 * MARKET verification (docs/verification.md):
 *  - Unofficial vendors (Yahoo) and proxies never confirm a value.
 *  - A secondary only counts when it refers to the SAME reference date (never last-vs-last on different dates).
 *  - Agreement between different lineages → independent_crosscheck; two feeds of the same official
 *    lineage (BRAPI + B3, US Treasury + FRED DGS*) → official_crosscheck.
 *  - Official publisher alone (PTAX, Treasury curve, B3 settlement) → VERIFIED/MEDIUM official_single.
 *  - Any other single source → UNVERIFIED single_source. Disagreement → CONFLICT.
 */
export function verifyMarket(asset: AssetConfig, observations: RawObservation[], ctx: VerificationContext): VerifiedFact {
  const fact = baseFact(ctx, asset.metric, asset.label, asset.region, asset.unit, 'MARKET')
  fact.timezone = asset.exchange.timezone
  const order = asset.sources.map((s) => s.sourceId as string)
  const obs = observations.filter((o) => o.metric === asset.metric).sort((a, b) => order.indexOf(a.sourceId) - order.indexOf(b.sourceId))

  if (!obs.length) {
    fact.notes = 'Todas as fontes falharam ou estão indisponíveis. Nenhum valor foi estimado.'
    return fact
  }

  const counted = obs.filter((o) => !isUnofficialSource(o.sourceId))
  const real = counted.filter((o) => !mappingOf(asset, o.sourceId)?.proxy)
  const primary = real[0] ?? counted[0] ?? obs[0]
  const primaryMapping = mappingOf(asset, primary.sourceId)

  fact.value = primary.value
  fact.reference_period = primary.referencePeriod
  fact.as_of = primary.asOf
  fact.retrieved_at = primary.retrievedAt
  fact.primary_source = primary.sourceId
  fact.primary_url = primary.url
  fact.session = primary.session ?? null
  fact.instrument = primary.instrument ?? null
  fact.market_status = primary.marketStatus ?? 'UNKNOWN'
  fact.source_fallback = primary.sourceId !== asset.sources[0]?.sourceId
  fact.previous_value = primary.previousValue ?? null
  fact.change_pct = primary.changePct ?? null
  if (fact.change_pct === null && fact.previous_value === null) {
    const prev = ctx.previousFacts?.get(asset.metric)
    if (prev?.value && prev.reference_period && prev.reference_period < primary.referencePeriod) {
      fact.previous_value = prev.value
      fact.change_pct = asset.unit === '%' || asset.unit === '% a.a.' ? null : round(((primary.value - prev.value) / prev.value) * 100, 2)
    }
  }
  fact.is_stale = diffDays(ctx.briefDate, primary.referencePeriod) > asset.maxAgeDays

  const notes: string[] = []
  if (primary.notes) notes.push(primary.notes)
  if (asset.notes) notes.push(asset.notes)
  const finish = () => {
    if (fact.is_stale) notes.push(`Dado defasado: referência ${primary.referencePeriod}.`)
    fact.notes = notes.join(' ')
    return fact
  }

  if (primary !== real[0]) {
    // No real observation of the instrument: a proxy or an unofficial vendor is shown, never VERIFIED.
    const unofficial = isUnofficialSource(primary.sourceId)
    fact.verification_status = 'UNVERIFIED'
    fact.confidence = 'LOW'
    fact.single_source = true
    fact.verification_method = unofficial ? 'unofficial_vendor' : 'proxy'
    notes.push(unofficial ? 'Somente fornecedor não oficial respondeu: exibido como referência, não verificado.' : 'Valor aproximado (proxy): não é o índice oficial.')
    return finish()
  }

  const primaryLineage = lineageOf(asset, primary.sourceId)
  const others = real.slice(1).filter((o) => o.sourceId !== primary.sourceId)
  // Same reference date only; different lineage first (true independence), then same official lineage.
  const aligned = others
    .filter((o) => o.referencePeriod === primary.referencePeriod)
    .sort((a, b) => Number(lineageOf(asset, a.sourceId) === primaryLineage) - Number(lineageOf(asset, b.sourceId) === primaryLineage))
  const secondary = aligned[0]

  if (!secondary) {
    fact.single_source = true
    if (others.length) notes.push(`Fonte secundária com data de referência diferente (${others.map((c) => `${c.sourceId}: ${c.referencePeriod}`).join(', ')}): datas diferentes não são comparadas.`)
    const vendorCheck = obs.find((o) => isUnofficialSource(o.sourceId) && o.referencePeriod === primary.referencePeriod)
    if (vendorCheck) notes.push(`Referência não oficial (${vendorCheck.sourceId}: ${vendorCheck.value}) na mesma data; não conta para verificação.`)
    if (primaryMapping?.official) {
      fact.verification_status = 'VERIFIED'
      fact.confidence = 'MEDIUM'
      fact.verification_method = 'official_single'
      notes.push('Fonte oficial do instrumento (publicador do dado), sem segunda fonte na mesma data.')
    } else {
      fact.verification_status = 'UNVERIFIED'
      fact.confidence = 'LOW'
      fact.verification_method = 'single_source'
      if (!others.length) notes.push('Apenas uma fonte respondeu.')
    }
    return finish()
  }

  fact.secondary_source = secondary.sourceId
  fact.secondary_url = secondary.url
  const secondaryLineage = lineageOf(asset, secondary.sourceId)
  if (!withinTolerance(primary.value, secondary.value, asset.tolerance)) {
    fact.verification_status = 'CONFLICT'
    fact.confidence = 'LOW'
    fact.verification_method = 'conflict'
    notes.push(`CONFLITO: ${primary.sourceId}=${primary.value} vs ${secondary.sourceId}=${secondary.value} (${primary.referencePeriod}). Não resolvido automaticamente.`)
    return finish()
  }
  if (secondaryLineage !== primaryLineage) {
    fact.verification_status = 'VERIFIED'
    fact.confidence = 'HIGH'
    fact.verification_method = 'independent_crosscheck'
    notes.push(`Validado por fonte independente: ${secondary.sourceId} (${secondary.value}), mesma data de referência.`)
  } else if (OFFICIAL_LINEAGES.has(primaryLineage)) {
    fact.verification_status = 'VERIFIED'
    fact.confidence = 'HIGH'
    fact.verification_method = 'official_crosscheck'
    notes.push(`Conferido com a fonte oficial (${secondary.sourceId}: ${secondary.value}); mesma origem (${primaryLineage}), não independente.`)
  } else {
    // Two redistributions of the same non-official feed are not a cross-check.
    fact.verification_status = primaryMapping?.official ? 'VERIFIED' : 'UNVERIFIED'
    fact.confidence = primaryMapping?.official ? 'MEDIUM' : 'LOW'
    fact.verification_method = primaryMapping?.official ? 'official_single' : 'single_source'
    fact.single_source = true
    notes.push(`${secondary.sourceId} redistribui o mesmo dado (${primaryLineage}): não conta como validação independente.`)
  }
  return finish()
}

/**
 * Deterministic spreads in bps (e.g. 2s10s = 10Y − 2Y). VERIFIED only when both
 * inputs are VERIFIED on the same reference date; the calculation is in the notes.
 */
export function deriveSpread(spec: { metric: string; label: string; long: string; short: string }, facts: VerifiedFact[], ctx: VerificationContext): VerifiedFact {
  const fact = baseFact(ctx, spec.metric, spec.label, 'US', 'bps', 'MARKET')
  fact.timezone = 'America/New_York'
  const long = facts.find((f) => f.metric === spec.long)
  const short = facts.find((f) => f.metric === spec.short)
  if (!long?.value || !short?.value || !long.reference_period || long.reference_period !== short.reference_period) {
    fact.notes = `Sem cálculo: ${spec.long} e ${spec.short} precisam existir na mesma data de referência.`
    return fact
  }
  const bps = (a: number, b: number) => Math.round((a - b) * 10000) / 100
  fact.value = bps(long.value, short.value)
  fact.previous_value = long.previous_value != null && short.previous_value != null ? bps(long.previous_value, short.previous_value) : null
  fact.reference_period = long.reference_period
  fact.as_of = long.as_of
  fact.primary_source = long.primary_source
  fact.primary_url = long.primary_url
  fact.market_status = long.market_status
  fact.session = long.session
  fact.verification_method = 'derived'
  const both = long.verification_status === 'VERIFIED' && short.verification_status === 'VERIFIED'
  fact.verification_status = both ? 'VERIFIED' : 'UNVERIFIED'
  fact.confidence = both ? (long.confidence === 'HIGH' && short.confidence === 'HIGH' ? 'HIGH' : 'MEDIUM') : 'LOW'
  fact.is_stale = long.is_stale || short.is_stale
  fact.notes = `Cálculo: ${long.label} ${long.value}% − ${short.label} ${short.value}% = ${fact.value} bps (fatos ${long.id}, ${short.id}; referência ${long.reference_period}).`
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
      fact.released_at = o.releasedAt ?? null
      if (o.notes) notes.push(o.notes)
    } else {
      fact.secondary_source = o.sourceId
      fact.secondary_url = o.url
    }
  }

  let status: VerificationStatus = 'UNAVAILABLE'
  let confidence: Confidence = 'NONE'
  let method: VerifiedFact['verification_method'] = 'unavailable'

  if (official && secondary) {
    fill(official, 'primary')
    fill(secondary, 'secondary')
    if (official.referencePeriod === secondary.referencePeriod) {
      if (Math.abs(official.value - secondary.value) <= ind.tolerance) {
        status = 'VERIFIED'
        confidence = 'HIGH'
        // SGS/FRED republish the official number: a consistency check against the official, not independent.
        method = 'official_crosscheck'
        notes.push(`Fonte oficial confirmada por ${secondary.sourceId}.`)
      } else {
        status = 'CONFLICT'
        confidence = 'LOW'
        method = 'conflict'
        notes.push(`CONFLITO: oficial ${official.sourceId}=${official.value} vs ${secondary.sourceId}=${secondary.value} (${official.referencePeriod}). Não resolvido automaticamente.`)
      }
    } else if (official.referencePeriod > secondary.referencePeriod) {
      status = ctx.strictMacro ? 'UNVERIFIED' : 'VERIFIED'
      confidence = 'MEDIUM'
      method = 'official_single'
      fact.single_source = true
      notes.push(`Fonte oficial mais recente (${official.referencePeriod}) que a secundária (${secondary.referencePeriod}); validação cruzada pendente.`)
    } else {
      // Secondary newer than official: the official has not been refreshed or failed partially. Keep the official, flag it.
      status = 'UNVERIFIED'
      confidence = 'LOW'
      method = 'official_single'
      notes.push(`Fonte secundária mais recente (${secondary.referencePeriod}: ${secondary.value}) que a oficial (${official.referencePeriod}). Verificar publicação oficial.`)
    }
  } else if (official) {
    fill(official, 'primary')
    status = ctx.strictMacro ? 'UNVERIFIED' : 'VERIFIED'
    confidence = 'MEDIUM'
    method = 'official_single'
    fact.single_source = true
    notes.push(ind.secondary ? 'Validação secundária indisponível nesta execução.' : 'Fonte oficial única (autoridade do dado).')
  } else if (secondary) {
    fill(secondary, 'primary')
    fact.primary_source = secondary.sourceId
    status = 'UNVERIFIED'
    confidence = 'LOW'
    method = 'single_source'
    fact.single_source = true
    fact.source_fallback = true
    notes.push(ind.official ? 'Fonte oficial indisponível; valor apenas da fonte secundária.' : 'Sem fonte oficial integrada; valor de fonte secundária.')
  } else {
    notes.push(ind.official || ind.secondary ? 'Todas as fontes falharam. Nenhum valor foi estimado.' : 'Sem fonte estruturada integrada. Requer importação manual com URL oficial.')
  }

  fact.verification_status = status
  fact.confidence = confidence
  fact.verification_method = method
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
  if (assets.some((a) => a.metric.startsWith('US_UST_'))) for (const d of DERIVED_SPREADS) facts.push(deriveSpread(d, facts, ctx))
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
