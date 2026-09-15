import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { createSeed } from '#server/data'
import { orgTreeSchema } from '#shared/org'
import { buildTree } from '#src/model/tree'
import { fetchOrgTree } from '#src/api/org'
import { orgQueryOptions } from '#src/api/query'

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('Контракт и дерево', () => {
  it('40 узлов, три уровня; первые два уровня раскрыты', () => {
    const nodes = orgTreeSchema.parse(createSeed())
    const tree = buildTree(nodes)
    expect(nodes).toHaveLength(40)
    expect(tree.roots).toHaveLength(4)
    const depths = nodes.map(node => {
      let depth = 1
      let current = node
      while (current.parentId !== null) {
        current = tree.byId.get(current.parentId)!
        depth++
      }
      return depth
    })
    expect(new Set(depths)).toEqual(new Set([1, 2, 3]))
    expect(Math.max(...depths)).toBe(3)
    expect(tree.defaultExpanded.size).toBe(16)
    expect(nodes.filter(n => n.parentId && !tree.defaultExpanded.has(n.id))).toHaveLength(24)
  })
  it('разрешает пустой массив', () => expect(orgTreeSchema.parse([])).toEqual([]))
  it.each([
    { headcount: -1 }, { headcount: 1.2 }, { budget: -1 }, { budget: Infinity },
    { performance: 101 }, { performance: -1 }, { updatedAt: 'yesterday' },
    { name: ' ' }, { parentId: 'missing' }, { id: '' },
  ])('отклоняет некорректные поля %j', patch => {
    const nodes = createSeed(); nodes[0] = { ...nodes[0]!, ...patch }
    const result = orgTreeSchema.safeParse(nodes)
    expect(result.success).toBe(false)
    if (!result.success) {
      const field = Object.keys(patch)[0]
      if (field === 'parentId') expect(result.error.issues[0]?.message).toContain('Не найден родитель')
      else expect(result.error.issues.some(issue => issue.path[1] === field)).toBe(true)
    }
  })
  it.each([{ id: ' division-1 ' }, { parentId: 'division-1\t' }, { name: ' Отдел ' }])('не нормализует строки %j', patch => {
    const nodes = createSeed()
    nodes[1] = { ...nodes[1]!, ...patch }
    expect(() => orgTreeSchema.parse(nodes)).toThrow('Пробелы по краям строки недопустимы')
    expect(nodes[1]).toMatchObject(patch)
  })
  it('отклоняет дубликаты, циклы и самоссылки', () => {
    const nodes = createSeed()
    expect(() => orgTreeSchema.parse([...nodes, nodes[0]])).toThrow('Идентификаторы подразделений повторяются')
    expect(() => orgTreeSchema.parse([{ ...nodes[0], parentId: nodes[0]!.id }])).toThrow('Обнаружен цикл')
    nodes[0]!.parentId = nodes[1]!.id
    expect(() => orgTreeSchema.parse(nodes)).toThrow('Обнаружен цикл')
  })
})

describe('API и кэш', () => {
  it('передаёт AbortSignal в fetch и проверяет тело', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify([{ bad: true }])))
    vi.stubGlobal('fetch', fetch)
    const signal = new AbortController().signal
    await expect(fetchOrgTree(signal)).rejects.toThrow('некорректную')
    expect(fetch).toHaveBeenCalledWith('/api/org-tree', { signal })
  })
  it('не переводит отмену fetch в сетевую ошибку', async () => {
    const controller = new AbortController()
    const error = new DOMException('Aborted', 'AbortError')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(error))
    controller.abort(error)
    await expect(fetchOrgTree(controller.signal)).rejects.toBe(error)
  })
  it('не переводит отмену чтения тела в ошибку JSON', async () => {
    const controller = new AbortController()
    const error = new DOMException('Aborted', 'AbortError')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => { controller.abort(error); throw error } }))
    await expect(fetchOrgTree(controller.signal)).rejects.toBe(error)
  })
  it('HTTP ошибка не становится успешными данными', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })))
    await expect(fetchOrgTree(new AbortController().signal)).rejects.toThrow('503')
  })
  it('повторно использует данные 5 секунд и сохраняет ссылки при равном ответе', async () => {
    vi.useFakeTimers()
    const fetch = vi.fn().mockImplementation(async () => new Response(JSON.stringify(createSeed())))
    vi.stubGlobal('fetch', fetch)
    const client = new QueryClient()
    const first = await client.fetchQuery(orgQueryOptions)
    await vi.advanceTimersByTimeAsync(4999)
    expect(await client.fetchQuery(orgQueryOptions)).toBe(first)
    expect(fetch).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(2)
    await client.fetchQuery(orgQueryOptions)
    expect(client.getQueryData(orgQueryOptions.queryKey)).toBe(first)
    expect(fetch).toHaveBeenCalledTimes(2)
    client.clear()
  })
  it('отменяет запрос после удаления последнего подписчика', async () => {
    let signal: AbortSignal | undefined
    vi.stubGlobal('fetch', vi.fn((_url, options: RequestInit) => {
      signal = options.signal ?? undefined
      return new Promise((_resolve, reject) => signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))))
    }))
    const client = new QueryClient()
    const unsubscribe = new QueryObserver(client, orgQueryOptions).subscribe(() => {})
    expect(signal?.aborted).toBe(false)
    unsubscribe()
    expect(signal?.aborted).toBe(true)
    client.clear()
  })
})
