import { useState } from 'react'
import styled from 'styled-components'
import type { LiveSnapshot } from '#src/model/live'
import { AnalyticsTable } from '#src/ui/AnalyticsTable'
import { OrgTree } from '#src/ui/OrgTree'
import { useTreeState } from '#src/ui/useTreeState'
import type { LiveHighlights } from '#src/ui/useLiveOrg'
import { c, Panel } from '#src/ui/styles'

const split = '(min-width: 1280px)'
const single = '(max-width: 1279.98px)'

const ViewSwitch = styled.div`
  display: inline-flex; gap: 2px; margin-bottom: 16px; padding: 3px; background: #f2f3f7; border: 1px solid ${c.border}; border-radius: 10px;
  @media ${split} { display: none; }
`
const ViewButton = styled.button`
  padding: 7px 16px; border: 0; border-radius: 8px; background: transparent; color: ${c.body}; font-size: 12px; font-weight: 600;
  &[aria-pressed='true'] { background: ${c.surface}; color: ${c.text}; font-weight: 700; box-shadow: 0 1px 2px rgba(20, 25, 45, .08); }
`
const Split = styled.div`
  @media ${split} {
    display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); gap: 24px; align-items: stretch;
    flex: 1 1 auto; min-height: 0;
  }
`
// Below 1280px only the chosen view is shown; above it both panels fill the screen and scroll inside.
const ViewPanel = styled(Panel)<{ $active: boolean }>`
  @media ${single} { display: ${p => p.$active ? 'block' : 'none'}; }
  @media ${split} { display: flex; flex-direction: column; min-height: 0; height: 100%; }
`
const TreePanel = styled(ViewPanel)`container-type: inline-size;`

export function Dashboard({ snapshot, highlights }: { snapshot: LiveSnapshot; highlights: LiveHighlights }) {
  const treeState = useTreeState(snapshot.tree)
  const [view, setView] = useState<'tree' | 'table'>('tree')
  const selectInTree = (id: string) => {
    // Switching the view hides the table panel, so the tree has to take the focus that was inside it.
    treeState.revealNode(id, { focus: view !== 'tree' && !window.matchMedia(split).matches })
    setView('tree')
  }

  return <>
    <ViewSwitch role="group" aria-label="Режим просмотра">
      <ViewButton type="button" aria-pressed={view === 'tree'} onClick={() => setView('tree')}>Дерево</ViewButton>
      <ViewButton type="button" aria-pressed={view === 'table'} onClick={() => setView('table')}>Таблица</ViewButton>
    </ViewSwitch>
    <Split>
      <TreePanel $active={view === 'tree'} aria-label="Дерево подразделений">
        {/* Дереву — собственные значения узлов, таблице — суммы по поддереву. */}
        <OrgTree tree={snapshot.tree} state={treeState} highlights={highlights.own} />
      </TreePanel>
      <ViewPanel $active={view === 'table'} aria-label="Аналитическая таблица">
        <AnalyticsTable rows={snapshot.aggregates.rows} selectedId={treeState.selected} onSelect={selectInTree} highlights={highlights.aggregates} />
      </ViewPanel>
    </Split>
  </>
}
