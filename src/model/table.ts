import type { NodeAggregate } from '#src/model/aggregate'

export type SortKey = 'name' | 'level' | 'headcount' | 'budget' | 'performance'
export type Sort = { key: SortKey; direction: 'asc' | 'desc' } | null

const normalize = (value: string) => value.trim().toLocaleLowerCase('ru').replaceAll('ё', 'е')
const collator = new Intl.Collator('ru', { sensitivity: 'base', numeric: true })

export function filterRows(rows: NodeAggregate[], query: string) {
  const needle = normalize(query)
  return needle ? rows.filter(row => normalize(row.name).includes(needle)) : rows
}

/** Stable copy: equal values keep tree order in both directions; missing performance always goes last. */
export function sortRows(rows: NodeAggregate[], sort: Sort) {
  if (!sort) return rows
  const { key, direction } = sort
  const sign = direction === 'asc' ? 1 : -1
  return rows.toSorted((a, b) => {
    if (key === 'name') return sign * collator.compare(a.name, b.name)
    const left = a[key]
    const right = b[key]
    if (left === null || right === null) return left === right ? 0 : left === null ? 1 : -1
    return sign * (left - right)
  })
}
