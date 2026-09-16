// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createSeed } from '#server/data'
import { aggregateTree } from '#src/model/aggregate'
import { createSnapshot } from '#src/model/live'
import { Dashboard } from '#src/ui/Dashboard'
import type { LiveHighlights } from '#src/ui/useLiveOrg'

vi.mock('#src/model/aggregate', { spy: true })

const highlights: LiveHighlights = { own: new Map(), aggregates: new Map() }
const snapshot = () => createSnapshot(createSeed(), 1)
const fixture = snapshot()
type ScrollIntoView = (arg?: boolean | ScrollIntoViewOptions) => void
let scrollIntoView: ReturnType<typeof vi.fn<ScrollIntoView>>

beforeEach(() => {
  // jsdom has no layout; the spy records which element the tree asks the browser to reveal.
  scrollIntoView = vi.fn<ScrollIntoView>()
  Element.prototype.scrollIntoView = scrollIntoView
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })))
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  delete (Element.prototype as Partial<Element>).scrollIntoView
})

const table = () => screen.getByRole('table', { name: 'Аналитика подразделений' })
const tableRow = (name: string) => within(table()).getAllByRole('row').find(row => within(row).queryByRole('rowheader')?.textContent === name)!
const treeRow = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name},`) })

describe('Дерево и таблица вместе', () => {
  it('после расширения окна из режима таблицы сохраняет фокус и стрелочную навигацию в таблице', async () => {
    render(<Dashboard snapshot={fixture} highlights={highlights} />)
    await userEvent.click(screen.getByRole('button', { name: 'Таблица' }))
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })))
    const row = within(tableRow('Серверные сервисы')).getByRole('button')
    row.focus()
    await userEvent.keyboard('{Enter}')
    expect(document.activeElement).toBe(row)
    await userEvent.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(within(tableRow('Инфраструктура')).getByRole('button'))
  })
  it('клик по строке таблицы выделяет узел в дереве, раскрывает его предков и прокручивает к нему', async () => {
    render(<Dashboard snapshot={fixture} highlights={highlights} />)
    await userEvent.click(screen.getByRole('button', { name: 'Свернуть всё' }))
    await userEvent.click(within(tableRow('Серверные сервисы')).getByText('624 000 руб.'))
    const target = treeRow('Серверные сервисы')
    expect(target.getAttribute('aria-current')).toBe('true')
    expect(treeRow('Цифровые продукты').getAttribute('aria-expanded')).toBe('true')
    expect(treeRow('Разработка платформы').getAttribute('aria-expanded')).toBe('true')
    expect(treeRow('Коммерческий блок').getAttribute('aria-expanded')).toBe('false')
    expect(within(tableRow('Серверные сервисы')).getByRole('button').getAttribute('aria-current')).toBe('true')
    await waitFor(() => expect(scrollIntoView.mock.contexts).toContain(target))
  })

  it('Enter на названии в таблице тоже выделяет узел', async () => {
    render(<Dashboard snapshot={fixture} highlights={highlights} />)
    within(tableRow('Инфраструктура')).getByRole('button').focus()
    await userEvent.keyboard('{Enter}')
    expect(treeRow('Инфраструктура').getAttribute('aria-current')).toBe('true')
  })

  it('фокус уходит на узел дерева, только когда панель таблицы скрывается', async () => {
    render(<Dashboard snapshot={fixture} highlights={highlights} />)
    const inSplitView = within(tableRow('Логистика')).getByRole('button')
    inSplitView.focus()
    await userEvent.keyboard('{Enter}')
    expect(document.activeElement).toBe(inSplitView)

    await userEvent.click(screen.getByRole('button', { name: 'Таблица' }))
    within(tableRow('Инфраструктура')).getByRole('button').focus()
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(document.activeElement).toBe(treeRow('Инфраструктура')))
  })

  it('выделение узла в дереве прокручивает таблицу к его строке', async () => {
    render(<Dashboard snapshot={fixture} highlights={highlights} />)
    await userEvent.click(treeRow('Логистика'))
    await waitFor(() => expect(scrollIntoView.mock.contexts).toContain(tableRow('Логистика')))
  })

  it('переключатель показывает таблицу, а выбор строки возвращает к дереву', async () => {
    render(<Dashboard snapshot={fixture} highlights={highlights} />)
    const treeView = screen.getByRole('button', { name: 'Дерево' })
    const tableView = screen.getByRole('button', { name: 'Таблица' })
    expect(treeView.getAttribute('aria-pressed')).toBe('true')
    await userEvent.click(tableView)
    expect(tableView.getAttribute('aria-pressed')).toBe('true')
    expect(treeView.getAttribute('aria-pressed')).toBe('false')
    await userEvent.click(within(tableRow('Маркетинг')).getByRole('button'))
    expect(treeView.getAttribute('aria-pressed')).toBe('true')
  })

  it('не пересчитывает агрегаты при фильтре, сортировке и выборе; новый снимок считается один раз', async () => {
    const { rerender } = render(<Dashboard snapshot={fixture} highlights={highlights} />)
    fireEvent.change(screen.getByRole('searchbox', { name: 'Фильтр по названию' }), { target: { value: 'продаж' } })
    await waitFor(() => expect(within(table()).getAllByRole('row')).toHaveLength(3))
    const budget = within(screen.getByRole('columnheader', { name: 'Бюджет' })).getByRole('button')
    await userEvent.click(budget)
    await userEvent.click(budget)
    await userEvent.click(within(tableRow('Региональные продажи')).getByRole('button'))
    await userEvent.click(screen.getByRole('button', { name: 'Свернуть всё' }))
    await userEvent.click(screen.getByRole('button', { name: 'Таблица' }))
    rerender(<Dashboard snapshot={fixture} highlights={highlights} />)
    // Панель ничего не агрегирует: суммы приходят готовыми в снимке.
    expect(aggregateTree).toHaveBeenCalledTimes(0)
    rerender(<Dashboard snapshot={snapshot()} highlights={highlights} />)
    expect(aggregateTree).toHaveBeenCalledTimes(1)
  })
})
