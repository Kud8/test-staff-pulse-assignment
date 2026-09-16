import { orgTreeSchema, type OrgNode } from '#shared/org'

/** A snapshot is the flat array plus the stream coordinates it belongs to. */
export type OrgSnapshot = { nodes: OrgNode[]; session: string; version: number }

function rethrowIfAborted(error: unknown, signal: AbortSignal) {
  signal.throwIfAborted()
  if (error instanceof Error && error.name === 'AbortError') throw error
}

export async function fetchOrgTree(signal: AbortSignal): Promise<OrgSnapshot> {
  let response: Response
  try {
    response = await fetch('/api/org-tree', { signal })
  } catch (error) {
    rethrowIfAborted(error, signal)
    throw new Error('Не удалось связаться с сервером. Проверьте подключение и повторите попытку', { cause: error })
  }
  if (!response.ok) throw new Error(`Сервер вернул ошибку ${response.status}`)
  let body: unknown
  try {
    body = await response.json()
  } catch (error) {
    rethrowIfAborted(error, signal)
    throw new Error('Сервер вернул ответ в неверном формате. Ожидались данные JSON', { cause: error })
  }
  const result = orgTreeSchema.safeParse(body)
  if (!result.success) throw new Error('Сервер вернул некорректную структуру подразделений')
  // Without these the client cannot tell whether a live patch belongs to this snapshot.
  const session = response.headers.get('X-Org-Session')?.trim() ?? ''
  const version = Number(response.headers.get('X-Org-Version'))
  if (!session || !Number.isInteger(version) || version < 1) {
    throw new Error('Сервер не сообщил версию снимка. Обновите страницу позже')
  }
  return { nodes: result.data, session, version }
}
