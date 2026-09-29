import type { RawObservation, RunError, SourceHealth } from '../../../core/schemas'

export interface CollectorResult {
  observations: RawObservation[]
  health: SourceHealth[]
  errors: RunError[]
  skipped: string[]
}
