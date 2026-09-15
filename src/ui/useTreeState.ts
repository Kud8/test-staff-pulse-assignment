import { useState } from 'react'
import type { OrgTree } from '#src/model/tree'

/**
 * A request to bring a node into view: afterExpand means its branch is still opening,
 * focus means the caller is hiding the element that currently holds focus.
 */
export type RevealRequest = { id: string; afterExpand: boolean; focus: boolean }

export function useTreeState(tree: OrgTree) {
  const [expanded, setExpanded] = useState(() => new Set(tree.defaultExpanded))
  const [selected, setSelected] = useState<string | null>(null)
  const [reveal, setReveal] = useState<RevealRequest | null>(null)

  const toggle = (id: string) => setExpanded(previous => {
    const next = new Set(previous)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const expandAll = () => setExpanded(new Set([...tree.children.keys()].filter((id): id is string => id !== null)))
  const collapseAll = () => setExpanded(new Set())
  const revealNode = (id: string, options: { focus?: boolean } = {}) => {
    const ancestors: string[] = []
    for (let parentId = tree.byId.get(id)?.parentId ?? null; parentId !== null; parentId = tree.byId.get(parentId)?.parentId ?? null) {
      ancestors.push(parentId)
    }
    const afterExpand = ancestors.some(ancestor => !expanded.has(ancestor))
    if (afterExpand) setExpanded(previous => new Set([...previous, ...ancestors]))
    setSelected(id)
    setReveal({ id, afterExpand, focus: options.focus ?? false })
  }

  return { expanded, selected, reveal, select: setSelected, toggle, expandAll, collapseAll, revealNode }
}
export type TreeState = ReturnType<typeof useTreeState>
