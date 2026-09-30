import type { NewsTopic, Region } from '../core/schemas'

/**
 * Deterministic news classification (no LLM). Keyword rules in PT and EN.
 * Cheap, explainable and good enough to rank. The LLM only sees the top
 * clusters after this filter.
 */

export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9%$.\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const TOPIC_RULES: [NewsTopic, RegExp][] = [
  ['monetary_policy', /\b(copom|selic|fomc|fed(eral reserve)?|powell|galipolo|banco central|central bank|ecb|bce|lagarde|pboc|boj|juros basicos|rate (cut|hike|decision)|interest rates?|taxa de juros|politica monetaria)\b/],
  ['tax', /\b(imposto|tribut|reforma tributaria|irpf|ir sobre|itcmd|heranca|dividendos? (tributad|isen)|jcp|offshore|fundos? exclusivos?|tax(es|ation)?|iof)\b/],
  ['fiscal', /\b(fiscal|arcabouco|meta de resultado|primario|divida publica|orcamento|deficit|superavit|gastos publicos|tesouro nacional|treasury auction|debt ceiling|arrecadacao)\b/],
  ['regulation', /\b(cvm|regula|anbima|sec |antitruste|cade|norma|resolucao|marco legal|compliance|susep)\b/],
  ['m_and_a', /\b(fusao|aquisicao|aquire|acquisition|merger|m&a|compra da|takeover|oferta hostil|opa)\b/],
  ['ai', /\b(inteligencia artificial|ia generativa|\bai\b|openai|anthropic|nvidia|chips?|semicondutor|data centers?)\b/],
  ['technology', /\b(tecnologia|tech|big techs?|apple|microsoft|google|alphabet|amazon|meta|startup|software)\b/],
  ['geopolitics', /\b(guerra|war|sancoes|sanctions|tarifas?|tariffs?|otan|nato|israel|ira|iran|russia|ucrania|ukraine|taiwan|conflito|geopolit|trade war)\b/],
  ['commodities', /\b(petroleo|oil|brent|wti|minerio|iron ore|ouro|gold|cobre|copper|soja|soy|commodit|opep|opec)\b/],
  ['banking_credit', /\b(bancos?|banks?|credito|credit|inadimplencia|default|spread bancario|emprestimos?|loans?|recuperacao judicial)\b/],
  ['capital_markets', /\b(ipo|follow-on|debentures?|emissao|b3|bolsa|ibovespa|renda fixa|fii|fundos imobiliarios|bonds?|treasuries|yields?)\b/],
  ['politics', /\b(eleic|candidat|congresso|senado|camara|stf|planalto|presidente|lula|trump|partido|campanha|pesquisa eleitoral|ministro)\b/],
  ['corporate', /\b(lucro|resultado trimestral|balanco|earnings|receita|guidance|dividendos|recompra|buyback|ceo)\b/],
  ['wealth', /\b(patrimonio|wealth|family office|sucessao|previdencia privada|holding|planejamento patrimonial|alta renda|private bank)\b/],
  ['markets', /\b(mercados?|markets?|stocks?|acoes|wall street|s&p|nasdaq|dow|dolar|cambio|dollar|currency)\b/],
  ['economy', /\b(economia|economy|pib|gdp|inflacao|inflation|ipca|cpi|pce|desemprego|unemployment|payroll|emprego|jobs|varejo|retail|industria|pmi|recessao|recession|desaceleracao|slowdown|atividade economica|condicoes financeiras)\b/],
]

const REGION_RULES: [Region, RegExp][] = [
  ['BR', /\b(brasil|brazil|copom|selic|ibovespa|b3|ipca|real brasileiro|lula|haddad|tesouro nacional|petrobras|vale|itau|bradesco|stf|camara|senado)\b/],
  ['US', /\b(eua|estados unidos|u\.s\.?|us(?![$\w])|united states|fed|fomc|wall street|treasur|trump|nasdaq|s&p|dow|payroll|powell)\b/],
  ['CN', /\b(china|chines|chinese|pequim|beijing|pboc|yuan|shanghai|xi jinping)\b/],
  ['EU', /\b(europa|europe|euro|zona do euro|eurozone|ecb|bce|lagarde|alemanha|germany|franca|france|uk|reino unido|britain|london|ucrania|ukraine|russia|kremlin|moscou|moscow)\b/],
  ['ASIA', /\b(japao|japan|boj|nikkei|coreia|korea|kospi|hong kong|india)\b/],
]

