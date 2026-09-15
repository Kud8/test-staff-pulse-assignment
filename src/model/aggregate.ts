import type { OrgNode } from '#shared/org'
import type { OrgTree } from '#src/model/tree'

export type NodeAggregate = {
  id: string
  name: string
  level: number
  headcount: number
  budget: number
  /** Sum of performance × headcount over the subtree; the average is derived from it, never from child averages. */
  weightedPerformance: number
  performance: number | null
}
export type Aggregates = { rows: NodeAggregate[]; byId: Map<string, NodeAggregate> }

export function aggregateTree(tree: OrgTree): Aggregates {
  const rows: NodeAggregate[] = []
  const byId = new Map<string, NodeAggregate>()
  // Iterative pre-order: rows follow the tree and depth of untrusted data cannot overflow the call stack.
  const stack = tree.roots.map((root): [OrgNode, number] => [root, 1]).reverse()
  while (stack.length) {
    const [node, level] = stack.pop()!
    const row: NodeAggregate = { id: node.id, name: node.name, level, headcount: node.headcount, budget: node.budget,
      weightedPerformance: node.performance * node.headcount, performance: null }
    rows.push(row)
    byId.set(row.id, row)
    const children = tree.children.get(node.id) ?? []
    for (let i = children.length - 1; i >= 0; i--) stack.push([children[i]!, level + 1])
  }
  // Reverse pre-order reaches every descendant before its ancestor, so each row is final when visited.
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i]!
    row.performance = row.headcount > 0 ? row.weightedPerformance / row.headcount : null
    const parentId = tree.byId.get(row.id)?.parentId
    const parent = parentId == null ? undefined : byId.get(parentId)
    if (parent) {
      parent.headcount += row.headcount
      parent.budget += row.budget
      parent.weightedPerformance += row.weightedPerformance
    }
  }
  return { rows, byId }
}
