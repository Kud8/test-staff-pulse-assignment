// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createSeed } from '#server/data'
import { aggregateTree } from '#src/model/aggregate'
import { buildTree } from '#src/model/tree'
import { AnalyticsTable } from '#src/ui/AnalyticsTable'

const rows = aggregateTree(buildTree(createSeed())).rows

afterEach(() => { cleanup(); vi.useRealTimers() })

const renderTable = () => render(<AnalyticsTable rows={rows} selectedId={null} onSelect={() => {}} />)
const bodyRows = () => within(screen.getByRole('table', { name: 'Аналитика подразделений' })).getAllByRole('row').slice(1)
const names = () => bodyRows().map(row => within(row).getByRole('rowheader').textContent)
const valuesOf = (name: string) => {
  const row = bodyRows().find(item => within(item).getByRole('rowheader').textContent === name)!
  return within(row).getAllByRole('cell').map(cell => cell.textContent)
}
const typeFilter = (value: string) => fireEvent.change(screen.getByRole('searchbox', { name: 'Фильтр по названию' }), { target: { value } })

describe('Аналитическая таблица', () => {
  it('показывает все подразделения со столбцами агрегатов в порядке дерева', () => {
    renderTable()
    expect(screen.getAllByRole('columnheader').map(cell => cell.textContent))
      .toEqual(['Подразделение', 'Уровень', 'Всего сотрудников', 'Бюджет суммарный', 'Средняя эффективность'])
    expect(names()).toHaveLength(40)
    expect(names().slice(0, 3)).toEqual(['Цифровые продукты', 'Разработка платформы', 'Серверные сервисы'])
    expect(valuesOf('Цифровые продукты')).toEqual(['Дивизион', '170', '9 665 000 руб.', '80,5%'])
    expect(valuesOf('Клиентские приложения')).toEqual(['Отдел', '44', '3 105 000 руб.', '89,9%'])
    expect(valuesOf('Комплаенс')).toEqual(['Команда', '0', '1 493 000 руб.', '—'])
  })

  it.each([
    ['Подразделение', 'Анализ данных', 'Экспертная поддержка'],
    ['Уровень', 'Цифровые продукты', 'Серверные сервисы'],
    ['Всего сотрудников', 'Комплаенс', 'Цифровые продукты'],
    ['Бюджет суммарный', 'Подбор персонала', 'Операционная деятельность'],
    ['Средняя эффективность', 'Региональные продажи', 'Договорная работа'],
  ])('«%s»: клик — по возрастанию, двойной клик — по убыванию', async (column, firstAscending, firstDescending) => {
    renderTable()
    const cell = screen.getByRole('columnheader', { name: column })
    const button = within(cell).getByRole('button')
    await userEvent.click(button)
    expect(cell.getAttribute('aria-sort')).toBe('ascending')
    expect(names()[0]).toBe(firstAscending)
    await userEvent.dblClick(button)
    expect(cell.getAttribute('aria-sort')).toBe('descending')
    expect(names()[0]).toBe(firstDescending)
    await userEvent.click(button)
    expect(cell.getAttribute('aria-sort')).toBe('ascending')
    expect(names()[0]).toBe(firstAscending)
  })

  it('Enter на заголовке переключает направление, потому что двойной клик с клавиатуры недоступен', async () => {
    renderTable()
    const cell = screen.getByRole('columnheader', { name: 'Уровень' })
    within(cell).getByRole('button').focus()
    await userEvent.keyboard('{Enter}')
    expect(cell.getAttribute('aria-sort')).toBe('ascending')
    await userEvent.keyboard('{Enter}')
    expect(cell.getAttribute('aria-sort')).toBe('descending')
    expect(names()[0]).toBe('Серверные сервисы')
  })

  it('фильтрует по названию через 250 мс после последнего ввода', () => {
    vi.useFakeTimers()
    renderTable()
    typeFilter('прод')
    act(() => { vi.advanceTimersByTime(200) })
    typeFilter('продаж')
    expect(screen.getByRole<HTMLInputElement>('searchbox', { name: 'Фильтр по названию' }).value).toBe('продаж')
    act(() => { vi.advanceTimersByTime(249) })
    expect(names()).toHaveLength(40)
    expect(screen.getByText('Показано: 40 из 40')).toBeTruthy()
    act(() => { vi.advanceTimersByTime(1) })
    expect(names()).toEqual(['Корпоративные продажи', 'Региональные продажи'])
    expect(screen.getByText('Показано: 2 из 40')).toBeTruthy()
  })

  it('сообщает, что по запросу ничего не найдено', () => {
    vi.useFakeTimers()
    renderTable()
    typeFilter('  Бухгалтерия ')
    act(() => { vi.advanceTimersByTime(250) })
    expect(screen.getByText('Ничего не найдено по запросу «Бухгалтерия»')).toBeTruthy()
    expect(screen.getByText('Показано: 0 из 40')).toBeTruthy()
  })
})
