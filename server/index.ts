import { createOrgServer } from '#server/app'
import { readConfig } from '#server/config'

const config = readConfig()
const { patchIntervalMs } = config
const server = await createOrgServer(config)
console.log(`Staff Pulse API: http://127.0.0.1:${server.port}/api/org-tree`)
console.log(patchIntervalMs > 0 ? `Живые обновления: ws://127.0.0.1:${server.port}/api/live, патч каждые ${patchIntervalMs} мс` : 'Живые обновления отключены')

// Without the explicit exit a replaced instance keeps serving its open sockets and feeds clients a stale session.
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
  process.on(signal, () => void server.close().then(() => process.exit(0)))
}
