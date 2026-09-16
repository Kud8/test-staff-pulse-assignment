import { z } from 'zod'
import { orgNodeSchema } from '#shared/org'

const { id, headcount, budget, performance, updatedAt } = orgNodeSchema.shape
const session = z.string().min(1)
const version = z.number().int().positive()

/** Sent right after the socket opens: lets the client compare its snapshot with the live stream. */
export const helloMessageSchema = z.object({ type: z.literal('hello'), session, version })

/** Heartbeat: proves the stream is still alive and carries the version the server is at. */
export const pingMessageSchema = z.object({ type: z.literal('ping'), session, version })

/** Values of an existing node only: adding, removing and moving nodes are out of scope. */
export const patchMessageSchema = z.object({
  type: z.literal('patch'),
  session,
  version,
  id,
  changes: z.object({ headcount: headcount.optional(), budget: budget.optional(), performance: performance.optional() })
    .refine(changes => Object.keys(changes).length > 0, { message: 'Патч без изменений' }),
  updatedAt,
})

export const liveMessageSchema = z.discriminatedUnion('type', [helloMessageSchema, pingMessageSchema, patchMessageSchema])

export type HelloMessage = z.infer<typeof helloMessageSchema>
export type PingMessage = z.infer<typeof pingMessageSchema>
export type OrgPatch = z.infer<typeof patchMessageSchema>
export type LiveMessage = z.infer<typeof liveMessageSchema>
