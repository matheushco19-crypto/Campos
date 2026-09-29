import { XMLParser } from 'fast-xml-parser'
import { RSS_FEEDS, SOURCES } from '../../../../config/sources'
import { fetchText, type FetchOptions } from '../../../core/http'
import { stableId } from '../../../core/ids'
import { pool } from '../../../core/pool'
import type { NewsItem, RunError, SourceHealth } from '../../../core/schemas'
import { classifyNews } from '../../../engines/news-classifier'

export interface FeedEntry {
  title: string
  link: string
  published: string | null
  summary: string
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

/** Strips tags and decodes entities. External text is data, never markup. */
export function cleanText(input: unknown, maxLen = 400): string {
  const s = String(input ?? '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === '#') {
        const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
        return Number.isFinite(code) ? String.fromCodePoint(code) : ' '
      }
      return ENTITIES[e.toLowerCase()] ?? m
    })
    .replace(/\s+/g, ' ')
    .trim()
  return s.length > maxLen ? `${s.slice(0, maxLen - 1).trimEnd()}…` : s
}

const textOf = (v: unknown): string => {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') return String((v as Record<string, unknown>)['#text'] ?? '')
  return String(v)
}

/** Parses RSS 2.0, RSS 1.0 (RDF) and Atom. */
export function parseFeed(xml: string): FeedEntry[] {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', processEntities: false, htmlEntities: false })
  const doc = parser.parse(xml)
  const asArray = <T,>(x: T | T[] | undefined): T[] => (x === undefined ? [] : Array.isArray(x) ? x : [x])

  const rssItems = asArray(doc?.rss?.channel?.item ?? doc?.['rdf:RDF']?.item)
  if (rssItems.length) {
    return rssItems.map((it: Record<string, unknown>) => ({
      title: cleanText(textOf(it.title), 300),
      link: textOf(it.link).trim() || textOf(it.guid).trim(),
      published: textOf(it.pubDate ?? it['dc:date']) || null,
      summary: cleanText(textOf(it.description ?? it['content:encoded']), 400),
    }))
  }
  const entries = asArray(doc?.feed?.entry)
  return entries.map((e: Record<string, unknown>) => {
    const links = asArray(e.link as Record<string, string> | Record<string, string>[])
    const href = links.find((l) => !l['@_rel'] || l['@_rel'] === 'alternate')?.['@_href'] ?? links[0]?.['@_href'] ?? ''
    return {
      title: cleanText(textOf(e.title), 300),
      link: href,
      published: textOf(e.published ?? e.updated) || null,
      summary: cleanText(textOf(e.summary ?? e.content), 400),
    }
  })
}

export interface NewsCollectResult {
  items: NewsItem[]
  health: SourceHealth[]
  errors: RunError[]
}

export async function collectNews(briefDate: string, now = new Date(), opts: { windowHours?: number; http?: FetchOptions; feeds?: Record<string, string> } = {}): Promise<NewsCollectResult> {
  const windowMs = (opts.windowHours ?? 30) * 3_600_000
  const feeds = opts.feeds ?? RSS_FEEDS
  const res: NewsCollectResult = { items: [], health: [], errors: [] }
  const retrievedAt = now.toISOString()

  const thunks = Object.entries(feeds).map(([sourceId, url]) => async () => {
    const src = SOURCES.find((s) => s.id === sourceId)
    if (!src || !src.enabled) return
    const started = Date.now()
    try {
      const entries = parseFeed(await fetchText(url, { timeoutMs: 10_000, retries: 1, ...opts.http }))
      let kept = 0
      for (const e of entries) {
        if (!e.title || !/^https?:\/\//.test(e.link)) continue
        const published = e.published ? new Date(e.published) : null
        if (!published || Number.isNaN(published.getTime())) continue
        const age = now.getTime() - published.getTime()
        if (age > windowMs || age < -3_600_000) continue
        const c = classifyNews(e.title, e.summary, { officialSource: src.authority === 'official', defaultRegion: src.regions[0] })
        res.items.push({
          id: stableId('news', e.link),
          headline: e.title,
          original_summary: e.summary,
          published_at: published.toISOString(),
          retrieved_at: retrievedAt,
          source: src.name,
          source_id: src.id,
          url: e.link,
          ...c,
          verification_status: src.authority === 'official' ? 'VERIFIED' : 'UNVERIFIED',
          event_cluster_id: null,
          brief_date: briefDate,
        })
        kept++
      }
      res.health.push({ source_id: sourceId, ok: true, items: kept, latency_ms: Date.now() - started, error: null })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      res.health.push({ source_id: sourceId, ok: false, items: 0, latency_ms: Date.now() - started, error: message })
      res.errors.push({ step: 'collect_news', source: sourceId, message, at: new Date().toISOString() })
    }
  })
  await pool(thunks, 4)
  return res
}
