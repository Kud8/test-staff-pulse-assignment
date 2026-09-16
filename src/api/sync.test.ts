import { afterEach, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { createSeed } from '#server/data'
import type { OrgPatch } from '#shared/live'
import { orgQueryOptions } from '#src/api/query'
import { createLiveSync } from '#src/api/sync'
import { aggregateTree } from '#src/model/aggregate'

vi.mock('#src/model/aggregate', { spy: true })
const clients: QueryClient[] = []
const disposers: (() => void)[] = []
const response = (version = 1, headcount = 3, session = 's') => new Response(
  JSON.stringify(createSeed().map(node => node.id === 'division-1' ? { ...node, headcount } : node)),
  { headers: { 'X-Org-Session': session, 'X-Org-Version': String(version) } },
)
const patch = (version: number, headcount: number, session = 's'): OrgPatch => ({
  type: 'patch', session, version, id: 'division-1', changes: { headcount }, updatedAt: '2026-09-02T00:00:00Z',
})
function deferred() {
  let resolve!: (value: Response) => void
  const promise = new Promise<Response>(done => { resolve = done })
  return { resolve, promise }
}
async function setup() {
  const fetch = vi.fn().mockImplementation(async () => response())
  vi.stubGlobal('fetch', fetch)
  const client = new QueryClient()
  clients.push(client)
  await client.fetchQuery(orgQueryOptions)
  const applied = vi.fn()
  const sync = createLiveSync(client, applied)
  disposers.push(sync.dispose)
  return { client, fetch, applied, sync, data: () => client.getQueryData(orgQueryOptions.queryKey)! }
}
afterEach(() => {
  disposers.splice(0).forEach(dispose => dispose())
  clients.splice(0).forEach(client => client.clear())
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  vi.useRealTimers()
})

it('обновляет кэш и агрегаты атомарно, без полной агрегации при патчах и дубликатах', async () => {
  const { sync, data, fetch, client } = await setup()
  const initial = data()
  sync.onMessage(patch(2, 10))
  expect(data().version).toBe(2)
  expect(data().nodes[0]?.headcount).toBe(10)
  expect(data().snapshot.aggregates.byId.get('division-1')?.headcount)
    .toBe(initial.snapshot.aggregates.byId.get('division-1')!.headcount + 7)
  const updated = data()
  sync.onMessage(patch(2, 10))
  expect(data()).toBe(updated)
  expect(await client.fetchQuery(orgQueryOptions)).toBe(updated)
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(aggregateTree).toHaveBeenCalledTimes(1)
})

it('медленный HTTP версии 2 не откатывает применённую версию 3', async () => {
  const { sync, data, fetch, client } = await setup()
  sync.onMessage(patch(2, 10))
  const http = deferred()
  fetch.mockReturnValueOnce(http.promise)
  const request = client.refetchQueries({ queryKey: orgQueryOptions.queryKey })
  sync.onMessage(patch(3, 20))
  const latest = data()
  http.resolve(response(2, 10))
  await request
  expect(data()).toBe(latest)
  expect(data().version).toBe(3)
  expect(data().nodes[0]?.headcount).toBe(20)
  expect(aggregateTree).toHaveBeenCalledTimes(1)
})

it('не отменяет recovery следующими патчами и воспроизводит буфер поверх ответа', async () => {
  const { sync, data, fetch } = await setup()
  const http = deferred()
  fetch.mockReturnValueOnce(http.promise)
  sync.onMessage(patch(5, 50))
  const signal = (fetch.mock.calls[1]![1] as RequestInit).signal!
  sync.onMessage(patch(6, 60))
  sync.onMessage(patch(6, 60))
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(signal.aborted).toBe(false)
  http.resolve(response(4, 40))
  await vi.waitFor(() => expect(data().version).toBe(6))
  expect(data().nodes[0]?.headcount).toBe(60)
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(aggregateTree).toHaveBeenCalledTimes(2)
})

it('восстанавливает новую сессию и применяет её буфер с нумерацией заново', async () => {
  const { sync, data, fetch } = await setup()
  sync.onMessage(patch(2, 10))
  const http = deferred()
  fetch.mockReturnValueOnce(http.promise)
  sync.onMessage({ type: 'hello', session: 'new', version: 1 })
  sync.onMessage(patch(2, 80, 'new'))
  http.resolve(response(1, 70, 'new'))
  await vi.waitFor(() => expect(data().session).toBe('new'))
  expect(data().version).toBe(2)
  expect(data().nodes[0]?.headcount).toBe(80)
})

it('после ошибки повторяет recovery с задержкой и очищает таймер при dispose', async () => {
  const { sync, data, fetch } = await setup()
  vi.useFakeTimers()
  fetch.mockRejectedValueOnce(new TypeError('offline'))
  sync.onMessage(patch(5, 50))
  await vi.advanceTimersByTimeAsync(0)
  expect(data().version).toBe(1)
  expect(fetch).toHaveBeenCalledTimes(2)
  fetch.mockResolvedValueOnce(response(5, 50))
  await vi.advanceTimersByTimeAsync(1000)
  expect(data().version).toBe(5)
  expect(fetch).toHaveBeenCalledTimes(3)
  sync.onMessage(patch(9, 90))
  await vi.advanceTimersByTimeAsync(0)
  sync.dispose()
  const count = fetch.mock.calls.length
  await vi.advanceTimersByTimeAsync(30_000)
  sync.onMessage(patch(10, 100))
  expect(fetch).toHaveBeenCalledTimes(count)
})

it('старые heartbeat не запускают GET', async () => {
  const { sync, fetch } = await setup()
  sync.onMessage(patch(2, 10))
  sync.onMessage({ type: 'ping', session: 's', version: 1 })
  expect(fetch).toHaveBeenCalledTimes(1)
})

it('присоединяется к фоновому GET и догоняет поток, даже если ответ сделан до пропуска', async () => {
  const { sync, data, fetch, client } = await setup()
  const http = deferred()
  fetch.mockReturnValueOnce(http.promise)
  const background = client.refetchQueries({ queryKey: orgQueryOptions.queryKey })
  const signal = (fetch.mock.calls[1]![1] as RequestInit).signal!
  sync.onMessage(patch(3, 30))
  sync.onMessage(patch(4, 40))
  http.resolve(response(2, 20))
  await background
  await vi.waitFor(() => expect(data().version).toBe(4))
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(signal.aborted).toBe(false)
})

it('после dispose не воспроизводит буфер и не запускает повтор при завершении HTTP', async () => {
  const { sync, data, fetch, applied } = await setup()
  const http = deferred()
  fetch.mockReturnValueOnce(http.promise)
  sync.onMessage(patch(3, 30))
  sync.dispose()
  http.resolve(response(2, 20))
  await vi.waitFor(() => expect(data().version).toBe(2))
  expect(applied).not.toHaveBeenCalled()
  expect(fetch).toHaveBeenCalledTimes(2)
})
