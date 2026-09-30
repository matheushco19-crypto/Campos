import { ASSETS, CORE_MARKETS, DERIVED_SPREADS, DI_BUCKETS } from '../../../config/assets'
import { MACRO_INDICATORS } from '../../../config/macro'
import { sourceName } from '../../../config/sources'
import type { AgendaItem, AnalysisOutput, CalendarEvent, ContentLab, ContentLabInput, EventCluster, MacroRow, MarketRow, NewsTopic, RateVertex, RatesSnapshot, SourceReference, VerifiedFact } from '../../core/schemas'
import { addDays, weekdayOf } from '../../core/time'
import { isCitable } from '../../verification/engine'

/* Deterministic parts of the Morning Brief: tables, agenda and sources. No LLM. */

export function buildMarketRows(facts: VerifiedFact[]): MarketRow[] {
  const byMetric = new Map(facts.filter((f) => f.category === 'MARKET').map((f) => [f.metric, f]))
  const core = new Set<string>(CORE_MARKETS)
  return ASSETS.filter((a) => a.enabled && a.showInBrief)
    .map((a) => byMetric.get(a.metric))
    .filter((f): f is VerifiedFact => !!f)
    .map((f) => ({
      verification_method: f.verification_method,
      core: core.has(f.metric),
      session: f.session?.session ?? null,
      metric: f.metric,
      label: f.label,
      region: f.region,
      value: f.value,
      unit: f.unit,
      change_pct: f.change_pct,
      reference: f.reference_period,
      market_status: f.market_status,
      verification_status: f.verification_status,
      fact_id: f.id,
      is_stale: f.is_stale,
      source_fallback: f.source_fallback,
    }))
}

const TREASURY_TENORS: [string, string][] = [
  ['US_UST_3M', '3M'],
  ['US_UST_6M', '6M'],
  ['US_UST_1Y', '1Y'],
  ['US_UST_2Y', '2Y'],
  ['US_UST_5Y', '5Y'],
  ['US10Y', '10Y'],
  ['US_UST_20Y', '20Y'],
  ['US_UST_30Y', '30Y'],
]
const HIGHLIGHT = new Set(['2Y', '5Y', '10Y', '30Y'])
const POLICY = ['BR_SELIC_TARGET', 'BR_SELIC_EFFECTIVE', 'BR_CDI', 'US_FED_FUNDS_UPPER', 'EU_ECB_DEPOSIT_RATE']

/** Curves section, straight from facts. Change in bps = value − previous (same source series), never estimated. */
export function buildRates(facts: VerifiedFact[]): RatesSnapshot {
  const byMetric = new Map(facts.map((f) => [f.metric, f]))
  const vertex = (f: VerifiedFact, tenor: string, highlight = false): RateVertex => ({
    metric: f.metric,
    label: f.label,
    tenor,
    value: f.value,
    unit: f.unit,
    change_bps:
      f.value === null || f.previous_value === null ? null : f.unit === 'bps' ? Math.round((f.value - f.previous_value) * 100) / 100 : Math.round((f.value - f.previous_value) * 10000) / 100,
    reference: f.reference_period,
    source: f.primary_source ? sourceName(f.primary_source) : null,
    verification_status: f.verification_status,
    verification_method: f.verification_method,
    fact_id: f.id,
    instrument: f.instrument,
    highlight,
    note: f.verification_status === 'VERIFIED' ? null : f.notes,
  })
  const pick = (metric: string) => byMetric.get(metric)
  return {
    treasury: TREASURY_TENORS.flatMap(([m, t]) => (pick(m) ? [vertex(pick(m)!, t, HIGHLIGHT.has(t))] : [])),
    spreads: DERIVED_SPREADS.flatMap((d) => (pick(d.metric) ? [vertex(pick(d.metric)!, d.label.replace('Spread ', ''), true)] : [])),
    di: DI_BUCKETS.flatMap(([b]) => (pick(`BR_DI1_${b}`) ? [vertex(pick(`BR_DI1_${b}`)!, b, false)] : [])),
    policy: POLICY.flatMap((m) => (pick(m) ? [vertex(pick(m)!, '—', m.startsWith('BR_SELIC'))] : [])),
  }
}

