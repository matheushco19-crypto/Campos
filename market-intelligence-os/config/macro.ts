import type { Region } from '../src/core/schemas'

/**
 * MACRO INDICATORS. The `official` source is the authority. `secondary`
 * validates it. `transform` converts raw series deterministically (never an LLM).
 */
export type MacroSourceRef =
  | { sourceId: 'bcb-sgs'; code: number }
  | { sourceId: 'ibge-sidra'; table: number; variable: number; classification?: string }
  | { sourceId: 'bcb-focus'; indicator: string; horizon: 'current_year' | 'next_year' }
  | { sourceId: 'bls'; series: string }
  | { sourceId: 'fred-macro'; series: string }
  | { sourceId: 'ecb'; flow: string; key: string }

export interface MacroIndicator {
  metric: string
  label: string
  region: Region
  unit: string
  frequency: 'daily' | 'monthly' | 'quarterly' | 'meeting' | 'weekly'
  /** yoy: 12-period % change of an index; mom_diff: level change (e.g. payrolls, thousands). */
  transform?: 'yoy' | 'mom_diff'
  official: MacroSourceRef | null
  secondary: MacroSourceRef | null
  /** Absolute tolerance for official vs secondary comparison. */
  tolerance: number
  maxAgeDays: number
  enabled: boolean
  notes?: string
}

