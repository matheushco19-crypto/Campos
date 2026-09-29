import { ManualImportProvider } from '@/social/metrics'
import { getRepository } from '@/storage/repository'

export const dynamic = 'force-dynamic'

/** Manual import of Instagram metrics (CSV or JSON body). Max 2 MB. */
export async function POST(req: Request) {
  const text = await req.text()
  if (text.length > 2_000_000) return Response.json({ error: 'payload too large' }, { status: 413 })
  const format = (req.headers.get('content-type') ?? '').includes('json') ? 'json' : 'csv'
  try {
    const posts = await new ManualImportProvider(text, format).fetchPosts()
    await getRepository().upsertSocialPosts(posts)
    return Response.json({ imported: posts.length })
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 })
  }
}
