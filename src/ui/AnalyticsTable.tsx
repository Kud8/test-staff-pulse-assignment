import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import styled from 'styled-components'
import type { NodeAggregate } from '#src/model/aggregate'
import type { LiveField } from '#src/model/live'
import { filterRows, sortRows, type Sort, type SortKey } from '#src/model/table'
import { formatBudget, formatCount, formatLevel, formatPerformance } from '#src/ui/format'
import { useDebouncedValue } from '#src/ui/useDebouncedValue'
import type { Highlights } from '#src/ui/useLiveOrg'
import { c, Muted, performanceColor, performanceSoft, Toolbar, Updated } from '#src/ui/styles'
import type { SearchFilter } from '#shared/search'
import { applySearchFilter } from '#src/model/search'
import { SearchBar } from '#src/ui/SearchBar'

const FILTER_DELAY_MS = 250
// Подписи короткие, чтобы колонки помещались без переносов; полное значение — в title и в подзаголовке панели.
const columns: { key: SortKey; label: string; hint?: string; numeric: boolean; live?: LiveField }[] = [
  { key: 'name', label: 'Подразделение', numeric: false },
  { key: 'level', label: 'Уровень', numeric: false },
  { key: 'headcount', label: 'Сотрудники', hint: 'Сотрудники подразделения и всех дочерних', numeric: true, live: 'headcount' },
  { key: 'budget', label: 'Бюджет', hint: 'Бюджет подразделения и всех дочерних', numeric: true, live: 'budget' },
  { key: 'performance', label: 'Эффективность', hint: 'Средняя эффективность по поддереву, взвешенная по численности', numeric: true, live: 'performance' },
]

const TableScroll = styled.div`
  overflow: auto;
  @media (min-width: 1280px) { flex: 1 1 auto; min-height: 0; }
`
const Table = styled.table`width: 100%; border-collapse: separate; border-spacing: 0; font-variant-numeric: tabular-nums;`
const HeaderCell = styled.th<{ $numeric: boolean; $sorted: boolean }>`
  position: sticky; top: 0; z-index: 1; padding: 0; background: ${c.surface}; border-bottom: 1px solid ${c.line};
  text-align: ${p => p.$numeric ? 'right' : 'left'}; color: ${p => p.$sorted ? c.accent : c.label};
  font-size: 10px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase;
`
const SortButton = styled.button<{ $direction: 'asc' | 'desc' | null; $numeric: boolean }>`
  display: flex; align-items: center; gap: 6px; width: 100%; justify-content: ${p => p.$numeric ? 'flex-end' : 'flex-start'};
  padding: 13px 14px; border: 0; background: transparent; color: inherit; white-space: nowrap;
  /* Кнопки не наследуют регистр и начертание от ячейки: браузер сбрасывает их своим стилем. */
  font-size: 10px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase;
  /* Подряд идущие клики меняют порядок: текст заголовка не должен выделяться, а тап — уходить в зум. */
  user-select: none; touch-action: manipulation;
  &::after { content: '${p => p.$direction === 'asc' ? '↑' : p.$direction === 'desc' ? '↓' : '↕'}'; opacity: ${p => p.$direction ? 1 : .35}; }
  &:hover { color: ${c.text}; }
  &:focus-visible { outline-offset: -3px; }
`
const BodyRow = styled.tr<{ $selected: boolean }>`
  cursor: pointer;
  > th, > td { border-bottom: 1px solid ${c.rowLine}; background: ${p => p.$selected ? c.selected : c.surface}; }
  &:hover > th, &:hover > td { background: ${p => p.$selected ? '#e6edf6' : c.hover}; }
  > th { box-shadow: ${p => p.$selected ? `inset 3px 0 ${c.accent}` : 'none'}; }
`
const NameCell = styled.th`padding: 0; min-width: 180px; text-align: left; font-size: 13.5px; font-weight: 700;`
const RowButton = styled.button`
  width: 100%; padding: 11px 14px; border: 0; background: transparent; color: inherit; text-align: left; line-height: 1.5;
  &:focus-visible { outline-offset: -3px; }
`
const Cell = styled(Updated).attrs({ as: 'td' })<{ $numeric?: boolean }>`
  padding: 11px 14px; white-space: nowrap; border-radius: 6px;
  text-align: ${p => p.$numeric ? 'right' : 'left'}; font-size: 13px; color: ${p => p.$numeric ? c.body : c.muted};
`
/* Доля бюджета — фоном самой ячейки: лишний вложенный узел с тем же текстом ломал бы поиск по тексту. */
const BudgetCell = styled(Cell)<{ $ratio: number }>`
  color: ${c.text}; font-weight: 700;
  &::after {
    content: ''; display: block; width: 76px; height: 4px; margin: 5px 0 0 auto; border-radius: 2px;
    background: linear-gradient(to right, ${c.accent} ${p => p.$ratio}%, ${c.track} ${p => p.$ratio}%);
  }
`
const Level = styled.span<{ $level: number }>`
  display: inline-block; padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 700;
  color: ${p => p.$level === 1 ? c.accent : p.$level === 2 ? '#35618f' : c.muted};
  background: ${p => p.$level === 1 ? c.accentSoft : p.$level === 2 ? '#eef3f8' : '#f2f3f7'};
`
const Performance = styled.span<{ $value: number }>`
  display: inline-block; padding: 3px 9px; border-radius: 20px; font-size: 11px; font-weight: 700;
  color: ${p => performanceColor(p.$value)}; background: ${p => performanceSoft(p.$value)};
`
const EmptyCell = styled.td`padding: 48px 16px; text-align: center; color: ${c.muted};`

