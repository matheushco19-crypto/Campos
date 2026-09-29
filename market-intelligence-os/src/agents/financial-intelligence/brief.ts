import { ASSETS } from '../../../config/assets'
import { MACRO_INDICATORS } from '../../../config/macro'
import { sourceName } from '../../../config/sources'
import type { AgendaItem, AnalysisOutput, CalendarEvent, ContentLab, EventCluster, MacroRow, MarketRow, NewsTopic, SourceReference, VerifiedFact } from '../../core/schemas'
import { addDays } from '../../core/time'
import { isCitable } from '../../verification/engine'

/* Deterministic parts of the Morning Brief: tables, agenda and sources. No LLM. */

export function buildMarketRows(facts: VerifiedFact[]): MarketRow[] {
  const byMetric = new Map(facts.filter((f) => f.category === 'MARKET').map((f) => [f.metric, f]))
  return ASSETS.filter((a) => a.enabled && a.showInBrief)
    .map((a) => byMetric.get(a.metric))
    .filter((f): f is VerifiedFact => !!f)
    .map((f) => ({
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

export function buildAgenda(events: CalendarEvent[], date: string, horizonDays = 21, maxUpcoming = 8): AgendaItem[] {
  const tomorrow = addDays(date, 1)
  const end = addDays(date, horizonDays)
  const inRange = events.filter((e) => e.date >= date && e.date <= end)
  const bucket = (d: string): AgendaItem['bucket'] => (d === date ? 'today' : d === tomorrow ? 'tomorrow' : 'upcoming')
  const toItem = (e: CalendarEvent): AgendaItem => ({
    event_id: e.id,
    name: e.name,
    date: e.date,
    time: e.time,
    category: e.category,
    region: e.region,
    importance: e.importance,
    source: e.source,
    source_url: e.source_url,
    verification_status: e.verification_status,
    bucket: bucket(e.date),
  })
  const near = inRange.filter((e) => e.date <= tomorrow).map(toItem)
  const upcoming = inRange
    .filter((e) => e.date > tomorrow && e.importance !== 'LOW')
    .sort((a, b) => IMPORTANCE_RANK[a.importance] - IMPORTANCE_RANK[b.importance] || a.date.localeCompare(b.date))
    .slice(0, maxUpcoming)
    .sort((a, b) => a.date.localeCompare(b.date))
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
export function deterministicAnalysis(facts: VerifiedFact[], clusters: EventCluster[]): AnalysisOutput {
  const top = clusters.slice(0, 6)
  const macroFacts = facts.filter((f) => f.category === 'MACRO' && isCitable(f))
  const region = (r: 'BR' | 'US' | 'CN' | 'EU') =>
    macroFacts
      .filter((f) => f.region === r)
      .slice(0, 3)
      .map((f) => ({ text: `${f.label}: ${fmt(f.value as number, f.unit)} (referência ${f.reference_period}, ${sourceName(f.primary_source)}).`, fact_ids: [f.id], cluster_ids: [] }))
  const idea = (title: string) => ({ title, hook: 'Indisponível nesta execução.', angle: 'Content Lab requer a etapa de interpretação (Agent 2 com LLM). Nenhuma ideia foi gerada automaticamente.', fact_ids: [], cluster_ids: [] })
  const content_lab: ContentLab = { story: idea('Story'), carousel: idea('Carrossel'), reel: idea('Reel'), take: idea('Opinião'), exceptional: null }
  return {
    what_matters: top.map((c) => {
      const names = [...new Set(c.sources.map((s) => s.source))]
      return {
        headline: c.title.slice(0, 160),
        why_it_matters: `${names.length > 1 ? `Reportado por ${names.length} fontes (${names.slice(0, 3).join(', ')})` : `Reportado por ${names[0]} (fonte única, não confirmado)`}. Tema: ${TOPIC_PT[c.topic]}.`,
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
