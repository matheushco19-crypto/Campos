import { CALENDAR_SEED } from '../../config/calendar-seed'
import { fetchJson, type FetchOptions } from '../core/http'
import { stableId } from '../core/ids'
import type { CalendarEvent, Level, RunError, SourceHealth } from '../core/schemas'
import { addDays } from '../core/time'

/**
 * EVENT ENGINE: builds the editorial/economic calendar from
 *  1. the official calendar seed (config/calendar-seed.ts),
 *  2. national holidays computed by law,
 *  3. the IBGE release calendar API (official, when reachable).
 */

const now = () => new Date().toISOString()

export function seedEvents(): CalendarEvent[] {
  return CALENDAR_SEED.map((s) => ({
    id: stableId('cal', s.name, s.date),
    name: s.name,
    category: s.category,
    region: s.region,
    date: s.date,
    time: s.time,
    timezone: s.timezone,
    source: s.source,
    source_url: s.source_url,
    importance: s.importance,
    market_relevance: s.market_relevance,
    audience_relevance: s.audience_relevance,
    content_opportunity: s.content_opportunity,
    verification_status: s.verification_status,
    notes: s.notes ?? null,
    created_at: now(),
    updated_at: now(),
  }))
}

/** Easter Sunday (Anonymous Gregorian algorithm). */
export function easter(year: number): string {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function brazilHolidays(year: number): CalendarEvent[] {
  const e = easter(year)
  const fixed: [string, string][] = [
    [`${year}-01-01`, 'Confraternização Universal'],
    [`${year}-04-21`, 'Tiradentes'],
    [`${year}-05-01`, 'Dia do Trabalho'],
    [`${year}-09-07`, 'Independência do Brasil'],
    [`${year}-10-12`, 'Nossa Senhora Aparecida'],
    [`${year}-11-02`, 'Finados'],
    [`${year}-11-15`, 'Proclamação da República'],
    [`${year}-11-20`, 'Dia Nacional de Zumbi e da Consciência Negra'],
    [`${year}-12-25`, 'Natal'],
    [addDays(e, -2), 'Sexta-feira Santa'],
  ]
  const optional: [string, string][] = [
    [addDays(e, -48), 'Carnaval (segunda-feira)'],
    [addDays(e, -47), 'Carnaval (terça-feira)'],
    [addDays(e, 60), 'Corpus Christi'],
  ]
  const mk = (date: string, name: string, verified: boolean): CalendarEvent => ({
    id: stableId('cal', 'holiday', date),
    name: `Feriado: ${name}`,
    category: 'HOLIDAY',
    region: 'BR',
    date,
    time: null,
    timezone: 'America/Sao_Paulo',
    source: verified ? 'Lei 662/1949, Lei 6.802/1980 e Lei 14.759/2023 (data calculada)' : 'Ponto facultativo nacional; B3 costuma não operar (confirmar calendário B3)',
    source_url: verified ? 'https://www.planalto.gov.br/ccivil_03/leis/l0662.htm' : 'https://www.b3.com.br/pt_br/solucoes/plataformas/puma-trading-system/para-participantes-e-traders/calendario-de-negociacao/feriados/',
    importance: 'LOW',
    market_relevance: 'MEDIUM',
    audience_relevance: 'LOW',
    content_opportunity: null,
    verification_status: verified ? 'VERIFIED' : 'UNVERIFIED',
    notes: 'Mercado brasileiro fechado ou com funcionamento especial.',
    created_at: now(),
    updated_at: now(),
  })
  return [...fixed.map(([d, n]) => mk(d, n, true)), ...optional.map(([d, n]) => mk(d, n, false))]
}

/* ------------------------------ IBGE release calendar ------------------------------ */

const IBGE_KEY_RELEASES: [RegExp, Level, string | null][] = [
  [/\bIPCA\b(?!-15)|Pre[çc]os ao Consumidor Amplo(?! ?-? ?15)|SNIPC/i, 'HIGH', 'Usar o IPCA para mostrar como inflação corrói o retorno real, e por que o que importa é o juro real e não o nominal.'],
  [/IPCA-15/, 'MEDIUM', null],
  [/PIB|Contas Nacionais Trimestrais/i, 'HIGH', 'Explicar o que o PIB diz (e o que ele não diz) sobre lucro das empresas e renda das famílias.'],
  [/PNAD Cont[íi]nua|Pesquisa Nacional por Amostra de Domic[íi]lios/i, 'MEDIUM', null],
  [/Produção Industrial|PIM/i, 'MEDIUM', null],
  [/Pesquisa Mensal de Comércio|Varejo/i, 'MEDIUM', null],
  [/Pesquisa Mensal de Serviços/i, 'MEDIUM', null],
]

export function parseIbgeCalendar(json: unknown): CalendarEvent[] {
  const items = (json as { items?: { titulo?: string; nome_produto?: string; data_divulgacao?: string }[] })?.items
  if (!Array.isArray(items)) throw new Error('IBGE calendário: formato inesperado')
  const out: CalendarEvent[] = []
  for (const it of items) {
    const title = `${it.nome_produto ?? ''} ${it.titulo ?? ''}`.trim()
    const rule = IBGE_KEY_RELEASES.find(([re]) => re.test(title))
    if (!rule || !it.data_divulgacao) continue
    const m = /^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/.exec(it.data_divulgacao)
    if (!m) continue
    const date = `${m[3]}-${m[2]}-${m[1]}`
    out.push({
      id: stableId('cal', 'ibge', title, date),
      name: `IBGE: ${(it.titulo ?? it.nome_produto ?? title).slice(0, 120)}`,
      category: 'MACRO',
      region: 'BR',
      date,
      // The API's time field is ambiguous (timezone not documented), so we don't publish a time we can't confirm.
      time: null,
      timezone: 'America/Sao_Paulo',
      source: 'IBGE — Calendário de divulgações',
      source_url: 'https://www.ibge.gov.br/calendario-de-divulgacoes.html',
      importance: rule[1],
      market_relevance: rule[1],
      audience_relevance: rule[1] === 'HIGH' ? 'HIGH' : 'MEDIUM',
      content_opportunity: rule[2],
      verification_status: 'VERIFIED',
      notes: m[4] ? `Horário informado pela API: ${m[4]}:${m[5]} (fuso não documentado; confirmar no calendário do IBGE).` : null,
      created_at: now(),
      updated_at: now(),
    })
  }
  return out
}

export async function collectIbgeCalendar(from: string, to: string, http: FetchOptions = {}): Promise<CalendarEvent[]> {
  const f = (d: string) => `${d.slice(5, 7)}-${d.slice(8, 10)}-${d.slice(0, 4)}`
  const url = `https://servicodados.ibge.gov.br/api/v3/calendario/?de=${f(from)}&ate=${f(to)}&qtd=200`
  return parseIbgeCalendar(await fetchJson(url, http))
}

export async function buildCalendar(date: string, opts: { http?: FetchOptions; skipNetwork?: boolean } = {}): Promise<{ events: CalendarEvent[]; health: SourceHealth[]; errors: RunError[] }> {
  const year = Number(date.slice(0, 4))
  const events = [...seedEvents(), ...brazilHolidays(year), ...brazilHolidays(year + 1)]
  const health: SourceHealth[] = [{ source_id: 'cal-official-seed', ok: true, items: CALENDAR_SEED.length, latency_ms: 0, error: null }]
  const errors: RunError[] = []
  if (!opts.skipNetwork) {
    const started = Date.now()
    try {
      const ibge = await collectIbgeCalendar(date, addDays(date, 45), opts.http)
      events.push(...ibge)
      health.push({ source_id: 'ibge-calendario', ok: true, items: ibge.length, latency_ms: Date.now() - started, error: null })
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      health.push({ source_id: 'ibge-calendario', ok: false, items: 0, latency_ms: Date.now() - started, error: message })
      errors.push({ step: 'collect_calendar', source: 'ibge-calendario', message, at: now() })
    }
  }
  return { events, health, errors }
}
