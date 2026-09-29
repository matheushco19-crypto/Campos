import { MACRO_INDICATORS, type MacroIndicator, type MacroSourceRef } from '../../../../config/macro'
import { getEnv } from '../../../core/env'
import { fetchJson, fetchText, redactUrl, type FetchOptions } from '../../../core/http'
import { pool } from '../../../core/pool'
import type { RawObservation } from '../../../core/schemas'
import { addDays, toLocalDate, zonedToUtc } from '../../../core/time'
import { diff, parseBls, parseEcbCsv, parseFocus, parseFredCsv, parseFredJson, parseSgs, parseSidra, yoy, type SeriesPoint } from './parsers'
import type { CollectorResult } from './types'

export function refKey(ref: MacroSourceRef): string {
  switch (ref.sourceId) {
    case 'bcb-sgs':
      return `sgs:${ref.code}`
    case 'ibge-sidra':
      return `sidra:${ref.table}/${ref.variable}`
    case 'bcb-focus':
      return `focus:${ref.indicator}:${ref.horizon}`
    case 'bls':
      return `bls:${ref.series}`
    case 'fred-macro':
      return `fred:${ref.series}`
    case 'ecb':
      return `ecb:${ref.flow}.${ref.key}`
  }
}

/** Monthly/quarterly period → an instant for `asOf` (first day, 00:00 UTC-3). */
const periodInstant = (period: string) => {
  const q = /^(\d{4})-Q([1-4])$/.exec(period)
  if (q) return zonedToUtc(`${q[1]}-${String((Number(q[2]) - 1) * 3 + 1).padStart(2, '0')}-01`, '00:00', 'America/Sao_Paulo')
  const date = period.length === 7 ? `${period}-01` : period
  return zonedToUtc(date, '00:00', 'America/Sao_Paulo')
}

/** FRED quarterly dates (YYYY-01-01) → YYYY-Qn; monthly (YYYY-MM-01) → YYYY-MM. */
const normaliseFredPeriod = (p: SeriesPoint, frequency: MacroIndicator['frequency']): SeriesPoint => {
  if (frequency === 'quarterly') return { ...p, period: `${p.period.slice(0, 4)}-Q${Math.floor((Number(p.period.slice(5, 7)) - 1) / 3) + 1}` }
  if (frequency === 'monthly') return { ...p, period: p.period.slice(0, 7) }
  return p
}

async function fetchSeries(ind: MacroIndicator, ref: MacroSourceRef, now: Date, http: FetchOptions): Promise<{ points: SeriesPoint[]; url: string; notes?: string }> {
  const env = getEnv()
  switch (ref.sourceId) {
    case 'bcb-sgs': {
      const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${ref.code}/dados/ultimos/15?formato=json`
      // Daily "meeting" series (e.g. Selic target, 432) are forward-filled by the BCB until the
      // next Copom date. Only points up to today are observations.
      const today = toLocalDate(now)
      const points = parseSgs(await fetchJson(url, http), ind.frequency === 'meeting' ? 'daily' : ind.frequency).filter((p) => p.period.length !== 10 || p.period <= today)
      return { points, url }
    }
    case 'ibge-sidra': {
      const url = `https://servicodados.ibge.gov.br/api/v3/agregados/${ref.table}/periodos/-6/variaveis/${ref.variable}?localidades=N1[all]`
      return { points: parseSidra(await fetchJson(url, http)), url }
    }
    case 'bcb-focus': {
      const year = Number(toLocalDate(now).slice(0, 4)) + (ref.horizon === 'next_year' ? 1 : 0)
      const filter = encodeURIComponent(`Indicador eq '${ref.indicator}' and DataReferencia eq '${year}'`)
      const url = `https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/ExpectativasMercadoAnuais?$top=10&$filter=${filter}&$orderby=Data%20desc&$format=json&$select=Indicador,Data,DataReferencia,Mediana,baseCalculo`
      const f = parseFocus(await fetchJson(url, http))
      if (!f) throw new Error('Focus: no data')
      return { points: [{ period: f.date, value: f.median }], url, notes: `Mediana Focus para ${f.reference}, publicada em ${f.date}` }
    }
    case 'bls': {
      const url = `https://api.bls.gov/publicAPI/v1/timeseries/data/${ref.series}`
      let points = parseBls(await fetchJson(url, http), ref.series)
      if (ind.transform === 'yoy') points = yoy(points)
      if (ind.transform === 'mom_diff') points = diff(points)
      return { points, url }
    }
    case 'fred-macro': {
      const start = addDays(toLocalDate(now, 'UTC'), ind.transform === 'yoy' ? -800 : ind.frequency === 'quarterly' ? -500 : -400)
      const url = env.FRED_API_KEY
        ? `https://api.stlouisfed.org/fred/series/observations?series_id=${ref.series}&api_key=${env.FRED_API_KEY}&file_type=json&observation_start=${start}`
        : `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${ref.series}&cosd=${start}`
      let points = (env.FRED_API_KEY ? parseFredJson(await fetchJson(url, http)) : parseFredCsv(await fetchText(url, http))).map((p) =>
        normaliseFredPeriod(p, ind.frequency),
      )
      if (ind.transform === 'yoy') points = yoy(points)
      if (ind.transform === 'mom_diff') points = diff(points)
      return { points, url: redactUrl(url) }
    }
    case 'ecb': {
      const url = `https://data-api.ecb.europa.eu/service/data/${ref.flow}/${ref.key}?lastNObservations=6&format=csvdata`
      return { points: parseEcbCsv(await fetchText(url, http)), url }
    }
  }
}

export async function collectMacro(now = new Date(), indicators = MACRO_INDICATORS.filter((m) => m.enabled), http: FetchOptions = {}): Promise<CollectorResult> {
  const result: CollectorResult = { observations: [], health: [], errors: [], skipped: [] }
  const retrievedAt = now.toISOString()
  const thunks = indicators.flatMap((ind) =>
    [ind.official, ind.secondary]
      .filter((r): r is MacroSourceRef => r !== null)
      .map((ref) => async () => {
        const started = Date.now()
        const key = refKey(ref)
        try {
          const { points, url, notes } = await fetchSeries(ind, ref, now, http)
          const last = points.at(-1)
          if (!last) throw new Error('no observations after transform')
          const obs: RawObservation = {
            sourceId: ref.sourceId,
            category: 'MACRO',
            metric: ind.metric,
            value: last.value,
            unit: ind.unit,
            referencePeriod: last.period,
            asOf: periodInstant(last.period),
            retrievedAt,
            url,
            previousValue: points.at(-2)?.value ?? null,
            changePct: null,
            notes,
          }
          result.observations.push(obs)
          result.health.push({ source_id: key, ok: true, items: 1, latency_ms: Date.now() - started, error: null })
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e)
          result.health.push({ source_id: key, ok: false, items: 0, latency_ms: Date.now() - started, error: message })
          result.errors.push({ step: 'collect_macro', source: `${ref.sourceId}:${ind.metric}`, message, at: new Date().toISOString() })
        }
      }),
  )
  await pool(thunks, 5)
  return result
}
