/** Minimal structured logger (JSON lines). Vercel captures stdout. */
type Level = 'debug' | 'info' | 'warn' | 'error'

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 }
const threshold = LEVELS[(process.env.MI_LOG_LEVEL as Level) ?? 'info'] ?? 20

function emit(level: Level, msg: string, ctx?: Record<string, unknown>) {
  if (LEVELS[level] < threshold || process.env.MI_SILENT === '1') return
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...ctx })
  if (level === 'error' || level === 'warn') console.error(line)
  else console.log(line)
}

export const log = {
  debug: (m: string, c?: Record<string, unknown>) => emit('debug', m, c),
  info: (m: string, c?: Record<string, unknown>) => emit('info', m, c),
  warn: (m: string, c?: Record<string, unknown>) => emit('warn', m, c),
  error: (m: string, c?: Record<string, unknown>) => emit('error', m, c),
}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e))
