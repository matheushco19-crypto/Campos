import type { VerifiedFact } from '../core/schemas'
import { normalizeText } from './news-classifier'

/**
 * METRIC ALIGNMENT ENGINE (deterministic).
 *
 * A number can be true and still be wrong: "IPCA-15 surpreende" backed by the
 * monthly IPCA is a substitution, not a citation. This engine maps explicit
 * metric names in text to their target metric, and checks that the evidence
 * of an item is the metric it names.
 *
 * Rules (docs/verification.md → Metric alignment):
 *  1. A named metric whose fact is available must be cited; the correct fact is
 *     attached as the item's primary fact.
 *  2. A named metric stated as a result ("subiu", "surpreendeu", a number) with no
 *     fact available must be declared unavailable; no other indicator may stand in.
 *  3. A number in a sentence that names metric A, supported only by the fact of a
 *     different named metric B that the sentence does not name, is a substitution.
 *  4. A cited fact of family F (e.g. inflation) used by an item that names another
 *     metric of family F, without naming the fact's own metric, is a substitution.
 */

export interface MetricAlias {
  id: string
  label: string
  /** Matched against normalized text (lowercase, no accents). */
  pattern: RegExp
  /** Facts that legitimately represent this name. The first is the primary target. */
  metrics: string[]
  /** Metric prefix accepted (e.g. DI1 contracts BR_DI1_*). */
  metricPrefix?: string
  family: 'inflation' | 'rates' | 'jobs' | 'activity' | 'markets' | 'fx'
  /** False when the metric is not integrated (e.g. ADP): mentions can never be backed by a fact. */
  integrated?: boolean
}

// More specific patterns first. Patterns run on normalizeText() output.
export const METRIC_ALIASES: MetricAlias[] = [
  { id: 'ipca15', label: 'IPCA-15', pattern: /\bipca[\s-]?15\b/, metrics: ['BR_IPCA15_MOM'], family: 'inflation' },
  { id: 'ipca', label: 'IPCA', pattern: /\bipca\b(?![\s-]?15)/, metrics: ['BR_IPCA_MOM', 'BR_IPCA_12M'], family: 'inflation' },
  { id: 'igpm', label: 'IGP-M', pattern: /\bigp[\s-]?m\b/, metrics: ['BR_IGPM_MOM'], family: 'inflation' },
  { id: 'cn_cpi', label: 'CPI da China', pattern: /\b(cpi (da |de )?china|china(s)? cpi|inflacao (da |na )?china)\b/, metrics: ['CN_CPI_YOY'], family: 'inflation' },
  { id: 'cpi', label: 'CPI', pattern: /\bcpi\b/, metrics: ['US_CPI_YOY'], family: 'inflation' },
  { id: 'pce', label: 'PCE', pattern: /\bpce\b/, metrics: ['US_PCE_YOY'], family: 'inflation' },
  { id: 'hicp', label: 'HICP', pattern: /\bhicp\b/, metrics: ['EU_HICP_YOY'], family: 'inflation' },
  { id: 'adp', label: 'ADP', pattern: /\badp\b/, metrics: [], family: 'jobs', integrated: false },
  { id: 'payroll', label: 'Payroll', pattern: /\b(payrolls?|nonfarm|non-farm|folha de pagamento nao agricola)\b/, metrics: ['US_PAYROLLS_CHANGE'], family: 'jobs' },
  { id: 'focus', label: 'Focus', pattern: /\bfocus\b/, metrics: ['BR_FOCUS_SELIC_CY', 'BR_FOCUS_IPCA_CY'], family: 'rates' },
  { id: 'selic_effective', label: 'Selic efetiva', pattern: /\bselic (efetiva|over|diaria)\b/, metrics: ['BR_SELIC_EFFECTIVE'], family: 'rates' },
  { id: 'di1', label: 'DI futuro', pattern: /\b(di futuro|di1|di1[fghjkmnquvxz]\d{2}|di de (\d+|um|dois|tres|cinco|dez) (anos?|mes(es)?)|juros futuros|curva (de juros |do )?di|taxas? de di)\b/, metrics: [], metricPrefix: 'BR_DI1_', family: 'rates' },
  { id: 'cdi', label: 'CDI', pattern: /\bcdi\b/, metrics: ['BR_CDI'], family: 'rates' },
  { id: 'selic', label: 'Selic', pattern: /\bselic\b(?! (efetiva|over|diaria))/, metrics: ['BR_SELIC_TARGET'], family: 'rates' },
  { id: 'fomc', label: 'FOMC / Fed Funds', pattern: /\b(fomc|fed funds|fed fund)\b/, metrics: ['US_FED_FUNDS_UPPER'], family: 'rates' },
  { id: 'treasury', label: 'Treasury', pattern: /\b(treasur(y|ies)|t-note|titulos? (do tesouro )?americanos?|yield de \d+ anos)\b/, metrics: ['US10Y'], metricPrefix: 'US_UST_', family: 'rates' },
  { id: 'ecb_rate', label: 'Taxa de depósito do BCE', pattern: /\b(taxa de deposito (do )?(bce|ecb)|ecb deposit|deposit facility)\b/, metrics: ['EU_ECB_DEPOSIT_RATE'], family: 'rates' },
  { id: 'ecb', label: 'ECB / BCE', pattern: /\b(ecb|bce)\b/, metrics: ['EU_ECB_DEPOSIT_RATE'], family: 'rates' },
  { id: 'ibov', label: 'Ibovespa', pattern: /\b(ibovespa|ibov)\b/, metrics: ['IBOV'], family: 'markets' },
  { id: 'spx', label: 'S&P 500', pattern: /\bs&?p ?500\b|\bs&p\b/, metrics: ['SPX'], family: 'markets' },
  { id: 'nasdaq', label: 'Nasdaq', pattern: /\bnasdaq\b/, metrics: ['NASDAQ'], family: 'markets' },
  { id: 'dow', label: 'Dow Jones', pattern: /\bdow( jones)?\b/, metrics: ['DJI'], family: 'markets' },
  { id: 'dxy', label: 'DXY', pattern: /\bdxy\b/, metrics: ['DXY'], family: 'fx' },
  { id: 'ptax', label: 'PTAX', pattern: /\bptax\b/, metrics: ['USDBRL', 'EURBRL'], family: 'fx' },
  { id: 'btc', label: 'Bitcoin', pattern: /\b(bitcoin|btc)\b/, metrics: ['BTCUSD'], family: 'markets' },
]

