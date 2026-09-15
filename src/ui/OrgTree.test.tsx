// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ServerStyleSheet } from 'styled-components'
import { renderToStaticMarkup } from 'react-dom/server'
import { OrgTree } from '#src/ui/OrgTree'
import { buildTree } from '#src/model/tree'
import { createSeed } from '#server/data'

afterEach(cleanup)
const departmentName = 'Разработка платформы, сотрудников: 10, эффективность: 65%'

describe('Дерево с данными', () => {
  it('показывает каждый узел, собственную численность и эффективность; три уровня видны', () => {
    const nodes = createSeed()
    render(<OrgTree tree={buildTree(nodes)} />)
    for (const node of nodes) {
      const row = screen.getByRole('button', { name: `${node.name}, сотрудников: ${node.headcount}, эффективность: ${node.performance}%` })
      expect(within(row).getByText(node.name)).toBeTruthy()
      expect(within(row).getByText(String(node.headcount))).toBeTruthy()
      expect(within(row).getByText(`${node.performance}%`)).toBeTruthy()
      if (row.hasAttribute('aria-expanded')) expect(row.getAttribute('aria-expanded')).toBe('true')
    }
  })
  it('строка и клавиатура переключают ветвь, скрытая ветвь inert', async () => {
    render(<OrgTree tree={buildTree(createSeed())} />)
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
    render(<OrgTree tree={buildTree(createSeed())} />)
    await userEvent.click(screen.getByRole('button', { name: 'Свернуть всё' }))
    expect(screen.getAllByRole('button', { expanded: false })).toHaveLength(4)
    expect(screen.queryByRole('button', { name: departmentName })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Раскрыть всё' }))
    expect(screen.getAllByRole('button', { expanded: true })).toHaveLength(16)
    expect(screen.getByRole('button', { name: departmentName })).toBeTruthy()
  })
  it('выбирает лист без добавления состояния раскрытия', async () => {
    render(<OrgTree tree={buildTree(createSeed())} />)
    const leaf = screen.getByRole('button', { name: /^Серверные сервисы,/ })
    await userEvent.click(leaf)
    expect(leaf.getAttribute('aria-current')).toBe('true')
    expect(leaf.hasAttribute('aria-expanded')).toBe(false)
  })
  it('выводит три цветовых диапазона эффективности вместе с числовыми значениями', () => {
    const sheet = new ServerStyleSheet()
    try {
      const html = renderToStaticMarkup(sheet.collectStyles(<OrgTree tree={buildTree(createSeed())} />))
      const css = sheet.getStyleTags()
      for (const color of ['#34805b', '#a47b24', '#b55750']) expect(css).toContain(color)
      for (const value of ['54', '65', '87']) expect(html).toContain(`${value}%`)
    } finally { sheet.seal() }
  })
})
