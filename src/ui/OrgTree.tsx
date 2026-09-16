import { useEffect, useRef } from 'react'
import styled from 'styled-components'
import type { OrgNode } from '#shared/org'
import type { OrgTree as TreeModel } from '#src/model/tree'
import type { TreeState } from '#src/ui/useTreeState'
import type { Highlights } from '#src/ui/useLiveOrg'
import { formatCount } from '#src/ui/format'
import { Actions, Button, c, Footer, performanceColor, Toolbar, Updated } from '#src/ui/styles'

// Layout follows the panel width, not the viewport: the tree is narrow both on phones and in the split view.
const compact = '(max-width: 680px)'
const tight = '(max-width: 440px)'
// Opening ancestors animate height for 240 ms; scrolling earlier would aim at a moving target.
const EXPAND_SETTLE_MS = 260

const List = styled.ul`list-style: none; padding: 0; margin: 0;`
const RootList = styled(List)`> li + li { margin-top: 16px; }`
const Nested = styled(List)`
  margin-left: 24px; border-left: 1px solid ${c.line};
  @container ${compact} { margin-left: 16px; }
  @container ${tight} { margin-left: 12px; }
`
// Keep content mounted so closing can finish; inert removes collapsed controls from navigation.
const Branch = styled.div<{ $open: boolean }>`
  display: grid; grid-template-rows: ${p => p.$open ? '1fr' : '0fr'};
  opacity: ${p => p.$open ? 1 : 0};
  transition: grid-template-rows 240ms cubic-bezier(.22, 1, .36, 1), opacity 180ms ease;
  @supports (interpolate-size: allow-keywords) {
    interpolate-size: allow-keywords;
    grid-template-rows: 1fr;
    height: ${p => p.$open ? 'auto' : '0px'};
    transition: height 240ms cubic-bezier(.22, 1, .36, 1), opacity 180ms ease;
  }
  @media(prefers-reduced-motion: reduce) { transition: none; }
`
const BranchContent = styled.div`min-height: 0; overflow: hidden;`
const Content = styled.div`
  padding: 4px 20px 24px;
  @container ${compact} { padding: 4px 12px 16px; }
  @container ${tight} { padding: 4px 8px 16px; }
  @media (min-width: 1280px) { flex: 1 1 auto; min-height: 0; overflow: auto; button { scroll-margin-top: 8px; } }
`
const Row = styled.button<{ $selected: boolean; $depth: number }>`
  display: grid; width: 100%; grid-template-columns: 24px minmax(0, 1fr) 160px 120px; align-items: center; gap: 12px;
  border: 0; text-align: left; min-height: 46px; border-radius: 8px; padding: 9px 12px 9px 8px;
  background: ${p => p.$selected ? c.selected : p.$depth === 0 ? '#f6f8fb' : 'transparent'};
  box-shadow: ${p => p.$selected ? `inset 3px 0 ${c.accent}` : 'none'};
  color: ${p => p.$depth > 1 ? c.body : c.text};
  font-size: ${p => p.$depth === 0 ? 14 : 13}px;
  font-weight: ${p => p.$depth === 0 ? 800 : p.$depth === 1 ? 700 : 500};
  &:hover { background: ${p => p.$selected ? '#e6edf6' : '#f7f9fc'}; }
  &:focus-visible { outline-offset: -3px; }
  @container ${compact} { grid-template-columns: 20px minmax(0, 1fr) 72px 88px; gap: 8px; padding: 10px 8px 10px 6px; }
  @container ${tight} { grid-template-columns: 18px minmax(0, 1fr) 52px 66px; gap: 6px; padding: 10px 6px; }
`
const Chevron = styled.svg<{ $open: boolean }>`
  display: block; width: 14px; height: 14px; justify-self: center; color: #8891a3;
  transform: rotate(${p => p.$open ? 90 : 0}deg);
  transition: transform 240ms cubic-bezier(.22, 1, .36, 1);
  @media(prefers-reduced-motion: reduce) { transition: none; }
`
const Leaf = styled.span`width: 4px; height: 4px; border-radius: 50%; background: #b3bbc9; justify-self: center;`
const Name = styled.span`line-height: 1.5; overflow-wrap: anywhere;`
const Count = styled(Updated)`
  text-align: right; font-variant-numeric: tabular-nums; font-size: 12.5px; font-weight: 400; color: ${c.muted};
  border-radius: 6px;
`
/* Полоса — псевдоэлемент: внутри ячейки не должно появляться второго узла с тем же текстом. */
const Performance = styled(Updated)<{ $value: number }>`
  justify-self: end; display: flex; flex-direction: column; align-items: flex-end; gap: 4px; border-radius: 6px;
  font-variant-numeric: tabular-nums; font-size: 12px; font-weight: 700; color: ${p => performanceColor(p.$value)};
  &::after {
    content: ''; width: 52px; height: 5px; border-radius: 3px;
    background: linear-gradient(to right, currentColor ${p => p.$value}%, ${c.track} ${p => p.$value}%);
  }
  @container ${tight} { &::after { width: 44px; } }
`
const Columns = styled.div`
  display: grid; grid-template-columns: 24px minmax(0, 1fr) 160px 120px; gap: 12px; padding: 14px 32px 10px 28px;
  color: ${c.label}; font-size: 10px; font-weight: 700; line-height: 1.5; letter-spacing: .07em; text-transform: uppercase;
  border-bottom: 1px solid ${c.line};
  > span:nth-child(n + 3) { text-align: right; }
  @container ${compact} { grid-template-columns: 20px minmax(0, 1fr) 72px 88px; gap: 8px; padding: 14px 20px 10px 18px; }
  @container ${tight} { grid-template-columns: 18px minmax(0, 1fr) 52px 66px; gap: 6px; padding: 16px 14px 12px; }
`
const DesktopLabel = styled.span`@container ${compact} { display: none; }`
const MobileLabel = styled.span`display: none; @container ${compact} { display: inline; }`

