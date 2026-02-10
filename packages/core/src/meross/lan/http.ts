import type { MerossLanMessage } from './message'

export class MerossLanHttpError extends Error {
  override name = 'MerossLanHttpError'
}

export type PostConfigOptions = {
  timeoutMs?: number
  fetch?: typeof fetch
  // Allow passing a full URL for testing or non-standard device setups.
  url?: string
}

export const postConfig = async <TResponse = unknown>(
  host: string,
  message: MerossLanMessage,
  options: PostConfigOptions = {},
): Promise<TResponse> => {
  const url = options.url ?? `http://${host}/config`
  const timeoutMs = options.timeoutMs ?? 5000
  const f = options.fetch ?? fetch

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await f(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(message),
      signal: controller.signal,
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new MerossLanHttpError(`POST /config failed: ${res.status} ${res.statusText}${text ? `: ${text}` : ''}`)
    }

    return (await res.json()) as TResponse
  } finally {
    clearTimeout(timeout)
  }
}

