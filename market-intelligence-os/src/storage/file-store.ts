import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { MemoryStore, TABLES, type Row, type TableName } from './store'

/** JSON-file store for local development. One file per table under MI_DATA_DIR. */
export class FileStore extends MemoryStore {
  override readonly kind = 'file' as const

  constructor(private readonly dir: string) {
    super()
    mkdirSync(dir, { recursive: true })
    for (const name of Object.keys(TABLES) as TableName[]) {
      const file = join(dir, `${name}.json`)
      if (!existsSync(file)) continue
      const rows = JSON.parse(readFileSync(file, 'utf8')) as Row[]
      const t = this.table(name)
      for (const r of rows) t.set(String(r[TABLES[name]]), r)
    }
  }

  protected override async persist(table: TableName) {
    const file = join(this.dir, `${table}.json`)
    const tmp = `${file}.tmp`
    writeFileSync(tmp, JSON.stringify([...this.table(table).values()], null, 1))
    renameSync(tmp, file)
  }
}
