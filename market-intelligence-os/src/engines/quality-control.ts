import { ASSETS } from '../../config/assets'
import { EDITORIAL_PROFILE } from '../../config/editorial-profile'
import type { AgendaItem, AnalysisOutput, ContentIdea, MarketRow, QcCheck, QcReport, VerifiedFact } from '../core/schemas'
import { isCitable } from '../verification/engine'
import { normalizeText } from './news-classifier'

/**
 * QUALITY CONTROL OF THE MORNING BRIEF (deterministic, runs before every save).
 *
 *  1 numbers have a source          7 text is in Portuguese
 *  2 material facts are VERIFIED    8 reading time ≤ 10 min
 *  3 no duplicated news             9 Content Lab is short
 *  4 no market wrongly "closed"    10 agenda has sources
 *  5 no stale data as current      11 no generic AI language
 *  6 insights separated from facts 12 no invented personal experience
 *
 * Failures are corrected (items removed or fixed) and the checks re-run.
 * The final report lists every correction.
 */

type Cited = { fact_ids: string[]; cluster_ids: string[] }

/* ------------------------ Unsupported claim detection ------------------------ */

const SCALE: Record<string, number> = { mil: 1e3, milhao: 1e6, milhoes: 1e6, bilhao: 1e9, bilhoes: 1e9, trilhao: 1e12, trilhoes: 1e12 }

export interface NumberToken {
  raw: string
  candidates: number[]
  decimals: number
  scale: number
  unitHint: string
}

/** Extracts numeric claims from pt-BR text (handles 5.402,10 / 15,00 / 4.25 / 129 mil / 0,25 p.p.). */
const NAMED_NUMBERS = [
  ...ASSETS.map((a) => a.label).filter((l) => /\d/.test(l)),
  'S&P 500', 'S&P500', 'Euro Stoxx 50', 'FTSE 100', 'Nikkei 225', 'DAX 40', 'Treasury 10Y', 'Treasury de 10 anos', 'T-10', 'G20', 'G7', 'Web 3',
]
const DURATION = /\b\d+\s?(segundos?|minutos?|horas?|dias?|semanas?|meses|mês|anos?|trimestres?|turnos?)\b/gi

/** Removes entity names and durations that contain digits but are not numeric claims. */
export function sanitizeForNumbers(text: string): string {
  let t = text
  for (const n of NAMED_NUMBERS) t = t.split(n).join(' ')
  return t.replace(DURATION, ' ')
}

export function extractNumbers(input: string): NumberToken[] {
  const text = sanitizeForNumbers(input)
  const out: NumberToken[] = []
  const re = /(R\$|US\$|\$|€)?\s?([-+−]?\d{1,3}(?:\.\d{3})+(?:,\d+)?|[-+−]?\d+(?:[.,]\d+)?)(\s?(?:%|p\.p\.|pp|bps|pb|pontos?|mil(?:h(?:ão|ao|ões|oes))?|bilh(?:ão|ao|ões|oes)|trilh(?:ão|ao|ões|oes)|º|ª|°)?)/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const numStart = m.index + m[0].indexOf(m[2])
    const before = numStart > 0 ? text[numStart - 1] : ''
    if (/[\w/.,-]/.test(before) && !m[1]) continue // part of a word, id or date like 28/09 or 2026-09
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 1)
    if (after === '/' || /\d/.test(after)) continue
    const numStr = m[2].replace('−', '-')
    const unit = normalizeText(m[3] ?? '').replace(/\s/g, '')
    const candidates = new Set<number>()
    let decimals = 0
    if (/^\-?\+?\d{1,3}(\.\d{3})+(,\d+)?$/.test(numStr)) {
      candidates.add(Number(numStr.replace(/\./g, '').replace(',', '.')))
      decimals = numStr.includes(',') ? numStr.split(',')[1].length : 0
      // "4.250" could also be English decimal 4.25 only if exactly one group; keep pt reading.
    } else if (numStr.includes(',')) {
      candidates.add(Number(numStr.replace(',', '.')))
      decimals = numStr.split(',')[1].length
    } else if (numStr.includes('.')) {
      candidates.add(Number(numStr)) // English decimal
      decimals = numStr.split('.')[1].length
    } else candidates.add(Number(numStr))
    const scale = SCALE[unit] ?? 1
    out.push({ raw: m[0].trim(), candidates: [...candidates].filter(Number.isFinite), decimals, scale, unitHint: unit })
  }
  return out
}

