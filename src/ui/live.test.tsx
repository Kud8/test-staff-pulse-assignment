// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createSeed } from '#server/data'
import App from '#src/App'

class FakeWebSocket {
  static instances: FakeWebSocket[] = []
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  closed = false
  url: string
  constructor(url: string) {
    this.url = url
    FakeWebSocket.instances.push(this)
  }
  close() { this.closed = true }
}

const seed = createSeed()
const snapshotResponse = (nodes: unknown = seed, version = 1) =>
  new Response(JSON.stringify(nodes), { headers: { 'X-Org-Session': 'session-1', 'X-Org-Version': String(version) } })
const patch = (over: Record<string, unknown> = {}) => JSON.stringify({
  type: 'patch', session: 'session-1', version: 2,
  id: 'division-1-department-1-team-1', changes: { headcount: 99 }, updatedAt: '2026-09-02T10:00:00.000Z', ...over,
})

const clients: QueryClient[] = []
let fetchMock: ReturnType<typeof vi.fn>

function renderApp() {
  const client = new QueryClient()
  clients.push(client)
  const view = render(<QueryClientProvider client={client}><App /></QueryClientProvider>)
  return view
}

const socket = () => FakeWebSocket.instances.at(-1)!
const send = (data: string) => act(() => { socket().onmessage?.({ data }) })
const teamRow = () => screen.getByRole('button', { name: /^Серверные сервисы,/ })
const tableRow = (name: string) => within(screen.getByRole('table', { name: 'Аналитика подразделений' }))
  .getAllByRole('row').find(row => within(row).queryByRole('rowheader')?.textContent === name)!
const cells = (name: string) => within(tableRow(name)).getAllByRole('cell').map(cell => cell.textContent)

beforeEach(() => {
  FakeWebSocket.instances = []
  Element.prototype.scrollIntoView = () => {}
  fetchMock = vi.fn(async () => snapshotResponse())
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('WebSocket', FakeWebSocket)
})
afterEach(() => {
  cleanup()
  for (const client of clients.splice(0)) client.clear()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  delete (Element.prototype as Partial<Element>).scrollIntoView
})

describe('Живые обновления', () => {
  it('показывает состояние соединения в шапке', async () => {
    renderApp()
    await teamRowVisible()
    const indicator = screen.getByRole('status')
    expect(indicator.textContent).toContain('Подключаемся')
    act(() => { socket().onopen?.() })
    expect(indicator.textContent).toContain('В сети')
    act(() => { socket().onclose?.() })
    expect(indicator.textContent).toContain('Нет связи')
  })

  it('применяет патч без повторного запроса и пересчитывает предков', async () => {
    renderApp()
    await teamRowVisible()
    act(() => { socket().onopen?.() })
    send(patch())
    expect(teamRow().getAttribute('aria-label')).toBe('Серверные сервисы, сотрудников: 99, эффективность: 76%')
    expect(cells('Серверные сервисы')).toEqual(['Команда', '99', '624 000 руб.', '76%'])
    // 51 − 17 + 99 = 133, взвешенная 650 + 7524 + 2088 = 10 262 → 77,2%.
    expect(cells('Разработка платформы')).toEqual(['Отдел', '133', '1 872 000 руб.', '77,2%'])
    expect(cells('Цифровые продукты')[1]).toBe('252')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('в дереве подсвечивается только изменившийся узел, в таблице — он и его предки', async () => {
    renderApp()
    await teamRowVisible()
    act(() => { socket().onopen?.() })
    send(patch())
    const treeMarks = [...document.querySelectorAll('li [data-updated]')]
      .map(cell => cell.closest('button')?.getAttribute('aria-label')?.split(',')[0])
    const tableMarks = [...document.querySelectorAll('table [data-updated]')]
      .map(cell => cell.closest('tr')?.querySelector('th button')?.textContent)
    // Собственная численность изменилась только у команды; суммы — у неё и у предков.
    expect(treeMarks).toEqual(['Серверные сервисы'])
    expect([...new Set(tableMarks)].sort()).toEqual(['Разработка платформы', 'Серверные сервисы', 'Цифровые продукты'])
  })

  it('подсвечивает изменённые ячейки и снимает подсветку через 1.5 секунды', async () => {
    renderApp()
    await teamRowVisible()
    act(() => { socket().onopen?.() })
    vi.useFakeTimers()
    send(patch())
    const updated = document.querySelectorAll('[data-updated]')
    expect(updated.length).toBeGreaterThan(0)
    expect(within(tableRow('Серверные сервисы')).getByText('99').closest('[data-updated]')).not.toBeNull()
    expect(within(tableRow('Разработка платформы')).getByText('133').closest('[data-updated]')).not.toBeNull()
    act(() => { vi.advanceTimersByTime(1500) })
    expect(document.querySelectorAll('[data-updated]')).toHaveLength(0)
  })

  it('перезапрашивает снимок при пропуске версии', async () => {
    renderApp()
    await teamRowVisible()
    act(() => { socket().onopen?.() })
    send(patch({ version: 5 }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  })

  it('перезапрашивает снимок, если сервер перезапустился с другой сессией', async () => {
    renderApp()
    await teamRowVisible()
    act(() => { socket().onopen?.() })
    send(JSON.stringify({ type: 'hello', session: 'session-2', version: 1 }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  })

  it('перезапрашивает снимок, если heartbeat сообщает более новую версию', async () => {
    renderApp()
    await teamRowVisible()
    act(() => { socket().onopen?.() })
    // Патчи потерялись: версия сервера ушла вперёд, наш снимок устарел.
    send(JSON.stringify({ type: 'ping', session: 'session-1', version: 7 }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  })

  it('не трогает снимок на heartbeat со своей версией', async () => {
    renderApp()
    await teamRowVisible()
    act(() => { socket().onopen?.() })
    send(JSON.stringify({ type: 'ping', session: 'session-1', version: 1 }))
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('не трогает снимок на повторном hello той же сессии', async () => {
    renderApp()
    await teamRowVisible()
    act(() => { socket().onopen?.() })
    send(JSON.stringify({ type: 'hello', session: 'session-1', version: 1 }))
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('закрывает соединение при размонтировании', async () => {
    const view = renderApp()
    await teamRowVisible()
    view.unmount()
    expect(socket().closed).toBe(true)
  })
})

async function teamRowVisible() {
  await screen.findByRole('button', { name: /^Серверные сервисы,/ })
  await waitFor(() => expect(FakeWebSocket.instances.length).toBeGreaterThan(0))
}
