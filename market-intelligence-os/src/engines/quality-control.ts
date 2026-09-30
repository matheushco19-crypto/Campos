import { ASSETS } from '../../config/assets'
import { EDITORIAL_PROFILE } from '../../config/editorial-profile'
import type { AgendaItem, AnalysisOutput, ContentLabInput, EventCluster, IntelligenceSnapshot, MarketRow, QcCheck, QcReport, VerifiedFact } from '../core/schemas'
import { isCitable } from '../verification/engine'
import { checkAlignment } from './metric-alignment'
import { normalizeText } from './news-classifier'

/**
 * QUALITY CONTROL OF THE MORNING BRIEF (deterministic, runs before every save).
 *
 *  1 numbers have a source          9 Content Lab is short and specific
 *  2 material facts are VERIFIED   10 agenda has sources
 *  3 no duplicated news            11 no generic AI language
 *  4 no market wrongly "closed"    12 no invented personal experience
 *  5 no stale data as current      13 5–7 events, 1–2 sentences each
 *  6 insights separated from facts 14 single-source news is attributed
 *  7 text is in Portuguese         15 no individualized recommendation
 *  8 reading time ≤ 10 min         16 target length 900–1.200 words (advisory)
 *
 * Failures are corrected (items removed, trimmed or replaced) and the checks
 * re-run. A brief whose blocking checks still fail is never PUBLISHED.
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

export function isExempt(t: NumberToken): boolean {
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
  // Values stored in thousands ("162 mil") may be written with the "mil" scale word.
  if (f.unit === 'mil') return [...out, ...out.map((v) => v * 1000)]
  return out
}

export function numberSupported(t: NumberToken, facts: VerifiedFact[]): boolean {
  if (isExempt(t)) return true
  const values = facts.flatMap(factNumbers)
  const tol = (0.5 * 10 ** -t.decimals + 1e-9) * t.scale
  return t.candidates.some((c) => values.some((v) => Math.abs(Math.abs(c * t.scale) - Math.abs(v)) <= tol))
}

/* ------------------------------ Helpers ------------------------------ */

const PT_MARKERS = /(?<![\p{L}])(de|do|da|em|no|na|ao|os|as|entre|após|sobre|que|não|para|com|uma|por|mais|como|dos|das|está|são|isso|juros|também)(?![\p{L}])/giu
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