function isExempt(t: NumberToken): boolean {
  const n = t.candidates[0]
  if (t.unitHint === 'º' || t.unitHint === 'ª' || t.unitHint === '°') return true
  const quantified = /%|p\.?p\.?|bps|pb|ponto|mil|bilh|trilh/.test(t.unitHint) || /R\$|US\$|\$|€/.test(t.raw)
  if (!quantified && t.decimals === 0 && n >= 1990 && n <= 2100) return true // years
  if (!quantified && t.decimals === 0 && Math.abs(n) <= 12) return true // small counts ("3 insights", "2 turnos")
  return false
}

function factNumbers(f: VerifiedFact): number[] {
  const out: number[] = []
  if (f.value !== null) out.push(f.value)
  if (f.change_pct !== null) out.push(f.change_pct, Math.abs(f.change_pct))
  if (f.previous_value !== null) out.push(f.previous_value)
  if (f.value !== null && f.previous_value !== null) {
    const d = f.value - f.previous_value
    out.push(d, Math.abs(d), Math.abs(d) * 100) // level change, and in bps for rates
  }
  return out
}

export function numberSupported(t: NumberToken, facts: VerifiedFact[]): boolean {
  if (isExempt(t)) return true
  const values = facts.flatMap(factNumbers)
  const tol = (0.5 * 10 ** -t.decimals + 1e-9) * t.scale
  return t.candidates.some((c) => values.some((v) => Math.abs(Math.abs(c * t.scale) - Math.abs(v)) <= tol))
}

/* ------------------------------ Helpers ------------------------------ */

const PT_MARKERS = /\b(de|que|não|para|com|uma|por|mais|como|dos|das|está|são|isso|juros|também)\b/gi
const EN_MARKERS = /\b(the|and|of|is|are|with|that|this|for|which|rates)\b/gi

export function isPortuguese(text: string): boolean {
  const pt = (text.match(PT_MARKERS) ?? []).length
  const en = (text.match(EN_MARKERS) ?? []).length
  return pt >= 3 && pt >= en * 2
}

export function findBannedPhrases(text: string): string[] {
  const n = normalizeText(text)
  return EDITORIAL_PROFILE.bannedPhrases.filter((p) => n.includes(normalizeText(p)))
}

export function findInventedExperience(text: string): boolean {
  return EDITORIAL_PROFILE.inventedExperiencePatterns.some((re) => re.test(text))
}

const CLOSED_WORDS = /\b(fechou|fechamento|encerrou|terminou o pregão|no fechamento)\b/i
const OPINION_WORDS = /\b(minha leitura|eu acho|acredito que|na minha visão|na minha opinião)\b/i

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length
}

/** Text of the brief that the user actually reads (excludes tables and source lists). */
export function briefText(a: AnalysisOutput): string {
  const parts: string[] = []
  for (const w of a.what_matters) parts.push(w.headline, w.why_it_matters)
  for (const r of ['BR', 'US', 'CN', 'EU'] as const) for (const m of a.macro_watch[r]) parts.push(m.text)
  for (const i of a.insights) parts.push(i.title, i.what_happened, i.why_it_happened, i.what_it_changes)
  for (const u of a.uhnw_lens) parts.push(u.text)
  const cl = a.content_lab
  for (const idea of [cl.story, cl.carousel, cl.reel, cl.take, cl.exceptional]) if (idea) parts.push(idea.title, idea.hook, idea.angle)
  return parts.join('\n')
}

