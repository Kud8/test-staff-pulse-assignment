import { expect, it } from 'vitest'
import { applySearchFilter, describeFilter } from '#src/model/search'
import { createSnapshot } from '#src/model/live'
import { createSeed } from '#server/data'
import type { SearchFilter } from '#shared/search'

const empty: SearchFilter = { name: null, level: null, headcount: null, budget: null, performance: null }
const rows = createSnapshot(createSeed(), 1).aggregates.rows
it('фильтрует по агрегатам, не меняя их и состав поддерева', () => {
  const result = applySearchFilter(rows, { ...empty, name: 'платформ', level: 2, headcount: { min: { value: 50, inclusive: true }, max: null } })
  expect(result).toHaveLength(1)
  expect(result[0]?.headcount).toBe(51)
  expect(result[0]).toBe(rows.find(row => row.name === 'Разработка платформы'))
})
it('учитывает строгие и включённые границы и null эффективности', () => {
  const sample = [{ ...rows[0]!, performance: null }, { ...rows[0]!, performance: 80 }, { ...rows[0]!, performance: 81 }]
  const above: SearchFilter = { ...empty, performance: { min: { value: 80, inclusive: false }, max: { value: 81, inclusive: true } } }
  expect(applySearchFilter(sample, above).map(row => row.performance)).toEqual([81])
  expect(applySearchFilter(sample, empty)).toHaveLength(3)
})
it('показывает интерпретацию из проверенных условий, без текста модели', () => {
  expect(describeFilter({ ...empty, level: 2, budget: { min: null, max: { value: 5000000, inclusive: true } } }))
    .toContain('Суммарный бюджет, руб. ≤ 5')
  expect(describeFilter(empty)).toBe('Все подразделения')
})
