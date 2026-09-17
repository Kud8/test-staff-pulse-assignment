import { z } from 'zod'

const integer = (fallback: number, min: number, max: number) => z.coerce.number().int().min(min).max(max).default(fallback)
const schema = z.object({
  PORT: integer(3001, 1, 65535), HOST: z.string().min(1).default('127.0.0.1'),
  LIVE_INTERVAL_MS: integer(2000, 0, 2_147_483_647),
  LIVE_HEARTBEAT_MS: integer(5000, 0, 2_147_483_647),
  AI_PROVIDER: z.enum(['openai', 'openai-compatible']).default('openai'),
  AI_MODEL: z.string().min(1).default('gpt-4.1-mini-2025-04-14'),
  AI_API_KEY: z.string().default(''),
  AI_BASE_URL: z.url().refine(value => ['https:', 'http:'].includes(new URL(value).protocol)).default('https://api.openai.com/v1'),
  AI_TIMEOUT_MS: integer(12000, 100, 30000),
})
export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const result = schema.safeParse(env)
  if (!result.success) throw new Error(`Некорректная конфигурация: ${result.error.issues.map(issue => issue.path.join('.')).join(', ')}`)
  const value = result.data
  return {
    port: value.PORT, host: value.HOST, patchIntervalMs: value.LIVE_INTERVAL_MS, heartbeatMs: value.LIVE_HEARTBEAT_MS,
    ai: { provider: value.AI_PROVIDER, model: value.AI_MODEL, apiKey: value.AI_API_KEY,
      baseUrl: value.AI_BASE_URL, timeoutMs: value.AI_TIMEOUT_MS },
  }
}
export type AiConfig = ReturnType<typeof readConfig>['ai']
