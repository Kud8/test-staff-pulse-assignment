import { describe, expect, it } from 'vitest'
import type { NodeAggregate } from '#src/model/aggregate'
import { filterRows, sortRows, type Sort } from '#src/model/table'

const row = (id: string, name: string, level: number, headcount: number, budget: number, performance: number | null): NodeAggregate =>
  ({ id, name, level, headcount, budget, weightedPerformance: (performance ?? 0) * headcount, performance })

const rows = [
  row('1', 'Бухгалтерский учёт', 3, 12, 900, 70),
  row('2', 'Архив', 2, 0, 100, null),
  row('3', 'ёлочный отдел', 1, 40, 5000, 91.5),
  row('4', 'Выездная служба', 2, 12, 2500, 64),
  row('5', 'Южный филиал', 1, 5, 100, 88),
]
const ids = (list: NodeAggregate[]) => list.map(item => item.id)

describe('filterRows', () => {
  it.each([
    { query: '', expected: ['1', '2', '3', '4', '5'] },
    { query: '   ', expected: ['1', '2', '3', '4', '5'] },
    { query: 'ФИЛИАЛ', expected: ['5'] },
    { query: '  архив ', expected: ['2'] },
    { query: 'учет', expected: ['1'] },
    { query: 'елоч', expected: ['3'] },
    { query: 'ЁЛОЧ', expected: ['3'] },
    { query: 'склад', expected: [] },
  ])('«$query» → $expected', ({ query, expected }) => {
    expect(ids(filterRows(rows, query))).toEqual(expected)
  })
})

describe('sortRows', () => {
  it.each<{ sort: Sort; expected: string[] }>([
    { sort: null, expected: ['1', '2', '3', '4', '5'] },
    { sort: { key: 'name', direction: 'asc' }, expected: ['2', '1', '4', '3', '5'] },
    { sort: { key: 'name', direction: 'desc' }, expected: ['5', '3', '4', '1', '2'] },
    { sort: { key: 'level', direction: 'asc' }, expected: ['3', '5', '2', '4', '1'] },
    { sort: { key: 'level', direction: 'desc' }, expected: ['1', '2', '4', '3', '5'] },
    { sort: { key: 'headcount', direction: 'asc' }, expected: ['2', '5', '1', '4', '3'] },
    { sort: { key: 'headcount', direction: 'desc' }, expected: ['3', '1', '4', '5', '2'] },
    { sort: { key: 'budget', direction: 'asc' }, expected: ['2', '5', '1', '4', '3'] },
    { sort: { key: 'budget', direction: 'desc' }, expected: ['3', '4', '1', '2', '5'] },
    { sort: { key: 'performance', direction: 'asc' }, expected: ['4', '1', '5', '3', '2'] },
    { sort: { key: 'performance', direction: 'desc' }, expected: ['3', '5', '1', '4', '2'] },
  ])('$sort.key $sort.direction: равные значения сохраняют порядок, пустая эффективность в конце', ({ sort, expected }) => {
    expect(ids(sortRows(rows, sort))).toEqual(expected)
  })

  it('не изменяет исходный массив', () => {
    sortRows(rows, { key: 'budget', direction: 'desc' })
    expect(ids(rows)).toEqual(['1', '2', '3', '4', '5'])
  })
})