const itemTexts = (x: unknown): string[] => Object.values(x as Record<string, unknown>).filter((v): v is string => typeof v === 'string')

/** Removes a few leading filler phrases deterministically ("Vale ressaltar que o..." → "O..."). */
export function stripFillers(text: string): string {
  let t = text
  for (const p of ['é importante destacar que ', 'vale ressaltar que ', 'cabe destacar que ', 'podemos observar que ', 'diante desse contexto, ', 'em suma, ', 'mais do que nunca, ']) {
    const re = new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
    t = t.replace(re, '')
  }
  return t.replace(/(^|[.!?]\s+)([a-zà-ú])/g, (_m, pre: string, c: string) => pre + c.toUpperCase())
}

/* ------------------------------ Main ------------------------------ */

export interface QcInput {
  analysis: AnalysisOutput
  facts: VerifiedFact[]
  marketRows: MarketRow[]
  agenda: AgendaItem[]
}

export interface QcResult {
  analysis: AnalysisOutput
  report: QcReport
}

type Issue = { check: string; detail: string }

function checkItem(item: Cited & object, factsById: Map<string, VerifiedFact>, citable: VerifiedFact[]): { issues: Issue[]; addedFacts: string[] } {
  const issues: Issue[] = []
  const addedFacts: string[] = []
  const cited = item.fact_ids.map((id) => factsById.get(id)).filter((f): f is VerifiedFact => !!f)
  for (const id of item.fact_ids) {
    const f = factsById.get(id)
    if (!f) issues.push({ check: 'material_facts_verified', detail: `fact_id inexistente: ${id}` })
    else if (!isCitable(f)) issues.push({ check: f.is_stale ? 'no_stale_as_current' : 'material_facts_verified', detail: `${f.label} está ${f.verification_status}${f.is_stale ? ' (defasado)' : ''}` })
  }
  const text = itemTexts(item).join(' ')
  for (const t of extractNumbers(text)) {
    if (numberSupported(t, cited.filter(isCitable))) continue
    // Auto-correct missing citation when the number matches exactly one citable fact.
    const match = citable.filter((f) => numberSupported(t, [f]))
    if (match.length === 1) {
      addedFacts.push(match[0].id)
      continue
    }
    issues.push({ check: 'numbers_have_source', detail: `número sem fonte: "${t.raw}"` })
  }
  if (CLOSED_WORDS.test(text) && cited.some((f) => f.category === 'MARKET' && f.market_status === 'OPEN')) {
    issues.push({ check: 'no_market_wrongly_closed', detail: 'texto trata como fechado um mercado em negociação' })
  }
  const banned = findBannedPhrases(text)
  if (banned.length) issues.push({ check: 'no_ai_language', detail: `expressões proibidas: ${banned.join(', ')}` })
  if (findInventedExperience(text)) issues.push({ check: 'no_invented_experience', detail: 'possível experiência pessoal inventada' })
  return { issues, addedFacts }
}

