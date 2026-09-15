// Grouping is done by hand: ICU data differs between runtimes, the required format is fixed (12 345 678 руб.).
const groupDigits = (value: number) => Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

export const formatCount = (value: number) => groupDigits(value)
export const formatBudget = (value: number) => `${groupDigits(value)} руб.`

export function formatPerformance(value: number | null) {
  if (value === null) return '—'
  return `${String(Math.round(value * 10) / 10).replace('.', ',')}%`
}

const levels = ['Дивизион', 'Отдел', 'Команда']
export const formatLevel = (level: number) => levels[level - 1] ?? `Уровень ${level}`