export const MACRO_INDICATORS: MacroIndicator[] = [
  /* BRASIL */
  { metric: 'BR_SELIC_TARGET', label: 'Selic meta', region: 'BR', unit: '% a.a.', frequency: 'meeting',
    official: { sourceId: 'bcb-sgs', code: 432 }, secondary: null, tolerance: 0.001, maxAgeDays: 120, enabled: true },
  { metric: 'BR_IPCA_MOM', label: 'IPCA (variação mensal)', region: 'BR', unit: '%', frequency: 'monthly',
    official: { sourceId: 'ibge-sidra', table: 1737, variable: 63 }, secondary: { sourceId: 'bcb-sgs', code: 433 }, tolerance: 0.005, maxAgeDays: 75, enabled: true },
  { metric: 'BR_IPCA_12M', label: 'IPCA (12 meses)', region: 'BR', unit: '%', frequency: 'monthly',
    official: { sourceId: 'ibge-sidra', table: 1737, variable: 2265 }, secondary: { sourceId: 'bcb-sgs', code: 13522 }, tolerance: 0.005, maxAgeDays: 75, enabled: true },
  { metric: 'BR_IGPM_MOM', label: 'IGP-M (variação mensal)', region: 'BR', unit: '%', frequency: 'monthly',
    official: { sourceId: 'bcb-sgs', code: 189 }, secondary: null, tolerance: 0.005, maxAgeDays: 75, enabled: true,
    notes: 'IGP-M é calculado pela FGV (instituição privada). O BCB/SGS republica a série oficial.' },
  { metric: 'BR_UNEMPLOYMENT', label: 'Desemprego (PNAD Contínua)', region: 'BR', unit: '%', frequency: 'monthly',
    official: { sourceId: 'ibge-sidra', table: 6381, variable: 4099 }, secondary: { sourceId: 'bcb-sgs', code: 24369 }, tolerance: 0.05, maxAgeDays: 100, enabled: true },
  { metric: 'BR_IBCBR', label: 'IBC-Br (índice dessazonalizado)', region: 'BR', unit: 'idx', frequency: 'monthly',
    official: { sourceId: 'bcb-sgs', code: 24364 }, secondary: null, tolerance: 0.01, maxAgeDays: 100, enabled: true },
  { metric: 'BR_GROSS_DEBT_GDP', label: 'Dívida bruta do governo geral (% PIB)', region: 'BR', unit: '% PIB', frequency: 'monthly',
    official: { sourceId: 'bcb-sgs', code: 13762 }, secondary: null, tolerance: 0.05, maxAgeDays: 100, enabled: true },
  { metric: 'BR_FOCUS_IPCA_CY', label: 'Focus: IPCA esperado (ano corrente)', region: 'BR', unit: '%', frequency: 'weekly',
    official: { sourceId: 'bcb-focus', indicator: 'IPCA', horizon: 'current_year' }, secondary: null, tolerance: 0.01, maxAgeDays: 10, enabled: true },
  { metric: 'BR_FOCUS_SELIC_CY', label: 'Focus: Selic esperada (fim do ano corrente)', region: 'BR', unit: '% a.a.', frequency: 'weekly',
    official: { sourceId: 'bcb-focus', indicator: 'Selic', horizon: 'current_year' }, secondary: null, tolerance: 0.01, maxAgeDays: 10, enabled: true },

  /* ESTADOS UNIDOS */
  { metric: 'US_FED_FUNDS_UPPER', label: 'Fed Funds (teto da banda)', region: 'US', unit: '%', frequency: 'meeting',
    official: { sourceId: 'fred-macro', series: 'DFEDTARU' }, secondary: null, tolerance: 0.001, maxAgeDays: 10, enabled: true,
    notes: 'Série do Federal Reserve distribuída via FRED (St. Louis Fed).' },
  { metric: 'US_CPI_YOY', label: 'CPI (12 meses)', region: 'US', unit: '%', frequency: 'monthly', transform: 'yoy',
    official: { sourceId: 'bls', series: 'CUUR0000SA0' }, secondary: { sourceId: 'fred-macro', series: 'CPIAUCNSL' }, tolerance: 0.05, maxAgeDays: 75, enabled: true },
  { metric: 'US_UNEMPLOYMENT', label: 'Desemprego EUA', region: 'US', unit: '%', frequency: 'monthly',
    official: { sourceId: 'bls', series: 'LNS14000000' }, secondary: { sourceId: 'fred-macro', series: 'UNRATE' }, tolerance: 0.05, maxAgeDays: 75, enabled: true },
  { metric: 'US_PAYROLLS_CHANGE', label: 'Payroll (variação mensal, mil)', region: 'US', unit: 'mil', frequency: 'monthly', transform: 'mom_diff',
    official: { sourceId: 'bls', series: 'CES0000000001' }, secondary: { sourceId: 'fred-macro', series: 'PAYEMS' }, tolerance: 1, maxAgeDays: 75, enabled: true },
  { metric: 'US_PCE_YOY', label: 'PCE (12 meses)', region: 'US', unit: '%', frequency: 'monthly', transform: 'yoy',
    official: { sourceId: 'fred-macro', series: 'PCEPI' }, secondary: null, tolerance: 0.05, maxAgeDays: 75, enabled: true,
    notes: 'Fonte original: BEA. Distribuído via FRED.' },
  { metric: 'US_GDP_QOQ_SAAR', label: 'PIB EUA (tri/tri anualizado)', region: 'US', unit: '%', frequency: 'quarterly',
    official: { sourceId: 'fred-macro', series: 'A191RL1Q225SBEA' }, secondary: null, tolerance: 0.05, maxAgeDays: 200, enabled: true,
    notes: 'Fonte original: BEA. Distribuído via FRED.' },

  /* EUROPA */
  { metric: 'EU_ECB_DEPOSIT_RATE', label: 'ECB — taxa de depósito', region: 'EU', unit: '%', frequency: 'meeting',
    official: { sourceId: 'ecb', flow: 'FM', key: 'B.U2.EUR.4F.KR.DFR.LEV' }, secondary: null, tolerance: 0.001, maxAgeDays: 120, enabled: true },
  { metric: 'EU_HICP_YOY', label: 'HICP zona do euro (12 meses)', region: 'EU', unit: '%', frequency: 'monthly',
    official: { sourceId: 'ecb', flow: 'ICP', key: 'M.U2.N.000000.4.ANR' }, secondary: null, tolerance: 0.05, maxAgeDays: 75, enabled: true },
  { metric: 'EU_UNEMPLOYMENT', label: 'Desemprego zona do euro', region: 'EU', unit: '%', frequency: 'monthly',
    official: { sourceId: 'ecb', flow: 'LFSI', key: 'M.I9.S.UNEHRT.TOTAL0.15_74.T' }, secondary: null, tolerance: 0.05, maxAgeDays: 100, enabled: true },

  /* CHINA */
  { metric: 'CN_CPI_YOY', label: 'CPI China (12 meses)', region: 'CN', unit: '%', frequency: 'monthly', transform: 'yoy',
    official: null, secondary: { sourceId: 'fred-macro', series: 'CHNCPIALLMINMEI' }, tolerance: 0.1, maxAgeDays: 120, enabled: true,
    notes: 'NBS não integrado. A série da OECD via FRED tem defasagem e fica UNVERIFIED até haver confirmação oficial.' },
  { metric: 'CN_LPR_1Y', label: 'LPR 1 ano (PBoC)', region: 'CN', unit: '%', frequency: 'monthly',
    official: null, secondary: null, tolerance: 0.001, maxAgeDays: 45, enabled: true,
    notes: 'PBoC sem API estruturada. Fica UNAVAILABLE até ser importado manualmente com a URL oficial.' },
]

export const enabledMacro = () => MACRO_INDICATORS.filter((m) => m.enabled)
