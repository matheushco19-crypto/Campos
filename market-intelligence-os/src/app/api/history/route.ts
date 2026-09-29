import { normalizeText } from '@/engines/news-classifier'
import { getRepository } from '@/storage/repository'

export const dynamic = 'force-dynamic'

/** Historical search across the latest version of the last 120 briefs. */
export async function GET(req: Request) {
  const q = normalizeText(new URL(req.url).searchParams.get('q') ?? '').slice(0, 80)
  if (q.length < 3) return Response.json({ hits: [] })
  const repo = getRepository()
  const dates = (await repo.listSnapshotDates()).slice(0, 120)
  const hits: { date: string; version: number; kind: string; text: string }[] = []
  for (const date of dates) {
    const s = await repo.getLatestSnapshot(date)
    if (!s) continue
    const add = (kind: string, text: string) => normalizeText(text).includes(q) && hits.push({ date, version: s.version, kind, text: text.slice(0, 180) })
    s.what_matters.forEach((w) => add('O que importa', w.headline))
    s.insights.forEach((i) => add('Insight', i.title))
    s.news_snapshot.forEach((c) => add('Notícia', c.title))
    if (hits.length >= 30) break
  }
  return Response.json({ hits: hits.slice(0, 30) })
}
