import { z } from 'zod'
import { SocialPostMetrics } from '../core/schemas'
import { csvObjects } from '../agents/market-intelligence/collectors/parsers'

/**
 * SOCIAL METRICS
 * SocialMetricsProvider abstracts where Instagram metrics come from.
 * MVP: ManualImportProvider (CSV/JSON exported by the user). A Meta Graph API
 * provider can implement the same interface later. No integration is faked.
 */
export interface SocialMetricsProvider {
  readonly id: string
  fetchPosts(): Promise<SocialPostMetrics[]>
}

export class ManualImportProvider implements SocialMetricsProvider {
  readonly id = 'manual-import'
  constructor(
    private readonly content: string,
    private readonly format: 'csv' | 'json',
  ) {}

  async fetchPosts(): Promise<SocialPostMetrics[]> {
    return parseSocialImport(this.content, this.format)
  }
}

/** Column aliases accepted in CSV imports (Meta Business Suite exports use varied names). */
const ALIASES: Record<string, keyof SocialPostMetrics> = {
  id: 'post_id', post_id: 'post_id', 'post id': 'post_id',
  published_at: 'published_at', date: 'published_at', 'publish time': 'published_at', data: 'published_at',
  format: 'format', type: 'format', 'post type': 'format', formato: 'format',
  content_type: 'content_type', tipo_conteudo: 'content_type',
  topic: 'topic', tema: 'topic', caption: 'caption', description: 'caption', legenda: 'caption',
  reach: 'reach', alcance: 'reach', impressions: 'impressions', impressoes: 'impressions', views: 'views', visualizacoes: 'views', plays: 'views',
  watch_time_s: 'watch_time_s', avg_watch_time_s: 'avg_watch_time_s', completion_rate: 'completion_rate',
  likes: 'likes', curtidas: 'likes', comments: 'comments', comentarios: 'comments', shares: 'shares', compartilhamentos: 'shares',
  saves: 'saves', salvamentos: 'saves', profile_visits: 'profile_visits', 'profile visits': 'profile_visits', follows: 'follows', seguidores: 'follows',
  link_clicks: 'link_clicks', 'link clicks': 'link_clicks',
}

const FORMAT_MAP: Record<string, SocialPostMetrics['format']> = {
  reel: 'reel', reels: 'reel', video: 'reel', carousel: 'carousel', carrossel: 'carousel', 'carousel_album': 'carousel',
  story: 'story', stories: 'story', image: 'post', post: 'post', foto: 'post', photo: 'post',
}

function normalizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) {
    const key = ALIASES[k.trim().toLowerCase()]
    if (!key) continue
    out[key] = v
  }
  const numeric: (keyof SocialPostMetrics)[] = ['reach', 'impressions', 'views', 'watch_time_s', 'avg_watch_time_s', 'likes', 'comments', 'shares', 'saves', 'profile_visits', 'follows', 'link_clicks']
  for (const k of numeric) if (out[k] !== undefined && out[k] !== '') out[k] = Number(String(out[k]).replace(/\./g, '').replace(',', '.'))
  if (out.completion_rate !== undefined && out.completion_rate !== '') {
    const c = Number(String(out.completion_rate).replace('%', '').replace(',', '.'))
    out.completion_rate = c > 1 ? c / 100 : c
  } else delete out.completion_rate
  if (typeof out.format === 'string') out.format = FORMAT_MAP[out.format.toLowerCase()] ?? 'post'
  if (out.published_at) {
    const d = new Date(String(out.published_at))
    if (!Number.isNaN(d.getTime())) out.published_at = d.toISOString()
  }
  if (out.post_id !== undefined) out.post_id = String(out.post_id)
  return out
}

export function parseSocialImport(content: string, format: 'csv' | 'json'): SocialPostMetrics[] {
  const rows: Record<string, unknown>[] = format === 'json' ? z.array(z.record(z.string(), z.unknown())).parse(JSON.parse(content)) : csvObjects(content)
  const out: SocialPostMetrics[] = []
  const errors: string[] = []
  rows.forEach((r, i) => {
    const parsed = SocialPostMetrics.safeParse(normalizeRow(r))
    if (parsed.success) out.push(parsed.data)
    else errors.push(`linha ${i + 1}: ${parsed.error.issues.map((x) => `${x.path.join('.')} ${x.message}`).join(', ')}`)
  })
  if (!out.length && errors.length) throw new Error(`Importação inválida: ${errors.slice(0, 3).join(' | ')}`)
  return out
}

/* ------------------------------ Analytics ------------------------------ */

