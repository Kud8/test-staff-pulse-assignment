import { afterEach, describe, expect, it } from 'vitest'
import { liveMessageSchema, type LiveMessage } from '#shared/live'
import { orgNodeSchema, orgTreeSchema } from '#shared/org'
import { createSeed } from '#server/data'
import { createOrgServer } from '#server/app'
import { applyPatchToNodes, nextPatch } from '#server/live'

type Server = Awaited<ReturnType<typeof createOrgServer>>
const servers: Server[] = []
const sockets: WebSocket[] = []

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.close()
  for (const server of servers.splice(0)) await server.close()
})

async function start(patchIntervalMs: number, heartbeatMs = 0) {
  const server = await createOrgServer({ port: 0, patchIntervalMs, heartbeatMs })
  servers.push(server)
  return server
}

async function open(port: number) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/api/live`)
  sockets.push(socket)
  const queue: LiveMessage[] = []
  const waiting: ((message: LiveMessage) => void)[] = []
  socket.addEventListener('message', event => {
    const message = liveMessageSchema.parse(JSON.parse(String(event.data)))
    const next = waiting.shift()
    if (next) next(message); else queue.push(message)
  })
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }))
  return () => queue.length ? Promise.resolve(queue.shift()!) : new Promise<LiveMessage>(resolve => waiting.push(resolve))
}

describe('nextPatch', () => {
  const nodes = createSeed()
  const scripted = (values: number[]) => () => values.shift() ?? 0

  it.each([
    { random: [0, 0, 0], id: 'division-1', changes: { headcount: 1 }, why: 'первый узел, численность, шаг −2' },
    { random: [0.5, 0.5, 0.99], id: 'division-3', changes: { budget: 3_140_000 }, why: 'середина списка, бюджет, шаг +2' },
    { random: [0.999, 0.99, 0.6], id: 'division-4-department-3-team-2', changes: { performance: 61 }, why: 'последний узел, эффективность, шаг +1' },
  ])('строит патч по случайным числам: $why', ({ random, id, changes }) => {
    expect(nextPatch(nodes, 7, 'session-1', scripted([...random]))).toMatchObject({ type: 'patch', session: 'session-1', version: 8, id, changes })
  })

  it('всегда меняет значение и остаётся в границах схемы', () => {
    let snapshot = createSeed()
    let version = 1
    for (let step = 0; step < 300; step++) {
      const patch = nextPatch(snapshot, version, 'session-1', Math.random)
      expect(patch.version).toBe(version + 1)
      const before = snapshot.find(node => node.id === patch.id)!
      snapshot = applyPatchToNodes(snapshot, patch)
      const after = snapshot.find(node => node.id === patch.id)!
      expect(after).not.toEqual(before)
      expect(orgNodeSchema.safeParse(after).success).toBe(true)
      version = patch.version
    }
    expect(orgTreeSchema.safeParse(snapshot).success).toBe(true)
  })

  it('применение патча не трогает остальные узлы', () => {
    const before = createSeed()
    const patch = nextPatch(before, 1, 'session-1', () => 0)
    const after = applyPatchToNodes(before, patch)
    expect(after.filter((node, index) => node !== before[index]).map(node => node.id)).toEqual([patch.id])
    expect(after.find(node => node.id === patch.id)).toMatchObject({ ...patch.changes, updatedAt: patch.updatedAt })
  })
})

describe('Сервер живых обновлений', () => {
  it('отдаёт снимок с версией и сессией в заголовках', async () => {
    const { port } = await start(0)
    const response = await fetch(`http://127.0.0.1:${port}/api/org-tree`)
    expect(response.status).toBe(200)
    expect(response.headers.get('x-org-version')).toBe('1')
    expect(response.headers.get('x-org-session')).toMatch(/\S/)
    expect(orgTreeSchema.parse(await response.json())).toHaveLength(40)
  })

  it('здоровается сессией и версией текущего снимка', async () => {
    const { port } = await start(0)
    const response = await fetch(`http://127.0.0.1:${port}/api/org-tree`)
    const nextMessage = await open(port)
    expect(await nextMessage()).toEqual({
      type: 'hello',
      session: response.headers.get('x-org-session'),
      version: Number(response.headers.get('x-org-version')),
    })
  })

  it('шлёт патчи существующих узлов подряд по версиям', async () => {
    const { port } = await start(15)
    const ids = new Set(createSeed().map(node => node.id))
    const nextMessage = await open(port)
    const hello = await nextMessage()
    const first = await nextMessage()
    const second = await nextMessage()
    if (hello.type !== 'hello' || first.type !== 'patch' || second.type !== 'patch') throw new Error('Неожиданный тип сообщения')
    expect(first.version).toBe(hello.version + 1)
    expect(second.version).toBe(first.version + 1)
    expect(first.session).toBe(hello.session)
    expect(ids.has(first.id)).toBe(true)
  })

  it('снимок по GET совпадает с потоком патчей', async () => {
    const { port } = await start(200)
    const nextMessage = await open(port)
    await nextMessage()
    const patch = await nextMessage()
    if (patch.type !== 'patch') throw new Error('Ожидался патч')
    const response = await fetch(`http://127.0.0.1:${port}/api/org-tree`)
    const nodes = orgTreeSchema.parse(await response.json())
    expect(Number(response.headers.get('x-org-version'))).toBeGreaterThanOrEqual(patch.version)
    if (response.headers.get('x-org-version') === String(patch.version)) {
      expect(nodes.find(node => node.id === patch.id)).toMatchObject({ ...patch.changes, updatedAt: patch.updatedAt })
    }
  })

  it('шлёт heartbeat с текущей версией, даже когда патчей нет', async () => {
    const { port } = await start(0, 30)
    const nextMessage = await open(port)
    const hello = await nextMessage()
    const ping = await nextMessage()
    if (hello.type !== 'hello' || ping.type !== 'ping') throw new Error('Ожидались hello и ping')
    expect(ping.session).toBe(hello.session)
    expect(ping.version).toBe(hello.version)
  })

  it('на неизвестный путь отвечает 404 и не открывает сокет', async () => {
    const { port } = await start(0)
    expect((await fetch(`http://127.0.0.1:${port}/api/unknown`)).status).toBe(404)
    const socket = new WebSocket(`ws://127.0.0.1:${port}/api/unknown`)
    sockets.push(socket)
    const event = await new Promise<Event>(resolve => {
      socket.addEventListener('error', resolve, { once: true })
      socket.addEventListener('close', resolve, { once: true })
    })
    expect(['error', 'close']).toContain(event.type)
  })
})
