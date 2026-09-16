import type { OrgPatch } from '#shared/live'
import { orgNodeSchema, type OrgNode } from '#shared/org'

const fields = ['headcount', 'budget', 'performance'] as const
const BUDGET_STEP = 25_000
const MAX_PERFORMANCE = 100

/** Never returns the current value: a patch that changes nothing would only burn a version. */
function changedValue(current: number, candidate: number, step: number, max: number) {
  if (candidate !== current) return candidate
  return current + step <= max ? current + step : current - step
}

function nextValue(node: OrgNode, field: typeof fields[number], delta: number) {
  if (field === 'headcount') return changedValue(node.headcount, Math.max(0, node.headcount + delta), 1, Number.MAX_SAFE_INTEGER)
  if (field === 'performance') return changedValue(node.performance, Math.min(MAX_PERFORMANCE, Math.max(0, node.performance + delta)), 1, MAX_PERFORMANCE)
  return changedValue(node.budget, Math.max(0, node.budget + delta * BUDGET_STEP), BUDGET_STEP, Number.MAX_SAFE_INTEGER)
}

/** Live changes touch values of one existing node; structure never moves. */
export function nextPatch(nodes: OrgNode[], version: number, session: string, random: () => number): OrgPatch {
  const node = nodes[Math.floor(random() * nodes.length)]!
  const field = fields[Math.floor(random() * fields.length)]!
  const step = Math.floor(random() * 5) - 2
  const changes = { [field]: nextValue(node, field, step === 0 ? 1 : step) }
  // The server refuses to broadcast anything its own contract would reject.
  orgNodeSchema.parse({ ...node, ...changes })
  return { type: 'patch', session, version: version + 1, id: node.id, changes, updatedAt: new Date().toISOString() }
}

export function applyPatchToNodes(nodes: OrgNode[], patch: OrgPatch): OrgNode[] {
  return nodes.map(node => node.id === patch.id ? { ...node, ...patch.changes, updatedAt: patch.updatedAt } : node)
}
