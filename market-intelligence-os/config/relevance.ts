import type { NewsTopic } from '../src/core/schemas'

/**
 * RELEVANCE, OVERRIDES, SHOCKS, COVERAGE AND PACKET BUDGET — one place to tune.
 * Everything here is deterministic: no LLM filters or ranks news (docs/relevance.md).
 */

/** relevance_score (0–100) = Σ component (0–1) × weight. Weights sum to 100. */
export const RELEVANCE_WEIGHTS = {
  materiality: 25,
  sources: 20,
  market_impact: 20,
  novelty: 15,
  authority: 10,
  wealth: 10,
} as const

/** Adjustments calibrated on the real 30/09/2026 run (docs/relevance.md). */
export const RELEVANCE_TUNING = {
  /** Materiality floor (0–1) for hard-override events. */
  overrideMaterialityFloor: 0.8,
  /** Market-impact floor (0–1) for hard-override events. */
  overrideMarketFloor: 0.7,
  /** Materiality multiplier for agenda/roundup headlines (they announce, they are not the event). */
  roundupFactor: 0.6,
  /** Days after an official release during which news naming that metric is treated as the release itself. */
  releaseWindowDays: 7,
} as const

/** Agenda / roundup headlines ("Agenda do dia", "Manhã no mercado", "o que acompanhar"). Normalized text. */
export const ROUNDUP = /\b(agenda do dia|manha no mercado|o que (voce precisa saber|acompanhar|esperar)|resumo do dia|morning bid|what to watch|destaques do dia|abertura de mercado)\b/

/** Independent-source ladder (distinct outlets in the cluster). */
export const SOURCE_LADDER: [number, number][] = [
  [4, 1],
  [3, 0.8],
  [2, 0.6],
  [1, 0.25],
]

/** Hours between the latest story and the morning run (05:00 BRT) → novelty. */
export const NOVELTY_LADDER: [number, number][] = [
  [12, 1],
  [24, 0.7],
  [36, 0.4],
  [Infinity, 0.1],
]

export const AUTHORITY_SCORE: Record<string, number> = { official: 1, exchange: 0.9, data_vendor: 0.7, press: 0.6, unofficial_vendor: 0.3, manual: 0.5 }

/**
 * HARD OVERRIDES — event classes that can never be dropped from the day's selection.
 * An override guarantees presence (top clusters, or the watchlist when the top is
 * full of other overrides), NOT the headline. Matched on normalized headlines.
 */
export const HARD_OVERRIDES: { id: string; label: string; pattern: RegExp }[] = [
  { id: 'central_bank', label: 'Decisão de banco central', pattern: /\b(copom|fomc|banco central (mantem|eleva|corta|reduz|decide)|central bank (holds|raises|cuts|decision)|boj|pboc|bank of england|juros basicos|rate decision|decisao de juros|decisao do copom|fed (holds|raises|cuts|mantem|eleva|corta)|selic (sobe|cai|e mantida|mantida|vai a|sera|corte|alta|elevada|reduzida))\b/ },
  { id: 'ecb', label: 'ECB', pattern: /\b(ecb|bce|lagarde)\b/ },
  { id: 'regulator', label: 'Regulador', pattern: /\b(cvm|sec charges|sec approves|cmn|susep|anbima|bacen regula|banco central regula|resolucao cmn)\b/ },
  { id: 'inflation', label: 'Inflação', pattern: /\b(ipca(-15)?|igp-?m|cpi|pce|hicp|inflacao (oficial|ao consumidor|sobe|cai|acelera|desacelera|recua|avanca|fica|surpreende|anual|em 12 meses)|inflation (rate|data|report|rises|falls|cools|accelerates|slows|eases|jumps))\b/ },
  { id: 'employment', label: 'Emprego', pattern: /\b(payrolls?|nonfarm|desemprego|unemployment|pnad|caged|jobless)\b/ },
  { id: 'gdp', label: 'PIB / atividade', pattern: /\b(pib( \w+){0,4} (cresce|cai|recua|avanca|sobe|fica|encolhe|surpreende)|pib (do (primeiro|segundo|terceiro|quarto|\d) ?o? trimestre|trimestral)|gdp (grows|growth|contracts|shrinks|rises|falls|data)|recessao|recession|ibc-?br)\b/ },
  { id: 'fiscal_tax', label: 'Fiscal / tributário', pattern: /\b(arcabouco|meta fiscal|resultado primario|deficit primario|contas publicas|divida (bruta|publica)|reforma tributaria|imposto de renda|irpf|itcmd|iof|orcamento|shutdown|debt ceiling|teto da divida)\b/ },
  { id: 'sovereign', label: 'Default / rating soberano', pattern: /\b(default soberano|sovereign default|rating soberano|rebaixa(mento)? (de )?rating|downgrade|moody.?s|fitch|s&p global ratings)\b/ },
  { id: 'banking_crisis', label: 'Crise bancária', pattern: /\b(crise bancaria|banking crisis|bank run|corrida bancaria|quebra de banco|bank collapse|liquidacao extrajudicial|resgate bancario|bailout)\b/ },
  { id: 'geopolitics', label: 'Geopolítica / guerra / sanções', pattern: /\b(guerra|war|invasao|invasion|ataque (militar|a[eé]reo|com m[ií]sseis)|airstrikes?|missil|misseis|missiles?|sancoes|sanctions|cessar-fogo|ceasefire|otan|nato|alerta nuclear)\b/ },
  { id: 'oil_shock', label: 'Choque de petróleo', pattern: /\b(petroleo (dispara|despenca|salta|sobe|cai)|oil (soars|plunges|spikes|jumps|tumbles)|opep|opec)\b/ },
  { id: 'systemic_corporate', label: 'Evento corporativo sistêmico', pattern: /\b(recuperacao judicial|chapter 11|falencia|bankruptcy|fraude contabil|accounting fraud|calote)\b/ },
]

