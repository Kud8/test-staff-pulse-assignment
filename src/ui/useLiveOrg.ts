import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createLiveSync } from '#src/api/sync'
import { connectLive, type LiveStatus } from '#src/api/live'
import { orgQueryOptions } from '#src/api/query'
import type { LiveField, TouchedFields } from '#src/model/live'

export const HIGHLIGHT_MS = 1500

/** Токен на каждую ячейку: он гасит подсветку по таймеру и перезапускает её при повторном изменении. */
export type Highlights = Map<string, Map<LiveField, number>>
/** Дерево подсвечивает собственные значения узла, таблица — суммы по поддереву. */
export type LiveHighlights = { own: Highlights; aggregates: Highlights }

const noHighlights: LiveHighlights = { own: new Map(), aggregates: new Map() }

function merge(highlights: Highlights, touched: TouchedFields, token: number): Highlights {
  if (!touched.size) return highlights
  const next = new Map(highlights)
  for (const [id, fields] of touched) {
    // Поля живут по отдельности: изменение бюджета не должно гасить подсветку численности.
    const cells = new Map(next.get(id))
    for (const field of fields) cells.set(field, token)
    next.set(id, cells)
  }
  return next
}

function without(highlights: Highlights, token: number): Highlights {
  let removed = false
  const next = new Map<string, Map<LiveField, number>>()
  for (const [id, cells] of highlights) {
    const kept = new Map([...cells].filter(([, value]) => value !== token))
    if (kept.size !== cells.size) removed = true
    if (kept.size) next.set(id, kept)
  }
  return removed ? next : highlights
}

const liveUrl = () => {
  const url = new URL('/api/live', globalThis.location.href)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

export function useLiveOrg() {
  const query = useQuery(orgQueryOptions)
  const queryClient = useQueryClient()
  const [highlights, setHighlights] = useState<LiveHighlights>(noHighlights)
  const [status, setStatus] = useState<LiveStatus>('connecting')
  const tokens = useRef(0)
  const connected = query.data !== undefined

  useEffect(() => {
    if (!connected) return
    const timers = new Set<ReturnType<typeof setTimeout>>()
    const sync = createLiveSync(queryClient, touched => {
      if (!touched.own.size && !touched.aggregates.size) return
      const token = ++tokens.current
      setHighlights(previous => ({
        own: merge(previous.own, touched.own, token),
        aggregates: merge(previous.aggregates, touched.aggregates, token),
      }))
      const timer = setTimeout(() => {
        timers.delete(timer)
        setHighlights(previous => {
          const own = without(previous.own, token)
          const aggregates = without(previous.aggregates, token)
          return own === previous.own && aggregates === previous.aggregates ? previous : { own, aggregates }
        })
      }, HIGHLIGHT_MS)
      timers.add(timer)
    })
    const stop = connectLive({ url: liveUrl(), onStatus: setStatus, onMessage: sync.onMessage })
    return () => {
      stop()
      sync.dispose()
      for (const timer of timers) clearTimeout(timer)
    }
  }, [connected, queryClient])

  return { query, snapshot: query.data?.snapshot ?? null, highlights, status }
}
