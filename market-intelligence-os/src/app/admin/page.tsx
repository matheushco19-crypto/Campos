import { AlertTriangle, ArrowLeft, CheckCircle2, CircleDashed, Clock, XCircle } from 'lucide-react'
import Link from 'next/link'
import { sourceName } from '../../../config/sources'
import { SNAP_STATUS } from '@/components/brief/shared'
import { ResearchPanel, RunNowButton } from '@/components/ResearchPanel'
import { cn, Kicker, Panel, Pill } from '@/components/ui'
import type { SystemHealth } from '@/engines/system-health'
import type { AgentRun } from '@/core/schemas'
import { type AdminData, type AgentKey, loadAdmin } from '@/lib/admin-data'
import { fmtDate, fmtDateTimeBRT, fmtTimeBRT } from '@/lib/format'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Administração · Market Intelligence OS' }

const AGENT_CARDS: [AgentKey, string, string][] = [
  ['market-intelligence', 'Agent 1', 'Coleta e verificação'],
  ['financial-intelligence', 'Agent 2', 'Análise e briefing'],
  ['social-strategist', 'Agent 3', 'Agenda e estratégia social'],
  ['orchestrator', 'Orquestrador', 'Pipeline e snapshot'],
]
const RUN_TONE: Record<string, 'ok' | 'warn' | 'crit' | 'accent' | 'neutral'> = { SUCCESS: 'ok', PARTIAL: 'warn', FAILED: 'crit', AWAITING_ANALYSIS: 'accent', RUNNING: 'neutral' }
const RUN_PT: Record<string, string> = { SUCCESS: 'Sucesso', PARTIAL: 'Parcial', FAILED: 'Falhou', AWAITING_ANALYSIS: 'Aguardando análise', RUNNING: 'Rodando' }

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date } = await searchParams
  let a: AdminData
  try {
    a = await loadAdmin(date)
  } catch (e) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <Panel className="border-crit/40 p-5 text-[13px] text-crit">Não foi possível ler o armazenamento: {e instanceof Error ? e.message : String(e)}</Panel>
      </main>
    )
  }
  const dg = a.diagnosis
  const DgIcon = dg.tone === 'ok' ? CheckCircle2 : dg.tone === 'neutral' ? Clock : dg.tone === 'warn' ? AlertTriangle : XCircle

  return (
    <div className="min-h-screen">
      <header className="bg-deck text-white">
        <div className="mx-auto flex max-w-[1320px] flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <Link href="/" className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-white/80 hover:text-white">
            <ArrowLeft className="size-4" /> Briefing
          </Link>
          <span className="text-[11px] font-extrabold tracking-[0.24em] text-white/90">ADMINISTRAÇÃO</span>
          <form className="ml-auto flex items-center gap-2" action="/admin">
            <label className="sr-only" htmlFor="admin-date">
              Data
            </label>
            <input id="admin-date" type="date" name="date" defaultValue={a.date} max={a.today} className="h-8 rounded-md border border-white/15 bg-white/5 px-2 text-[12px] font-semibold text-white tnum [color-scheme:dark]" />
            <button className="h-8 rounded-md border border-white/15 px-2.5 text-[12px] font-bold text-white hover:bg-white/10">Ver</button>
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-[1320px] space-y-8 px-4 py-8 sm:px-6">
        <section aria-labelledby="dg-title">
          <Kicker>Por que o briefing {a.date === a.today ? 'de hoje' : `de ${fmtDate(a.date)}`} (não) apareceu?</Kicker>
          <Panel className={cn('mt-2 p-5', dg.tone === 'crit' && 'border-crit/40', dg.tone === 'warn' && 'border-warn/40', dg.tone === 'ok' && 'border-ok/40')}>
            <div className="flex flex-wrap items-start gap-3">
              <DgIcon className={cn('mt-0.5 size-5 shrink-0', dg.tone === 'ok' ? 'text-ok' : dg.tone === 'warn' ? 'text-warn' : dg.tone === 'crit' ? 'text-crit' : 'text-ink-3')} aria-hidden />
              <div className="min-w-0 flex-1 basis-60">
                <h1 id="dg-title" className="text-[17px] font-extrabold text-ink">
                  {dg.headline}
                </h1>
                {dg.detail.length > 0 && (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-[12.5px] text-ink-2">
                    {dg.detail.map((x, i) => (
                      <li key={i}>{x}</li>
                    ))}
                  </ul>
                )}
                {dg.nextStep && <p className="mt-2 text-[12.5px] font-semibold text-ink">Próximo passo: {dg.nextStep}</p>}
              </div>
              <RunNowButton />
            </div>
          </Panel>
        </section>

        <SystemHealthPanel h={a.health} />

        <section aria-label="Últimas execuções por agente" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {AGENT_CARDS.map(([key, name, role]) => (
            <AgentCard key={key} name={name} role={role} run={a.lastRuns[key]} />
          ))}
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <Panel className="p-5">
            <Kicker>Último snapshot publicado</Kicker>
            {a.lastPublished && a.lastPublishedDate ? (
              <div className="mt-2 text-[13px] text-ink-2">
                <Link href={`/?date=${a.lastPublishedDate}`} className="text-[16px] font-extrabold text-ink hover:underline">
                  {fmtDate(a.lastPublishedDate)} · v{a.lastPublished.version}
                </Link>
                <p className="mt-1 tnum">Gerado em {fmtDateTimeBRT(a.lastPublished.generated_at)}</p>
                <p className="tnum">
                  {a.lastPublished.qc.word_count} palavras · {a.lastPublished.qc.reading_minutes.toLocaleString('pt-BR')} min · QC {a.lastPublished.qc.passed ? 'aprovado' : 'reprovado'}
                </p>
              </div>
            ) : (
              <p className="mt-2 text-[13px] text-ink-3">Nenhum snapshot publicado ainda.</p>
            )}
          </Panel>
          <Panel className="p-5">
            <Kicker>Versões de {fmtDate(a.date)}</Kicker>
            <ul className="mt-2 space-y-1 text-[12.5px]">
              {a.versions.map((v) => (
                <li key={v.id} className="flex items-center gap-2">
                  <span className="w-7 font-extrabold tnum">v{v.version}</span>
                  <span className="text-ink-3 tnum">{fmtTimeBRT(v.generated_at)}</span>
                  <Pill tone={SNAP_STATUS[v.status]?.tone ?? 'neutral'}>{SNAP_STATUS[v.status]?.label ?? v.status}</Pill>
                </li>
              ))}
              {!a.versions.length && <li className="text-ink-3">Nenhuma versão.</li>}
            </ul>
            <p className="mt-3 text-[12px] text-ink-3">Pacote de análise (Claude Code): {a.packetStatus ?? 'nenhum'}</p>
          </Panel>
          <Panel className="p-5">
            <Kicker>Controle de qualidade da última versão</Kicker>
            {a.latestForDate ? (
              <ul className="mt-2 grid gap-1 text-[12px]">
                {a.latestForDate.qc.checks.map((c) => (
                  <li key={c.id} className="flex items-start gap-1.5" title={c.detail ?? ''}>
                    {c.passed ? <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-ok" /> : c.severity === 'warn' ? <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warn" /> : <XCircle className="mt-0.5 size-3.5 shrink-0 text-crit" />}
                    <span className={c.passed ? 'text-ink-2' : c.severity === 'warn' ? 'text-warn' : 'font-semibold text-crit'}>
                      {c.label}
                      {!c.passed && c.detail ? `: ${c.detail}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[13px] text-ink-3">Sem versão nesta data.</p>
            )}
          </Panel>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <Panel className="p-5">
            <Kicker>Fontes indisponíveis na última coleta</Kicker>
            {a.unavailableSources.length ? (
              <ul className="mt-2 space-y-1 text-[12.5px]">
                {a.unavailableSources.map((s) => (
                  <li key={s.source} className="flex gap-2">
                    <span className="w-40 shrink-0 font-semibold text-ink">{sourceName(s.source)}</span>
                    <span className="min-w-0 text-ink-3">{s.error}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[13px] text-ink-3">Todas as fontes consultadas responderam.</p>
            )}
            {a.skippedSources.length > 0 && (
              <details className="mt-3 text-[12px] text-ink-2">
                <summary className="cursor-pointer font-semibold">Fontes puladas por falta de chave ou bloqueio ({a.skippedSources.length})</summary>
                <ul className="mt-1.5 space-y-0.5 text-ink-3">
                  {a.skippedSources.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </details>
            )}
          </Panel>
          <Panel className="p-5">
            <Kicker>Dados sem verificação em {fmtDate(a.date)}</Kicker>
            {a.unavailableFacts.length ? (
              <ul className="mt-2 space-y-1 text-[12.5px]">
                {a.unavailableFacts.map((f) => (
                  <li key={f.id} className="flex items-start gap-2">
                    <CircleDashed className="mt-0.5 size-3.5 shrink-0 text-ink-3" aria-hidden />
                    <span className="font-semibold text-ink">{f.label}</span>
                    <span className="text-ink-3">{f.verification_status}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[13px] text-ink-3">Nenhum dado indisponível, rejeitado ou em conflito.</p>
            )}
          </Panel>
        </section>

        <section>
          <Kicker className="mb-2">Execuções em {fmtDate(a.date)}</Kicker>
          <Panel className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-[12.5px]">
              <thead>
                <tr className="border-b border-line text-left text-[10.5px] tracking-wider text-ink-3 uppercase">
                  <th className="px-3 py-2">Agente</th>
                  <th className="px-3 py-2">Início</th>
                  <th className="px-3 py-2">Duração</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Coletado</th>
                  <th className="px-3 py-2 text-right">Verificado</th>
                  <th className="px-3 py-2">Erros</th>
                </tr>
              </thead>
              <tbody>
                {a.runsForDate.map((r) => (
                  <tr key={r.run_id} className="border-b border-line align-top last:border-0">
                    <td className="px-3 py-2 font-semibold text-ink">{r.agent}</td>
                    <td className="px-3 py-2 text-ink-2 tnum">{fmtDateTimeBRT(r.started_at)}</td>
                    <td className="px-3 py-2 text-ink-2 tnum">{duration(r)}</td>
                    <td className="px-3 py-2">
                      <Pill tone={RUN_TONE[r.status] ?? 'neutral'}>{RUN_PT[r.status] ?? r.status}</Pill>
                    </td>
                    <td className="px-3 py-2 text-right tnum">{r.items_collected}</td>
                    <td className="px-3 py-2 text-right tnum">{r.items_verified}</td>
                    <td className="px-3 py-2 text-ink-3">
                      {r.errors.length ? (
                        <details>
                          <summary className="cursor-pointer font-semibold text-ink-2">{r.errors.length}</summary>
                          <ul className="mt-1 max-h-48 space-y-0.5 overflow-y-auto">
                            {r.errors.map((e, i) => (
                              <li key={i}>
                                {e.step}
                                {e.source ? ` · ${e.source}` : ''}: {e.message}
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : (
                        '0'
                      )}
                    </td>
                  </tr>
                ))}
                {!a.runsForDate.length && (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-ink-3">
                      Nenhuma execução registrada nesta data.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Panel>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="min-w-0">
            <Kicker className="mb-2">Research Broker</Kicker>
            <ResearchPanel requests={a.research} />
          </div>
          <div className="min-w-0">
            <Kicker className="mb-2">Atividade recente (todas as datas)</Kicker>
            <Panel className="divide-y divide-line">
              {a.recentRuns.slice(0, 12).map((r) => (
                <div key={r.run_id} className="flex items-center gap-2 px-4 py-2 text-[12px]">
                  <span className="w-20 shrink-0 text-ink-3 tnum">{r.brief_date ?? '—'}</span>
                  <span className="min-w-0 flex-1 truncate font-semibold text-ink">{r.agent}</span>
                  <span className="shrink-0 text-ink-3 tnum">{fmtTimeBRT(r.started_at)}</span>
                  <Pill tone={RUN_TONE[r.status] ?? 'neutral'}>{RUN_PT[r.status] ?? r.status}</Pill>
                </div>
              ))}
            </Panel>
          </div>
        </section>
        <p className="text-[11.5px] text-ink-3">Armazenamento: {a.storage}. Horários em BRT.</p>
      </main>
    </div>
  )
}

function AgentCard({ name, role, run }: { name: string; role: string; run: AgentRun | null }) {
  return (
    <Panel className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[14px] font-extrabold text-ink">{name}</div>
          <div className="text-[11.5px] text-ink-3">{role}</div>
        </div>
        {run ? <Pill tone={RUN_TONE[run.status] ?? 'neutral'}>{RUN_PT[run.status] ?? run.status}</Pill> : <Pill>Sem execução</Pill>}
      </div>
      {run && (
        <dl className="mt-3 grid grid-cols-2 gap-y-1 text-[12px]">
          <dt className="text-ink-3">Última execução</dt>
          <dd className="text-right font-semibold text-ink tnum">{fmtDateTimeBRT(run.started_at)}</dd>
          <dt className="text-ink-3">Briefing de</dt>
          <dd className="text-right font-semibold text-ink tnum">{run.brief_date ? fmtDate(run.brief_date) : '—'}</dd>
          <dt className="text-ink-3">Duração</dt>
          <dd className="text-right font-semibold text-ink tnum">{duration(run)}</dd>
          <dt className="text-ink-3">Erros</dt>
          <dd className={cn('text-right font-semibold tnum', run.errors.length ? 'text-warn' : 'text-ink')}>{run.errors.length}</dd>
        </dl>
      )}
      {run?.errors[0] && <p className="mt-2 line-clamp-2 text-[11.5px] text-ink-3">Último erro: {run.errors.at(-1)!.message}</p>}
    </Panel>
  )
}

function duration(r: AgentRun): string {
  if (!r.finished_at) return 'em andamento'
  const s = Math.max(0, (new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()) / 1000)
  return s < 60 ? `${s.toFixed(1).replace('.', ',')} s` : `${Math.round(s / 60)} min`
}

const HEALTH_TONE = { HEALTHY: 'ok', DEGRADED: 'warn', FAILED: 'crit' } as const
const PROVIDER_TONE = { ok: 'ok', partial: 'warn', down: 'crit' } as const

function SystemHealthPanel({ h }: { h: SystemHealth }) {
  const when = (iso: string | null) => (iso ? fmtDateTimeBRT(iso) : 'nunca')
  return (
    <section aria-labelledby="health-title">
      <Kicker>System health</Kicker>
      <Panel className={cn('mt-2 p-5', h.status === 'FAILED' && 'border-crit/40', h.status === 'DEGRADED' && 'border-warn/40', h.status === 'HEALTHY' && 'border-ok/40')}>
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="health-title" className="text-[17px] font-extrabold text-ink">
            SYSTEM HEALTH: {h.status}
          </h2>
          <Pill tone={HEALTH_TONE[h.status]}>{h.status}</Pill>
          <span className="text-[12.5px] font-semibold text-ink-2 tnum">
            Core Markets Verified: {h.core.verified}/{h.core.total}
          </span>
          <Pill tone={h.publication === 'AVAILABLE' ? 'ok' : 'crit'}>Publicação: {h.publication === 'AVAILABLE' ? 'disponível' : 'indisponível'}</Pill>
        </div>
        {h.reasons.length > 0 && (
          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-[12.5px] text-ink-2">
            {h.reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        )}
        <dl className="mt-4 grid gap-x-6 gap-y-1.5 text-[12.5px] sm:grid-cols-2 lg:grid-cols-3">
          {(
            [
              ['Último morning run com sucesso', when(h.runs.lastMorningRun)],
              ['Último enriquecimento (Agent 2)', when(h.runs.lastEnriched)],
              ['Último snapshot determinístico', when(h.runs.lastDeterministic)],
              ['Último Agent 1 com sucesso', when(h.lastSuccess.agent1)],
              ['Última coleta de mercado', when(h.lastSuccess.markets)],
              ['Última coleta macro', when(h.lastSuccess.macro)],
              ['Última coleta de notícias', when(h.lastSuccess.news)],
              ['Último Agent 3', when(h.lastSuccess.agent3)],
              ['Último Agent 2', when(h.lastSuccess.agent2)],
              ['Último snapshot publicado', h.lastPublished ? `${h.lastPublished.date} v${h.lastPublished.version} (${h.lastPublished.mode})` : 'nenhum'],
              ['Idade do snapshot', h.lastPublished ? `${h.lastPublished.ageHours.toLocaleString('pt-BR')} h` : '—'],
              ['Fatos', `${h.facts.VERIFIED} VERIFIED · ${h.facts.UNVERIFIED} UNVERIFIED · ${h.facts.UNAVAILABLE} UNAVAILABLE · ${h.facts.CONFLICT} CONFLICT`],
              ['Pacote do Agent 2', h.packet.chars !== null ? `${h.packet.chars.toLocaleString('pt-BR')} caracteres ≈ ${h.packet.estimatedTokens?.toLocaleString('pt-BR')} tokens (${h.packet.status ?? 'sem pacote'})` : '—'],
              ['Provedor de mercado (fatos)', h.marketProviders.map((p) => `${p.source} ${p.facts}`).join(' · ') || '—'],
              ['Core não verificados', h.core.notVerified.map((n) => `${n.metric} (${n.status}, ${n.method})`).join(' · ') || 'nenhum'],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="flex min-w-0 flex-col">
              <dt className="text-[11px] font-bold tracking-wide text-ink-3 uppercase">{k}</dt>
              <dd className="break-words text-ink tnum">{v}</dd>
            </div>
          ))}
        </dl>
        {h.providers.length > 0 && (
          <div className="mt-4 border-t border-line pt-3">
            <p className="mb-2 text-[11px] font-bold tracking-wide text-ink-3 uppercase">Provedores na última coleta (um provedor secundário fora não derruba o sistema)</p>
            <ul className="flex flex-wrap gap-1.5">
              {h.providers.map((p) => (
                <li key={p.source} title={p.lastError ?? ''}>
                  <Pill tone={PROVIDER_TONE[p.status]}>
                    {p.source} {p.ok}/{p.ok + p.failed}
                  </Pill>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Panel>
    </section>
  )
}
