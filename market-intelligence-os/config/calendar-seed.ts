import type { EventCategory, Level, Region, VerificationStatus } from '../src/core/schemas'

/**
 * EDITORIAL / ECONOMIC CALENDAR SEED
 *
 * Events whose dates come from official schedules. Anything not confirmed
 * against the official page at the time of writing is marked UNVERIFIED.
 * The dashboard shows the badge and the link, so the user can confirm with one click.
 * To add events, append to this list (docs/social-strategy.md).
 */
export interface SeedEvent {
  name: string
  category: EventCategory
  region: Region
  date: string
  time: string | null
  timezone: string
  source: string
  source_url: string
  importance: Level
  market_relevance: Level
  audience_relevance: Level
  content_opportunity: string | null
  verification_status: VerificationStatus
  notes?: string
}

const FED_CAL = 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm'
const COPOM_CAL = 'https://www.bcb.gov.br/controleinflacao/calendarioreunioescopom'
const ECB_CAL = 'https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html'
const TSE_CAL = 'https://www.tse.jus.br/eleicoes/eleicoes-2026'
const BLS_CAL = 'https://www.bls.gov/schedule/news_release/empsit.htm'

export const CALENDAR_SEED: SeedEvent[] = [
  {
    name: 'Eleições gerais — 1º turno',
    category: 'POLICY', region: 'BR', date: '2026-10-04', time: null, timezone: 'America/Sao_Paulo',
    source: 'Constituição Federal, art. 77 (primeiro domingo de outubro) / TSE', source_url: TSE_CAL,
    importance: 'HIGH', market_relevance: 'HIGH', audience_relevance: 'HIGH',
    content_opportunity: 'Explicar, sem viés político, como a incerteza eleitoral aparece nos preços (prêmio de risco, curva de juros, câmbio) e por que a alocação não deveria ser uma aposta em resultado.',
    verification_status: 'VERIFIED',
    notes: 'Data definida pela Constituição (primeiro domingo de outubro).',
  },
  {
    name: 'Eleições gerais — 2º turno',
    category: 'POLICY', region: 'BR', date: '2026-10-25', time: null, timezone: 'America/Sao_Paulo',
    source: 'Constituição Federal, art. 77 (último domingo de outubro) / TSE', source_url: TSE_CAL,
    importance: 'HIGH', market_relevance: 'HIGH', audience_relevance: 'HIGH',
    content_opportunity: 'Mostrar o que historicamente importa para o mercado depois da eleição: sinalização fiscal, composição da equipe econômica e trajetória da dívida. Nada de previsão de resultado.',
    verification_status: 'VERIFIED',
    notes: 'Somente se houver 2º turno. Data definida pela Constituição (último domingo de outubro).',
  },
  {
    name: 'FOMC — decisão de juros',
    category: 'MACRO', region: 'US', date: '2026-10-28', time: '14:00', timezone: 'America/New_York',
    source: 'Federal Reserve — FOMC calendar', source_url: FED_CAL,
    importance: 'HIGH', market_relevance: 'HIGH', audience_relevance: 'MEDIUM',
    content_opportunity: 'Usar a decisão para explicar como a taxa básica americana chega ao preço dos ativos brasileiros (dólar, prêmio de risco, fluxo).',
    verification_status: 'UNVERIFIED',
    notes: 'Reunião de 27–28/out. Confirmar no calendário oficial.',
  },
  {
    name: 'FOMC — decisão de juros',
    category: 'MACRO', region: 'US', date: '2026-12-09', time: '14:00', timezone: 'America/New_York',
    source: 'Federal Reserve — FOMC calendar', source_url: FED_CAL,
    importance: 'HIGH', market_relevance: 'HIGH', audience_relevance: 'MEDIUM',
    content_opportunity: 'Reunião com projeções (SEP): explicar o dot plot como mapa de expectativas, não como promessa.',
    verification_status: 'UNVERIFIED',
    notes: 'Reunião de 8–9/dez. Confirmar no calendário oficial.',
  },
  {
    name: 'Copom — decisão da Selic',
    category: 'MACRO', region: 'BR', date: '2026-11-04', time: '18:30', timezone: 'America/Sao_Paulo',
    source: 'Banco Central do Brasil — calendário do Copom', source_url: COPOM_CAL,
    importance: 'HIGH', market_relevance: 'HIGH', audience_relevance: 'HIGH',
    content_opportunity: 'Usar a decisão para explicar como uma mudança na curva de juros afeta valuation, crédito e patrimônio.',
    verification_status: 'UNVERIFIED',
    notes: 'Data a confirmar no calendário oficial do BCB.',
  },
  {
    name: 'Copom — decisão da Selic',
    category: 'MACRO', region: 'BR', date: '2026-12-09', time: '18:30', timezone: 'America/Sao_Paulo',
    source: 'Banco Central do Brasil — calendário do Copom', source_url: COPOM_CAL,
    importance: 'HIGH', market_relevance: 'HIGH', audience_relevance: 'HIGH',
    content_opportunity: 'Último Copom do ano: o que a trajetória de juros implica para a alocação em renda fixa pós versus prefixada.',
    verification_status: 'UNVERIFIED',
    notes: 'Data a confirmar no calendário oficial do BCB.',
  },
  {
    name: 'ECB — decisão de política monetária',
    category: 'MACRO', region: 'EU', date: '2026-10-29', time: '14:15', timezone: 'Europe/Berlin',
    source: 'ECB — Governing Council meetings calendar', source_url: ECB_CAL,
    importance: 'MEDIUM', market_relevance: 'MEDIUM', audience_relevance: 'LOW',
    content_opportunity: null,
    verification_status: 'UNVERIFIED',
    notes: 'Confirmar no calendário oficial do ECB.',
  },
  {
    name: 'ECB — decisão de política monetária',
    category: 'MACRO', region: 'EU', date: '2026-12-17', time: '14:15', timezone: 'Europe/Berlin',
    source: 'ECB — Governing Council meetings calendar', source_url: ECB_CAL,
    importance: 'MEDIUM', market_relevance: 'MEDIUM', audience_relevance: 'LOW',
    content_opportunity: null,
    verification_status: 'UNVERIFIED',
    notes: 'Confirmar no calendário oficial do ECB.',
  },
  {
    name: 'Payroll EUA (Employment Situation — setembro)',
    category: 'MACRO', region: 'US', date: '2026-10-02', time: '08:30', timezone: 'America/New_York',
    source: 'BLS — Employment Situation schedule', source_url: BLS_CAL,
    importance: 'HIGH', market_relevance: 'HIGH', audience_relevance: 'MEDIUM',
    content_opportunity: 'Mercado de trabalho americano como variável-chave para a trajetória do Fed e, por tabela, para o dólar.',
    verification_status: 'UNVERIFIED',
    notes: 'Data estimada pela regra usual (primeira sexta-feira do mês). Confirmar no calendário do BLS.',
  },
]
