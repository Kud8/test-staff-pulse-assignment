import type { IncomingMessage, ServerResponse } from 'node:http'
import { searchRequestSchema } from '#shared/search'
import { interpretQuery } from '#server/ai'
import type { AiConfig } from '#server/config'

export function createSearchHandler(config: AiConfig) {
  let active: AbortController | null = null
  return {
    async handle(request: IncomingMessage, response: ServerResponse) {
      if (request.method !== 'POST') {
        response.setHeader('Allow', 'POST')
        response.writeHead(405).end(JSON.stringify({ message: 'Метод не поддерживается' }))
        return
      }
      if (active) { response.writeHead(429).end(JSON.stringify({ mode: 'text', reason: 'busy' })); return }
      const controller = new AbortController()
      active = controller
      const cancel = () => { if (!response.writableEnded) controller.abort() }
      response.on('close', cancel)
      try {
        const chunks: Buffer[] = []
        let size = 0
        for await (const chunk of request) {
          const bytes = Buffer.from(chunk as Uint8Array)
          size += bytes.length
          if (size > 4096) { response.writeHead(413).end(JSON.stringify({ message: 'Запрос слишком длинный' })); return }
          chunks.push(bytes)
        }
        const parsed = searchRequestSchema.safeParse(JSON.parse(Buffer.concat(chunks).toString('utf8')))
        if (!parsed.success) { response.writeHead(400).end(JSON.stringify({ message: 'Введите запрос от 1 до 500 символов' })); return }
        const result = await interpretQuery(parsed.data.query, config, controller.signal)
        if (!controller.signal.aborted) response.end(JSON.stringify(result))
      } catch {
        if (!controller.signal.aborted) response.writeHead(400).end(JSON.stringify({ message: 'Некорректный JSON' }))
      } finally {
        response.off('close', cancel)
        if (active === controller) active = null
      }
    },
    close() { active?.abort() },
  }
}
