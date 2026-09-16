import { describe, expect, it } from 'vitest'
import type { OrgNode } from '#shared/org'
import { liveMessageSchema } from '#shared/live'
import { aggregateTree } from '#src/model/aggregate'
import { applyPatch, createSnapshot } from '#src/model/live'
import { buildTree } from '#src/model/tree'

const node = (id: string, parentId: string | null, headcount: number, budget: number, performance: number): OrgNode =>
  ({ id, name: `Узел ${id}`, parentId, headcount, budget, performance, updatedAt: '2026-09-01T09:00:00.000Z' })

// a(10) ├ b(0) ├ c(30) └ d(0)   └ e(20);  f(0) — второй корень без сотрудников.
const fixture = [
  node('c', 'b', 30, 300, 80),
  node('d', 'b', 0, 50, 10),
  node('a', null, 10, 1000, 50),
  node('b', 'a', 0, 200, 90),
  node('e', 'a', 20, 500, 20),
  node('f', null, 0, 0, 70),
]
const patched = '2026-09-02T10:00:00.000Z'
const snapshot = () => createSnapshot(fixture, 7)
const patch = (over: Record<string, unknown> = {}) =>
  ({ type: 'patch' as const, session: 'session-1', version: 8, id: 'c', changes: { headcount: 40 }, updatedAt: patched, ...over })

describe('Схема сообщений', () => {
  it('принимает hello и патч', () => {
    expect(liveMessageSchema.parse({ type: 'hello', session: 'session-1', version: 7 })).toMatchObject({ type: 'hello', version: 7 })
    expect(liveMessageSchema.parse({ type: 'ping', session: 'session-1', version: 9 })).toMatchObject({ type: 'ping', version: 9 })
    expect(liveMessageSchema.parse(patch())).toMatchObject({ id: 'c', changes: { headcount: 40 } })
  })
  it.each([
    { message: { type: 'unknown', session: 's', version: 1 }, why: 'неизвестный тип' },
    { message: { type: 'ping', session: 'session-1', version: 0 }, why: 'heartbeat без версии' },
    { message: patch({ changes: {} }), why: 'патч без изменений' },
    { message: patch({ changes: { headcount: -1 } }), why: 'отрицательная численность' },
    { message: patch({ changes: { performance: 101 } }), why: 'эффективность вне диапазона' },
    { message: patch({ version: 0 }), why: 'версия должна быть положительной' },
    { message: patch({ id: ' c ' }), why: 'пробелы по краям id' },
    { message: patch({ updatedAt: 'вчера' }), why: 'некорректная дата' },
  ])('отклоняет: $why', ({ message }) => {
    expect(liveMessageSchema.safeParse(message).success).toBe(false)
  })
})