const noHighlights: Highlights = new Map()

export function OrgTree({ tree, state, highlights = noHighlights }: { tree: TreeModel; state: TreeState; highlights?: Highlights }) {
  const rows = useRef(new Map<string, HTMLButtonElement>())
  const { reveal } = state
  useEffect(() => {
    if (!reveal) return
    const timer = setTimeout(() => {
      const row = rows.current.get(reveal.id)
      if (!row) return
      row.scrollIntoView({ block: 'nearest' })
      // The switch hides the table panel on narrow screens; without this the browser drops focus to <body>.
      if (reveal.focus) row.focus({ preventScroll: true })
    }, reveal.afterExpand ? EXPAND_SETTLE_MS : 0)
    return () => clearTimeout(timer)
  }, [reveal])

  const renderNode = (node: OrgNode, depth = 0): React.ReactNode => {
    const children = tree.children.get(node.id) ?? []
    const open = state.expanded.has(node.id)
    const selected = state.selected === node.id
    const highlight = highlights.get(node.id)
    return <li key={node.id}>
      <Row $selected={selected} $depth={depth}
        ref={element => {
          if (element) rows.current.set(node.id, element)
          return () => { rows.current.delete(node.id) }
        }}
        aria-label={`${node.name}, сотрудников: ${formatCount(node.headcount)}, эффективность: ${node.performance}%`}
        aria-expanded={children.length ? open : undefined}
        aria-controls={children.length ? `children-${node.id}` : undefined}
        aria-current={selected ? 'true' : undefined}
        onClick={() => { state.select(node.id); if (children.length) state.toggle(node.id) }}>
        {children.length ? <Chevron $open={open} viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m6 4 4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></Chevron> : <Leaf aria-hidden="true" />}
        <Name>{node.name}</Name>
        {/* Токен в key перезапускает затухание, если та же ячейка изменилась снова. */}
        <Count key={`headcount-${highlight?.get('headcount') ?? 0}`}
          data-updated={highlight?.has('headcount') ? '' : undefined}>{formatCount(node.headcount)}</Count>
        <Performance key={`performance-${highlight?.get('performance') ?? 0}`}
          data-updated={highlight?.has('performance') ? '' : undefined} $value={node.performance}>{node.performance}%</Performance>
      </Row>
      {children.length > 0 && <Branch id={`children-${node.id}`} $open={open} inert={!open} aria-hidden={!open}><BranchContent><Nested>{children.map(child => renderNode(child, depth + 1))}</Nested></BranchContent></Branch>}
    </li>
  }
  return <>
    <Toolbar><div><h2 id="tree-title">Подразделения <span>{tree.byId.size}</span></h2></div>
      <Actions><Button onClick={state.expandAll}>Раскрыть всё</Button><Button onClick={state.collapseAll}>Свернуть всё</Button></Actions>
    </Toolbar>
    <Columns><span aria-hidden="true" /><span>Название</span><span title="Сотрудники самого подразделения. Дочерние команды не включены."><DesktopLabel>Сотрудники в подразделении</DesktopLabel><MobileLabel>Сотруд.</MobileLabel></span><span><DesktopLabel>Эффективность</DesktopLabel><MobileLabel>Эффект.</MobileLabel></span></Columns>
    <Content><RootList aria-labelledby="tree-title">{tree.roots.map(root => renderNode(root))}</RootList></Content>
    <Footer>Сотрудники и эффективность относятся к самому подразделению. Суммы по дочерним — в таблице.</Footer>
  </>
}
