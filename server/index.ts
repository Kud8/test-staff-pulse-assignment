import { createServer } from 'node:http'
import { createSeed } from '#server/data'

const data = createSeed()
const port = Number(process.env.PORT ?? 3001)
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Некорректный PORT')
const server = createServer((request, response) => {
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  if (request.url?.split('?')[0] !== '/api/org-tree') {
    response.writeHead(404).end(JSON.stringify({ message: 'Маршрут не найден' }))
  } else if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    response.writeHead(405).end(JSON.stringify({ message: 'Метод не поддерживается' }))
  } else {
    response.end(JSON.stringify(data))
  }
})
server.listen(port, '127.0.0.1', () => console.log(`Staff Pulse API: http://127.0.0.1:${port}`))
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => server.close())
