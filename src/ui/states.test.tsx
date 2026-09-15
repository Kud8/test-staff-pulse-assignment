// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from '#src/App'
import { orgQueryOptions } from '#src/api/query'
import { createSeed } from '#server/data'

const clients: QueryClient[] = []
function renderApp() {
  const client = new QueryClient()
  clients.push(client)
  render(<QueryClientProvider client={client}><App /></QueryClientProvider>)
  return client
}
function jsonResponse(data: unknown) { return new Response(JSON.stringify(data)) }
const departmentName = 'Разработка платформы, сотрудников: 10, эффективность: 65%'

afterEach(() => {
  cleanup()
  for (const client of clients.splice(0)) client.clear()
  vi.unstubAllGlobals()
})

describe('Состояния интерфейса через настоящий API-клиент', () => {
  it('показывает загрузку до ответа', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    renderApp()
    expect(screen.getByRole('status').textContent).toContain('Загружаем структуру')
  })
  it('показывает пустой ответ', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse([])))
    renderApp()
    expect((await screen.findByRole('status')).textContent).toContain('Загружаем структуру')
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Подразделений пока нет'))
  })
  it.each([
    { name: 'HTTP', response: () => new Response('', { status: 502 }), message: 'Сервер вернул ошибку 502' },
    { name: 'HTML вместо JSON', response: () => new Response('<!doctype html>'), message: 'Сервер вернул ответ в неверном формате' },
    { name: '204', response: () => new Response(null, { status: 204 }), message: 'Сервер вернул ответ в неверном формате' },
    { name: 'невалидная структура', response: () => jsonResponse([{ bad: true }]), message: 'Сервер вернул некорректную структуру' },
    { name: 'сеть', response: () => { throw new TypeError('Failed to fetch') }, message: 'Не удалось связаться с сервером' },
  ])('$name → понятная ошибка → успешный повтор', async ({ response, message }) => {
    const fetch = vi.fn().mockImplementationOnce(response).mockImplementation(async () => jsonResponse(createSeed()))
    vi.stubGlobal('fetch', fetch)
    renderApp()
    expect((await screen.findByRole('alert')).textContent).toContain(message)
    await userEvent.click(screen.getByRole('button', { name: 'Повторить загрузку' }))
    await screen.findByRole('button', { name: departmentName })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(fetch).toHaveBeenCalledTimes(2)
  })
  it('сохраняет дерево, раскрытие и выделение при pending/error/success фонового refetch', async () => {
    const fetch = vi.fn().mockImplementation(async () => jsonResponse(createSeed()))
    vi.stubGlobal('fetch', fetch)
    const client = renderApp()
    const department = await screen.findByRole('button', { name: departmentName })
    await userEvent.click(department)
    expect(department.getAttribute('aria-expanded')).toBe('false')
    expect(department.getAttribute('aria-current')).toBe('true')
    const tree = screen.getByRole('list', { name: 'Подразделения 40' })
    let respond!: (response: Response) => void
    fetch.mockImplementationOnce(() => new Promise<Response>(resolve => { respond = resolve }))
    act(() => { void client.refetchQueries({ queryKey: orgQueryOptions.queryKey }) })
    await waitFor(() => expect(client.isFetching()).toBe(1))
    expect(screen.getByRole('list', { name: 'Подразделения 40' })).toBe(tree)
    await act(async () => { respond(new Response('', { status: 502 })) })
    const notice = await screen.findByRole('alert')
    expect(notice.textContent).toContain('Не удалось обновить данные')
    expect(client.getQueryData<unknown[]>(orgQueryOptions.queryKey)).toHaveLength(40)
    expect(screen.getByRole('list', { name: 'Подразделения 40' })).toBe(tree)
    expect(screen.getByRole('button', { name: departmentName })).toBe(department)
    expect(department.getAttribute('aria-expanded')).toBe('false')
    expect(department.getAttribute('aria-current')).toBe('true')
    await userEvent.click(within(notice).getByRole('button', { name: 'Повторить обновление' }))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(screen.getByRole('button', { name: departmentName })).toBe(department)
    expect(department.getAttribute('aria-expanded')).toBe('false')
    expect(department.getAttribute('aria-current')).toBe('true')
  })
  it('сохраняет пустой снимок при ошибке обновления', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(jsonResponse([])).mockResolvedValue(new Response('', { status: 502 }))
    vi.stubGlobal('fetch', fetch)
    const client = renderApp()
    await screen.findByText('Подразделений пока нет')
    await act(async () => { await client.refetchQueries({ queryKey: orgQueryOptions.queryKey }) })
    expect((await screen.findByRole('alert')).textContent).toContain('Не удалось обновить данные')
    expect(screen.getByText('Подразделений пока нет')).toBeTruthy()
  })
})
