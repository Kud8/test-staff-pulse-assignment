// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SearchBar } from '#src/ui/SearchBar'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })
async function setup() {
  const onChange = vi.fn()
  const view = render(<SearchBar onChange={onChange} count={40} total={40} />)
  await userEvent.click(screen.getByRole('button', { name: 'AI-поиск' }))
  onChange.mockClear()
  await userEvent.type(screen.getByRole('searchbox'), 'Отделы')
  return { onChange, ...view }
}
it('отправляет только форму, блокирует повторы и показывает интерпретацию/сброс', async () => {
  let resolve!: (value: Response) => void
  const fetch = vi.fn(() => new Promise<Response>(done => { resolve = done }))
  vi.stubGlobal('fetch', fetch)
  const { onChange } = await setup()
  expect(fetch).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: 'Найти с AI' }))
  const form = screen.getByRole('searchbox').closest('form')!
  fireEvent.submit(form)
  expect(fetch).toHaveBeenCalledTimes(1)
  const filter = { name: null, level: 2, headcount: null, budget: null, performance: null }
  await act(async () => { resolve(new Response(JSON.stringify({ mode: 'ai', filter }))) })
  expect(onChange).toHaveBeenLastCalledWith('', filter)
  expect(screen.getByRole('status').textContent).toContain('Уровень: 2')
  await userEvent.click(screen.getByRole('button', { name: 'Сбросить' }))
  expect(onChange).toHaveBeenLastCalledWith('', null)
})
it.each([
  { mode: 'text', reason: 'unconfigured' },
  { mode: 'text', reason: 'timeout' },
  { mode: 'ai', filter: { evil: true } },
])('при $mode/$reason использует текстовый fallback', async response => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(response))))
  const { onChange } = await setup()
  await userEvent.click(screen.getByRole('button', { name: 'Найти с AI' }))
  await waitFor(() => expect(onChange).toHaveBeenLastCalledWith('Отделы', null))
  expect(screen.getByRole('status').textContent).toContain('обычный поиск по названию')
})
it('сброс отменяет fetch и не позволяет старому ответу применить фильтр', async () => {
  let resolve!: (value: Response) => void
  let signal!: AbortSignal
  vi.stubGlobal('fetch', vi.fn((_url, options: RequestInit) => {
    signal = options.signal!
    return new Promise<Response>(done => { resolve = done })
  }))
  const { onChange } = await setup()
  await userEvent.click(screen.getByRole('button', { name: 'Найти с AI' }))
  await userEvent.click(screen.getByRole('button', { name: 'Сбросить' }))
  expect(signal.aborted).toBe(true)
  onChange.mockClear()
  await act(async () => { resolve(new Response(JSON.stringify({ mode: 'text', reason: 'unavailable' }))) })
  expect(onChange).not.toHaveBeenCalled()
})
