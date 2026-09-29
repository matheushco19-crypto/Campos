import { createHash, randomUUID } from 'node:crypto'

export const newId = (prefix: string) => `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 20)}`

/** Deterministic id: identical inputs always produce the same id (idempotent upserts). */
export const stableId = (prefix: string, ...parts: (string | number | null | undefined)[]) =>
  `${prefix}_${createHash('sha256').update(parts.map((p) => String(p ?? '')).join('|')).digest('hex').slice(0, 20)}`