const HIGH_IMPACT = /\b(copom|selic|fomc|fed|ecb|payroll|cpi|ipca|pce|pib|gdp|recessao|recession|tarifa|tariff|default|guerra|war|downgrade|rebaixa|rating|crise|crisis|colapso|shutdown|reforma tributaria|arcabouco|eleic)\b/
const UHNW_TERMS = /\b(patrimonio|heranca|sucessao|itcmd|holding|offshore|fundos? exclusivos?|tributacao|dividendos|jcp|previdencia|family office|imovel|imoveis|cambio|dolar|juros|renda fixa|credito privado|isen|aliquota|trust|internacionaliza)\b/
const SOCIAL_TERMS = /\b(juros|dolar|inflacao|imposto|salario|aposentadoria|previdencia|casa propria|financiamento|bitcoin|ia|inteligencia artificial|emprego|gasolina|combustivel|precos?)\b/

const RELATED_LINKS = /\b(leia (tambem|mais)|veja (tambem|mais)|saiba mais|read more)\b.*$/

export interface Classification {
  topic: NewsTopic
  region: Region
  importance: number
  market_relevance: number
  uhnw_relevance: number
  social_relevance: number
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)))

export function classifyNews(headline: string, summary: string, opts: { officialSource?: boolean; defaultRegion?: Region } = {}): Classification {
  // Feed summaries often end with related-story links ("Leia também: …") that are not about this story.
  const text = normalizeText(`${headline} ${summary}`).replace(RELATED_LINKS, '')
  const head = normalizeText(headline)
  const topic = TOPIC_RULES.find(([, re]) => re.test(head))?.[0] ?? TOPIC_RULES.find(([, re]) => re.test(text))?.[0] ?? 'other'
  const region = REGION_RULES.find(([, re]) => re.test(head))?.[0] ?? REGION_RULES.find(([, re]) => re.test(text))?.[0] ?? opts.defaultRegion ?? 'GLOBAL'

  const topicWeight: Partial<Record<NewsTopic, number>> = {
    monetary_policy: 35, fiscal: 30, tax: 30, economy: 28, markets: 22, geopolitics: 25, commodities: 20,
    banking_credit: 20, capital_markets: 18, regulation: 18, m_and_a: 15, ai: 16, technology: 10, corporate: 12, politics: 14, wealth: 20, international: 15, other: 3,
  }
  const highImpact = HIGH_IMPACT.test(text) ? 25 : 0
  const official = opts.officialSource ? 15 : 0
  const importance = clamp((topicWeight[topic] ?? 5) + highImpact + official + (region === 'BR' || region === 'US' ? 8 : 3))
  const marketTopics: NewsTopic[] = ['monetary_policy', 'markets', 'economy', 'fiscal', 'commodities', 'capital_markets', 'banking_credit', 'geopolitics', 'corporate', 'm_and_a']
  const market_relevance = clamp((marketTopics.includes(topic) ? 45 : 10) + highImpact + official)
  const uhnw_relevance = clamp((UHNW_TERMS.test(text) ? 45 : 10) + (['tax', 'wealth', 'fiscal', 'regulation'].includes(topic) ? 30 : 0) + (topic === 'monetary_policy' ? 15 : 0))
  const social_relevance = clamp((SOCIAL_TERMS.test(text) ? 40 : 10) + highImpact + (['ai', 'tax', 'monetary_policy', 'economy'].includes(topic) ? 15 : 0))
  return { topic, region, importance, market_relevance, uhnw_relevance, social_relevance }
}
