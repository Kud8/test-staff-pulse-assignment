import { createServer, type ServerResponse } from 'node:http'
import { afterEach, expect, it } from 'vitest'
import { createOrgServer } from '#server/app'
import { readConfig } from '#server/config'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { for (const close of cleanups.splice(0).reverse()) await close() })
async function setup(withProvider = false) {
  let release: (() => void) | undefined
  const bodies: unknown[] = []
  const filter = { name: null, level: 2, headcount: null, budget: null, performance: null }
  const reply = (response: ServerResponse) => response.end(JSON.stringify({ status: 'completed', output: [
    { type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ filter }) }] },
  ] }))
  let paused = false
  const upstream = createServer(async (request, response) => {
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(Buffer.from(chunk as Uint8Array))
    bodies.push(JSON.parse(Buffer.concat(chunks).toString()))
    if (paused) release = () => reply(response)
    else reply(response)
  })
  await new Promise<void>(resolve => upstream.listen(0, '127.0.0.1', resolve))
  cleanups.push(() => new Promise<void>(resolve => { upstream.closeAllConnections(); upstream.close(() => resolve()) }))
  const address = upstream.address()
  const providerPort = typeof address === 'object' && address ? address.port : 0
  const app = await createOrgServer({ port: 0, patchIntervalMs: 0, heartbeatMs: 0,
    ai: { ...readConfig({}).ai, apiKey: withProvider ? 'fixture-key' : '', baseUrl: `http://127.0.0.1:${providerPort}/v1` } })
  cleanups.push(app.close)
  const url = `http://127.0.0.1:${app.port}/api/search`
  const post = (body: unknown) => fetch(url, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } })
  return { url, post, bodies, filter, pause: () => { paused = true }, release: () => release?.() }
}
it('POST → реальный HTTP-адаптер → проверенный фильтр, только запрос уходит провайдеру', async () => {
  const { post, bodies, filter } = await setup(true)
  const response = await post({ query: 'Отделы' })
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ mode: 'ai', filter })
  expect(bodies[0]).toMatchObject({ input: 'Отделы', store: false })
  expect(JSON.stringify(bodies[0])).not.toContain('Цифровые продукты')
})
it('отсутствие ключа возвращает явный fallback', async () => {
  const { post, bodies } = await setup()
  expect(await (await post({ query: 'Продажи' })).json()).toEqual({ mode: 'text', reason: 'unconfigured' })
  expect(bodies).toHaveLength(0)
})
it('отклоняет пустой, длинный и невалидный запрос до LLM', async () => {
  const { post, url, bodies } = await setup(true)
  for (const body of [{ query: '' }, { query: 'x'.repeat(501) }, { query: 10 }, { query: 'ok', extra: true }]) {
    expect((await post(body)).status).toBe(400)
  }
  expect((await fetch(url, { method: 'POST', body: '{broken' })).status).toBe(400)
  expect((await post({ query: 'x'.repeat(5000) })).status).toBe(413)
  expect(bodies).toHaveLength(0)
})
it('не отправляет повторный одновременный запрос провайдеру', async () => {
  const { post, bodies, pause, release } = await setup(true)
  pause()
  const first = post({ query: 'Отделы' })
  // Дожидаемся реального HTTP-запроса, не фиксированного времени сети.
  await expect.poll(() => bodies.length).toBe(1)
  const second = await post({ query: 'Отделы' })
  expect(second.status).toBe(429)
  expect(await second.json()).toEqual({ mode: 'text', reason: 'busy' })
  release()
  expect((await first).status).toBe(200)
  expect(bodies).toHaveLength(1)
})
