import type { AgentRun, IntelligenceSnapshot } from '../core/schemas'

/**
 * Answers "por que o briefing de hoje não apareceu?" from observability data only
 * (agent_runs, snapshot versions and the Claude Code hand-off packet).
 */
export type BriefState = 'PUBLISHED' | 'AWAITING_ANALYSIS' | 'FAILED_QC' | 'FACTS_ONLY' | 'RUN_FAILED' | 'NOT_RUN' | 'SCHEDULED'

export interface Diagnosis {
  state: BriefState
  tone: 'ok' | 'warn' | 'crit' | 'neutral'
  headline: string
  detail: string[]
  nextStep: string | null
}

export interface DiagnosisInput {
  date: string
  /** Current time in São Paulo, "HH:MM". */
  nowLocal: string
  isToday: boolean
  runs: AgentRun[]
  versions: Pick<IntelligenceSnapshot, 'version' | 'status' | 'generated_at'>[]
  latest: IntelligenceSnapshot | null
  packetStatus: 'PENDING' | 'SUBMITTED' | 'EXPIRED' | null
  /** Scheduled time of the morning job, local "HH:MM". */
  scheduledAt?: string
}

export function diagnoseBrief(i: DiagnosisInput): Diagnosis {
  const published = i.versions.find((v) => v.status === 'PUBLISHED')
  const orch = i.runs.filter((r) => r.agent === 'orchestrator').sort((a, b) => b.started_at.localeCompare(a.started_at))[0]
  const agentErrors = i.runs.flatMap((r) => r.errors.map((e) => `${r.agent} · ${e.step}${e.source ? ` (${e.source})` : ''}: ${e.message}`))
  const scheduled = i.scheduledAt ?? '05:00'

  if (published) {
    const newer = i.versions.filter((v) => v.version > published.version)
    return {
      state: 'PUBLISHED',
      tone: 'ok',
      headline: `Briefing publicado (v${published.version}).`,
      detail: newer.length ? [`Há ${newer.length} versão(ões) mais recente(s) não publicada(s): ${newer.map((v) => `v${v.version} ${v.status}`).join(', ')}. O dashboard mostra a última publicada.`] : [],
      nextStep: null,
    }
  }
  if (i.latest?.status === 'FAILED_QC') {
    return {
      state: 'FAILED_QC',
      tone: 'crit',
      headline: 'A análise foi escrita, mas o controle de qualidade reprovou e ela não foi publicada.',
      detail: i.latest.qc.checks.filter((c) => !c.passed && c.severity !== 'warn').map((c) => `${c.label}: ${c.detail ?? ''}`),
      nextStep: 'Reenvie a análise corrigida (POST /api/analysis ou `npm run mi -- submit`).',
    }
  }
  if (i.latest?.status === 'AWAITING_ANALYSIS' || i.packetStatus === 'PENDING') {
    return {
      state: 'AWAITING_ANALYSIS',
      tone: 'warn',
      headline: 'Os fatos foram coletados e verificados. Falta a etapa de interpretação (Agent 2).',
      detail: ['O pacote de análise está PENDING. A rotina do Claude Code lê o pacote em GET /api/analysis e publica em POST /api/analysis.', ...agentErrors.slice(0, 5)],
      nextStep: 'Verifique se a rotina do Claude Code rodou (05:20) ou rode a análise manualmente.',
    }
  }
  if (i.latest?.status === 'DRAFT_FACTS_ONLY') {
    return {
      state: 'FACTS_ONLY',
      tone: 'warn',
      headline: 'Só há a versão com fatos: a interpretação falhou ou está desligada.',
      detail: [...i.latest.limitations, ...agentErrors].slice(0, 6),
      nextStep: 'Confira MI_LLM_PROVIDER e os erros do Agent 2 abaixo.',
    }
  }
  if (orch && (orch.status === 'FAILED' || !i.versions.length)) {
    return {
      state: 'RUN_FAILED',
      tone: 'crit',
      headline: 'O pipeline rodou, mas nenhum briefing foi gravado.',
      detail: agentErrors.slice(0, 8),
      nextStep: 'Veja os erros por agente e rode de novo em "Rodar agora".',
    }
  }
  if (i.isToday && i.nowLocal < scheduled) {
    return { state: 'SCHEDULED', tone: 'neutral', headline: `O Morning Intelligence de hoje roda às ${scheduled} (BRT).`, detail: [], nextStep: null }
  }
  return {
    state: 'NOT_RUN',
    tone: 'crit',
    headline: 'Nenhuma execução registrada para esta data.',
    detail: i.isToday
      ? ['O cron não disparou ou não conseguiu autenticar. Confira o Vercel Cron (vercel.json), a variável CRON_SECRET e os logs do deploy.']
      : ['Não houve execução nesta data. O histórico nunca é preenchido retroativamente.'],
    nextStep: i.isToday ? 'Rode agora pelo botão "Rodar Morning Intelligence".' : null,
  }
}
