import { searchResponseSchema, type SearchResponse } from '#shared/search'

export async function searchWithAi(query: string, signal: AbortSignal): Promise<SearchResponse> {
  const timeout = AbortSignal.timeout(35_000)
  try {
    const response = await fetch('/api/search', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }), signal: AbortSignal.any([signal, timeout]) })
    if (!response.ok && response.status !== 429) return { mode: 'text', reason: 'unavailable' }
    const result = searchResponseSchema.safeParse(await response.json())
    return result.success ? result.data : { mode: 'text', reason: 'invalid' }
  } catch {
    signal.throwIfAborted()
    return { mode: 'text', reason: timeout.aborted ? 'timeout' : 'unavailable' }
  }
}