function runChecks(input: QcInput, analysis: AnalysisOutput): { checks: QcCheck[]; perItem: Map<object, Issue[]>; words: number; minutes: number } {
  const factsById = new Map(input.facts.map((f) => [f.id, f]))
  const citable = input.facts.filter(isCitable)
  const perItem = new Map<object, Issue[]>()
  const all: Issue[] = []
  const cl = analysis.content_lab
  const items: (Cited & object)[] = [
    ...analysis.what_matters,
    ...analysis.macro_watch.BR, ...analysis.macro_watch.US, ...analysis.macro_watch.CN, ...analysis.macro_watch.EU,
    ...analysis.insights,
    ...analysis.uhnw_lens,
    cl.story, cl.carousel, cl.reel, cl.take,
    ...(cl.exceptional ? [cl.exceptional] : []),
  ]
  for (const it of items) {
    const { issues, addedFacts } = checkItem(it, factsById, citable)
    if (addedFacts.length) it.fact_ids = [...new Set([...it.fact_ids, ...addedFacts])]
    perItem.set(it, issues)
    all.push(...issues)
  }

  // 3. duplicates
  const seenClusters = new Set<string>()
  const seenHeads = new Set<string>()
  for (const w of analysis.what_matters) {
    const key = normalizeText(w.headline)
    const dupCluster = w.cluster_ids.some((c) => seenClusters.has(c))
    if (dupCluster || seenHeads.has(key)) {
      const issue = { check: 'no_duplicate_news', detail: `evento repetido: "${w.headline}"` }
      perItem.set(w, [...(perItem.get(w) ?? []), issue])
      all.push(issue)
    }
    w.cluster_ids.forEach((c) => seenClusters.add(c))
    seenHeads.add(key)
  }
  // 6. insights separated from facts: grounded, and no opinion inside "what happened"
  for (const i of analysis.insights) {
    if (!i.fact_ids.length && !i.cluster_ids.length) {
      const issue = { check: 'insights_separated', detail: `insight sem fato ou evento de base: "${i.title}"` }
      perItem.set(i, [...(perItem.get(i) ?? []), issue])
      all.push(issue)
    }
    if (OPINION_WORDS.test(i.what_happened)) {
      const issue = { check: 'insights_separated', detail: `opinião misturada ao fato em "${i.title}"` }
      perItem.set(i, [...(perItem.get(i) ?? []), issue])
      all.push(issue)
    }
  }
  // Market table must never label an intraday value as closed.
  for (const r of input.marketRows) {
    if (r.market_status === 'CLOSED' && r.reference === null && r.value !== null) all.push({ check: 'no_market_wrongly_closed', detail: `${r.label} sem data de referência` })
  }
  // 9. Content Lab
  for (const [k, idea] of Object.entries({ story: cl.story, carousel: cl.carousel, reel: cl.reel, take: cl.take })) {
    if (idea.hook.length > 240 || idea.angle.length > 500) {
      const issue = { check: 'content_lab_short', detail: `${k} longo demais` }
      perItem.set(idea, [...(perItem.get(idea) ?? []), issue])
      all.push(issue)
    }
    if (EDITORIAL_PROFILE.forbiddenContentPatterns.some((re) => re.test(idea.title))) {
      const issue = { check: 'content_lab_short', detail: `${k} com formato genérico proibido: "${idea.title}"` }
      perItem.set(idea, [...(perItem.get(idea) ?? []), issue])
      all.push(issue)
    }
  }
  // 10. agenda sources
  for (const a of input.agenda) if (!a.source) all.push({ check: 'agenda_has_source', detail: `${a.name} sem fonte` })

  const text = briefText(analysis)
  const words = wordCount(text)
  const minutes = Math.round((words / EDITORIAL_PROFILE.briefLimits.wordsPerMinute) * 10) / 10
  if (minutes > EDITORIAL_PROFILE.briefLimits.maxReadingMinutes) all.push({ check: 'reading_time', detail: `${words} palavras ≈ ${minutes} min` })
  if (text.trim() && !isPortuguese(text)) all.push({ check: 'portuguese', detail: 'texto não parece estar em português' })

  const DEFS: [string, string][] = [
    ['numbers_have_source', 'Todos os números têm fonte'],
    ['material_facts_verified', 'Fatos materiais verificados'],
    ['no_duplicate_news', 'Nenhuma notícia duplicada'],
    ['no_market_wrongly_closed', 'Nenhum mercado fechado erroneamente'],
    ['no_stale_as_current', 'Nenhum dado antigo como atual'],
    ['insights_separated', 'Insights separados dos fatos'],
    ['portuguese', 'Texto em português'],
    ['reading_time', 'Leitura em até 10 minutos'],
    ['content_lab_short', 'Content Lab curto'],
    ['agenda_has_source', 'Agenda com fonte'],
    ['no_ai_language', 'Sem linguagem genérica de IA'],
    ['no_invented_experience', 'Nenhuma experiência pessoal inventada'],
  ]
  const checks = DEFS.map(([id, label]) => {
    const issues = all.filter((i) => i.check === id)
    return { id, label, passed: issues.length === 0, detail: issues.length ? issues.map((i) => i.detail).slice(0, 5).join(' | ') : null }
  })
  return { checks, perItem, words, minutes }
}

