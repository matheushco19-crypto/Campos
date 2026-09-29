/** Runs async thunks with bounded concurrency (polite to upstream sources). */
export async function pool<T>(thunks: (() => Promise<T>)[], limit: number): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array(thunks.length)
  let next = 0
  async function worker() {
    while (next < thunks.length) {
      const i = next++
      try {
        results[i] = { status: 'fulfilled', value: await thunks[i]() }
      } catch (reason) {
        results[i] = { status: 'rejected', reason }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, thunks.length) }, worker))
  return results
}
