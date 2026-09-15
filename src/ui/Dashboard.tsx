import { useMemo, useState } from 'react'
import styled from 'styled-components'
import { aggregateTree } from '#src/model/aggregate'
import type { OrgTree as TreeModel } from '#src/model/tree'
import { AnalyticsTable } from '#src/ui/AnalyticsTable'
import { OrgTree } from '#src/ui/OrgTree'
import { useTreeState } from '#src/ui/useTreeState'
import { Panel } from '#src/ui/styles'

const split = '(min-width: 1280px)'
const single = '(max-width: 1279.98px)'

const ViewSwitch = styled.div`
  display: inline-flex; gap: 2px; margin-bottom: 16px; padding: 3px; background: white; border: 1px solid #d9dee6; border-radius: 7px;
  @media ${split} { display: none; }
`
const ViewButton = styled.button`
  padding: 7px 16px; border: 0; border-radius: 5px; background: transparent; color: #3b4960; font-size: 13px; font-weight: 500;
  &[aria-pressed='true'] { background: #263954; color: white; }
`
const Split = styled.div`
  @media ${split} { display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); gap: 24px; align-items: start; }
`
// Below 1280px only the chosen view is shown; above it both panels stick under the header and scroll inside.
const ViewPanel = styled(Panel)<{ $active: boolean }>`
  @media ${single} { display: ${p => p.$active ? 'block' : 'none'}; }
  @media ${split} { position: sticky; top: 92px; display: flex; flex-direction: column; max-height: calc(100vh - 116px); }
`
const TreePanel = styled(ViewPanel)`container-type: inline-size;`

export function Dashboard({ tree }: { tree: TreeModel }) {
  // One aggregation pass per data snapshot; the table only filters and sorts its result.
  const { rows } = useMemo(() => aggregateTree(tree), [tree])
  const treeState = useTreeState(tree)
  const [view, setView] = useState<'tree' | 'table'>('tree')
  const selectInTree = (id: string) => {
    // Switching the view hides the table panel, so the tree has to take the focus that was inside it.
    treeState.revealNode(id, { focus: view !== 'tree' })
    setView('tree')
  }

  return <>
    <ViewSwitch role="group" aria-label="Режим просмотра">
      <ViewButton type="button" aria-pressed={view === 'tree'} onClick={() => setView('tree')}>Дерево</ViewButton>
      <ViewButton type="button" aria-pressed={view === 'table'} onClick={() => setView('table')}>Таблица</ViewButton>
    </ViewSwitch>
    <Split>
      <TreePanel $active={view === 'tree'} aria-label="Дерево подразделений"><OrgTree tree={tree} state={treeState} /></TreePanel>
      <ViewPanel $active={view === 'table'} aria-label="Аналитическая таблица">
        <AnalyticsTable rows={rows} selectedId={treeState.selected} onSelect={selectInTree} />
      </ViewPanel>
    </Split>
  </>
}