export function buildMacroRows(facts: VerifiedFact[]): MacroRow[] {
  const byMetric = new Map(facts.filter((f) => f.category === 'MACRO').map((f) => [f.metric, f]))
  return MACRO_INDICATORS.filter((m) => m.enabled)
    .map((m) => byMetric.get(m.metric))
    .filter((f): f is VerifiedFact => !!f)
    .map((f) => ({
      metric: f.metric,
      label: f.label,
      region: f.region,
      value: f.value,
      unit: f.unit,
      reference: f.reference_period,
      verification_status: f.verification_status,
      fact_id: f.id,
      is_stale: f.is_stale,
    }))
}

const IMPORTANCE_RANK = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const

/**
 * Editorial priority of recurring events (lower = more important). Events not
 * matched keep their importance ordering after these.
 */
export const EVENT_PRIORITY: [RegExp, number][] = [
  [/\bcopom\b/i, 0],
  [/\bipca\b(?!-15)|pre[çc]os ao consumidor amplo(?! ?-? ?15)/i, 1],
  [/\bpayroll\b|employment situation/i, 2],
  [/\bcpi\b|consumer price index/i, 3],
  [/\bfomc\b|federal reserve/i, 4],
  [/\becb\b|bce\b/i, 5],
  [/\bpmi\b|\bism\b/i, 6],
  [/fiscal|tesouro|arrecada|resultado prim[áa]rio|or[çc]amento|dívida/i, 7],
  [/regula|cvm|reforma|lei |projeto de lei|receita federal/i, 8],
  [/resultado|balan[çc]o|earnings|ipo\b/i, 9],
]

export function eventPriority(name: string): number {
  return EVENT_PRIORITY.find(([re]) => re.test(name))?.[1] ?? 20
}

/** Last day (Sunday) of the ISO week that contains `date`. */
export function endOfWeek(date: string): string {
  const wd = weekdayOf(date) // 0 = Sunday
  return addDays(date, wd === 0 ? 0 : 7 - wd)
}

const CATEGORY_ANGLE: Record<string, string> = {
  MACRO: 'Explicar o mecanismo: como o dado ou a decisão chega a juros, câmbio, valuation e patrimônio.',
  POLICY: 'Separar fato de ruído: impacto econômico e fiscal documentado, sem viés político nem previsão.',
  TAX: 'Fato legal com fonte, depois a leitura econômica e o possível impacto patrimonial, sem aconselhamento categórico.',
  REGULATION: 'O que muda na prática para investidores e famílias, e o que ainda não se sabe.',
  MARKET: 'Contexto histórico e o que o movimento sinaliza sobre prêmio de risco.',
  CORPORATE: 'O que o resultado revela sobre o ciclo econômico, além da empresa.',
  GEOPOLITICS: 'Canais de transmissão para o portfólio: commodities, dólar e aversão a risco.',
  TECH: 'Da tecnologia ao valuation: por que expectativas longas deixam esses ativos sensíveis a juros.',
}

export function editorialAngle(e: Pick<CalendarEvent, 'category' | 'content_opportunity'>): string | null {
  return e.content_opportunity ?? CATEGORY_ANGLE[e.category] ?? null
}