/** normalizeText drops "&" and "-"; keep them for S&P and IPCA-15. */
const norm = (t: string) =>
  t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9%$&.,\s-]/g, ' ')
    .replace(/\s+/g, ' ')

export function mentionedAliases(text: string): MetricAlias[] {
  const t = norm(text)
  const found: MetricAlias[] = []
  for (const a of METRIC_ALIASES) {
    if (!a.pattern.test(t)) continue
    // "Selic efetiva" must not also count as "Selic"; "IPCA-15" never counts as "IPCA" (lookaheads).
    // "taxa de depósito do BCE" also matches "BCE": keep only the specific alias.
    if (a.id === 'ecb' && found.some((f) => f.id === 'ecb_rate')) continue
    found.push(a)
  }
  return found
}

export function aliasOfMetric(metric: string): MetricAlias | undefined {
  return METRIC_ALIASES.find((a) => a.metrics.includes(metric) || (a.metricPrefix && metric.startsWith(a.metricPrefix)))
}

export const aliasCovers = (a: MetricAlias, metric: string) => a.metrics.includes(metric) || Boolean(a.metricPrefix && metric.startsWith(a.metricPrefix))

/** The metric an event title refers to (first specific alias), for event clusters. */
export function metricTarget(text: string): string | null {
  const a = mentionedAliases(text).find((x) => x.integrated !== false && (x.metrics.length || x.metricPrefix))
  return a ? a.metrics[0] ?? `${a.metricPrefix}*` : null
}

const RESULT_CLAIM = /\b(sub(iu|iram|ir)|ca(iu|iram)|cai\b|recu(ou|aram)|avanc(ou|aram)|acelerou|desacelerou|surpreend|veio|vieram|ficou|ficaram|registr(ou|a)|marcou|superou|dispar|despenc|encerr|alta de|queda de|variacao de|em alta|em queda|decid(iu|e)|manteve|elevou|reduziu|cortou)/
const UNAVAILABLE = /\b(indisponivel|ainda nao (esta |foi )?(disponivel|divulgad|verificad|publicad)|sem (o )?dado (oficial|verificado|especifico)|dado especifico (ainda )?(nao|indisponivel)|nao (esta|consta) (na base|entre os fatos))/

