export interface PollOptions {
  description?: string
  intervalMs?: number
  timeoutMs?: number
}

const DEFAULT_INTERVAL_MS = 100
const DEFAULT_TIMEOUT_MS = 5000

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const isReady = (value: unknown) => value !== false && value !== undefined && value !== null

const formatLastError = (lastError: unknown) => {
  if (lastError instanceof Error) {
    return ` Last error: ${lastError.message}`
  }
  return ''
}

export const pollUntil = async <TResult>(
  fn: () => Promise<TResult> | TResult,
  { description = 'condition', intervalMs = DEFAULT_INTERVAL_MS, timeoutMs = DEFAULT_TIMEOUT_MS }: PollOptions = {},
): Promise<TResult> => {
  const start = Date.now()
  let lastError: unknown = undefined

  const poll = async (): Promise<TResult> => {
    try {
      const result = await fn()
      if (isReady(result)) {
        return result
      }
    } catch (error) {
      lastError = error
    }

    if (Date.now() - start >= timeoutMs) {
      const errorSuffix = formatLastError(lastError)
      throw new Error(`Timed out after ${timeoutMs}ms waiting for ${description}.${errorSuffix}`)
    }

    await sleep(intervalMs)
    return await poll()
  }

  return await poll()
}