export function buildAgenda(events: CalendarEvent[], date: string, horizonDays = 21, maxUpcoming = 10): AgendaItem[] {
  const tomorrow = addDays(date, 1)
  const weekEnd = endOfWeek(date)
  const end = addDays(date, horizonDays)
  const inRange = events.filter((e) => e.date >= date && e.date <= end)
  const bucket = (d: string): AgendaItem['bucket'] => (d === date ? 'today' : d === tomorrow ? 'tomorrow' : d <= weekEnd ? 'week' : 'upcoming')
  const toItem = (e: CalendarEvent): AgendaItem => ({
    event_id: e.id,
    name: e.name,
    date: e.date,
    time: e.time,
    timezone: e.timezone,
    category: e.category,
    region: e.region,
    importance: e.importance,
    source: e.source,
    source_url: e.source_url,
    verification_status: e.verification_status,
    bucket: bucket(e.date),
    content_opportunity: e.category === 'HOLIDAY' ? null : editorialAngle(e),
  })
  const rank = (e: CalendarEvent) => eventPriority(e.name) * 10 + IMPORTANCE_RANK[e.importance]
  const byDay = (a: CalendarEvent, b: CalendarEvent) => a.date.localeCompare(b.date) || (a.time ?? '99').localeCompare(b.time ?? '99') || rank(a) - rank(b)
  const near = inRange.filter((e) => e.date <= weekEnd || e.date <= tomorrow).filter((e) => e.date <= tomorrow || e.importance !== 'LOW').sort(byDay).map(toItem)
  const upcoming = inRange
    .filter((e) => e.date > weekEnd && e.date > tomorrow && e.importance !== 'LOW')
    .sort((a, b) => rank(a) - rank(b) || a.date.localeCompare(b.date))
    .slice(0, maxUpcoming)
    .sort(byDay)
    .map(toItem)
  return [...near, ...upcoming]
}