const REMOVED_IDEA = (reason: string): ContentIdea => ({
  title: 'Ideia removida pelo controle de qualidade',
  hook: 'Removida antes de salvar.',
  angle: `Motivo: ${reason}. Gere novamente pelo Content Lab ou via research request.`,
  fact_ids: [],
  cluster_ids: [],
})

export function qualityControl(input: QcInput): QcResult {
  const analysis: AnalysisOutput = structuredClone(input.analysis)
  const corrections: string[] = []

  // Pre-pass: strip filler phrases deterministically.
  const strip = <T extends object>(o: T): T => {
    for (const [k, v] of Object.entries(o)) if (typeof v === 'string') (o as Record<string, unknown>)[k] = stripFillers(v)
    return o
  }
  const before = JSON.stringify(analysis)
  analysis.what_matters.forEach(strip)
  analysis.insights.forEach(strip)
  analysis.uhnw_lens.forEach(strip)
  for (const r of ['BR', 'US', 'CN', 'EU'] as const) analysis.macro_watch[r].forEach(strip)
  if (JSON.stringify(analysis) !== before) corrections.push('Expressões de preenchimento removidas do texto.')

  const first = runChecks(input, analysis)
  const bad = (o: object) => (first.perItem.get(o) ?? []).length > 0
  const reasons = (o: object) => (first.perItem.get(o) ?? []).map((i) => i.detail).join('; ')

  const dropFrom = <T extends object>(list: T[], name: string): T[] =>
    list.filter((it) => {
      if (!bad(it)) return true
      corrections.push(`${name} removido: ${reasons(it)}`)
      return false
    })

  analysis.what_matters = dropFrom(analysis.what_matters, 'Item de "O que importa"').slice(0, 7)
  analysis.insights = dropFrom(analysis.insights, 'Insight').slice(0, 3)
  analysis.uhnw_lens = dropFrom(analysis.uhnw_lens, 'Ponto UHNW').slice(0, 3)
  for (const r of ['BR', 'US', 'CN', 'EU'] as const) analysis.macro_watch[r] = dropFrom(analysis.macro_watch[r], `Macro Watch ${r}`).slice(0, 3)
  const cl = analysis.content_lab
  for (const k of ['story', 'carousel', 'reel', 'take'] as const) {
    if (bad(cl[k])) {
      corrections.push(`Content Lab (${k}) substituído: ${reasons(cl[k])}`)
      cl[k] = REMOVED_IDEA(reasons(cl[k]))
    }
  }
  if (cl.exceptional && bad(cl.exceptional)) {
    corrections.push(`Content Lab (exceptional) removido: ${reasons(cl.exceptional)}`)
    cl.exceptional = null
  }

  // Reading time: trim lowest-priority sections until within limit.
  let pass = runChecks(input, analysis)
  while (pass.minutes > EDITORIAL_PROFILE.briefLimits.maxReadingMinutes) {
    const regions = (['EU', 'CN', 'US', 'BR'] as const).find((r) => analysis.macro_watch[r].length > 1)
    if (regions) analysis.macro_watch[regions].pop()
    else if (analysis.what_matters.length > 5) analysis.what_matters.pop()
    else if (cl.exceptional) cl.exceptional = null
    else if (analysis.uhnw_lens.length > 2) analysis.uhnw_lens.pop()
    else break
    corrections.push('Brief encurtado para caber em 10 minutos.')
    pass = runChecks(input, analysis)
  }

  return {
    analysis,
    report: {
      passed: pass.checks.every((c) => c.passed),
      checks: pass.checks,
      word_count: pass.words,
      reading_minutes: pass.minutes,
      corrections,
    },
  }
}
