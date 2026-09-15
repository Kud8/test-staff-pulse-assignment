import { describe, expect, it } from 'vitest'
import type { OrgNode } from '#shared/org'
import { createSeed } from '#server/data'
import { buildTree } from '#src/model/tree'
import { aggregateTree } from '#src/model/aggregate'

const node = (id: string, parentId: string | null, headcount: number, budget: number, performance: number): OrgNode =>
  ({ id, name: `Узел ${id}`, parentId, headcount, budget, performance, updatedAt: '2026-09-01T09:00:00.000Z' })

// Children precede parents in the array: the result must not depend on input order.
const fixture = [
  node('c', 'b', 30, 300, 80),
  node('d', 'b', 0, 50, 10),
  node('a', null, 10, 1000, 50),
  node('b', 'a', 0, 200, 90),
  node('e', 'a', 20, 500, 20),
  node('f', null, 0, 0, 70),
]

describe('aggregateTree', () => {
  const { byId, rows } = aggregateTree(buildTree(fixture))

  it('суммирует численность и бюджет узла вместе со всеми потомками', () => {
    expect(byId.get('a')).toMatchObject({ headcount: 60, budget: 2050 })
    expect(byId.get('b')).toMatchObject({ headcount: 30, budget: 550 })
    expect(byId.get('c')).toMatchObject({ headcount: 30, budget: 300 })
    expect(byId.get('e')).toMatchObject({ headcount: 20, budget: 500 })
  })

  it('считает среднюю эффективность, взвешенную по численности, а не среднее средних', () => {
    // a: (50×10 + 80×30 + 10×0 + 90×0 + 20×20) / 60 = 55; простое среднее дало бы другое число.
    expect(byId.get('a')?.performance).toBe(55)
    // b: собственные 90% при нулевой численности не влияют на результат.
    expect(byId.get('b')?.performance).toBe(80)
  })

  it('возвращает null, если в поддереве нет сотрудников', () => {
    expect(byId.get('d')?.performance).toBeNull()
    expect(byId.get('f')?.performance).toBeNull()
  })

  it('отдаёт строки в порядке дерева с уровнем вложенности', () => {
    expect(rows.map(row => [row.id, row.level])).toEqual([['a', 1], ['b', 2], ['c', 3], ['d', 3], ['e', 2], ['f', 1]])
    expect(rows.every(row => byId.get(row.id) === row)).toBe(true)
  })

  it('на наборе API совпадает с ручным расчётом', () => {
    const seed = aggregateTree(buildTree(createSeed()))
    const byName = (name: string) => seed.rows.find(row => row.name === name)
    expect(byName('Клиентские приложения')).toMatchObject({ level: 2, headcount: 44, budget: 3_105_000 })
    expect(byName('Клиентские приложения')?.performance).toBeCloseTo(3954 / 44, 10)
    expect(byName('Цифровые продукты')).toMatchObject({ level: 1, headcount: 170, budget: 9_665_000 })
    expect(byName('Цифровые продукты')?.performance).toBeCloseTo(13683 / 170, 10)
    expect(byName('Комплаенс')).toMatchObject({ level: 3, headcount: 0, performance: null })
    expect(seed.rows).toHaveLength(40)
  })
})
