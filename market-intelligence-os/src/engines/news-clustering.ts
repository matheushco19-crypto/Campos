import { stableId } from '../core/ids'
import type { EventCluster, NewsItem, VerificationStatus } from '../core/schemas'
import { normalizeText } from './news-classifier'

/**
 * NEWS DEDUPLICATION + EVENT CLUSTERING (deterministic).
 * Ten stories about the same event become ONE event with many sources.
 *
 * 1. exact dedupe: same canonical URL or same normalized headline;
 * 2. near-duplicate clustering: token-set similarity (Jaccard + containment),
 *    with a small bilingual canonical vocabulary so "Fed mantém juros" and
 *    "Fed holds rates" land in the same event, within a 36h window.
 */

const STOPWORDS = new Set(
  (
    'a o os as um uma uns umas de do da dos das em no na nos nas por para com sem sob sobre entre e ou que se ao aos à às ' +
    'the a an of in on at to for from by with and or as is are was were be been its it this that after before over into says said new ' +
    'diz afirma segundo apos antes ate mais menos como ja nao sim ser tem vai pode podem deve devem hoje ontem amanha'
  ).split(/\s+/),
)

const CANON: Record<string, string> = {
  'federal reserve': 'fed', fomc: 'fed', powell: 'fed',
  juros: 'rate', rates: 'rate', interest: 'rate', taxa: 'rate', taxas: 'rate', selic: 'selic',
  mantem: 'hold', mantém: 'hold', holds: 'hold', keeps: 'hold', unchanged: 'hold', estaveis: 'hold',
  corta: 'cut', cuts: 'cut', reduz: 'cut', lowers: 'cut', corte: 'cut',
  eleva: 'hike', raises: 'hike', hikes: 'hike', sobe: 'hike', aumenta: 'hike', alta: 'hike',
  inflacao: 'inflation', precos: 'prices', petroleo: 'oil', crude: 'oil', dolar: 'dollar', tarifas: 'tariff', tarifa: 'tariff', tariffs: 'tariff',
  bolsa: 'stocks', acoes: 'stocks', shares: 'stocks', equities: 'stocks', eua: 'us', 'estados unidos': 'us', 'united states': 'us',
  china: 'china', chines: 'china', chinese: 'china', europa: 'europe', european: 'europe', emprego: 'jobs', empregos: 'jobs', payrolls: 'jobs',
  desemprego: 'unemployment', pib: 'gdp', bce: 'ecb', guerra: 'war',
}

export function tokenize(headline: string): Set<string> {
  let text = normalizeText(headline)
  for (const phrase of Object.keys(CANON).filter((k) => k.includes(' '))) text = text.replaceAll(phrase, CANON[phrase])
  const tokens = text
    .split(/[\s.-]+/)
    .map((t) => CANON[t] ?? t)
    .map((t) => (t.length > 4 && t.endsWith('s') ? t.slice(0, -1) : t))
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
  return new Set(tokens)
}

export function similarity(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0
  let inter = 0
  for (const t of a) if (b.has(t)) inter++
  const jaccard = inter / (a.size + b.size - inter)
  const containment = inter / Math.min(a.size, b.size)
  // Containment catches short headline vs long headline on the same event.
  return Math.max(jaccard, containment * 0.8)
}

export function canonicalUrl(url: string): string {
  try {
    const u = new URL(url)
    u.hash = ''
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|at_|cmpid|ref|fbclid|gclid)/i.test(k)) u.searchParams.delete(k)
    return `${u.hostname.replace(/^www\./, '')}${u.pathname.replace(/\/$/, '')}${u.search}`
  } catch {
    return url
  }
}

export function dedupeExact(items: NewsItem[]): NewsItem[] {
  const seenUrl = new Set<string>()
  const seenHead = new Set<string>()
  const out: NewsItem[] = []
  for (const it of [...items].sort((a, b) => a.published_at.localeCompare(b.published_at))) {
    const cu = canonicalUrl(it.url)
    const nh = normalizeText(it.headline)
    if (seenUrl.has(cu) || seenHead.has(nh)) continue
    seenUrl.add(cu)
    seenHead.add(nh)
    out.push(it)
  }
  return out
}

export interface ClusterOptions {
  threshold?: number
  windowHours?: number
  officialSourceIds?: Set<string>
}

export function clusterNews(items: NewsItem[], briefDate: string, opts: ClusterOptions = {}): { clusters: EventCluster[]; items: NewsItem[] } {
  const threshold = opts.threshold ?? 0.5
  const windowMs = (opts.windowHours ?? 36) * 3_600_000
  const official = opts.officialSourceIds ?? new Set<string>()
  const unique = dedupeExact(items)

  type Work = { tokens: Set<string>; members: NewsItem[] }
  const groups: Work[] = []
  // Most important first, so each cluster's seed is its strongest headline.
  for (const it of [...unique].sort((a, b) => b.importance - a.importance)) {
    const tk = tokenize(it.headline)
    let best: Work | null = null
    let bestScore = 0
    for (const g of groups) {
      const inWindow = g.members.some((m) => Math.abs(Date.parse(m.published_at) - Date.parse(it.published_at)) <= windowMs)
      if (!inWindow) continue
      const s = Math.max(...g.members.map((m) => similarity(tokenize(m.headline), tk)))
      if (s > bestScore) {
        bestScore = s
        best = g
      }
    }
    if (best && bestScore >= threshold) {
      best.members.push(it)
      for (const t of tk) best.tokens.add(t)
    } else groups.push({ tokens: tk, members: [it] })
  }

  const clusters: EventCluster[] = []
  const outItems: NewsItem[] = []
  for (const g of groups) {
    const seed = g.members[0]
    const id = stableId('evt', briefDate, canonicalUrl(seed.url))
    const distinctSources = new Set(g.members.map((m) => m.source_id))
    const hasOfficial = g.members.some((m) => official.has(m.source_id))
    const status: VerificationStatus = hasOfficial || distinctSources.size >= 2 ? 'VERIFIED' : 'UNVERIFIED'
    const times = g.members.map((m) => m.published_at).sort()
    // Each additional independent source adds weight (cap +20).
    const boost = Math.min(20, (distinctSources.size - 1) * 8)
    const max = (k: 'importance' | 'market_relevance' | 'uhnw_relevance' | 'social_relevance') => Math.min(100, Math.max(...g.members.map((m) => m[k])) + boost)
    clusters.push({
      id,
      title: seed.headline,
      topic: seed.topic,
      region: seed.region,
      first_published_at: times[0],
      last_published_at: times.at(-1)!,
      item_ids: g.members.map((m) => m.id),
      sources: g.members.map((m) => ({ source: m.source, url: m.url, headline: m.headline })),
      importance: max('importance'),
      market_relevance: max('market_relevance'),
      uhnw_relevance: max('uhnw_relevance'),
      social_relevance: max('social_relevance'),
      verification_status: status,
      brief_date: briefDate,
      // Filled by engines/relevance.ts.
      relevance_score: 0,
      relevance_components: {},
      hard_override: false,
      hard_override_reason: null,
      geography: seed.region,
      domain: 'other',
      metric_target: null,
      market_signals: [],
      rank_bucket: 'tail',
    })
    for (const m of g.members) outItems.push({ ...m, event_cluster_id: id, verification_status: status })
  }
  clusters.sort((a, b) => b.importance - a.importance)
  return { clusters, items: outItems }
}
