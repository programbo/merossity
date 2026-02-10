export type ApiOk<T> = { ok: true; data: T }
export type ApiErr = { ok: false; error: { message: string; code?: string; details?: unknown } }
export type ApiResult<T> = ApiOk<T> | ApiErr

export class ApiError extends Error {
  override name = 'ApiError'
  constructor(
    message: string,
    public code?: string,
    public details?: unknown,
    public status?: number,
  ) {
    super(message)
  }
}

const parseJson = async <T>(res: Response): Promise<T | null> => {
  const text = await res.text().catch(() => '')
  if (!text) return null
  try {
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

export const apiGet = async <T>(path: string): Promise<T> => {
  const res = await fetch(path, { headers: { accept: 'application/json' } })
  const json = await parseJson<ApiResult<T>>(res)
  if (!res.ok) {
    const msg = json && !json.ok ? json.error.message : `${res.status} ${res.statusText}`
    const code = json && !json.ok ? json.error.code : undefined
    const details = json && !json.ok ? json.error.details : undefined
    throw new ApiError(msg, code, details, res.status)
  }
  if (!json) throw new ApiError('Invalid JSON response', 'invalid_json', undefined, res.status)
  if (!json.ok) throw new ApiError(json.error.message, json.error.code, json.error.details, res.status)
  return json.data
}

export const apiPost = async <T>(path: string, body?: unknown): Promise<T> => {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: body === undefined ? '{}' : JSON.stringify(body),
  })
  const json = await parseJson<ApiResult<T>>(res)
  if (!res.ok) {
    const msg = json && !json.ok ? json.error.message : `${res.status} ${res.statusText}`
    const code = json && !json.ok ? json.error.code : undefined
    const details = json && !json.ok ? json.error.details : undefined
    throw new ApiError(msg, code, details, res.status)
  }
  if (!json) throw new ApiError('Invalid JSON response', 'invalid_json', undefined, res.status)
  if (!json.ok) throw new ApiError(json.error.message, json.error.code, json.error.details, res.status)
  return json.data
}
