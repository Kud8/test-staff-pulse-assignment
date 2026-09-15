import type { OrgNode } from '#shared/org'

export function buildTree(nodes: OrgNode[]) {
  const byId = new Map(nodes.map(node => [node.id, node]))
  const children = new Map<string | null, OrgNode[]>()
  for (const node of nodes) {
    const siblings = children.get(node.parentId) ?? []
    siblings.push(node)
    children.set(node.parentId, siblings)
  }
  const roots = children.get(null) ?? []
  const defaultExpanded = new Set<string>()
  for (const root of roots) {
    defaultExpanded.add(root.id)
    for (const child of children.get(root.id) ?? []) defaultExpanded.add(child.id)
  }
  return { byId, children, roots, defaultExpanded }
}
export type OrgTree = ReturnType<typeof buildTree>