/** Sentences in a short text (pt-BR); decimals use commas so periods end sentences. */
export function sentences(text: string): string[] {
  return text
    .trim()
    .split(/(?<=[.!?…])\s+(?=["“(]?[A-ZÀ-Ú0-9])/)
    .map((x) => x.trim())
    .filter(Boolean)
}

const RECOMMENDATION = /\b(recomendo que você|você deve (comprar|vender|investir|resgatar|migrar)|compre agora|venda agora|invista (já|agora)|coloque seu dinheiro|aloque \d+ ?% do seu)\b/i
export function findPersonalRecommendation(text: string): boolean {
  return RECOMMENDATION.test(text)
}

const ATTRIBUTION = /\b(segundo|de acordo com|conforme|informa|informou|reporta|reportou|noticia|noticiou|diz|disse|afirma|afirmou|relata|publicou)\b/i

const CLOSED_WORDS = /\b(fechou|fechamento|encerrou|terminou o pregão|no fechamento)\b/i
const OPINION_WORDS = /\b(minha leitura|eu acho|acredito que|na minha visão|na minha opinião)\b/i

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length
}

/** Text of the brief that the user actually reads (excludes tables and source lists). */
export function briefText(a: AnalysisOutput): string {
  const parts: string[] = [a.lede.text]
  for (const w of a.what_matters) parts.push(w.headline, w.why_it_matters)
  for (const r of ['BR', 'US', 'CN', 'EU'] as const) for (const m of a.macro_watch[r]) parts.push(m.text)
  for (const i of a.insights) parts.push(i.title, i.what_happened, i.why_it_happened, i.what_it_changes)
  for (const u of a.uhnw_lens) parts.push(u.text)
  const cl = a.content_lab
  for (const idea of [cl.story, cl.carousel, cl.take]) parts.push(idea.title, idea.angle, idea.main_idea)
  parts.push(cl.reel.title, cl.reel.angle, cl.reel.main_idea, cl.reel.hook, cl.reel.development, cl.reel.closing, cl.reel.cta)
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
  /** Event clusters, used to require attribution for single-source news. */
  clusters?: EventCluster[]
  /** Facts-only drafts (no interpretation) skip the editorial-shape checks (event count, target length). */
  factsOnly?: boolean
}

export interface QcResult {
  analysis: AnalysisOutput
  report: QcReport
}

type Issue = { check: string; detail: string }

/** Numbers in a sentence that are claims (not years/ordinals/small counts), for metric alignment. */
const claimNumbers = (sentence: string) =>
  extractNumbers(sentence)
    .filter((t) => !isExempt(t))
    .map((t) => ({ raw: t.raw, supportedBy: (f: VerifiedFact) => isCitable(f) && numberSupported(t, [f]) }))

function checkItem(item: Cited & object, factsById: Map<string, VerifiedFact>, citable: VerifiedFact[]): { issues: Issue[]; addedFacts: string[]; aligned: string[] } {
  const issues: Issue[] = []
  const addedFacts: string[] = []
  // Metric alignment first: the named metric's own fact becomes the primary evidence.
  const alignment = checkAlignment(itemTexts(item), item.fact_ids, factsById, citable, claimNumbers)
  const aligned = alignment.attach.filter((id) => !item.fact_ids.includes(id))
  if (aligned.length) item.fact_ids = [...aligned, ...item.fact_ids]
  for (const a of alignment.issues) issues.push({ check: 'metric_alignment', detail: a.detail })
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
  if (findPersonalRecommendation(text)) issues.push({ check: 'no_personal_recommendation', detail: 'recomendação individualizada' })
  if (text.length > 120 && !isPortuguese(text)) issues.push({ check: 'portuguese', detail: `trecho fora do português: "${text.slice(0, 60)}…"` })
  return { issues, addedFacts, aligned }
}

function runChecks(input: QcInput, analysis: AnalysisOutput): { checks: QcCheck[]; perItem: Map<object, Issue[]>; words: number; minutes: number; alignNotes: string[] } {
  const alignNotes: string[] = []
  const factsById = new Map(input.facts.map((f) => [f.id, f]))
  const citable = input.facts.filter(isCitable)
  const perItem = new Map<object, Issue[]>()
  const all: Issue[] = []
  const cl = analysis.content_lab
  const items: (Cited & object)[] = [
    analysis.lede,
    ...analysis.what_matters,
    ...analysis.macro_watch.BR, ...analysis.macro_watch.US, ...analysis.macro_watch.CN, ...analysis.macro_watch.EU,
    ...analysis.insights,
    ...analysis.uhnw_lens,
    cl.story, cl.carousel, cl.reel, cl.take,
  ]
  for (const it of items) {
    const { issues, addedFacts, aligned } = checkItem(it, factsById, citable)
    if (addedFacts.length) it.fact_ids = [...new Set([...it.fact_ids, ...addedFacts])]
    for (const id of aligned) alignNotes.push(`Fato da métrica citada associado como evidência principal: ${factsById.get(id)?.label ?? id}.`)
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
  // 13. each event in 1–2 sentences
  for (const w of analysis.what_matters) {
    const n = sentences(w.why_it_matters).length
    if (n > 2) {
      const issue = { check: 'event_brevity', detail: `"${w.headline}" tem ${n} frases` }
      perItem.set(w, [...(perItem.get(w) ?? []), issue])
      all.push(issue)
    }
  }
  const count = analysis.what_matters.length
  if (!input.factsOnly && (count < 5 || count > 7)) all.push({ check: 'event_count', detail: `${count} acontecimentos (5–7)` })

  // 14. news backed only by single-source clusters must be attributed ("segundo o Valor...")
  const clusterById = new Map((input.clusters ?? []).map((c) => [c.id, c]))
  for (const it of [analysis.lede, ...analysis.what_matters, ...analysis.insights, ...analysis.uhnw_lens] as (Cited & object)[]) {
    if (it.fact_ids.length || !it.cluster_ids.length) continue
    const cited = it.cluster_ids.map((id) => clusterById.get(id)).filter((c): c is EventCluster => !!c)
    if (!cited.length || cited.some((c) => c.verification_status === 'VERIFIED')) continue
    const text = itemTexts(it).join(' ')
    const names = cited.flatMap((c) => c.sources.map((x) => x.source))
    const n = normalizeText(text)
    if (!ATTRIBUTION.test(text) && !names.some((name) => n.includes(normalizeText(name.split(' ')[0])))) {
      const issue = { check: 'single_source_attributed', detail: `notícia de fonte única sem atribuição: "${text.slice(0, 60)}…"` }
      perItem.set(it, [...(perItem.get(it) ?? []), issue])
      all.push(issue)
    }
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
    if (idea.angle.length > 400 || idea.main_idea.length > 400) {
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
  const [lo, hi] = EDITORIAL_PROFILE.briefLimits.targetWords
  if (!input.factsOnly && (words < lo || words > hi)) all.push({ check: 'brief_target', detail: `${words} palavras (meta ${lo}–${hi}, ≈ 8 min)` })

  const DEFS: [string, string, ('block' | 'warn')?][] = [
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
    ['event_count', '5 a 7 acontecimentos'],
    ['event_brevity', 'Cada acontecimento em 1–2 frases'],
    ['single_source_attributed', 'Notícia de fonte única atribuída'],
    ['no_personal_recommendation', 'Sem recomendação individualizada'],
    ['metric_alignment', 'Métrica citada = métrica do fato (sem substituição)'],
    ['brief_target', 'Extensão na meta (900–1.200 palavras)', 'warn'],
  ]
  const checks: QcCheck[] = DEFS.map(([id, label, severity = 'block']) => {
    const issues = all.filter((i) => i.check === id)
    return { id, label, passed: issues.length === 0, detail: issues.length ? issues.map((i) => i.detail).slice(0, 5).join(' | ') : null, severity }
  })
  return { checks, perItem, words, minutes, alignNotes }
}

const REMOVED_IDEA = (reason: string) => ({
  title: 'Ideia removida pelo controle de qualidade',
  angle: `Motivo: ${reason}.`,
  main_idea: 'Removida antes de salvar. Gere de novo a partir dos fatos verificados do dia.',
  fact_ids: [],
  cluster_ids: [],
})
const REMOVED_REEL = (reason: string) => ({ ...REMOVED_IDEA(reason), hook: 'Removido.', development: 'Removido pelo controle de qualidade antes de salvar.', closing: 'Removido.', cta: 'Removido.' })

const PROSE_KEYS = new Set(['text', 'headline', 'why_it_matters', 'title', 'what_happened', 'why_it_happened', 'what_it_changes'])

export function qualityControl(input: QcInput): QcResult {
  const analysis: AnalysisOutput = structuredClone(input.analysis)
  const corrections: string[] = []

  // Pre-pass: strip filler phrases deterministically.
  const strip = <T extends object>(o: T): T => {
    for (const [k, v] of Object.entries(o)) if (typeof v === 'string' && PROSE_KEYS.has(k)) (o as Record<string, unknown>)[k] = stripFillers(v)
    return o
  }
  const before = JSON.stringify(analysis)
  strip(analysis.lede)
  analysis.what_matters.forEach(strip)
  analysis.insights.forEach(strip)
  analysis.uhnw_lens.forEach(strip)
  for (const r of ['BR', 'US', 'CN', 'EU'] as const) analysis.macro_watch[r].forEach(strip)
  if (JSON.stringify(analysis) !== before) corrections.push('Expressões de preenchimento removidas do texto.')

  // Events: keep 1–2 sentences (trimming never adds claims).
  for (const w of analysis.what_matters) {
    const ss = sentences(w.why_it_matters)
    if (ss.length > 2) {
      w.why_it_matters = ss.slice(0, 2).join(' ')
      corrections.push(`"${w.headline}" encurtado para 2 frases.`)
    }
  }

  const first = runChecks(input, analysis)
  corrections.push(...first.alignNotes)
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
  if (bad(analysis.lede)) corrections.push(`Resumo do dia com problema: ${reasons(analysis.lede)}`)
  const cl: ContentLabInput = analysis.content_lab
  for (const k of ['story', 'carousel', 'take'] as const) {
    if (bad(cl[k])) {
      corrections.push(`Content Lab (${k}) substituído: ${reasons(cl[k])}`)
      cl[k] = REMOVED_IDEA(reasons(cl[k]))
    }
  }
  if (bad(cl.reel)) {
    corrections.push(`Content Lab (reel) substituído: ${reasons(cl.reel)}`)
    cl.reel = REMOVED_REEL(reasons(cl.reel))
  }

  // Reading time: trim lowest-priority sections until within limit.
  let pass = runChecks(input, analysis)
  while (pass.minutes > EDITORIAL_PROFILE.briefLimits.maxReadingMinutes) {
    const regions = (['EU', 'CN', 'US', 'BR'] as const).find((r) => analysis.macro_watch[r].length > 1)
    if (regions) analysis.macro_watch[regions].pop()
    else if (analysis.what_matters.length > 5) analysis.what_matters.pop()
    else if (analysis.uhnw_lens.length > 2) analysis.uhnw_lens.pop()
    else break
    corrections.push('Brief encurtado para caber em 10 minutos.')
    pass = runChecks(input, analysis)
  }

  return {
    analysis,
    report: {
      passed: pass.checks.every((c) => c.passed || c.severity === 'warn'),
      checks: pass.checks,
      word_count: pass.words,
      reading_minutes: pass.minutes,
      corrections,
    },
  }
}

/**
 * Stored snapshot → Agent 2 output shape, so QC can be re-run on history (audit).
 * Older versions predate the lede and the Reel script; missing parts become empty strings,
 * which carry no claims.
 */
export function snapshotToAnalysis(snap: IntelligenceSnapshot): AnalysisOutput | null {
  if (!snap.content_lab) return null
  const c = snap.content_lab
  const idea = (x: typeof c.story) => ({ title: x.title, angle: x.angle, main_idea: x.main_idea ?? x.hook ?? '', fact_ids: x.fact_ids, cluster_ids: x.cluster_ids })
  return {
    lede: snap.lede ?? { text: '', fact_ids: [], cluster_ids: [] },
    what_matters: snap.what_matters,
    macro_watch: snap.macro_watch,
    insights: snap.insights,
    uhnw_lens: snap.uhnw_lens,
    content_lab: {
      story: idea(c.story),
      carousel: idea(c.carousel),
      take: idea(c.take),
      reel: { ...idea(c.reel), hook: c.reel.hook ?? '', development: c.reel.development ?? '', closing: c.reel.closing ?? '', cta: c.reel.cta ?? '' },
    },
  }
}
