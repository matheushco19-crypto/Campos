import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { TABLES, type Query, type Row, type Store, type TableName } from './store'

/**
 * Supabase/Postgres store. Uses the service-role key and runs only on the
 * server (API routes, cron, CLI). RLS is enabled on every table with no public
 * policies, so the anon key can read nothing.
 */
export class SupabaseStore implements Store {
  readonly kind = 'supabase' as const
  private client: SupabaseClient

  constructor(url: string, serviceKey: string) {
    this.client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  }

  async upsert(table: TableName, rows: Row[]) {
    if (!rows.length) return
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await this.client.from(table).upsert(rows.slice(i, i + 500), { onConflict: TABLES[table] })
      if (error) throw new Error(`Supabase upsert ${table}: ${error.message}`)
    }
  }

  async insert(table: TableName, rows: Row[]) {
    if (!rows.length) return
    const { error } = await this.client.from(table).insert(rows)
    if (error) throw new Error(`Supabase insert ${table}: ${error.message}`)
  }

  async select<T = Row>(table: TableName, q: Query = {}): Promise<T[]> {
    let query = this.client.from(table).select(q.select?.join(',') ?? '*')
    if (q.eq) for (const [k, v] of Object.entries(q.eq)) query = v === null ? query.is(k, null) : query.eq(k, v)
    if (q.in) query = query.in(q.in[0], q.in[1])
    if (q.gte) query = query.gte(q.gte[0], q.gte[1])
    if (q.lte) query = query.lte(q.lte[0], q.lte[1])
    if (q.order) query = query.order(q.order.field, { ascending: q.order.ascending })
    query = query.limit(q.limit ?? 5000)
    const { data, error } = await query
    if (error) throw new Error(`Supabase select ${table}: ${error.message}`)
    return (data ?? []) as T[]
  }

  async remove(table: TableName, keys: string[]) {
    if (!keys.length) return
    const { error } = await this.client.from(table).delete().in(TABLES[table], keys)
    if (error) throw new Error(`Supabase delete ${table}: ${error.message}`)
  }

  async removeIf(table: TableName, key: string, match: Row) {
    let q = this.client.from(table).delete().eq(TABLES[table], key)
    for (const [k, v] of Object.entries(match)) q = v === null ? q.is(k, null) : q.eq(k, v as string | number | boolean)
    const { data, error } = await q.select(TABLES[table])
    if (error) throw new Error(`Supabase delete ${table}: ${error.message}`)
    return (data?.length ?? 0) > 0
  }
}
