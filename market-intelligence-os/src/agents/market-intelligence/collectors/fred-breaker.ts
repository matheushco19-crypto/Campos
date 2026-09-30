/**
 * fredgraph.csv (keyless FRED) can hang from some datacenter IPs: in production every call
 * waited the full 25 s timeout. After two timeouts in one collection the remaining keyless
 * calls fail fast with an explicit reason. The official API (FRED_API_KEY) is never skipped.
 */
const LIMIT = 2
let timeouts = 0

export function resetFredBreaker() {
  timeouts = 0
}

export async function guardFredgraph<T>(keyless: boolean, fn: () => Promise<T>): Promise<T> {
  if (!keyless) return fn()
  if (timeouts >= LIMIT) throw new Error(`FRED (fredgraph, sem chave) sem resposta nesta execução após ${LIMIT} timeouts: consulta ignorada. Cadastre FRED_API_KEY para usar a API oficial.`)
  try {
    return await fn()
  } catch (e) {
    if (e instanceof Error && /timeout/i.test(e.message)) timeouts++
    throw e
  }
}
