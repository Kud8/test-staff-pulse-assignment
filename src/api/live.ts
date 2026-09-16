import { liveMessageSchema, type LiveMessage } from '#shared/live'

export type LiveStatus = 'connecting' | 'online' | 'offline'

/** The subset of WebSocket this transport uses; a browser socket satisfies it. */
export type LiveSocket = {
  onopen: (() => void) | null
  onmessage: ((event: { data: string }) => void) | null
  onclose: (() => void) | null
  onerror: (() => void) | null
  close: () => void
}

type Options = {
  url: string
  onMessage: (message: LiveMessage) => void
  onStatus: (status: LiveStatus) => void
  createSocket?: (url: string) => LiveSocket
  random?: () => number
  silenceMs?: number
}

const BASE_DELAY_MS = 500
const MAX_DELAY_MS = 10_000
/** Longer than any gap the server allows between heartbeats. */
const SILENCE_MS = 12_000

function parse(raw: string): unknown {
  try { return JSON.parse(raw) } catch { return null }
}

export function connectLive({
  url, onMessage, onStatus,
  createSocket = target => new WebSocket(target) as unknown as LiveSocket,
  random = Math.random,
  silenceMs = SILENCE_MS,
}: Options) {
  let socket: LiveSocket | null = null
  let retry: ReturnType<typeof setTimeout> | null = null
  let watchdog: ReturnType<typeof setTimeout> | null = null
  let attempt = 0
  let stopped = false

  const stopWatchdog = () => {
    if (watchdog) clearTimeout(watchdog)
    watchdog = null
  }

  const open = () => {
    onStatus('connecting')
    const current = createSocket(url)
    socket = current
    // A stream can die without closing the socket: then only silence gives it away.
    const armWatchdog = () => {
      stopWatchdog()
      watchdog = setTimeout(() => current.close(), silenceMs)
    }
    current.onopen = () => { attempt = 0; armWatchdog(); onStatus('online') }
    current.onmessage = event => {
      armWatchdog()
      // A malformed or hostile message is dropped; the stream keeps running.
      const message = liveMessageSchema.safeParse(parse(event.data))
      if (message.success) onMessage(message.data)
    }
    current.onerror = () => current.close()
    current.onclose = () => {
      stopWatchdog()
      if (stopped) return
      onStatus('offline')
      // Exponential backoff with a cap and jitter, so many clients do not retry in lockstep.
      const delay = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** attempt) * (0.75 + random() * 0.5)
      attempt++
      retry = setTimeout(open, delay)
    }
  }

  open()
  return () => {
    stopped = true
    if (retry) clearTimeout(retry)
    stopWatchdog()
    socket?.close()
  }
}
