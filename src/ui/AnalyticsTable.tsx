import { useEffect, useId, useMemo, useRef, useState, type MouseEvent } from 'react'
import styled from 'styled-components'
import type { NodeAggregate } from '#src/model/aggregate'
import { filterRows, sortRows, type Sort, type SortKey } from '#src/model/table'
import { formatBudget, formatCount, formatLevel, formatPerformance } from '#src/ui/format'
import { useDebouncedValue } from '#src/ui/useDebouncedValue'
import { Muted, Toolbar } from '#src/ui/styles'

const FILTER_DELAY_MS = 250
const columns: { key: SortKey; label: string; numeric: boolean }[] = [
  { key: 'name', label: 'Подразделение', numeric: false },
  { key: 'level', label: 'Уровень', numeric: false },
  { key: 'headcount', label: 'Всего сотрудников', numeric: true },
  { key: 'budget', label: 'Бюджет суммарный', numeric: true },
  { key: 'performance', label: 'Средняя эффективность', numeric: true },
]

const FilterBar = styled.div`
  display: flex; align-items: center; gap: 8px 12px; flex-wrap: wrap; padding: 14px 28px; border-bottom: 1px solid #e6e9ee;
  label { font-weight: 500; font-size: 13px; }
  @media(max-width: 600px) { padding: 14px 16px; }
`
const SearchInput = styled.input`
  flex: 1 1 200px; min-width: 0; max-width: 340px; font: inherit; color: inherit; background: white;
  padding: 7px 10px; border: 1px solid #d9dee6; border-radius: 5px;
  &:focus-visible { outline-offset: 0; border-color: #4263a6; }
`
const Count = styled(Muted)`margin-left: auto;`
const TableScroll = styled.div`
  overflow: auto;
  @media (min-width: 1280px) { flex: 1 1 auto; min-height: 0; }
`
const Table = styled.table`width: 100%; border-collapse: separate; border-spacing: 0; font-variant-numeric: tabular-nums;`
const HeaderCell = styled.th<{ $numeric: boolean }>`
  position: sticky; top: 0; z-index: 1; padding: 0; background: #fafbfc; border-bottom: 1px solid #e6e9ee;
  text-align: ${p => p.$numeric ? 'right' : 'left'}; color: #606c7d; font-size: 12px; font-weight: 500;
`
const SortButton = styled.button<{ $direction: 'asc' | 'desc' | null; $numeric: boolean }>`
  display: flex; align-items: center; gap: 6px; width: 100%; justify-content: ${p => p.$numeric ? 'flex-end' : 'flex-start'};
  padding: 12px 14px; border: 0; background: transparent; color: inherit; font-weight: 500; white-space: nowrap;
  /* The reverse order needs a real double click, so the browser must not spend it on double-tap zoom. */
  user-select: none; touch-action: manipulation;
  &::after { content: '${p => p.$direction === 'asc' ? '↑' : p.$direction === 'desc' ? '↓' : '↕'}'; opacity: ${p => p.$direction ? 1 : .35}; }
  &:hover { color: #232b39; }
  &:focus-visible { outline-offset: -3px; }
`
const BodyRow = styled.tr<{ $selected: boolean }>`
  cursor: pointer;
  > th, > td { border-bottom: 1px solid #eef0f3; background: ${p => p.$selected ? '#eaf0fb' : 'white'}; }
  &:hover > th, &:hover > td { background: ${p => p.$selected ? '#e3ebfa' : '#f5f7fa'}; }
  > th { box-shadow: ${p => p.$selected ? 'inset 3px 0 #4263a6' : 'none'}; }
`
const NameCell = styled.th`padding: 0; min-width: 180px; text-align: left; font-weight: 450;`
const RowButton = styled.button`
  width: 100%; padding: 10px 14px; border: 0; background: transparent; color: inherit; text-align: left; line-height: 1.5;
  &:focus-visible { outline-offset: -3px; }
`
const Cell = styled.td<{ $numeric?: boolean }>`
  padding: 10px 14px; white-space: nowrap; text-align: ${p => p.$numeric ? 'right' : 'left'}; color: ${p => p.$numeric ? 'inherit' : '#606c7d'};
`
const EmptyCell = styled.td`padding: 48px 16px; text-align: center; color: #667184;`

type Props = { rows: NodeAggregate[]; selectedId: string | null; onSelect: (id: string) => void }

export function AnalyticsTable({ rows, selectedId, onSelect }: Props) {
  const filterId = useId()
  const [query, setQuery] = useState('')
  const appliedQuery = useDebouncedValue(query, FILTER_DELAY_MS)
  const [sort, setSort] = useState<Sort>(null)
  // Rows arrive already aggregated: filtering and sorting only reorder precomputed values.
  const visible = useMemo(() => sortRows(filterRows(rows, appliedQuery), sort), [rows, appliedQuery, sort])

  // The link works both ways: a node picked in the tree is brought into view here too.
  const rowElements = useRef(new Map<string, HTMLTableRowElement>())
  useEffect(() => {
    if (selectedId) rowElements.current.get(selectedId)?.scrollIntoView({ block: 'nearest' })
  }, [selectedId])

  const sortOnClick = (key: SortKey) => (event: MouseEvent<HTMLButtonElement>) => {
    // Keyboard activation reports detail 0 and has no double click, so it toggles the direction instead.
    if (event.detail === 0) setSort(current => ({ key, direction: current?.key === key && current.direction === 'asc' ? 'desc' : 'asc' }))
    else if (event.detail === 1) setSort({ key, direction: 'asc' })
  }

  return <>
    <Toolbar>
      <div><h2>Аналитика</h2><Muted>Суммы включают подразделение и все дочерние. Клик по заголовку — по возрастанию, двойной клик — по убыванию.</Muted></div>
    </Toolbar>
    <FilterBar>
      <label htmlFor={filterId}>Фильтр по названию</label>
      <SearchInput id={filterId} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Например, продажи" autoComplete="off" spellCheck={false} />
      <Count aria-live="polite">{`Показано: ${visible.length} из ${rows.length}`}</Count>
    </FilterBar>
    <TableScroll>
      <Table aria-label="Аналитика подразделений">
        <thead><tr>{columns.map(column => {
          const direction = sort?.key === column.key ? sort.direction : null
          return <HeaderCell key={column.key} scope="col" $numeric={column.numeric}
            aria-sort={direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : undefined}>
            <SortButton type="button" $direction={direction} $numeric={column.numeric}
              onClick={sortOnClick(column.key)} onDoubleClick={() => setSort({ key: column.key, direction: 'desc' })}>{column.label}</SortButton>
          </HeaderCell>
        })}</tr></thead>
        <tbody>
          {visible.length ? visible.map(row => {
            const selected = row.id === selectedId
            return <BodyRow key={row.id} $selected={selected} onClick={() => onSelect(row.id)}
              ref={element => {
                if (element) rowElements.current.set(row.id, element)
                return () => { rowElements.current.delete(row.id) }
              }}>
              <NameCell scope="row"><RowButton type="button" aria-current={selected ? 'true' : undefined}>{row.name}</RowButton></NameCell>
              <Cell>{formatLevel(row.level)}</Cell>
              <Cell $numeric>{formatCount(row.headcount)}</Cell>
              <Cell $numeric>{formatBudget(row.budget)}</Cell>
              <Cell $numeric>{formatPerformance(row.performance)}</Cell>
            </BodyRow>
          }) : <tr><EmptyCell colSpan={columns.length}>{`Ничего не найдено по запросу «${appliedQuery.trim()}»`}</EmptyCell></tr>}
        </tbody>
      </Table>
    </TableScroll>
  </>
}
