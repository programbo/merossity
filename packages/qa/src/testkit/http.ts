export const fetchText = async (url: string, init?: RequestInit) => {
  const response = await fetch(url, init)
  const text = await response.text()
  return { response, text }
}

export const fetchJson = async <TResult>(url: string, init?: RequestInit) => {
  const response = await fetch(url, init)
  const text = await response.text()
  let json: TResult | undefined = undefined
  try {
    json = JSON.parse(text) as TResult
  } catch {
    json = undefined
  }
  return { json, response, text }
}

export const expectStatus = (response: Response, expected: number | number[]) => {
  const expectedList: number[] = []
  if (Array.isArray(expected)) {
    expectedList.push(...expected)
  } else {
    expectedList.push(expected)
  }
  if (!expectedList.includes(response.status)) {
    throw new Error(`Expected status ${expectedList.join(', ')}, got ${response.status}`)
  }
}

export const timedFetch = async (url: string, init?: RequestInit) => {
  const start = performance.now()
  const response = await fetch(url, init)
  const elapsedMs = performance.now() - start
  return { elapsedMs, response }
}