export function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…:;])\s+|\n+/)
    .map((x) => x.trim())
    .filter(Boolean)
}

export interface AlignmentIssue {
  kind: 'metric_substitution' | 'metric_unavailable'
  alias: string
  detail: string
}

export interface AlignmentResult {
  issues: AlignmentIssue[]
  /** Correct facts that must be attached as primary evidence (rule 1). */
  attach: string[]
}

/**
 * Checks one item (all of its text fields) against its cited facts.
 * `supports(numberToken, fact)` is injected by the QC (number extraction lives there).
 */
export function checkAlignment(
  texts: string[],
  citedIds: string[],
  factsById: Map<string, VerifiedFact>,
  citable: VerifiedFact[],
  numbersIn: (sentence: string) => { raw: string; supportedBy: (f: VerifiedFact) => boolean }[],
): AlignmentResult {
  const issues: AlignmentIssue[] = []
  const attach: string[] = []
  const full = texts.join('\n')
  const mentions = mentionedAliases(full)
  if (!mentions.length) return { issues, attach }
  const cited = citedIds.map((id) => factsById.get(id)).filter((f): f is VerifiedFact => !!f)
  const nFull = norm(full)

  // Rules 1 and 2.
  for (const a of mentions) {
    const citedMatch = cited.some((f) => aliasCovers(a, f.metric))
    if (citedMatch) continue
    const available = citable.filter((f) => aliasCovers(a, f.metric)).sort((x, y) => a.metrics.indexOf(x.metric) - a.metrics.indexOf(y.metric))
    if (available.length) {
      attach.push(available[0].id)
      continue
    }
    const claimSentences = sentences(full).filter((s) => a.pattern.test(norm(s)) && (RESULT_CLAIM.test(norm(s)) || numbersIn(s).length > 0))
    if (claimSentences.length && !UNAVAILABLE.test(nFull)) {
      issues.push({
        kind: 'metric_unavailable',
        alias: a.label,
        detail: `${a.label} é citado como resultado, mas não há fato verificado de ${a.metrics[0] ?? a.metricPrefix ?? a.label}${a.integrated === false ? ' (métrica não integrada)' : ''}. Declare o dado como indisponível e não use outro indicador no lugar.`,
      })
    }
  }
  const evidence = [...cited, ...attach.map((id) => factsById.get(id)).filter((f): f is VerifiedFact => !!f)]

  // Rule 3: sentence-level number substitution.
  for (const s of sentences(full)) {
    const inSentence = mentionedAliases(s)
    if (!inSentence.length) continue
    for (const n of numbersIn(s)) {
      const supporters = evidence.filter((f) => n.supportedBy(f))
      if (!supporters.length) continue
      const legit = supporters.some((f) => inSentence.some((a) => aliasCovers(a, f.metric)) || !aliasOfMetric(f.metric))
      if (legit) continue
      const f = supporters[0]
      issues.push({
        kind: 'metric_substitution',
        alias: inSentence.map((a) => a.label).join('/'),
        detail: `"${n.raw}" vem de ${f.label} (${f.metric}), mas a frase fala de ${inSentence.map((a) => a.label).join(' / ')}.`,
      })
    }
  }

  // Rule 4: same-family fact standing in for another named metric (no number needed).
  for (const f of evidence) {
    const own = aliasOfMetric(f.metric)
    if (!own) continue
    if (mentions.some((a) => aliasCovers(a, f.metric))) continue // the fact's own metric is named
    const rival = mentions.find((a) => a.family === own.family && a.id !== own.id && !evidence.some((e) => aliasCovers(a, e.metric)))
    if (rival) {
      issues.push({
        kind: 'metric_substitution',
        alias: rival.label,
        detail: `O item fala de ${rival.label}, mas a evidência citada é ${f.label} (${f.metric}), outro indicador.`,
      })
    }
  }
  return { issues, attach }
}

/** Convenience for tests/tools: normalized text of a list. */
export const alignmentText = (xs: string[]) => normalizeText(xs.join(' '))
