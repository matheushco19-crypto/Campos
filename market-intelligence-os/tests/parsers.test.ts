import { describe, expect, it } from 'vitest'
import { diff, parseBls, parseCsv, parseEcbCsv, parseFredCsv, parseSgs, parseSidra, parseStooqHistory, parseTreasuryCsv, pctChange, yoy } from '../src/agents/market-intelligence/collectors/parsers'
import { observationStatus } from '../src/agents/market-intelligence/collectors/market-status'
import { assetByMetric } from '../config/assets'

describe('market & macro normalization', () => {
  it('parses quoted CSV', () => {
    expect(parseCsv('a,b\n"x, y","z ""q"""\n')).toEqual([['a', 'b'], ['x, y', 'z "q"']])
  })
  it('parses BCB SGS (dd/mm/yyyy, string values) and sorts ascending', () => {
    const pts = parseSgs([{ data: '26/09/2026', valor: '5.3012' }, { data: '25/09/2026', valor: '5.2900' }], 'daily')
    expect(pts).toEqual([{ period: '2026-09-25', value: 5.29 }, { period: '2026-09-26', value: 5.3012 }])
    expect(parseSgs([{ data: '01/08/2026', valor: '0.23' }], 'monthly')[0].period).toBe('2026-08')
  })
  it('parses IBGE SIDRA', () => {
    const json = [{ resultados: [{ series: [{ serie: { '202607': '0.26', '202608': '-0.11', '202609': '...' } }] }] }]
    expect(parseSidra(json)).toEqual([{ period: '2026-07', value: 0.26 }, { period: '2026-08', value: -0.11 }])
  })
  it('parses FRED CSV skipping missing "." values', () => {
    expect(parseFredCsv('observation_date,SP500\n2026-09-25,6500.1\n2026-09-26,.\n2026-09-28,6550.2\n')).toEqual([
      { period: '2026-09-25', value: 6500.1 },
      { period: '2026-09-28', value: 6550.2 },
    ])
  })
  it('parses BLS and derives yoy / monthly diff', () => {
    const json = { status: 'REQUEST_SUCCEEDED', Results: { series: [{ seriesID: 'X', data: [
      { year: '2026', period: 'M08', value: '330' }, { year: '2026', period: 'M07', value: '329' }, { year: '2025', period: 'M08', value: '320' }, { year: '2025', period: 'M13', value: '1' },
    ] }] } }
    const pts = parseBls(json, 'X')
    expect(pts.map((p) => p.period)).toEqual(['2025-08', '2026-07', '2026-08'])
    expect(yoy(pts)).toEqual([{ period: '2026-08', value: 3.13 }])
    expect(diff(pts).at(-1)).toEqual({ period: '2026-08', value: 1 })
  })
  it('parses ECB, Treasury and Stooq CSV', () => {
    expect(parseEcbCsv('KEY,TIME_PERIOD,OBS_VALUE\nX,2026-08,2.1\nX,2026-07,2.0\n').at(-1)).toEqual({ period: '2026-08', value: 2.1 })
    expect(parseTreasuryCsv('Date,"1 Mo","10 Yr"\n09/26/2026,4.1,4.12\n09/25/2026,4.1,4.10\n', '10 Yr').at(-1)).toEqual({ period: '2026-09-26', value: 4.12 })
    expect(parseStooqHistory('Date,Open,High,Low,Close,Volume\n2026-09-25,1,1,1,6500,0\n2026-09-28,1,1,1,6550,0\n').at(-1)!.value).toBe(6550)
    expect(() => parseStooqHistory('No data')).toThrow()
  })
  it('computes pct change', () => {
    expect(pctChange(110, 100)).toBe(10)
    expect(pctChange(110, null)).toBeNull()
  })
})

describe('market status (never present an open market as closed)', () => {
  const spx = assetByMetric('SPX')!.exchange
  const dax = assetByMetric('DAX')!.exchange
  it('US close from yesterday at 05:00 BRT is PRE_MARKET/CLOSED, not OPEN', () => {
    expect(['PRE_MARKET', 'CLOSED']).toContain(observationStatus(spx, '2026-09-28', new Date('2026-09-29T08:00:00Z')))
  })
  it('DAX intraday value at 05:00 BRT (10:00 CEST) is OPEN', () => {
    expect(observationStatus(dax, '2026-09-29', new Date('2026-09-29T08:00:00Z'))).toBe('OPEN')
  })
  it('weekend is CLOSED', () => {
    expect(observationStatus(spx, '2026-09-25', new Date('2026-09-27T12:00:00Z'))).toBe('CLOSED')
  })
})
