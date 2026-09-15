import { describe, expect, it } from 'vitest'
import { formatBudget, formatCount, formatLevel, formatPerformance } from '#src/ui/format'

describe('Форматирование', () => {
  it.each([
    [12_345_678, '12 345 678 руб.'],
    [950, '950 руб.'],
    [1234.5, '1 235 руб.'],
    [0, '0 руб.'],
  ])('бюджет %d → «%s»', (value, expected) => expect(formatBudget(value)).toBe(expected))

  it.each([[1234, '1 234'], [44, '44']])('численность %d → «%s»', (value, expected) => expect(formatCount(value)).toBe(expected))

  it.each([
    [null, '—'],
    [55, '55%'],
    [3954 / 44, '89,9%'],
    [99.96, '100%'],
  ])('эффективность %s → «%s»', (value, expected) => expect(formatPerformance(value)).toBe(expected))

  it.each([[1, 'Дивизион'], [2, 'Отдел'], [3, 'Команда'], [4, 'Уровень 4']])('уровень %d → «%s»', (value, expected) => expect(formatLevel(value)).toBe(expected))
})
