import { z } from 'zod'

const nonBlankString = z.string().min(1).refine(value => value.trim() === value, {
  message: 'Пробелы по краям строки недопустимы',
})

export const orgNodeSchema = z.object({
  id: nonBlankString,
  name: nonBlankString,
  parentId: nonBlankString.nullable(),
  headcount: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  budget: z.number().min(0).max(Number.MAX_SAFE_INTEGER),
  performance: z.number().min(0).max(100),
  updatedAt: z.iso.datetime({ offset: true }),
})
export type OrgNode = z.infer<typeof orgNodeSchema>

export const orgTreeSchema = z.array(orgNodeSchema).superRefine((nodes, ctx) => {
  const byId = new Map(nodes.map(node => [node.id, node]))
  const fail = (message: string) => ctx.addIssue({ code: 'custom', message })
  if (byId.size !== nodes.length) fail('Идентификаторы подразделений повторяются')
  for (const node of nodes) {
    if (node.parentId !== null && !byId.has(node.parentId)) fail(`Не найден родитель: ${node.id}`)
  }
  // Each parent chain is visited once; no recursive traversal of untrusted input.
  const done = new Set<string>()
  for (const node of nodes) {
    const path = new Set<string>()
    let current: OrgNode | undefined = node
    while (current && !done.has(current.id)) {
      if (path.has(current.id)) { fail('Обнаружен цикл в структуре'); break }
      path.add(current.id)
      current = current.parentId === null ? undefined : byId.get(current.parentId)
    }
    for (const id of path) done.add(id)
  }
})
