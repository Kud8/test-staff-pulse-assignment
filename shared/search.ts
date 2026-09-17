import { z } from 'zod'

export const MAX_QUERY_LENGTH = 500
export const searchRequestSchema = z.strictObject({ query: z.string().trim().min(1).max(MAX_QUERY_LENGTH) })
const bound = (max: number) => z.strictObject({ value: z.number().min(0).max(max), inclusive: z.boolean() }).nullable()
const range = (max: number) => z.strictObject({ min: bound(max), max: bound(max) }).nullable()

// Все поля обязательны для strict Structured Outputs; null означает отсутствие условия.
export const filterShapeSchema = z.strictObject({
  name: z.string().trim().min(1).max(120).nullable(),
  level: z.number().int().min(1).max(100).nullable(),
  headcount: range(Number.MAX_SAFE_INTEGER),
  budget: range(Number.MAX_SAFE_INTEGER),
  performance: range(100),
})
export const searchFilterSchema = filterShapeSchema.superRefine((filter, ctx) => {
  for (const field of ['headcount', 'budget', 'performance'] as const) {
    const value = filter[field]
    if (value?.min && value.max && (value.min.value > value.max.value
      || (value.min.value === value.max.value && (!value.min.inclusive || !value.max.inclusive)))) {
      ctx.addIssue({ code: 'custom', path: [field], message: 'Пустой или обратный диапазон' })
    }
  }
})
export type SearchFilter = z.infer<typeof searchFilterSchema>
export const fallbackReasons = ['unconfigured', 'timeout', 'unavailable', 'invalid', 'unsupported', 'busy'] as const
export const searchResponseSchema = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('ai'), filter: searchFilterSchema }),
  z.strictObject({ mode: z.literal('text'), reason: z.enum(fallbackReasons) }),
])
export type SearchResponse = z.infer<typeof searchResponseSchema>
