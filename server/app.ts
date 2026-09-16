import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { WebSocketServer } from 'ws'
import { createSeed } from '#server/data'
import { applyPatchToNodes, nextPatch } from '#server/live'
import type { OrgNode } from '#shared/org'

export type OrgServerOptions = { port?: number; host?: string; patchIntervalMs?: number; heartbeatMs?: number }

export async function createOrgServer({ port = 3001, host = '127.0.0.1', patchIntervalMs = 2000, heartbeatMs = 5000 }: OrgServerOptions = {}) {
  // A fresh session per start: after a restart clients must not trust their old version numbers.
  const session = randomUUID()
  let nodes: OrgNode[] = createSeed()
  let version = 1

  const http = createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json; charset=utf-8')
    response.setHeader('Cache-Control', 'no-store')
    if (request.url?.split('?')[0] !== '/api/org-tree') {
      response.writeHead(404).end(JSON.stringify({ message: 'Маршрут не найден' }))
    } else if (request.method !== 'GET') {
      response.setHeader('Allow', 'GET')
      response.writeHead(405).end(JSON.stringify({ message: 'Метод не поддерживается' }))
    } else {
      // The body stays a flat array; the snapshot version travels in headers.
      response.setHeader('X-Org-Session', session)
      response.setHeader('X-Org-Version', String(version))
      response.end(JSON.stringify(nodes))
    }
  })

  const live = new WebSocketServer({ noServer: true })
  const broadcast = (message: object) => {
    const text = JSON.stringify(message)
    for (const client of live.clients) if (client.readyState === client.OPEN) client.send(text)
  }
  http.on('upgrade', (request, socket, head) => {
    if (request.url?.split('?')[0] !== '/api/live') { socket.destroy(); return }
    live.handleUpgrade(request, socket, head, client => {
      client.send(JSON.stringify({ type: 'hello', session, version }))
      live.emit('connection', client, request)
    })
  })

  const patches = patchIntervalMs > 0 ? setInterval(() => {
    const patch = nextPatch(nodes, version, session, Math.random)
    nodes = applyPatchToNodes(nodes, patch)
    version = patch.version
    broadcast(patch)
  }, patchIntervalMs) : null
  patches?.unref()

  // Silence is indistinguishable from a dead stream, so an idle server keeps saying its version.
  const heartbeat = heartbeatMs > 0 ? setInterval(() => broadcast({ type: 'ping', session, version }), heartbeatMs) : null
  heartbeat?.unref()

  await new Promise<void>(resolve => http.listen(port, host, resolve))
  const address = http.address()
  return {
    session,
    port: typeof address === 'object' && address !== null ? address.port : port,
    close: () => new Promise<void>(resolve => {
      if (patches) clearInterval(patches)
      if (heartbeat) clearInterval(heartbeat)
      for (const client of live.clients) client.terminate()
      live.close(() => {
        // Keep-alive connections would hold the server open long after the last request.
        http.closeAllConnections()
        http.close(() => resolve())
      })
    }),
  }
}