describe('applyPatch', () => {
  it('обновляет собственные значения узла и версию снимка', () => {
    const result = applyPatch(snapshot(), patch())
    expect(result.status).toBe('applied')
    if (result.status !== 'applied') return
    expect(result.snapshot.version).toBe(8)
    expect(result.snapshot.nodes.get('c')).toMatchObject({ headcount: 40, budget: 300, performance: 80, updatedAt: patched })
  })

  it('пересчитывает суммы узла и его предков', () => {
    const result = applyPatch(snapshot(), patch())
    if (result.status !== 'applied') throw new Error(result.status)
    const { byId } = result.snapshot.aggregates
    // c: 40 сотрудников, взвешенная сумма 80 × 40 = 3200.
    expect(byId.get('c')).toMatchObject({ headcount: 40, budget: 300, weightedPerformance: 3200, performance: 80 })
    // b: собственные 0 + c(40) + d(0); эффективность по-прежнему 80.
    expect(byId.get('b')).toMatchObject({ headcount: 40, budget: 550, weightedPerformance: 3200, performance: 80 })
    // a: 10 + 40 + 20 = 70; взвешенная 500 + 3200 + 0 + 400 = 4100.
    expect(byId.get('a')).toMatchObject({ headcount: 70, budget: 2050, weightedPerformance: 4100 })
    expect(byId.get('a')?.performance).toBeCloseTo(4100 / 70, 10)
  })

  it('даёт тот же результат, что полный пересчёт снимка', () => {
    const result = applyPatch(snapshot(), patch())
    if (result.status !== 'applied') throw new Error(result.status)
    const full = aggregateTree(buildTree(fixture.map(item => item.id === 'c' ? { ...item, headcount: 40, updatedAt: patched } : item)))
    expect(result.snapshot.aggregates.rows).toEqual(full.rows)
  })

  it('сохраняет ссылки на строки вне цепочки предков', () => {
    const before = snapshot()
    const result = applyPatch(before, patch())
    if (result.status !== 'applied') throw new Error(result.status)
    for (const id of ['d', 'e', 'f']) {
      expect(result.snapshot.aggregates.byId.get(id)).toBe(before.aggregates.byId.get(id))
      expect(result.snapshot.nodes.get(id)).toBe(before.nodes.get(id))
    }
    for (const id of ['a', 'b', 'c']) {
      expect(result.snapshot.aggregates.byId.get(id)).not.toBe(before.aggregates.byId.get(id))
    }
  })

  it('разделяет собственные изменения узла и изменения агрегатов предков', () => {
    const result = applyPatch(snapshot(), patch())
    if (result.status !== 'applied') throw new Error(result.status)
    // Дерево показывает собственные значения: у предков они не менялись, подсвечивать там нечего.
    expect([...result.touched.own.keys()]).toEqual(['c'])
    expect([...result.touched.own.get('c')!]).toEqual(['headcount'])
    expect([...result.touched.aggregates.keys()].sort()).toEqual(['a', 'b', 'c'])
    expect([...result.touched.aggregates.get('c')!]).toEqual(['headcount'])
    expect([...result.touched.aggregates.get('b')!]).toEqual(['headcount'])
    expect([...result.touched.aggregates.get('a')!].sort()).toEqual(['headcount', 'performance'])
  })

  it('не трогает предков, если суммы не изменились', () => {
    const before = snapshot()
    // d без сотрудников: его эффективность не входит во взвешенную сумму.
    const result = applyPatch(before, patch({ id: 'd', changes: { performance: 90 } }))
    if (result.status !== 'applied') throw new Error(result.status)
    expect([...result.touched.own.keys()]).toEqual(['d'])
    expect([...result.touched.own.get('d')!]).toEqual(['performance'])
    // Агрегатная эффективность остаётся null: в таблице было «—» и осталось «—», отмечать нечего.
    expect(result.touched.aggregates.size).toBe(0)
    expect(result.snapshot.nodes.get('d')).toMatchObject({ performance: 90 })
    for (const id of ['a', 'b']) {
      expect(result.snapshot.aggregates.byId.get(id)).toBe(before.aggregates.byId.get(id))
    }
  })

  it.each([
    { version: 7, why: 'версия уже применена' },
    { version: 6, why: 'версия устарела' },
  ])('игнорирует патч: $why', ({ version }) => {
    expect(applyPatch(snapshot(), patch({ version }))).toEqual({ status: 'ignored' })
  })

  it('принимает версию патча, даже если значения не изменились', () => {
    // Иначе следующий патч выглядел бы пропуском версии и вызвал бы лишний GET.
    const before = snapshot()
    const result = applyPatch(before, patch({ changes: { headcount: 30 } }))
    if (result.status !== 'applied') throw new Error(result.status)
    expect(result.snapshot.version).toBe(8)
    expect(result.touched.own.size).toBe(0)
    expect(result.touched.aggregates.size).toBe(0)
    expect(result.snapshot.aggregates).toBe(before.aggregates)
    expect(result.snapshot.nodes).toBe(before.nodes)
  })

  it('требует ресинхронизации для неизвестного узла: структуры разошлись', () => {
    expect(applyPatch(snapshot(), patch({ id: 'нет-такого' }))).toEqual({ status: 'resync' })
  })

  it('требует ресинхронизации при пропуске версии', () => {
    expect(applyPatch(snapshot(), patch({ version: 10 }))).toEqual({ status: 'resync' })
  })
})
