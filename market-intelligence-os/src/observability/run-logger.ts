import { newId } from '../core/ids'
import { log } from '../core/logger'
import type { AgentName, AgentRun, JobName, RunError, RunStatus, SourceHealth } from '../core/schemas'
import type { Repository } from '../storage/repository'

/**
 * agent_runs writer. Every agent execution is persisted, successful or not,
 * so "why wasn't today's brief produced?" can always be answered from the
 * dashboard (Research → Runs) or from the agent_runs table.
 */
export class RunLogger {
  readonly run: AgentRun

  constructor(
    private readonly repo: Repository,
    agent: AgentName,
    opts: { job?: JobName | null; briefDate?: string | null; parentRunId?: string | null; runId?: string } = {},
  ) {
    this.run = {
      run_id: opts.runId ?? newId('run'),
      parent_run_id: opts.parentRunId ?? null,
      agent,
      job: opts.job ?? null,
      brief_date: opts.briefDate ?? null,
      started_at: new Date().toISOString(),
      finished_at: null,
      status: 'RUNNING',
      items_collected: 0,
      items_verified: 0,
      items_rejected: 0,
      errors: [],
      sources: [],
      execution_metadata: {},
    }
  }

  get id() {
    return this.run.run_id
  }

  async start() {
    log.info('run.start', { agent: this.run.agent, run_id: this.id, job: this.run.job, brief_date: this.run.brief_date })
    await this.safeSave()
    return this
  }

  error(step: string, message: string, source: string | null = null) {
    const e: RunError = { step, source, message, at: new Date().toISOString() }
    this.run.errors.push(e)
    log.warn('run.error', { agent: this.run.agent, run_id: this.id, ...e })
  }

  errors(list: RunError[]) {
    for (const e of list) this.run.errors.push(e)
  }

  sources(list: SourceHealth[]) {
    this.run.sources.push(...list)
  }

  meta(data: Record<string, unknown>) {
    Object.assign(this.run.execution_metadata, data)
  }

  counts(c: Partial<Pick<AgentRun, 'items_collected' | 'items_verified' | 'items_rejected'>>) {
    Object.assign(this.run, c)
  }

  async finish(status: RunStatus) {
    this.run.status = status
    this.run.finished_at = new Date().toISOString()
    this.meta({ duration_ms: Date.parse(this.run.finished_at) - Date.parse(this.run.started_at) })
    log.info('run.finish', { agent: this.run.agent, run_id: this.id, status, errors: this.run.errors.length })
    await this.safeSave()
    return this.run
  }

  /** Logging must never break the pipeline. */
  private async safeSave() {
    try {
      await this.repo.saveRun(this.run)
    } catch (e) {
      log.error('run.save_failed', { run_id: this.id, error: e instanceof Error ? e.message : String(e) })
    }
  }
}
