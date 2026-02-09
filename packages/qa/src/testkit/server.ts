import { createConnection, createServer } from 'node:net'
import { spawnProcess, type SpawnedProcess } from './process'
import { pollUntil } from './time'

const PORT_DYNAMIC = 0
const DEFAULT_WAIT_FOR_PORT_INTERVAL_MS = 100
const DEFAULT_WAIT_FOR_PORT_TIMEOUT_MS = 5000
const DEFAULT_WAIT_FOR_URL_INTERVAL_MS = 200
const DEFAULT_WAIT_FOR_URL_TIMEOUT_MS = 8000

export interface WaitForPortOptions {
  host?: string
  intervalMs?: number
  timeoutMs?: number
}

export const getFreePort = async (host = '127.0.0.1') => {
  const server = createServer()
  await new Promise<void>((resolve) => server.listen(PORT_DYNAMIC, host, resolve))
  const address = server.address()
  if (!address || typeof address === 'string') {
    server.close()
    throw new Error('Unable to resolve free port.')
  }
  const { port } = address
  await new Promise<void>((resolve) => server.close(() => resolve()))
  return port
}

export const waitForPort = async (
  port: number,
  {
    host = '127.0.0.1',
    intervalMs = DEFAULT_WAIT_FOR_PORT_INTERVAL_MS,
    timeoutMs = DEFAULT_WAIT_FOR_PORT_TIMEOUT_MS,
  }: WaitForPortOptions = {},
) =>
  await pollUntil(
    async () =>
      await new Promise<boolean>((resolve) => {
        const socket = createConnection({ host, port }, () => {
          socket.end()
          resolve(true)
        })
        socket.on('error', () => resolve(false))
      }),
    { description: `port ${port}`, intervalMs, timeoutMs },
  )

export const waitForUrl = async (
  url: string,
  {
    intervalMs = DEFAULT_WAIT_FOR_URL_INTERVAL_MS,
    timeoutMs = DEFAULT_WAIT_FOR_URL_TIMEOUT_MS,
  }: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<Response> =>
  await pollUntil(
    async () => {
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}.`)
      }
      return response
    },
    { description: `url ${url}`, intervalMs, timeoutMs },
  )

export interface StartServerOptions {
  command: string
  args?: string[]
  cwd?: string
  env?: Record<string, string | undefined>
  host?: string
  port?: number
  readyPath?: string
  readyUrl?: string
  readyTimeoutMs?: number
  stdout?: 'pipe' | 'inherit' | 'ignore'
  stderr?: 'pipe' | 'inherit' | 'ignore'
}

export interface RunningServer {
  proc: SpawnedProcess
  host: string
  port: number
  baseUrl: string
  readyUrl: string
  ready: Promise<Response>
  stop: () => Promise<void>
}

export const startServer = async (options: StartServerOptions): Promise<RunningServer> => {
  const host = options.host ?? '127.0.0.1'
  const port = options.port ?? (await getFreePort(host))
  const readyPath = options.readyPath ?? '/'
  const baseUrl = `http://${host}:${port}`
  const readyUrl = options.readyUrl ?? `${baseUrl}${readyPath}`
  const env = { ...process.env, ...options.env, PORT: String(port) }

  const proc = spawnProcess(options.command, options.args ?? [], {
    cwd: options.cwd,
    env,
    stderr: options.stderr,
    stdout: options.stdout,
  })

  const ready = waitForUrl(readyUrl, { timeoutMs: options.readyTimeoutMs })

  const stop = async () => {
    proc.kill('SIGTERM')
    await proc.waitForExit()
  }

  return { baseUrl, host, port, proc, ready, readyUrl, stop }
}

export const withServer = async <TResult>(
  options: StartServerOptions,
  fn: (server: RunningServer) => Promise<TResult>,
) => {
  const server = await startServer(options)
  try {
    await server.ready
    return await fn(server)
  } finally {
    await server.stop()
  }
}
