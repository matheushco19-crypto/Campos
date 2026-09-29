import { describe, expect, it } from 'vitest'
import { assetByMetric } from '../config/assets'
import { MACRO_INDICATORS } from '../config/macro'
import { isCitable, validateObservation, verifyAll, verifyMacro, verifyMarket } from '../src/verification/engine'
import { DATE, NOW, obs } from './helpers'

const ctx = { briefDate: DATE, runId: 'r1', now: NOW }
const spx = assetByMetric('SPX')!

describe('verification engine', () => {
  it('VERIFIED when two independent sources agree on the same reference date', () => {
    const f = verifyMarket(spx, [obs({ sourceId: 'stooq', metric: 'SPX', value: 6550 }), obs({ sourceId: 'fred', metric: 'SPX', value: 6551 })], ctx)
    expect(f.verification_status).toBe('VERIFIED')
    expect(f.confidence).toBe('HIGH')
    expect(f.primary_source).toBe('stooq')
    expect(f.secondary_source).toBe('fred')
    expect(f.source_fallback).toBe(true) // Investing.com not integrated
  })
  it('CONFLICT when sources diverge beyond tolerance, never picks a number', () => {
    const f = verifyMarket(spx, [obs({ sourceId: 'stooq', metric: 'SPX', value: 6550 }), obs({ sourceId: 'fred', metric: 'SPX', value: 6300 })], ctx)
    expect(f.verification_status).toBe('CONFLICT')
    expect(f.notes).toMatch(/CONFLITO/)
    expect(isCitable(f)).toBe(false)
  })
  it('UNVERIFIED with a single source (or misaligned dates)', () => {
    expect(verifyMarket(spx, [obs({ sourceId: 'stooq', metric: 'SPX', value: 6550 })], ctx).verification_status).toBe('UNVERIFIED')
    const f = verifyMarket(spx, [obs({ sourceId: 'stooq', metric: 'SPX', value: 6550 }), obs({ sourceId: 'fred', metric: 'SPX', value: 6500, referencePeriod: '2026-09-25' })], ctx)
    expect(f.verification_status).toBe('UNVERIFIED')
    expect(f.notes).toMatch(/data de referência diferente/)
  })
  it('UNAVAILABLE when every source failed (missing source), never invents', () => {
    const f = verifyMarket(spx, [], ctx)
    expect(f.verification_status).toBe('UNAVAILABLE')
    expect(f.value).toBeNull()
  })
  it('flags stale data', () => {
    const f = verifyMarket(spx, [obs({ sourceId: 'stooq', metric: 'SPX', value: 6550, referencePeriod: '2026-09-10' }), obs({ sourceId: 'fred', metric: 'SPX', value: 6550, referencePeriod: '2026-09-10' })], ctx)
    expect(f.is_stale).toBe(true)
    expect(isCitable(f)).toBe(false)
  })
  it('rejects implausible observations (source validation)', () => {
    expect(validateObservation(obs({ sourceId: 'stooq', metric: 'USDBRL', value: 540, unit: 'BRL' }), NOW)).toMatch(/fora da faixa/)
    const { facts, rejected } = verifyAll([obs({ sourceId: 'stooq', metric: 'USDBRL', value: 540, unit: 'BRL' })], ctx, [assetByMetric('USDBRL')!], [])
    expect(rejected).toHaveLength(1)
    expect(facts[0].verification_status).toBe('REJECTED')
  })
  it('macro: official + secondary agreeing → VERIFIED/HIGH; official alone → VERIFIED/MEDIUM single source', () => {
    const ipca = MACRO_INDICATORS.find((m) => m.metric === 'BR_IPCA_12M')!
    const o = (sourceId: string, value: number, referencePeriod = '2026-08') => obs({ sourceId, metric: 'BR_IPCA_12M', value, unit: '%', category: 'MACRO', referencePeriod, asOf: '2026-08-01T03:00:00Z' })
    expect(verifyMacro(ipca, [o('ibge-sidra', 5.1), o('bcb-sgs', 5.1)], ctx)).toMatchObject({ verification_status: 'VERIFIED', confidence: 'HIGH' })
    expect(verifyMacro(ipca, [o('ibge-sidra', 5.1)], ctx)).toMatchObject({ verification_status: 'VERIFIED', confidence: 'MEDIUM', single_source: true })
    expect(verifyMacro(ipca, [o('ibge-sidra', 5.1)], { ...ctx, strictMacro: true }).verification_status).toBe('UNVERIFIED')
    expect(verifyMacro(ipca, [o('ibge-sidra', 5.1), o('bcb-sgs', 5.4)], ctx).verification_status).toBe('CONFLICT')
    expect(verifyMacro(ipca, [o('bcb-sgs', 5.1)], ctx)).toMatchObject({ verification_status: 'UNVERIFIED', source_fallback: true })
  })
  it('macro without any integrated source is UNAVAILABLE', () => {
    const lpr = MACRO_INDICATORS.find((m) => m.metric === 'CN_LPR_1Y')!
    expect(verifyMacro(lpr, [], ctx).verification_status).toBe('UNAVAILABLE')
  })
})
