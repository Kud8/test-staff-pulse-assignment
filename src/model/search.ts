import type { SearchFilter } from '#shared/search'
import type { NodeAggregate } from '#src/model/aggregate'
import { filterRows } from '#src/model/table'

export function applySearchFilter(rows: NodeAggregate[], filter: SearchFilter | null) {
  if (!filter) return rows
  return filterRows(rows, filter.name ?? '').filter(row => {
    if (filter.level !== null && filter.level !== row.level) return false
    return (['headcount', 'budget', 'performance'] as const).every(field => {
      const range = filter[field]
      if (!range || (!range.min && !range.max)) return true
      const value = row[field]
      if (value === null) return false
      if (range.min && (range.min.inclusive ? value < range.min.value : value <= range.min.value)) return false
      if (range.max && (range.max.inclusive ? value > range.max.value : value >= range.max.value)) return false
      return true
    })
  })
}

export function describeFilter(filter: SearchFilter): string {
  const parts: string[] = []
  if (filter.name !== null) parts.push(`Название содержит «${filter.name}»`)
  if (filter.level !== null) parts.push(`Уровень: ${filter.level}`)
  const labels = { headcount: 'Всего сотрудников', budget: 'Суммарный бюджет, руб.', performance: 'Средняя эффективность, %' }
  for (const field of ['headcount', 'budget', 'performance'] as const) {
    const range = filter[field]
    if (!range) continue
    const bounds: string[] = []
    if (range.min) bounds.push(`${range.min.inclusive ? '≥' : '>'} ${range.min.value.toLocaleString('ru-RU')}`)
    if (range.max) bounds.push(`${range.max.inclusive ? '≤' : '<'} ${range.max.value.toLocaleString('ru-RU')}`)
    if (bounds.length) parts.push(`${labels[field]} ${bounds.join(' и ')}`)
  }
  return parts.join('; ') || 'Все подразделения'
}
