import { orgTreeSchema, type OrgNode } from '#shared/org'

const divisions = [
  ['Цифровые продукты', ['Разработка платформы', 'Клиентские приложения', 'Продуктовая аналитика']],
  ['Коммерческий блок', ['Корпоративные продажи', 'Развитие партнёров', 'Маркетинг']],
  ['Операционная деятельность', ['Клиентский сервис', 'Логистика', 'Контроль качества']],
  ['Корпоративные функции', ['Управление персоналом', 'Финансы', 'Правовое сопровождение']],
] as const
const teams = [
  ['Серверные сервисы', 'Инфраструктура'], ['Веб-приложения', 'Мобильные приложения'], ['Исследования', 'Анализ данных'],
  ['Ключевые клиенты', 'Региональные продажи'], ['Партнёрские программы', 'Сопровождение партнёров'], ['Бренд и коммуникации', 'Цифровой маркетинг'],
  ['Первая линия поддержки', 'Экспертная поддержка'], ['Планирование поставок', 'Складские операции'], ['Аудит процессов', 'Стандарты качества'],
  ['Подбор персонала', 'Обучение и развитие'], ['Планирование бюджета', 'Бухгалтерский учёт'], ['Договорная работа', 'Комплаенс'],
] as const

export function createSeed(): OrgNode[] {
  const nodes: OrgNode[] = []
  const add = (id: string, name: string, parentId: string | null) => {
    const n = nodes.length
    nodes.push({ id, name, parentId, headcount: n === 39 ? 0 : 3 + (n * 7) % 35,
      budget: 350000 + (n * 137000) % 4200000, performance: 54 + (n * 11) % 47,
      updatedAt: '2026-09-01T09:00:00.000Z' })
  }
  divisions.forEach(([name, departments], d) => {
    const root = `division-${d + 1}`
    add(root, name, null)
    departments.forEach((department, p) => {
      const id = `${root}-department-${p + 1}`
      add(id, department, root)
      teams[d * 3 + p]?.forEach((team, t) => add(`${id}-team-${t + 1}`, team, id))
    })
  })
  return orgTreeSchema.parse(nodes)
}