export interface DerivedMetrics {
  post_id: string
  format: SocialPostMetrics['format']
  content_type: SocialPostMetrics['content_type']
  topic: string
  published_at: string
  reach: number
  engagement_rate: number
  save_rate: number
  share_rate: number
  profile_conversion: number
  follow_conversion: number
  content_efficiency: number
}

const safe = (n: number, d: number) => (d > 0 ? n / d : 0)
const r4 = (n: number) => Math.round(n * 10000) / 10000

export function deriveMetrics(p: SocialPostMetrics): DerivedMetrics {
  const base = p.reach || p.impressions || p.views
  return {
    post_id: p.post_id,
    format: p.format,
    content_type: p.content_type,
    topic: p.topic,
    published_at: p.published_at,
    reach: base,
    engagement_rate: r4(safe(p.likes + p.comments + p.shares + p.saves, base)),
    save_rate: r4(safe(p.saves, base)),
    share_rate: r4(safe(p.shares, base)),
    profile_conversion: r4(safe(p.profile_visits, base)),
    follow_conversion: r4(safe(p.follows, p.profile_visits)),
    // Weighted toward high-intent actions: shares and saves signal authority, follows signal growth.
    content_efficiency: r4(safe(p.shares * 3 + p.saves * 2 + p.comments + p.follows * 5, base)),
  }
}

const median = (xs: number[]) => {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

const LABELS: Record<string, string> = {
  contextual: 'explicação contextual', news: 'puramente noticiosos', educational: 'educacionais', opinion: 'de opinião', personal: 'pessoais', other: 'outros',
  reel: 'Reels', carousel: 'carrosséis', story: 'stories', post: 'posts estáticos',
}
const METRIC_LABELS: Record<string, string> = { share_rate: 'compartilhamentos', save_rate: 'salvamentos', engagement_rate: 'engajamento', follow_conversion: 'conversão em seguidores', content_efficiency: 'eficiência' }

export interface Pattern {
  statement: string
  dimension: 'content_type' | 'format' | 'topic'
  metric: string
  winner: string
  loser: string
  lift_pct: number
  n: [number, number]
}

/** Detects patterns deterministically: medians by group, lift ≥ 20%, n ≥ 3 per group. */
export function detectPatterns(posts: SocialPostMetrics[], minN = 3, minLift = 0.2): Pattern[] {
  const derived = posts.map(deriveMetrics)
  const out: Pattern[] = []
  for (const dimension of ['content_type', 'format', 'topic'] as const) {
    const groups = new Map<string, DerivedMetrics[]>()
    for (const d of derived) groups.set(d[dimension], [...(groups.get(d[dimension]) ?? []), d])
    const valid = [...groups.entries()].filter(([, g]) => g.length >= minN)
    for (const metric of ['share_rate', 'save_rate', 'follow_conversion'] as const) {
      const ranked = valid.map(([k, g]) => ({ k, n: g.length, m: median(g.map((x) => x[metric])) })).sort((a, b) => b.m - a.m)
      if (ranked.length < 2) continue
      const [best, worst] = [ranked[0], ranked.at(-1)!]
      if (worst.m <= 0 || best.m / worst.m - 1 < minLift) continue
      const lift = Math.round((best.m / worst.m - 1) * 100)
      const name = (k: string) => LABELS[k] ?? k
      out.push({
        statement: `Conteúdos ${dimension === 'format' ? 'em formato de ' : ''}${name(best.k)} tiveram ${METRIC_LABELS[metric]} (mediana) ${lift}% maior que ${name(worst.k)} (n=${best.n} vs n=${worst.n}).`,
        dimension,
        metric,
        winner: best.k,
        loser: worst.k,
        lift_pct: lift,
        n: [best.n, worst.n],
      })
    }
  }
  return out.sort((a, b) => b.lift_pct - a.lift_pct).slice(0, 8)
}

export function summarize(posts: SocialPostMetrics[]) {
  const d = posts.map(deriveMetrics)
  return {
    posts: posts.length,
    median_reach: median(d.map((x) => x.reach)),
    median_engagement_rate: r4(median(d.map((x) => x.engagement_rate))),
    median_save_rate: r4(median(d.map((x) => x.save_rate))),
    median_share_rate: r4(median(d.map((x) => x.share_rate))),
    median_follow_conversion: r4(median(d.map((x) => x.follow_conversion))),
    by_format: Object.fromEntries(
      (['reel', 'carousel', 'story', 'post'] as const).map((f) => {
        const g = d.filter((x) => x.format === f)
        return [f, { n: g.length, median_efficiency: r4(median(g.map((x) => x.content_efficiency))) }]
      }),
    ),
  }
}
