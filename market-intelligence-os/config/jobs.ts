import type { JobName } from '../src/core/schemas'

/**
 * JOBS. Schedules are in America/Sao_Paulo. Vercel Cron runs in UTC, so
 * vercel.json carries the UTC translation. Brazil has no DST since 2019
 * (UTC-3 all year). If this ever changes, update vercel.json.
 */
export interface JobConfig {
  name: JobName
  description: string
  localCron: string | null
  utcCron: string | null
  endpoint: string | null
  enabled: boolean
}

export const JOBS: JobConfig[] = [
  { name: 'MORNING_INTELLIGENCE', description: 'Pipeline completo: coleta → verificação → análise → Morning Brief → calendário → snapshot.',
    localCron: '0 5 * * *', utcCron: '0 8 * * *', endpoint: '/api/cron/morning-intelligence', enabled: true },
  { name: 'MARKET_CLOSE_REFRESH', description: 'Atualiza fatos de mercado após o fechamento da B3/NYSE (sem nova análise LLM).',
    localCron: '30 18 * * 1-5', utcCron: '30 21 * * 1-5', endpoint: '/api/cron/market-close-refresh', enabled: true },
  { name: 'WEEKLY_SOCIAL_STRATEGY', description: 'Revisão semanal do Agent 3: calendário editorial, oportunidades e padrões de performance.',
    localCron: '0 8 * * 0', utcCron: '0 11 * * 0', endpoint: '/api/cron/weekly-social-strategy', enabled: true },
  { name: 'ON_DEMAND_RESEARCH', description: 'Processa research_requests pendentes. Acionado sob demanda (dashboard/API) e ao final de cada pipeline.',
    localCron: null, utcCron: null, endpoint: '/api/research', enabled: true },
]