type Props = { rows: NodeAggregate[]; selectedId: string | null; onSelect: (id: string) => void; highlights?: Highlights }
const noHighlights: Highlights = new Map()

export function AnalyticsTable({ rows, selectedId, onSelect, highlights = noHighlights }: Props) {
  const [query, setQuery] = useState('')
  const [aiFilter, setAiFilter] = useState<SearchFilter | null>(null)
  const appliedQuery = useDebouncedValue(query, FILTER_DELAY_MS)
  const [sort, setSort] = useState<Sort>(null)
  const [focusedId, setFocusedId] = useState<string | null>(null)
  // Rows arrive already aggregated: filtering and sorting only reorder precomputed values.
  const visible = useMemo(() => sortRows(applySearchFilter(filterRows(rows, aiFilter ? '' : appliedQuery), aiFilter), sort), [rows, appliedQuery, aiFilter, sort])
  // Полоса в ячейке бюджета показывает долю от самого дорогого подразделения.
  const maxBudget = useMemo(() => Math.max(1, ...rows.map(row => row.budget)), [rows])

  // The link works both ways: a node picked in the tree is brought into view here too.
  const rowElements = useRef(new Map<string, HTMLTableRowElement>())
  useEffect(() => {
    if (selectedId) rowElements.current.get(selectedId)?.scrollIntoView({ block: 'nearest' })
  }, [selectedId])

  // Первый клик по столбцу — по возрастанию, повторный разворачивает порядок; с клавиатуры так же.
  const sortOnClick = (key: SortKey) => () =>
    setSort(current => ({ key, direction: current?.key === key && current.direction === 'asc' ? 'desc' : 'asc' }))

  // One row is in the Tab order; the arrows move between rows, as in a grid.
  const tabbableId = visible.find(row => row.id === focusedId)?.id ?? visible[0]?.id
  const moveFocus = (event: KeyboardEvent<HTMLTableSectionElement>) => {
    const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End']
    if (!keys.includes(event.key)) return
    const from = visible.findIndex(row => row.id === (document.activeElement?.closest('tr')?.dataset.id ?? focusedId))
    const index = event.key === 'Home' ? 0
      : event.key === 'End' ? visible.length - 1
        : Math.min(visible.length - 1, Math.max(0, (from === -1 ? 0 : from) + (event.key === 'ArrowDown' ? 1 : -1)))
    const target = visible[index]
    if (!target) return
    event.preventDefault()
    setFocusedId(target.id)
    rowElements.current.get(target.id)?.querySelector('button')?.focus()
  }

  return <>
    <Toolbar>
      <div><h2>Аналитика</h2><Muted>Суммы включают подразделение и все дочерние. Клик по заголовку — сортировка, повторный клик — обратный порядок.</Muted></div>
    </Toolbar>
    <SearchBar onChange={(text, filter) => { setQuery(text); setAiFilter(filter) }} count={visible.length} total={rows.length} />
    <TableScroll>
      <Table aria-label="Аналитика подразделений">
        <thead><tr>{columns.map(column => {
          const direction = sort?.key === column.key ? sort.direction : null
          return <HeaderCell key={column.key} scope="col" $numeric={column.numeric} $sorted={direction !== null}
            aria-sort={direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : undefined}>
            <SortButton type="button" $direction={direction} $numeric={column.numeric} title={column.hint}
              onClick={sortOnClick(column.key)}>{column.label}</SortButton>
          </HeaderCell>
        })}</tr></thead>
        <tbody onKeyDown={moveFocus}>
          {visible.length ? visible.map(row => {
            const selected = row.id === selectedId
            const highlight = highlights.get(row.id)
            // Token 0 means the cell is calm; a fresh token restarts the fade on a repeated change.
            const token = (live: LiveField) => highlight?.get(live) ?? 0
            const cell = (key: SortKey, live: LiveField, text: string) =>
              <Cell key={`${key}-${token(live)}`} data-updated={token(live) ? '' : undefined} $numeric>{text}</Cell>
            return <BodyRow key={row.id} data-id={row.id} $selected={selected} onClick={() => onSelect(row.id)}
              ref={element => {
                if (element) rowElements.current.set(row.id, element)
                return () => { rowElements.current.delete(row.id) }
              }}>
              <NameCell scope="row">
                <RowButton type="button" tabIndex={row.id === tabbableId ? 0 : -1} onFocus={() => setFocusedId(row.id)}
                  aria-current={selected ? 'true' : undefined}>{row.name}</RowButton>
              </NameCell>
              <Cell><Level $level={row.level}>{formatLevel(row.level)}</Level></Cell>
              {cell('headcount', 'headcount', formatCount(row.headcount))}
              <BudgetCell key={`budget-${token('budget')}`} data-updated={token('budget') ? '' : undefined}
                $numeric $ratio={Math.max(2, Math.round((row.budget / maxBudget) * 100))}>{formatBudget(row.budget)}</BudgetCell>
              <Cell key={`performance-${token('performance')}`} data-updated={token('performance') ? '' : undefined} $numeric>
                {row.performance === null ? formatPerformance(null)
                  : <Performance $value={row.performance}>{formatPerformance(row.performance)}</Performance>}
              </Cell>
            </BodyRow>
          }) : <tr><EmptyCell colSpan={columns.length}>{aiFilter ? 'Нет подразделений, соответствующих условиям' : `Ничего не найдено по запросу «${appliedQuery.trim()}»`}</EmptyCell></tr>}
        </tbody>
      </Table>
    </TableScroll>
  </>
}
