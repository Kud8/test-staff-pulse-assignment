import { afterEach, expect, it, vi } from 'vitest'
import { interpretQuery } from '#server/ai'
import { readConfig } from '#server/config'
import { searchFilterSchema, searchResponseSchema } from '#shared/search'

const config = { ...readConfig({}).ai, apiKey: 'test-key', timeoutMs: 100 }
const filter = { name: null, level: 2, headcount: null, budget: { min: null, max: { value: 5000000, inclusive: true } }, performance: null }
const model = (value: unknown) => new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }] }))
const run = () => interpretQuery('Отделы до 5 млн', config, new AbortController().signal)
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

it('вызывает Responses API с ключом только в заголовке и strict JSON schema', async () => {
  const fetch = vi.fn().mockResolvedValue(model({ filter }))
  vi.stubGlobal('fetch', fetch)
  expect(await run()).toEqual({ mode: 'ai', filter })
  const [url, options] = fetch.mock.calls[0] as [string, RequestInit]
  expect(url).toBe('https://api.openai.com/v1/responses')
  expect(options.headers).toMatchObject({ Authorization: 'Bearer test-key' })
  const body = JSON.parse(String(options.body))
  expect(body).toMatchObject({ model: config.model, store: false, input: 'Отделы до 5 млн', text: { format: { type: 'json_schema', strict: true } } })
  expect(body.text.format.schema.additionalProperties).toBe(false)
  expect(String(options.body)).not.toContain('test-key')
})
it('без ключа не вызывает API', async () => {
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  expect(await interpretQuery('отделы', { ...config, apiKey: '' }, new AbortController().signal)).toEqual({ mode: 'text', reason: 'unconfigured' })
  expect(fetch).not.toHaveBeenCalled()
})
it.each([
  ['дополнительное поле', { filter: { ...filter, code: 'eval(1)' } }],
  ['обратный диапазон', { filter: { ...filter, budget: { min: { value: 10, inclusive: true }, max: { value: 1, inclusive: true } } } }],
  ['эффективность вне диапазона', { filter: { ...filter, performance: { min: { value: 101, inclusive: true }, max: null } } }],
  ['строковое число', { filter: { ...filter, level: '2' } }],
])('отклоняет ответ: %s', async (_name, value) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(model(value)))
  expect(await run()).toEqual({ mode: 'text', reason: 'invalid' })
})
it('неподдерживаемый запрос переходит в текстовый поиск', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(model({ filter: null })))
  expect(await run()).toEqual({ mode: 'text', reason: 'unsupported' })
})
it.each([401, 429, 500])('ошибка провайдера %s не раскрывает его ответ', async status => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('sensitive provider body', { status })))
  expect(await run()).toEqual({ mode: 'text', reason: 'unavailable' })
})
it('таймаут отменяет запрос', async () => {
  let signal: AbortSignal | undefined
  vi.stubGlobal('fetch', vi.fn((_url, options: RequestInit) => new Promise((_resolve, reject) => {
    signal = options.signal!
    signal.addEventListener('abort', () => reject(signal?.reason), { once: true })
  })))
  expect(await run()).toEqual({ mode: 'text', reason: 'timeout' })
  expect(signal?.aborted).toBe(true)
})
it('незавершённый ответ и отказ модели не применяются', async () => {
  for (const value of [
    { status: 'incomplete', output: [] },
    { status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal' }] }] },
  ]) {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(value))))
    expect(await run()).toEqual({ mode: 'text', reason: 'invalid' })
  }
})
it('общая схема клиента проверяет ответ и пустые строгие диапазоны', () => {
  expect(searchResponseSchema.safeParse({ mode: 'ai', filter }).success).toBe(true)
  expect(searchResponseSchema.safeParse({ mode: 'ai', filter: { ...filter, level: -1 } }).success).toBe(false)
  expect(searchFilterSchema.safeParse({ ...filter, budget: { min: { value: 5, inclusive: false }, max: { value: 5, inclusive: true } } }).success).toBe(false)
})
