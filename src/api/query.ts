import { QueryClient, queryOptions } from '@tanstack/react-query'
import { fetchOrgTree } from '#src/api/org'

export const queryClient = new QueryClient()
export const orgQueryOptions = queryOptions({
  queryKey: ['org-tree'],
  queryFn: ({ signal }) => fetchOrgTree(signal),
  staleTime: 5000,
  retry: false,
})
