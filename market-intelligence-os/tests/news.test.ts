import { describe, expect, it } from 'vitest'
import { parseFeed, cleanText } from '../src/agents/market-intelligence/collectors/news'
import { classifyNews } from '../src/engines/news-classifier'
import { clusterNews, dedupeExact, similarity, tokenize } from '../src/engines/news-clustering'
import { DATE, news } from './helpers'

describe('duplicate news & event clustering', () => {
  it('drops exact duplicates (same canonical URL or headline)', () => {
    const items = [
      news({ id: 'a', headline: 'Fed mantém juros', source_id: 'x', url: 'https://www.a.com/n?utm_source=tw' }),
      news({ id: 'b', headline: 'Outra coisa', source_id: 'y', url: 'https://a.com/n' }),
      news({ id: 'c', headline: 'Fed mantém juros', source_id: 'z', url: 'https://c.com/2' }),
    ]
    expect(dedupeExact(items).map((i) => i.id)).toEqual(['a'])
  })
  it('clusters 5 stories about the same event into ONE event with many sources', () => {
    const items = [
      news({ id: '1', headline: 'Fed holds interest rates steady', source_id: 'rss-bbc-business', source: 'BBC' }),
      news({ id: '2', headline: 'Fed keeps rates unchanged as inflation cools', source_id: 'rss-cnbc-markets', source: 'CNBC' }),
      news({ id: '3', headline: 'Fed mantém juros inalterados', source_id: 'rss-g1-economia', source: 'g1' }),
      news({ id: '4', headline: 'Federal Reserve holds rates', source_id: 'rss-fed-press', source: 'Fed' }),
      news({ id: '5', headline: 'Fed mantém taxa de juros e sinaliza cautela', source_id: 'rss-infomoney', source: 'InfoMoney' }),
      news({ id: '6', headline: 'Petrobras anuncia novo plano de investimentos', source_id: 'rss-infomoney', source: 'InfoMoney', topic: 'corporate', region: 'BR' }),
    ]
    const { clusters, items: out } = clusterNews(items, DATE, { officialSourceIds: new Set(['rss-fed-press']) })
    expect(clusters).toHaveLength(2)
    const fed = clusters.find((c) => c.item_ids.includes('1'))!
    expect(fed.item_ids.sort()).toEqual(['1', '2', '3', '4', '5'])
    expect(fed.verification_status).toBe('VERIFIED')
    expect(out.every((i) => i.event_cluster_id)).toBe(true)
    const single = clusters.find((c) => c.item_ids.includes('6'))!
    expect(single.verification_status).toBe('UNVERIFIED')
  })
  it('bilingual canonical tokens make PT and EN headlines comparable', () => {
    expect(similarity(tokenize('Fed mantém juros'), tokenize('Fed holds rates'))).toBeGreaterThanOrEqual(0.5)
    expect(similarity(tokenize('Fed mantém juros'), tokenize('Vale reports iron ore output'))).toBeLessThan(0.2)
  })
  it('classifies deterministically', () => {
    const c = classifyNews('Copom mantém Selic em 15%', '')
    expect(c.topic).toBe('monetary_policy')
    expect(c.region).toBe('BR')
    expect(c.importance).toBeGreaterThan(50)
  })
})

describe('RSS/Atom parsing treats external content as untrusted text', () => {
  it('parses RSS and strips markup/scripts', () => {
    const xml = `<?xml version="1.0"?><rss><channel><item><title><![CDATA[Juros &amp; câmbio]]></title><link>https://x.com/a</link><pubDate>Mon, 28 Sep 2026 22:00:00 GMT</pubDate><description><![CDATA[<p>Texto <script>alert(1)</script><b>forte</b></p>]]></description></item></channel></rss>`
    const [e] = parseFeed(xml)
    expect(e.title).toBe('Juros & câmbio')
    expect(e.summary).toBe('Texto forte')
    expect(e.link).toBe('https://x.com/a')
  })
  it('parses Atom', () => {
    const xml = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>ECB decision</title><link rel="alternate" href="https://ecb.example/p"/><updated>2026-09-28T12:00:00Z</updated><summary>Rates</summary></entry></feed>`
    expect(parseFeed(xml)[0]).toMatchObject({ title: 'ECB decision', link: 'https://ecb.example/p' })
  })
  it('truncates long summaries (no large copied excerpts)', () => {
    expect(cleanText('a'.repeat(1000), 100)).toHaveLength(100)
  })
})
