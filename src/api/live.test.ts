import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LiveMessage } from '#shared/live'
import { connectLive, type LiveStatus, type LiveSocket } from '#src/api/live'

// Minimal stand-in for the browser socket: the transport only opens, reads, and closes it.
class FakeSocket implements LiveSocket {
  static instances: FakeSocket[] = []
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  closed = false
  url: string
  constructor(url: string) {
    this.url = url
    FakeSocket.instances.push(this)
  }
  close() { this.closed = true }
}

const hello: LiveMessage = { type: 'hello', session: 'session-1', version: 4 }
const patch: LiveMessage = { type: 'patch', session: 'session-1', version: 5, id: 'division-1', changes: { headcount: 12 }, updatedAt: '2026-09-02T10:00:00.000Z' }

let messages: LiveMessage[]
let statuses: LiveStatus[]
let stop: () => void

function connect() {
  messages = []
  statuses = []
  stop = connectLive({
    url: 'ws://localhost/api/live',
    onMessage: message => messages.push(message),
    onStatus: status => statuses.push(status),
    createSocket: url => new FakeSocket(url),
    random: () => 0.5,
  })
  return FakeSocket.instances
}

beforeEach(() => { vi.useFakeTimers(); FakeSocket.instances = [] })
afterEach(() => { stop?.(); vi.useRealTimers() })

describe('Живое соединение', () => {
  it('сообщает статусы и отдаёт разобранные сообщения', () => {
    const [socket] = connect()
    expect(statuses).toEqual(['connecting'])
    socket!.onopen?.()
    expect(statuses).toEqual(['connecting', 'online'])
    socket!.onmessage?.({ data: JSON.stringify(hello) })
    socket!.onmessage?.({ data: JSON.stringify(patch) })
    expect(messages).toEqual([hello, patch])
  })

  it('отбрасывает мусор и некорректные сообщения, не разрывая соединение', () => {
    const [socket] = connect()
    socket!.onopen?.()
    socket!.onmessage?.({ data: 'не json' })
    socket!.onmessage?.({ data: JSON.stringify({ type: 'patch', session: 's', version: 5, id: 'x', changes: {}, updatedAt: 'вчера' }) })
    expect(messages).toEqual([])
    expect(statuses).toEqual(['connecting', 'online'])
    expect(FakeSocket.instances).toHaveLength(1)
  })

  it('переподключается с экспоненциальной задержкой и потолком', () => {
    const instances = connect()
    // Джиттер зафиксирован: random() = 0.5 даёт множитель 1, поэтому задержки точные.
    // Подключение ни разу не удалось, поэтому задержка растёт; сброс после успеха — в отдельном тесте.
    for (const expected of [500, 1000, 2000, 4000, 8000, 10000, 10000]) {
      const socket = instances.at(-1)!
      socket.onclose?.()
      const before = instances.length
      vi.advanceTimersByTime(expected - 1)
      expect(instances).toHaveLength(before)
      vi.advanceTimersByTime(1)
      expect(instances).toHaveLength(before + 1)
    }
  })

  it('сбрасывает задержку после успешного подключения', () => {
    const instances = connect()
    instances[0]!.onclose?.()
    vi.advanceTimersByTime(500)
    instances[1]!.onclose?.()
    vi.advanceTimersByTime(1000)
    expect(instances).toHaveLength(3)
    instances[2]!.onopen?.()
    instances[2]!.onclose?.()
    vi.advanceTimersByTime(500)
    expect(instances).toHaveLength(4)
  })

  it('сообщает offline при обрыве и online после восстановления', () => {
    const instances = connect()
    instances[0]!.onopen?.()
    instances[0]!.onclose?.()
    expect(statuses).toEqual(['connecting', 'online', 'offline'])
    vi.advanceTimersByTime(500)
    expect(statuses).toEqual(['connecting', 'online', 'offline', 'connecting'])
    instances[1]!.onopen?.()
    expect(statuses.at(-1)).toBe('online')
  })

  it('закрывает молчащий сокет и переподключается', () => {
    const instances = connect()
    instances[0]!.onopen?.()
    vi.advanceTimersByTime(11999)
    expect(instances[0]!.closed).toBe(false)
    vi.advanceTimersByTime(1)
    // Поток мог умереть молча: тогда сокет остаётся открытым, а данные устаревают незаметно.
    expect(instances[0]!.closed).toBe(true)
    instances[0]!.onclose?.()
    expect(statuses.at(-1)).toBe('offline')
    vi.advanceTimersByTime(500)
    expect(instances).toHaveLength(2)
  })

  it('любое сообщение продлевает ожидание', () => {
    const instances = connect()
    instances[0]!.onopen?.()
    vi.advanceTimersByTime(10000)
    instances[0]!.onmessage?.({ data: JSON.stringify(hello) })
    vi.advanceTimersByTime(11999)
    expect(instances[0]!.closed).toBe(false)
    vi.advanceTimersByTime(1)
    expect(instances[0]!.closed).toBe(true)
  })

  it('останавливает таймер и закрывает сокет', () => {
    const instances = connect()
    instances[0]!.onclose?.()
    stop()
    vi.advanceTimersByTime(60_000)
    expect(instances).toHaveLength(1)
    expect(instances[0]!.closed).toBe(true)
  })
})
