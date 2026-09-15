// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ServerStyleSheet } from 'styled-components'
import { renderToStaticMarkup } from 'react-dom/server'
import { OrgTree } from '#src/ui/OrgTree'
import { useTreeState } from '#src/ui/useTreeState'
import { buildTree, type OrgTree as TreeModel } from '#src/model/tree'
import { createSeed } from '#server/data'

afterEach(cleanup)
const departmentName = 'Разработка платформы, сотрудников: 10, эффективность: 65%'

function TreeHarness({ tree }: { tree: TreeModel }) {
  const state = useTreeState(tree)
  return <OrgTree tree={tree} state={state} />
}

describe('Дерево с данными', () => {
  it('показывает каждый узел, собственную численность и эффективность; три уровня видны', () => {
    const nodes = createSeed()
    render(<TreeHarness tree={buildTree(nodes)} />)
    for (const node of nodes) {
      const row = screen.getByRole('button', { name: `${node.name}, сотрудников: ${node.headcount}, эффективность: ${node.performance}%` })
      expect(within(row).getByText(node.name)).toBeTruthy()
      expect(within(row).getByText(String(node.headcount))).toBeTruthy()
      expect(within(row).getByText(`${node.performance}%`)).toBeTruthy()
      if (row.hasAttribute('aria-expanded')) expect(row.getAttribute('aria-expanded')).toBe('true')
    }
  })
  it('разряды численности группируются так же, как в таблице', () => {
    const nodes = [{ id: 'a', name: 'Большой дивизион', parentId: null, headcount: 1234567, budget: 0, performance: 50, updatedAt: '2026-09-01T09:00:00.000Z' }]
    render(<TreeHarness tree={buildTree(nodes)} />)
    const row = screen.getByRole('button', { name: 'Большой дивизион, сотрудников: 1 234 567, эффективность: 50%' })
    expect(within(row).getByText('1 234 567')).toBeTruthy()
  })
  it('строка и клавиатура переключают ветвь, скрытая ветвь inert', async () => {
    render(<TreeHarness tree={buildTree(createSeed())} />)
    const row = screen.getByRole('button', { name: departmentName })
    const branch = document.getElementById(row.getAttribute('aria-controls')!)!
    await userEvent.click(row)
    expect(row.getAttribute('aria-expanded')).toBe('false')
    expect(branch.hasAttribute('inert')).toBe(true)
    expect(branch.getAttribute('aria-hidden')).toBe('true')
    expect(screen.queryByRole('button', { name: /^Серверные сервисы,/ })).toBeNull()
    await userEvent.keyboard('{Enter}')
    expect(row.getAttribute('aria-expanded')).toBe('true')
    expect(branch.hasAttribute('inert')).toBe(false)
    expect(screen.getByRole('button', { name: /^Серверные сервисы,/ })).toBeTruthy()
  })
  it('сворачивает и раскрывает все ветви', async () => {
    render(<TreeHarness tree={buildTree(createSeed())} />)
    await userEvent.click(screen.getByRole('button', { name: 'Свернуть всё' }))
    expect(screen.getAllByRole('button', { expanded: false })).toHaveLength(4)
    expect(screen.queryByRole('button', { name: departmentName })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Раскрыть всё' }))
    expect(screen.getAllByRole('button', { expanded: true })).toHaveLength(16)
    expect(screen.getByRole('button', { name: departmentName })).toBeTruthy()
  })
  it('выбирает лист без добавления состояния раскрытия', async () => {
    render(<TreeHarness tree={buildTree(createSeed())} />)
    const leaf = screen.getByRole('button', { name: /^Серверные сервисы,/ })
    await userEvent.click(leaf)
    expect(leaf.getAttribute('aria-current')).toBe('true')
    expect(leaf.hasAttribute('aria-expanded')).toBe(false)
  })
  it('выводит три цветовых диапазона эффективности вместе с числовыми значениями', () => {
    const sheet = new ServerStyleSheet()
    try {
      const html = renderToStaticMarkup(sheet.collectStyles(<TreeHarness tree={buildTree(createSeed())} />))
      const css = sheet.getStyleTags()
      for (const color of ['#34805b', '#a47b24', '#b55750']) expect(css).toContain(color)
      for (const value of ['54', '65', '87']) expect(html).toContain(`${value}%`)
    } finally { sheet.seal() }
  })
})
