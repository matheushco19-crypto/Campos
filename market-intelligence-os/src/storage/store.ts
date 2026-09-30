/**
 * STORAGE LAYER — a tiny table/row abstraction implemented by an in-memory
 * store (tests), a JSON file store (local development) and Supabase/Postgres
 * (production). Column names are identical in every backend.
 */
export const TABLES = {
  verified_facts: 'id',
  raw_observations: 'id',
  news_items: 'id',
  event_clusters: 'id',
  calendar_events: 'id',
  research_requests: 'id',
  agent_runs: 'run_id',
  intelligence_snapshots: 'id',
  analysis_packets: 'id',
  social_posts: 'post_id',
  content_opportunities: 'id',
  strategy_reports: 'id',
  job_leases: 'lease_id',
} as const

export type TableName = keyof typeof TABLES
export type Row = Record<string, unknown>

export interface Query {
  eq?: Record<string, string | number | boolean | null>
  in?: [string, (string | number)[]]
  gte?: [string, string | number]
  lte?: [string, string | number]
  order?: { field: string; ascending: boolean }
  limit?: number
  select?: string[]
}

export interface Store {
  readonly kind: 'memory' | 'file' | 'supabase'
  upsert(table: TableName, rows: Row[]): Promise<void>
  /** Insert only: fails when the key already exists (append-only tables). */
  insert(table: TableName, rows: Row[]): Promise<void>
  select<T = Row>(table: TableName, query?: Query): Promise<T[]>
  remove(table: TableName, keys: string[]): Promise<void>
  /** Compare-and-delete: removes the row only if every field in `match` still has the expected value. Returns true when a row was removed. */
  removeIf(table: TableName, key: string, match: Row): Promise<boolean>
}

export function applyQuery<T extends Row>(rows: T[], q: Query = {}): T[] {
  let out = rows.filter((r) => {
    if (q.eq) for (const [k, v] of Object.entries(q.eq)) if ((r[k] ?? null) !== v) return false
    if (q.in && !q.in[1].includes(r[q.in[0]] as string | number)) return false
    if (q.gte && !((r[q.gte[0]] as string | number) >= q.gte[1])) return false
    if (q.lte && !((r[q.lte[0]] as string | number) <= q.lte[1])) return false
    return true
  })
  if (q.order) {
    const { field, ascending } = q.order
    out = [...out].sort((a, b) => {
      const av = a[field] as string | number
      const bv = b[field] as string | number
      if (av === bv) return 0
      return (av > bv ? 1 : -1) * (ascending ? 1 : -1)
    })
  }
  if (q.limit !== undefined) out = out.slice(0, q.limit)
  return out
}

export class MemoryStore implements Store {
  readonly kind: 'memory' | 'file' = 'memory'
  protected data = new Map<TableName, Map<string, Row>>()

  protected table(name: TableName) {
    let t = this.data.get(name)
    if (!t) {
      t = new Map()
      this.data.set(name, t)
    }
    return t
  }

  async upsert(table: TableName, rows: Row[]) {
    const key = TABLES[table]
    const t = this.table(table)
    for (const r of rows) t.set(String(r[key]), structuredClone(r))
    await this.persist(table)
  }

  async insert(table: TableName, rows: Row[]) {
    const key = TABLES[table]
    const t = this.table(table)
    for (const r of rows) if (t.has(String(r[key]))) throw new Error(`Duplicate key ${String(r[key])} in append-only table ${table}`)
    for (const r of rows) t.set(String(r[key]), structuredClone(r))
    await this.persist(table)
  }

  async select<T = Row>(table: TableName, query?: Query): Promise<T[]> {
    return applyQuery([...this.table(table).values()], query).map((r) => structuredClone(r)) as T[]
  }

  async remove(table: TableName, keys: string[]) {
    const t = this.table(table)
    for (const k of keys) t.delete(k)
    await this.persist(table)
  }

  async removeIf(table: TableName, key: string, match: Row) {
    const t = this.table(table)
    const row = t.get(key)
    // Check-and-delete happens synchronously (atomic within the event loop).
    if (!row || Object.entries(match).some(([k, v]) => (row[k] ?? null) !== v)) return false
    t.delete(key)
    await this.persist(table)
    return true
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected async persist(_table: TableName): Promise<void> {}
}
