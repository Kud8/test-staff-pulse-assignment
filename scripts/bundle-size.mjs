import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { gzipSync } from 'node:zlib'

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(entry => entry.isDirectory()
    ? files(join(directory, entry.name)) : [join(directory, entry.name)]))
  return nested.flat()
}
let total = 0
for (const file of (await files('dist')).filter(file => /\.(js|css)$/.test(file)).sort()) {
  const size = gzipSync(await readFile(file), { level: 6 }).length
  total += size
  console.log(`${relative('dist', file)}: ${size} bytes gzip`)
}
console.log(`Total JS + CSS: ${total} bytes (${(total / 1000).toFixed(2)} KB), limit: 200000 bytes`)
if (!total || total > 200_000) process.exitCode = 1