/**
 * MARKET SHOCK SIGNALS — daily moves above these thresholds become relevance signals.
 * A move is a signal, never a cause: no causal narrative is generated from it.
 */
export const SHOCK_THRESHOLDS: { metric: string; pct?: number; bps?: number; related: RegExp }[] = [
  { metric: 'IBOV', pct: 2, related: /\b(ibovespa|bolsa|b3|acoes)\b/ },
  { metric: 'SPX', pct: 1.5, related: /\b(s&p|wall street|stocks|acoes americanas|bolsas? (de )?(nova york|eua))\b/ },
  { metric: 'NASDAQ', pct: 2, related: /\b(nasdaq|tech|big techs?|tecnologia|nvidia)\b/ },
  { metric: 'DJI', pct: 1.5, related: /\b(dow|wall street)\b/ },
  { metric: 'USDBRL', pct: 1.5, related: /\b(dolar|cambio|real|dollar)\b/ },
  { metric: 'EURBRL', pct: 1.5, related: /\b(euro|cambio)\b/ },
  { metric: 'US_UST_2Y', bps: 12, related: /\b(treasur|yields?|fed|juros americanos)\b/ },
  { metric: 'US10Y', bps: 10, related: /\b(treasur|yields?|fed|juros americanos)\b/ },
  { metric: 'BR_DI1_12M', bps: 20, related: /\b(juros futuros|di1?|curva de juros|copom|selic|fiscal)\b/ },
  { metric: 'BR_DI1_60M', bps: 20, related: /\b(juros futuros|di1?|curva de juros|fiscal|arcabouco)\b/ },
  { metric: 'BTCUSD', pct: 5, related: /\b(bitcoin|btc|cripto|crypto)\b/ },
]

/** Topic → analytical domain carried to Agent 2. */
export const DOMAIN_OF: Record<NewsTopic, string> = {
  monetary_policy: 'monetary',
  fiscal: 'fiscal',
  tax: 'fiscal',
  economy: 'macro',
  markets: 'markets',
  capital_markets: 'markets',
  regulation: 'regulation',
  banking_credit: 'corporate',
  corporate: 'corporate',
  m_and_a: 'corporate',
  geopolitics: 'geopolitics',
  commodities: 'commodities',
  ai: 'technology',
  technology: 'technology',
  politics: 'politics',
  international: 'macro',
  wealth: 'wealth',
  other: 'other',
}

/**
 * COVERAGE MATRIX — the floor checked every morning. A category with no collected
 * event above `minScore` stays uncovered (flagged), it is never filled artificially.
 */
export const COVERAGE: { scope: 'BR' | 'WORLD'; id: string; label: string; regions?: string[]; notRegions?: string[]; topics?: NewsTopic[] }[] = [
  { scope: 'BR', id: 'br_macro', label: 'Brasil · macro', regions: ['BR'], topics: ['economy'] },
  { scope: 'BR', id: 'br_policy', label: 'Brasil · fiscal/monetário', regions: ['BR'], topics: ['fiscal', 'tax', 'monetary_policy'] },
  { scope: 'BR', id: 'br_markets', label: 'Brasil · mercados', regions: ['BR'], topics: ['markets', 'capital_markets'] },
  { scope: 'BR', id: 'br_real', label: 'Brasil · regulação/economia real', regions: ['BR'], topics: ['regulation', 'corporate', 'banking_credit', 'm_and_a', 'politics'] },
  { scope: 'WORLD', id: 'us', label: 'EUA', regions: ['US'] },
  { scope: 'WORLD', id: 'europe', label: 'Europa', regions: ['EU'] },
  { scope: 'WORLD', id: 'asia', label: 'China/Ásia', regions: ['CN', 'ASIA'] },
  { scope: 'WORLD', id: 'geopolitics', label: 'Geopolítica', topics: ['geopolitics'] },
  { scope: 'WORLD', id: 'commodities', label: 'Commodities', topics: ['commodities'] },
  { scope: 'WORLD', id: 'global_markets', label: 'Mercados globais', notRegions: ['BR'], topics: ['markets', 'capital_markets'] },
]
export const COVERAGE_MIN_SCORE = 30

/** Selection sizes (long-tail pipeline). */
export const SELECTION = {
  topMin: 10,
  topMax: 14,
  watchlistMax: 25,
  /** Clusters below this score never enter the top, even to fill it. */
  topMinScore: 25,
  maxPerTopic: 4,
  /** Top slots kept free for the coverage floor before filling by score. */
  coverageReserve: 2,
} as const

/** Agent 2 packet budget (deterministic truncation). */
export const PACKET_BUDGET = {
  maxChars: 36_000,
  maxFacts: 32,
  maxClusters: 14,
  maxAgenda: 12,
  summaryChars: 240,
} as const
