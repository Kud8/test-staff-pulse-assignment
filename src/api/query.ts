import { QueryClient, queryOptions } from '@tanstack/react-query'
import { fetchOrgTree } from '#src/api/org'
import type { OrgSnapshot } from '#src/api/org'
import { createSnapshot, type LiveSnapshot } from '#src/model/live'

/** Данные и их индексы меняются атомарно; UI не хранит отдельную копию server state. */
export type CachedOrg = OrgSnapshot & { snapshot: LiveSnapshot }
const queryKey = ['org-tree'] as const

export const queryClient = new QueryClient()
export const orgQueryOptions = queryOptions({
  queryKey,
  queryFn: async ({ signal, client }): Promise<CachedOrg> => {
    const startedSession = client.getQueryData<CachedOrg>(queryKey)?.session
    const incoming = await fetchOrgTree(signal)
    const current = client.getQueryData<CachedOrg>(queryKey)
    // Пока HTTP шёл, сокет мог применить более новую версию или сменить сессию.
    if (current && ((current.session === incoming.session && current.version >= incoming.version)
      || (current.session !== startedSession && incoming.session !== current.session))) return current
    return { ...incoming, snapshot: createSnapshot(incoming.nodes, incoming.version) }
  },
  // Map-индексы уже сохраняют ссылки при инкрементальном обновлении.
  structuralSharing: (old, incoming) => {
    const previous = old as CachedOrg | undefined
    const next = incoming as CachedOrg
    return previous?.session === next.session && previous.version >= next.version ? previous : next
  },
  staleTime: 5000,
  retry: false,
})