export function buildSourceReferences(facts: VerifiedFact[], clusters: EventCluster[], agenda: AgendaItem[], usedClusterIds?: Set<string>): SourceReference[] {
  const refs = new Map<string, SourceReference>()
  const add = (name: string, url: string | null, used_for: string) => {
    if (!url || !/^https?:\/\//.test(url)) return
    const key = url.split('?')[0]
    const cur = refs.get(key)
    if (cur) {
      if (!cur.used_for.includes(used_for)) cur.used_for = `${cur.used_for}, ${used_for}`
    } else refs.set(key, { name, url: key, used_for })
  }
  for (const f of facts) {
    if (f.value === null) continue
    add(sourceName(f.primary_source), f.primary_url, f.label)
    if (f.secondary_source) add(sourceName(f.secondary_source), f.secondary_url, `${f.label} (validação)`)
  }
  for (const c of clusters) {
    if (usedClusterIds && !usedClusterIds.has(c.id)) continue
    for (const s of c.sources) add(s.source, s.url, 'Notícia')
  }
  for (const a of agenda) add(a.source, a.source_url, `Agenda: ${a.name}`)
  // Group by source name so the list stays short: one representative link per source + usage.
  const grouped = new Map<string, SourceReference>()
  for (const r of refs.values()) {
    const g = grouped.get(r.name)
    if (!g) grouped.set(r.name, { ...r })
    else if (r.used_for === 'Notícia') grouped.set(`${r.name}::${r.url}`, r)
    else g.used_for = [...new Set(`${g.used_for}, ${r.used_for}`.split(', '))].join(', ')
  }
  return [...grouped.values()].slice(0, 60)
}

/* ------------------------------ Deterministic fallback ------------------------------ */

export const TOPIC_PT: Record<NewsTopic, string> = {
  markets: 'mercados', economy: 'economia', monetary_policy: 'política monetária', fiscal: 'fiscal', tax: 'tributação', regulation: 'regulação',
  politics: 'política', banking_credit: 'bancos e crédito', capital_markets: 'mercado de capitais', corporate: 'empresas', m_and_a: 'M&A',
  technology: 'tecnologia', ai: 'inteligência artificial', geopolitics: 'geopolítica', commodities: 'commodities', international: 'internacional', wealth: 'patrimônio', other: 'geral',
}

const fmt = (v: number, unit: string) => {
  const digits = unit === 'pts' ? 0 : unit === 'mil' ? 0 : 2
  return `${v.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })}${unit === '%' || unit.startsWith('%') ? unit.replace(/^%/, '%') : ` ${unit}`}`
}

/**
 * Facts-only brief used when no LLM is available (or the LLM failed).
 * It states facts and attributions only. No interpretation is fabricated.
 */
export function deterministicAnalysis(facts: VerifiedFact[], clusters: EventCluster[], news: NewsItem[] = []): AnalysisOutput {
  // Headlines carrying press numbers (not verified facts) or written in English would be stripped by QC:
  // the deterministic brief picks the next eligible events instead (order = relevance ranking).
  const eligible = (c: EventCluster) => !/\d/.test(c.title.replace(/\b[A-Z][A-Za-z]{1,6}[-\s]?\d{1,3}\b/g, '')) && (c.title.match(/\b(the|and|of|is|are|with|for|to|in|on)\b/gi) ?? []).length < 2
  const top = [...clusters.filter(eligible), ...clusters.filter((c) => !eligible(c))].slice(0, 6)
  const macroFacts = facts.filter((f) => f.category === 'MACRO' && isCitable(f))
  const region = (r: 'BR' | 'US' | 'CN' | 'EU') =>
    macroFacts
      .filter((f) => f.region === r)
      .slice(0, 3)
      .map((f) => ({ text: `${f.label}: ${fmt(f.value as number, f.unit)} (referência ${f.reference_period}, ${sourceName(f.primary_source)}).`, fact_ids: [f.id], cluster_ids: [] }))
  const idea = (title: string) => ({ title, angle: 'Indisponível nesta versão: depende da etapa de interpretação do analista.', main_idea: 'Nenhuma ideia foi gerada de forma automática nesta execução.', fact_ids: [], cluster_ids: [] })
  const content_lab: ContentLabInput = {
    story: idea('Story'),
    carousel: idea('Carrossel'),
    reel: { ...idea('Reel'), hook: 'Indisponível nesta versão.', development: 'Indisponível nesta execução, sem a etapa de interpretação do analista.', closing: 'Indisponível nesta versão.', cta: 'Indisponível nesta versão.' },
    take: idea('Opinião'),
  }
  const lede = top.length
    ? { text: `Briefing apenas com fatos: ${top.length} eventos do noticiário e os dados verificados abaixo, sem interpretação nesta versão.`, fact_ids: [], cluster_ids: [] }
    : { text: 'Briefing apenas com fatos verificados, sem interpretação nesta versão.', fact_ids: [], cluster_ids: [] }
  const newsById = new Map(news.map((n) => [n.id, n]))
  const cleanSummary = (text: string) => text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 360)
  const synthesis = (c: EventCluster) => {
    const first = c.item_ids.map((id) => newsById.get(id)).find((n) => n?.original_summary)
    const summary = first?.original_summary ? cleanSummary(first.original_summary) : ''
    const names = [...new Set(c.sources.map((s) => s.source))]
    const provenance = names.length > 1 ? 'Fontes: ' + names.slice(0, 3).join(', ') + '.' : 'Fonte única: ' + (names[0] ?? 'não identificada') + '; não confirmado por fonte independente.'
    return summary ? summary + ' ' + provenance : provenance + ' Tema: ' + TOPIC_PT[c.topic] + '.'
  }
  return {
    lede,
    what_matters: top.map((c) => {
      const names = [...new Set(c.sources.map((s) => s.source))]
      return {
        headline: c.title.slice(0, 160),
        why_it_matters: synthesis(c),
        fact_ids: [],
        cluster_ids: [c.id],
      }
    }),
    macro_watch: { BR: region('BR'), US: region('US'), CN: region('CN'), EU: region('EU') },
    insights: [],
    uhnw_lens: [],
    content_lab,
  }
}

/** Agent 2's content (strict) → stored Content Lab shape. */
export function toStoredContentLab(c: ContentLabInput): ContentLab {
  const idea = (x: ContentLabInput['story']) => ({ ...x, hook: null })
  return { story: idea(c.story), carousel: idea(c.carousel), take: idea(c.take), reel: { ...c.reel } }
}
