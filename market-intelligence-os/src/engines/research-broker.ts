import { ASSETS } from '../../config/assets'
import { MACRO_INDICATORS } from '../../config/macro'
import { sourceName } from '../../config/sources'
import { newId } from '../core/ids'
import type { AgentName, Level, ResearchRequest, VerifiedFact } from '../core/schemas'
import { toLocalDate } from '../core/time'
import { collectMacro } from '../agents/market-intelligence/collectors/macro'
import { collectMarkets } from '../agents/market-intelligence/collectors/market'
import { RunLogger } from '../observability/run-logger'
import type { Repository } from '../storage/repository'
import { verifyAll } from '../verification/engine'
import { normalizeText } from './news-classifier'

/**
 * RESEARCH BROKER
 * Any agent that lacks a number creates a research_request instead of guessing.
 * Agent 1 answers it via the same collect → verify → verified_facts path.
 * The answer is a set of fact ids, never free text.
 */

const KEYWORDS: [RegExp, string][] = [
  [/\bselic\b/, 'BR_SELIC_TARGET'], [/\bipca\b.*12|12.*\bipca\b/, 'BR_IPCA_12M'], [/\bipca\b/, 'BR_IPCA_MOM'], [/igp-?m/, 'BR_IGPM_MOM'],
  [/desemprego.*(brasil|pnad)|pnad/, 'BR_UNEMPLOYMENT'], [/ibc-?br/, 'BR_IBCBR'], [/divida bruta/, 'BR_GROSS_DEBT_GDP'], [/focus.*ipca/, 'BR_FOCUS_IPCA_CY'],
  [/fed funds|juros.*(eua|fed)/, 'US_FED_FUNDS_UPPER'], [/\bcpi\b/, 'US_CPI_YOY'], [/payroll/, 'US_PAYROLLS_CHANGE'], [/\bpce\b/, 'US_PCE_YOY'],
  [/desemprego.*(eua|estados unidos)/, 'US_UNEMPLOYMENT'], [/pib.*(eua|estados unidos)|us gdp/, 'US_GDP_QOQ_SAAR'], [/\becb\b|\bbce\b/, 'EU_ECB_DEPOSIT_RATE'], [/hicp|inflacao.*(zona do euro|europa)/, 'EU_HICP_YOY'],
  [/ibovespa|\bibov\b/, 'IBOV'], [/s&p|sp500|s&p 500/, 'SPX'], [/nasdaq/, 'NASDAQ'], [/dow jones/, 'DJI'], [/treasury|10 ?anos.*eua|10y/, 'US10Y'], [/\bdxy\b/, 'DXY'],
  [/dolar|usd\/?brl/, 'USDBRL'], [/euro.*real|eur\/?brl/, 'EURBRL'], [/bitcoin|\bbtc\b/, 'BTCUSD'], [/nikkei/, 'NIKKEI'], [/hang seng/, 'HANGSENG'], [/\bdax\b/, 'DAX'], [/ftse/, 'FTSE100'],
]

export function resolveMetric(question: string): string | null {
  const q = normalizeText(question)
  return KEYWORDS.find(([re]) => re.test(q))?.[1] ?? null
}

export async function createResearchRequest(
  repo: Repository,
  req: { requested_by: AgentName; question: string; metric?: string | null; priority?: Level; deadline?: string | null; required_sources?: string[] },
): Promise<ResearchRequest> {
  const r: ResearchRequest = {
    id: newId('rr'),
    requested_by: req.requested_by,
    question: req.question,
    metric: req.metric ?? resolveMetric(req.question),
    priority: req.priority ?? 'MEDIUM',
    deadline: req.deadline ?? null,
    required_sources: req.required_sources ?? [],
    status: 'PENDING',
    response: null,
    created_at: new Date().toISOString(),
    completed_at: null,
  }
  await repo.saveResearchRequest(r)
  return r
}

