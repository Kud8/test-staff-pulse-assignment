import { orgTreeSchema } from '#shared/org'

function rethrowIfAborted(error: unknown, signal: AbortSignal) {
  signal.throwIfAborted()
  if (error instanceof Error && error.name === 'AbortError') throw error
}

export async function fetchOrgTree(signal: AbortSignal) {
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
  return result.data
}
