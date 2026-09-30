/**
 * Market Intelligence OS CLI.
 *
 *   npm run mi -- morning [--date YYYY-MM-DD] [--bundle file.json] [--observations obs.json] [--mode anthropic_api|claude_code|deterministic]
 *        --observations: RawObservation[] fetched outside the collectors (e.g. BRAPI MCP in a Claude session)
 *   npm run mi -- collect --out bundle.json          # collection only (portable bundle)
 *   npm run mi -- packet [--date]                    # print pending analysis packet (Claude Code hand-off)
 *   npm run mi -- submit --date D --file analysis.json
 *   npm run mi -- close-refresh | weekly
 *   npm run mi -- research "Qual foi o IPCA de agosto?"
 *   npm run mi -- import-social metrics.csv|metrics.json
 *   npm run mi -- audit [--date]                     # automatic audit of the latest snapshot
 *   npm run mi -- runs [--date]                      # observability
 *   npm run mi -- sync --from data                   # copy a local file store into Supabase (append-safe)
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { z } from 'zod'
import { collectBundle, CollectionBundle } from '../src/agents/market-intelligence'
import { FINANCIAL_INTELLIGENCE_INSTRUCTIONS } from '../src/agents/financial-intelligence'
import { runMarketCloseRefresh, runMorningIntelligence, runWeeklySocialStrategy, submitAnalysis } from '../src/agents/orchestrator'
import { AnalysisOutput, RawObservation } from '../src/core/schemas'
import { toLocalDate } from '../src/core/time'
import { auditSnapshot } from '../src/engines/audit'
import { createResearchRequest, processResearchRequest } from '../src/engines/research-broker'
import { ManualImportProvider } from '../src/social/metrics'
import { getRepository } from '../src/storage/repository'
import { FileStore } from '../src/storage/file-store'
import { SupabaseStore } from '../src/storage/supabase-store'
import { TABLES, type TableName } from '../src/storage/store'
import { getEnv } from '../src/core/env'

const args = process.argv.slice(2)
const cmd = args[0]
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : undefined
}

async function main() {
  const repo = getRepository()
  const now = new Date()
  switch (cmd) {
    case 'morning': {
      const bundlePath = flag('bundle')
      const bundle = bundlePath ? CollectionBundle.parse(JSON.parse(readFileSync(bundlePath, 'utf8'))) : undefined
      const obsPath = flag('observations')
      const extraObservations = obsPath ? z.array(RawObservation).parse(JSON.parse(readFileSync(obsPath, 'utf8'))) : undefined
      const date = flag('date') ?? bundle?.brief_date
      const res = await runMorningIntelligence(repo, {
        extraObservations,
        now: bundle ? new Date(bundle.collected_at) : now,
        date,
        bundle,
        mode: flag('mode') as 'anthropic_api' | 'claude_code' | 'deterministic' | undefined,
        skipNetworkCalendar: args.includes('--offline'),
      })
      console.log(JSON.stringify({ run_id: res.runId, date: res.date, status: res.status, stages: res.stages, snapshot: res.snapshot?.id, qc: res.snapshot?.qc.checks.filter((c) => !c.passed) }, null, 2))
      break
    }
    case 'collect': {
      const date = flag('date') ?? toLocalDate(now)
      const bundle = await collectBundle(date, now)
      const out = flag('out') ?? `bundle-${date}.json`
      writeFileSync(out, JSON.stringify(bundle, null, 1))
      const ok = bundle.health.filter((h) => h.ok).length
      console.log(`bundle → ${out}: ${bundle.observations.length} observações, ${bundle.news.length} notícias, fontes ok ${ok}/${bundle.health.length}`)
      break
    }
    case 'packet': {
      const date = flag('date') ?? toLocalDate(now)
      const p = await repo.getAnalysisPacket(date)
      if (!p) throw new Error(`Nenhum pacote para ${date}`)
      console.log(JSON.stringify({ date, status: p.status, instructions: FINANCIAL_INTELLIGENCE_INSTRUCTIONS, output_schema: z.toJSONSchema(AnalysisOutput), packet: p.packet }, null, 1))
      break
    }
    case 'submit': {
      const date = flag('date') ?? toLocalDate(now)
      const file = flag('file')
      if (!file) throw new Error('--file obrigatório')
      const snap = await submitAnalysis(repo, date, JSON.parse(readFileSync(file, 'utf8')), now)
      console.log(JSON.stringify({ snapshot: snap.id, status: snap.status, qc_passed: snap.qc.passed, corrections: snap.qc.corrections, words: snap.qc.word_count, minutes: snap.qc.reading_minutes }, null, 2))
      break
    }
    case 'close-refresh': {
      const bundlePath = flag('bundle')
      const bundle = bundlePath ? CollectionBundle.parse(JSON.parse(readFileSync(bundlePath, 'utf8'))) : undefined
      console.log(JSON.stringify(await runMarketCloseRefresh(repo, now, bundle), null, 2))
      break
    }
    case 'weekly': {
      const r = await runWeeklySocialStrategy(repo, now)
      console.log(JSON.stringify({ run: r.runId, status: r.status, opportunities: r.opportunities.length }, null, 2))
      break
    }
    case 'research': {
      const q = args.slice(1).filter((a) => !a.startsWith('--')).join(' ')
      const r = await createResearchRequest(repo, { requested_by: 'orchestrator', question: q })
      console.log(JSON.stringify(await processResearchRequest(repo, r, now, { allowNetwork: !args.includes('--offline') }), null, 2))
      break
    }
    case 'import-social': {
      const file = args[1]
      const posts = await new ManualImportProvider(readFileSync(file, 'utf8'), file.endsWith('.json') ? 'json' : 'csv').fetchPosts()
      await repo.upsertSocialPosts(posts)
      console.log(`${posts.length} posts importados`)
      break
    }
    case 'audit': {
      const date = flag('date') ?? toLocalDate(now)
      const snap = await repo.getLatestSnapshot(date)
      if (!snap) throw new Error(`Nenhum snapshot para ${date}`)
      const facts = await repo.getLatestFactsForDate(date)
      const runs = await repo.getRuns({ briefDate: date, limit: 20 })
      console.log(JSON.stringify(auditSnapshot(snap, facts, runs), null, 2))
      break
    }
    case 'runs': {
      const runs = await repo.getRuns({ briefDate: flag('date'), limit: 20 })
      for (const r of runs) console.log(`${r.started_at}  ${r.agent.padEnd(24)} ${r.status.padEnd(18)} errors=${r.errors.length} collected=${r.items_collected} verified=${r.items_verified}  ${r.run_id}`)
      break
    }
    case 'sync': {
      const env = getEnv()
      if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios')
      const from = new FileStore(flag('from') ?? 'data')
      const to = new SupabaseStore(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
      for (const table of Object.keys(TABLES) as TableName[]) {
        const rows = await from.select(table)
        if (!rows.length) continue
        if (table === 'intelligence_snapshots') {
          // Append-only: insert only versions that don't exist yet.
          const existing = new Set((await to.select<{ id: string }>(table, { select: ['id'] })).map((r) => r.id))
          const fresh = rows.filter((r) => !existing.has(String(r.id)))
          await to.insert(table, fresh)
          console.log(`${table}: ${fresh.length} novas versões`)
        } else {
          await to.upsert(table, rows)
          console.log(`${table}: ${rows.length} linhas`)
        }
      }
      break
    }
    default:
      console.log(readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0])
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
