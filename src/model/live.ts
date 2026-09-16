import type { OrgPatch } from '#shared/live'
import type { OrgNode } from '#shared/org'
import { aggregateTree, type NodeAggregate } from '#src/model/aggregate'
import { buildTree, type OrgTree } from '#src/model/tree'

export type LiveField = 'headcount' | 'budget' | 'performance'
export type TouchedFields = Map<string, Set<LiveField>>

/**
 * Дерево показывает собственные значения узла, таблица — суммы по поддереву,
 * поэтому изменения разделены: иначе предок подсвечивался бы там, где ничего не менялось.
 */
export type TouchedCells = { own: TouchedFields; aggregates: TouchedFields }

export type LiveSnapshot = {
  version: number
  nodes: Map<string, OrgNode>
  tree: OrgTree
  aggregates: ReturnType<typeof aggregateTree>
}

export type PatchResult =
  | { status: 'applied'; snapshot: LiveSnapshot; touched: TouchedCells }
  | { status: 'ignored' }
  | { status: 'resync' }

const fields: LiveField[] = ['headcount', 'budget', 'performance']
const nothingTouched = (): TouchedCells => ({ own: new Map(), aggregates: new Map() })

export function createSnapshot(nodes: OrgNode[], version: number): LiveSnapshot {
  const tree = buildTree(nodes)
  return { version, nodes: tree.byId, tree, aggregates: aggregateTree(tree) }
}

export function applyPatch(snapshot: LiveSnapshot, patch: OrgPatch): PatchResult {
  if (patch.version <= snapshot.version) return { status: 'ignored' }
  // A gap means messages were lost: only a fresh snapshot can restore the sums.
  if (patch.version > snapshot.version + 1) return { status: 'resync' }
  const current = snapshot.nodes.get(patch.id)
  // The stream describes a node this snapshot does not have, so the structures disagree.
  if (!current) return { status: 'resync' }

  const next: OrgNode = { ...current, ...patch.changes, updatedAt: patch.updatedAt }
  const ownChanges = fields.filter(field => next[field] !== current[field])
  // The version still advances, otherwise the next patch would look like a gap and force a GET.
  if (!ownChanges.length) return { status: 'applied', snapshot: { ...snapshot, version: patch.version }, touched: nothingTouched() }

  const nodes = new Map(snapshot.nodes)
  nodes.set(next.id, next)
  const children = new Map(snapshot.tree.children)
  const siblings = children.get(current.parentId)
  if (siblings) children.set(current.parentId, siblings.map(item => item.id === next.id ? next : item))
  const tree: OrgTree = { ...snapshot.tree, byId: nodes, children, roots: children.get(null) ?? snapshot.tree.roots }

  const deltaHeadcount = next.headcount - current.headcount
  const deltaBudget = next.budget - current.budget
  const deltaWeighted = next.performance * next.headcount - current.performance * current.headcount
  const touched: TouchedCells = { own: new Map([[patch.id, new Set(ownChanges)]]), aggregates: new Map() }
  const byId = new Map(snapshot.aggregates.byId)

  if (deltaHeadcount !== 0 || deltaBudget !== 0 || deltaWeighted !== 0) {
    // Only the patched node and its ancestors hold its values, so nothing else can change.
    for (let id: string | null = patch.id; id !== null; id = snapshot.nodes.get(id)?.parentId ?? null) {
      const previous = byId.get(id)
      if (!previous) break
      const headcount = previous.headcount + deltaHeadcount
      const weightedPerformance = previous.weightedPerformance + deltaWeighted
      const updated: NodeAggregate = { ...previous, headcount, weightedPerformance,
        budget: previous.budget + deltaBudget,
        performance: headcount > 0 ? weightedPerformance / headcount : null }
      byId.set(id, updated)
      const changed = fields.filter(field => updated[field] !== previous[field])
      if (changed.length) touched.aggregates.set(id, new Set(changed))
    }
  }

  const rows = snapshot.aggregates.rows.map(row => byId.get(row.id) ?? row)
  return { status: 'applied', snapshot: { version: patch.version, nodes, tree, aggregates: { rows, byId } }, touched }
}
