import { createOrgServer } from '#server/app'

const positiveOrZero = (value: string | undefined, fallback: number, name: string) => {
  const parsed = Number(value ?? fallback)
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`Некорректный ${name}`)
  return parsed
}

const port = Number(process.env.PORT ?? 3001)
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Некорректный PORT')
const patchIntervalMs = positiveOrZero(process.env.LIVE_INTERVAL_MS, 2000, 'LIVE_INTERVAL_MS')
const heartbeatMs = positiveOrZero(process.env.LIVE_HEARTBEAT_MS, 5000, 'LIVE_HEARTBEAT_MS')

const server = await createOrgServer({ port, patchIntervalMs, heartbeatMs })
console.log(`Staff Pulse API: http://127.0.0.1:${server.port}/api/org-tree`)
console.log(patchIntervalMs > 0 ? `Живые обновления: ws://127.0.0.1:${server.port}/api/live, патч каждые ${patchIntervalMs} мс` : 'Живые обновления отключены')

// Without the explicit exit a replaced instance keeps serving its open sockets and feeds clients a stale session.
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
  process.on(signal, () => void server.close().then(() => process.exit(0)))
}
