import type { QueryClient } from '@tanstack/react-query'
import type { LiveMessage, OrgPatch } from '#shared/live'
import { orgQueryOptions, type CachedOrg } from '#src/api/query'
import { applyPatch, type TouchedCells } from '#src/model/live'

/** Один HTTP-запрос восстановления, ограниченный буфер и повтор после ошибки/пропуска. */
export function createLiveSync(client: QueryClient, onApplied: (touched: TouchedCells) => void) {
  let stopped = false
  let fetching = false
  let retry: ReturnType<typeof setTimeout> | undefined
  let attempt = 0
  let pending: OrgPatch[] = []
  let target: LiveMessage | undefined
  const read = () => client.getQueryData(orgQueryOptions.queryKey)

  function apply(message: LiveMessage): boolean {
    const current = read()
    if (!current || current.session !== message.session) return false
    if (message.version <= current.version) return true
    if (message.type !== 'patch') return false
    const result = applyPatch(current.snapshot, message)
    if (result.status !== 'applied') return result.status === 'ignored'
    const next: CachedOrg = {
      session: current.session, version: result.snapshot.version, snapshot: result.snapshot,
      nodes: result.snapshot.nodes === current.snapshot.nodes ? current.nodes : [...result.snapshot.nodes.values()],
    }
    client.setQueryData(orgQueryOptions.queryKey, next)
    onApplied(result.touched)
    return true
  }

  async function recover() {
    if (stopped || fetching || retry) return
    fetching = true
    try {
      // Не отменяем ни текущий recovery, ни уже запущенный фоновый GET.
      await client.refetchQueries({ queryKey: orgQueryOptions.queryKey }, { cancelRefetch: false, throwOnError: true })
      if (stopped) return
      const buffered = pending
      pending = []
      for (const patch of buffered) {
        if (!apply(patch)) pending.push(patch)
      }
      const current = read()
      if (target && current?.session === target.session && current.version >= target.version) {
        target = undefined
        pending = []
        attempt = 0
      }
    } catch {
      // Query сохраняет последний снимок и ошибку для уведомления и ручного повтора.
    } finally {
      fetching = false
      if (!stopped && target) {
        const delay = Math.min(1000 * 2 ** Math.min(attempt++, 4), 10_000)
        retry = setTimeout(() => { retry = undefined; void recover() }, delay)
      }
    }
  }

  return {
    onMessage(message: LiveMessage) {
      if (stopped) return
      if (apply(message)) return
      if (target?.session !== message.session) pending = []
      if (!target || target.session !== message.session || message.version >= target.version) target = message
      if (message.type === 'patch') {
        // Поток упорядочен; дубликат не занимает дополнительное место.
        if (!pending.some(patch => patch.version === message.version)) pending.push(message)
        if (pending.length > 256) pending.shift()
      }
      void recover()
    },
    dispose() {
      stopped = true
      if (retry) clearTimeout(retry)
      pending = []
    },
  }
}
