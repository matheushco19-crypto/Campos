/**
 * Hardened HTTP client for collectors: timeouts, bounded retries with
 * exponential backoff, response size cap and a polite User-Agent.
 * External content is always treated as untrusted text; nothing fetched is
 * ever executed.
 */
export interface FetchOptions {
  timeoutMs?: number
  retries?: number
  backoffMs?: number
  headers?: Record<string, string>
  maxBytes?: number
  /** Injected in tests. */
  fetchImpl?: typeof fetch
  /** Per-run memo: identical GETs within one collection are fetched once (e.g. the Treasury CSV for 8 vertices). */
  memo?: Map<string, Promise<string>>
}

/** Provider call accounting for agent_runs (reset per collection). */
export const httpStats = { calls: 0, retries: 0, failures: 0, reset() { this.calls = 0; this.retries = 0; this.failures = 0 } }

export const USER_AGENT = 'MarketIntelligenceOS/0.1 (personal research; low-frequency)'

export class HttpError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
    public readonly url: string,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function fetchText(url: string, opts: FetchOptions = {}): Promise<string> {
  if (opts.memo) {
    const hit = opts.memo.get(url)
    if (hit) return hit
    const p = fetchTextOnce(url, opts)
    opts.memo.set(url, p)
    p.catch(() => opts.memo?.delete(url))
    return p
  }
  return fetchTextOnce(url, opts)
}

async function fetchTextOnce(url: string, opts: FetchOptions): Promise<string> {
  const { timeoutMs = 12_000, retries = 2, backoffMs = 800, maxBytes = 5_000_000 } = opts
  const doFetch = opts.fetchImpl ?? fetch
  let lastError: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    httpStats.calls++
    if (attempt > 0) httpStats.retries++
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await doFetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': USER_AGENT, Accept: '*/*', ...opts.headers },
        redirect: 'follow',
        cache: 'no-store',
      })
      if (!res.ok) {
        // 4xx (except 429) are not retryable: the request itself is wrong or forbidden.
        const retryable = res.status === 429 || res.status >= 500
        const err = new HttpError(`HTTP ${res.status} for ${url}`, res.status, url)
        if (!retryable) throw err
        lastError = err
      } else {
        const text = await res.text()
        if (text.length > maxBytes) throw new HttpError(`Response too large (${text.length} bytes)`, res.status, url)
        return text
      }
    } catch (err) {
      if (err instanceof HttpError && err.status !== null && err.status < 500 && err.status !== 429) {
        httpStats.failures++
        throw err
      }
      lastError = err instanceof Error && err.name === 'AbortError' ? new HttpError(`Timeout after ${timeoutMs}ms`, null, url) : err
    } finally {
      clearTimeout(timer)
    }
    if (attempt < retries) await sleep(backoffMs * 2 ** attempt)
  }
  httpStats.failures++
  throw lastError instanceof Error ? lastError : new HttpError(String(lastError), null, url)
}

export async function fetchJson<T = unknown>(url: string, opts: FetchOptions = {}): Promise<T> {
  const text = await fetchText(url, { ...opts, headers: { Accept: 'application/json', ...opts.headers } })
  try {
    return JSON.parse(text) as T
  } catch {
    throw new HttpError(`Invalid JSON from ${url}`, null, url)
  }
}

/** Removes credentials from URLs before they are persisted or displayed. */
export function redactUrl(url: string): string {
  try {
    const u = new URL(url)
    for (const key of ['token', 'apikey', 'api_key', 'key', 'access_key', 'x_cg_demo_api_key']) {
      if (u.searchParams.has(key)) u.searchParams.set(key, 'REDACTED')
    }
    return u.toString()
  } catch {
    return url
  }
}
