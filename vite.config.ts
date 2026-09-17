import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: { alias: {
    '#src': fileURLToPath(new URL('./src', import.meta.url)),
    '#shared': fileURLToPath(new URL('./shared', import.meta.url)),
    '#server': fileURLToPath(new URL('./server', import.meta.url)),
  } },
  server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy: { '/api': { target: `http://127.0.0.1:${process.env.PORT ?? loadEnv(mode, process.cwd(), 'PORT').PORT ?? 3001}`, ws: true } } },
  test: { environment: 'node' },
}))