function describe(f: VerifiedFact): string {
  const v = f.value === null ? 'indisponível' : `${f.value.toLocaleString('pt-BR')} ${f.unit}`
  return `${f.label}: ${v} (referência ${f.reference_period ?? '—'}, fonte ${sourceName(f.primary_source)}${f.secondary_source ? `, validado por ${sourceName(f.secondary_source)}` : ''}; status ${f.verification_status}).`
}

export async function processResearchRequest(repo: Repository, r: ResearchRequest, now = new Date(), opts: { allowNetwork?: boolean } = {}): Promise<ResearchRequest> {
  const logger = await new RunLogger(repo, 'research-broker', { job: 'ON_DEMAND_RESEARCH', briefDate: toLocalDate(now) }).start()
  const update = async (patch: Partial<ResearchRequest>) => {
    Object.assign(r, patch)
    await repo.saveResearchRequest(r)
  }
  await update({ status: 'IN_PROGRESS' })
  try {
    if (!r.metric) {
      await update({
        status: 'FAILED',
        completed_at: new Date().toISOString(),
        response: { summary: 'Pergunta não mapeada para uma métrica com fonte estruturada. Não há resposta factual automática: requer pesquisa manual com fonte.', fact_ids: [], notes: null },
      })
      await logger.finish('FAILED')
      return r
    }
    const date = toLocalDate(now)
    let fact = (await repo.getLatestFactsForDate(date)).find((f) => f.metric === r.metric) ?? null

    // Missing or not verified today → targeted collection (only that metric).
    if ((!fact || fact.verification_status !== 'VERIFIED') && opts.allowNetwork !== false) {
      const asset = ASSETS.find((a) => a.metric === r.metric)
      const ind = MACRO_INDICATORS.find((m) => m.metric === r.metric)
      const collected = asset ? await collectMarkets(now, [asset]) : ind ? await collectMacro(now, [ind]) : null
      if (collected) {
        logger.sources(collected.health)
        logger.errors(collected.errors)
        const { facts } = verifyAll(collected.observations, { briefDate: date, runId: logger.id, now }, asset ? [asset] : [], ind ? [ind] : [])
        if (facts[0]) {
          await repo.upsertFacts(facts)
          fact = facts[0]
        }
      }
    }
    fact ??= await repo.getPreviousFact(r.metric, toLocalDate(new Date(now.getTime() + 86_400_000)))

    if (!fact || fact.value === null) {
      await update({ status: 'FAILED', completed_at: new Date().toISOString(), response: { summary: 'Dado indisponível em todas as fontes. Nenhum valor foi estimado.', fact_ids: fact ? [fact.id] : [], notes: fact?.notes ?? null } })
      await logger.finish('FAILED')
      return r
    }
    const status = fact.verification_status === 'CONFLICT' ? 'CONFLICT' : 'COMPLETED'
    await update({
      status,
      completed_at: new Date().toISOString(),
      response: { summary: describe(fact), fact_ids: [fact.id], notes: fact.verification_status === 'VERIFIED' ? null : `Atenção: dado ${fact.verification_status}. ${fact.notes ?? ''}`.trim() },
    })
    logger.counts({ items_collected: 1, items_verified: fact.verification_status === 'VERIFIED' ? 1 : 0 })
    await logger.finish('SUCCESS')
    return r
  } catch (e) {
    await update({ status: 'FAILED', completed_at: new Date().toISOString(), response: { summary: `Falha na pesquisa: ${e instanceof Error ? e.message : String(e)}`, fact_ids: [], notes: null } })
    logger.error('research', e instanceof Error ? e.message : String(e))
    await logger.finish('FAILED')
    return r
  }
}

export async function processPendingResearch(repo: Repository, now = new Date(), opts: { allowNetwork?: boolean } = {}) {
  const pending = await repo.getResearchRequests('PENDING')
  const out: ResearchRequest[] = []
  for (const r of pending.slice(0, 10)) out.push(await processResearchRequest(repo, r, now, opts))
  return out
}
