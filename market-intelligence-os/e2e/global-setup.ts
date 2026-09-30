/**
 * Seeds two days of history through the REAL pipeline (Agent 1 → verification →
 * Agent 3 → Agent 2 → QC → snapshot) using offline collection bundles, then
 * publishes a hand-off analysis for the latest day.
 */
import { rmSync } from 'node:fs'
import { FileStore } from '../src/storage/file-store'
import { Repository } from '../src/storage/repository'
import { runMorningIntelligence, submitAnalysis } from '../src/agents/orchestrator'
import type { CollectionBundle } from '../src/agents/market-intelligence'
import { goodAnalysis } from '../tests/fixtures/analysis'

function bundle(date: string, collectedAt: string, spx: number): CollectionBundle {
  const obs = (sourceId: string, metric: string, value: number, extra: Record<string, unknown> = {}) => ({
    sourceId, category: 'MARKET' as const, metric, value, unit: 'pts', referencePeriod: date, asOf: `${date}T20:00:00Z`, retrievedAt: collectedAt, url: `https://example.org/${sourceId}/${metric}`, ...extra,
  })
  return {
    version: 1, collected_at: collectedAt, brief_date: date, collector_host: 'e2e',
    observations: [
      obs('stooq', 'SPX', spx, { changePct: 0.8 }),
      obs('fred', 'SPX', spx + 1),
      obs('bcb-sgs', 'BR_SELIC_TARGET', 15, { category: 'MACRO', unit: '% a.a.', referencePeriod: '2026-09-17', asOf: '2026-09-17T03:00:00Z' }),
    ],
    news: [
      { id: `n1-${date}`, headline: 'Fed holds interest rates steady', original_summary: '', published_at: `${date}T02:00:00Z`, retrieved_at: collectedAt, source: 'BBC', source_id: 'rss-bbc-business', url: `https://news.example/1-${date}`, topic: 'monetary_policy', region: 'US', importance: 70, market_relevance: 70, uhnw_relevance: 40, social_relevance: 60, verification_status: 'UNVERIFIED', event_cluster_id: null, brief_date: date },
      { id: `n2-${date}`, headline: 'Fed mantém juros inalterados', original_summary: '', published_at: `${date}T03:00:00Z`, retrieved_at: collectedAt, source: 'g1', source_id: 'rss-g1-economia', url: `https://news.example/2-${date}`, topic: 'monetary_policy', region: 'US', importance: 68, market_relevance: 70, uhnw_relevance: 40, social_relevance: 60, verification_status: 'UNVERIFIED', event_cluster_id: null, brief_date: date },
    ],
    health: [], errors: [], skipped: [], calendar: [],
  }
}

export default async function globalSetup() {
  rmSync('e2e/.data', { recursive: true, force: true })
  process.env.MI_SILENT = '1'
  const repo = new Repository(new FileStore('e2e/.data'))
  await runMorningIntelligence(repo, { now: new Date('2026-09-28T08:00:00Z'), bundle: bundle('2026-09-28', '2026-09-28T08:00:00Z', 6500), mode: 'deterministic', skipNetworkCalendar: true, processResearch: false })
  await runMorningIntelligence(repo, { now: new Date('2026-09-29T08:00:00Z'), bundle: bundle('2026-09-29', '2026-09-29T08:00:00Z', 6550), mode: 'claude_code', skipNetworkCalendar: true, processResearch: false })
  const packet = (await repo.getAnalysisPacket('2026-09-29'))!.packet as { citable_facts: { id: string; label: string }[]; clusters: { id: string }[] }
  const spx = packet.citable_facts.find((f) => f.label === 'S&P 500')!.id
  const selic = packet.citable_facts.find((f) => f.label === 'Selic meta')!.id
  const analysis = goodAnalysis()
  analysis.lede = { text: 'Segundo a imprensa internacional, o Fed segurou os juros, e o S&P 500 subiu 0,8% mesmo assim.', fact_ids: [spx], cluster_ids: [packet.clusters[0].id] }
  analysis.what_matters[1] = { headline: 'S&P 500 sobe', why_it_matters: 'O índice fechou em 6.550 pontos, puxado por tecnologia, sinal de apetite por duration longa.', fact_ids: [spx], cluster_ids: [] }
  const json = JSON.stringify(analysis).replaceAll('f_spx', spx).replaceAll('f_selic', selic).replaceAll('c_fed', packet.clusters[0].id)
  await submitAnalysis(repo, '2026-09-29', JSON.parse(json), new Date('2026-09-29T08:30:00Z'))
}
