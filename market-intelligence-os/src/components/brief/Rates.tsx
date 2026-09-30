import type { IntelligenceSnapshot, RateVertex, VerifiedFact } from '@/core/schemas'
import { fmtShortDate } from '@/lib/format'
import { factProvenance } from '@/lib/provenance'
import { cn, Kicker, Panel } from '../ui'
import { VerificationBadge } from '../VerificationBadge'

const num = (v: number | null, d = 2) => (v === null ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }))
const Bps = ({ v }: { v: number | null }) =>
  v === null ? (
    <span className="text-ink-3">—</span>
  ) : (
    (() => {
      const r = Math.round(v)
      return <span className={cn('tnum', r > 0 ? 'text-crit' : r < 0 ? 'text-ok' : 'text-ink-3')}>{`${r > 0 ? '+' : ''}${r} bps`}</span>
    })()
  )

function Table({ rows, factById, instrument = false, unit = '%' }: { rows: RateVertex[]; factById: Map<string, VerifiedFact>; instrument?: boolean; unit?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] text-[12.5px]">
        <thead>
          <tr className="border-b border-line text-left text-[10.5px] font-bold tracking-wider text-ink-3 uppercase">
            <th className="py-2 pr-2 font-bold">Prazo</th>
            {instrument && <th className="px-2 py-2 font-bold">Contrato</th>}
            <th className="px-2 py-2 text-right font-bold">Taxa</th>
            <th className="px-2 py-2 text-right font-bold">Dia</th>
            <th className="px-2 py-2 font-bold">Ref.</th>
            <th className="py-2 pl-2 text-right font-bold">Dado</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.metric} className={cn('border-b border-line last:border-0', r.highlight && 'bg-surface-2')}>
              <td className={cn('py-2 pr-2 text-ink', r.highlight ? 'font-extrabold' : 'font-semibold')}>{r.tenor}</td>
              {instrument && (
                <td className="px-2 py-2 text-ink-2 tnum">
                  {r.instrument ? (
                    <>
                      <span className="font-bold text-ink">{r.instrument.code}</span> · venc. {fmtShortDate(r.instrument.maturity)} · {r.instrument.business_days} du
                    </>
                  ) : (
                    '—'
                  )}
                </td>
              )}
              <td className="px-2 py-2 text-right font-semibold text-ink tnum">{r.value === null ? '—' : unit === 'bps' ? `${num(r.value, 0)} bps` : `${num(r.value)}%`}</td>
              <td className="px-2 py-2 text-right">
                <Bps v={r.change_bps} />
              </td>
              <td className="px-2 py-2 text-ink-2 tnum">{r.reference ? fmtShortDate(r.reference.slice(0, 10)) : '—'}</td>
              <td className="py-2 pl-2 text-right">
                <VerificationBadge p={factProvenance(factById.get(r.fact_id), r.verification_status)} compact />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Curvas de Juros: Treasury par curve + spreads, DI1 by bucket (real contracts) and policy rates, straight from verified facts. */
export function Rates({ s, factById }: { s: IntelligenceSnapshot; factById: Map<string, VerifiedFact> }) {
  const r = s.rates
  if (!r) return null
  return (
    <div id="rates" className="mt-5 scroll-mt-28">
      <h3 className="mb-3 text-[16px] font-extrabold text-ink">Curvas de Juros</h3>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="min-w-0 p-4">
          <Kicker className="mb-1">US Treasury · par yield</Kicker>
          <p className="mb-2 text-[11.5px] text-ink-3">Destaque: 2Y, 5Y, 10Y e 30Y. Variação em bps contra o dia útil anterior da mesma série.</p>
          {r.treasury.length ? <Table rows={r.treasury} factById={factById} /> : <p className="text-[12.5px] text-ink-3">Curva indisponível nesta execução.</p>}
          {r.spreads.length > 0 && (
            <div className="mt-3 border-t border-line pt-2">
              <Kicker className="mb-1">Spreads (cálculo determinístico)</Kicker>
              <Table rows={r.spreads} factById={factById} unit="bps" />
            </div>
          )}
        </Panel>
        <Panel className="min-w-0 p-4">
          <Kicker className="mb-1">DI1 futuro · B3 (taxa de ajuste)</Kicker>
          <p className="mb-2 text-[11.5px] text-ink-3">Cada prazo usa o contrato real com vencimento mais próximo. Sem interpolação: prazo sem contrato fica vazio.</p>
          {r.di.length ? <Table rows={r.di} factById={factById} instrument /> : <p className="text-[12.5px] text-ink-3">DI1 indisponível nesta execução.</p>}
          {r.policy.length > 0 && (
            <div className="mt-3 border-t border-line pt-2">
              <Kicker className="mb-1">Taxas de política e CDI</Kicker>
              <ul className="space-y-1">
                {r.policy.map((p) => (
                  <li key={p.metric} className="flex items-center gap-2 text-[12.5px]">
                    <span className="min-w-0 flex-1 truncate text-ink-2">{p.label}</span>
                    <span className="font-bold text-ink tnum">{p.value === null ? '—' : `${num(p.value)}%`}</span>
                    <span className="w-16 text-[11px] text-ink-3 tnum">{p.reference ? p.reference.slice(0, 10) : '—'}</span>
                    <VerificationBadge p={factProvenance(factById.get(p.fact_id), p.verification_status)} compact />
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-ink-3">Selic meta (Copom), Selic efetiva (SGS 1178), CDI (SGS 4389) e DI futuro são taxas diferentes e não se substituem.</p>
            </div>
          )}
        </Panel>
      </div>
    </div>
  )
}
