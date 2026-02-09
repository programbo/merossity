import { mkdir, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { connect, createServer, type Server } from 'node:net'
import * as path from 'node:path'
import { serve } from 'bun'

const DEFAULT_PORT = 3000
const MAX_PORT = 65_535

const parsePort = (value: string | undefined, label: string) => {
  if (!value) return undefined
  const port = Number(value)
  if (!Number.isInteger(port) || port <= 0 || port > MAX_PORT) {
    console.warn(`⚠️ Ignoring invalid ${label}: ${value}`)
    return undefined
  }
  return port
}

const isAddressInUse = (error: unknown) => {
  if (!error || typeof error !== 'object') return false
  if ('code' in error && error.code === 'EADDRINUSE') return true
  if ('message' in error && typeof error.message === 'string') {
    return error.message.includes('EADDRINUSE')
  }
  return false
}

const resolveBasePort = (explicit?: number) => {
  if (explicit) return explicit
  return parsePort(process.env.PORT, 'PORT') ?? DEFAULT_PORT + (parsePort(process.env.PORT_OFFSET, 'PORT_OFFSET') ?? 0)
}

const toSafeId = (value: string) =>
  value
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

const resolveServerInfo = async () => {
  try {
    const pkgPath = path.resolve(process.cwd(), 'package.json')
    const contents = await Bun.file(pkgPath).text()
    const pkg = JSON.parse(contents) as { name?: string }
    const name = pkg.name ?? path.basename(process.cwd())
    const shortName = name.split('/').pop() ?? name
    const safeName = toSafeId(name)
    const hash = createHash('sha1').update(process.cwd()).digest('hex').slice(0, 6)
    return { id: `${safeName}-${hash}`, name, shortName: toSafeId(shortName) }
  } catch {
    const name = path.basename(process.cwd())
    const shortName = name.split('/').pop() ?? name
    const safeName = toSafeId(name)
    const hash = createHash('sha1').update(process.cwd()).digest('hex').slice(0, 6)
    return { id: `${safeName}-${hash}`, name, shortName: toSafeId(shortName) }
  }
}

const resolveProjectRoot = async () => {
  let current = process.cwd()
  while (true) {
    const pkgPath = path.join(current, 'package.json')
    if (existsSync(pkgPath)) {
      try {
        const contents = await Bun.file(pkgPath).text()
        const pkg = JSON.parse(contents) as { workspaces?: unknown }
        if (pkg.workspaces) return current
      } catch {
        // ignore
      }
    }

    const parent = path.dirname(current)
    if (parent === current) return process.cwd()
    current = parent
  }
}

const createControlPaths = async (root: string, shortName: string, port: number, controlSocket?: string) => {
  if (controlSocket) {
    const resolved = path.isAbsolute(controlSocket) ? controlSocket : path.resolve(root, controlSocket)
    return { controlDir: path.dirname(resolved), controlSocket: resolved }
  }

  const filename = `.${shortName}-${port}.sock`
  return { controlDir: root, controlSocket: path.join(root, filename) }
}

type RunningServer = {
  id: string
  name: string
  port?: number
  url?: string
  socket: string
}

const sendControlCommand = async (socketPath: string, message: string) => {
  return await new Promise<false | string>((resolve) => {
    const client = connect(socketPath, () => {
      client.write(message)
    })
    const timeout = setTimeout(() => {
      client.destroy()
      resolve(false)
    }, 1000)
    client.on('data', (data) => {
      clearTimeout(timeout)
      resolve(data.toString().trim())
      client.end()
    })
    client.on('error', () => {
      clearTimeout(timeout)
      resolve(false)
    })
  })
}

const resolveRunningServer = async (socketPath: string): Promise<RunningServer | null> => {
  if (!existsSync(socketPath)) return null
  const response = await sendControlCommand(socketPath, 'info')
  if (!response) return null
  try {
    const info = JSON.parse(response) as { id: string; name: string; port?: number; url?: string }
    if (typeof info.port === 'number') {
      return { ...info, socket: socketPath }
    }
  } catch {
    // ignore
  }
  return null
}

const startServerWithAwareness = async (
  config: Parameters<typeof serve>[0],
  startPort: number,
  currentName: string,
  shortName: string,
  root: string,
  allowRestartExisting: boolean,
  controlSocketOverride?: string,
) => {
  let port = startPort
  let replacedExisting = false
  while (port <= MAX_PORT) {
    const { controlSocket } = await createControlPaths(root, shortName, port, controlSocketOverride)
    const known = await resolveRunningServer(controlSocket)
    if (known) {
      const isSame = known.name === currentName
      const label = isSame ? '🟢' : '🔵'
      console.log(`${label} Existing "${known.name}" server detected on port ${port}.`)
      if (allowRestartExisting && isSame) {
        const stopAck = await sendControlCommand(known.socket, 'stop')
        if (stopAck && stopAck.startsWith('ok')) {
          replacedExisting = true
        } else {
          console.log(`⚠️ Replace failed: ${stopAck ?? 'unknown error'}`)
        }
      }
    }

    try {
      const started = serve({ ...config, port } as Bun.Serve.Options<undefined>)
      return { server: started, replacedExisting, controlSocket }
    } catch (error) {
      if (isAddressInUse(error)) {
        if (!known) {
          console.log(`⚫ Existing server detected on port ${port}.`)
        }
        port += 1
        continue
      }
      throw error
    }
  }
  throw new Error(`No available port found starting from ${startPort}`)
}

const runHealthCheck = async (url: string, timeoutMs: number) => {
  const controller = new AbortController()
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<{ ok: false; timeout: true }>((resolve) => {
    timeoutId = setTimeout(() => {
      controller.abort()
      resolve({ ok: false, timeout: true })
    }, timeoutMs)
  })

  const fetchPromise = (async () => {
    const response = await fetch(url, { signal: controller.signal })
    return { ok: response.ok, status: response.status }
  })().catch((error) => ({ ok: false, error }))

  const result = await Promise.race([fetchPromise, timeoutPromise])
  if (timeoutId) {
    clearTimeout(timeoutId)
  }
  return result
}

const logHealthCheck = async (
  serverName: string,
  url: string,
  labels: { starting: string; started: string; errorPrefix?: string } = {
    starting: `🚀 Starting "${serverName}" server at ${url}`,
    started: `✅ Started "${serverName}" server at ${url}`,
  },
) => {
  const starting = labels.starting
  const isTTY = Boolean(process.stdout.isTTY)
  if (!isTTY) {
    console.log(starting)
  }

  const result = await runHealthCheck(url, 2000)
  if (result.ok) {
    const message = labels.started
    if (isTTY) {
      process.stdout.write(`${message}\n`)
    } else {
      console.log(message)
    }
    return
  }

  let suffix = 'unknown error'
  if ('timeout' in result && result.timeout) {
    suffix = 'timeout'
  } else if ('status' in result && typeof result.status === 'number') {
    suffix = `status ${result.status}`
  } else if ('error' in result && result.error instanceof Error) {
    suffix = result.error.name === 'AbortError' ? 'timeout' : result.error.message
  }
  const message = labels.errorPrefix
    ? `${labels.errorPrefix} (${suffix})`
    : `⚠️ Health check failed for "${serverName}" at ${url} (${suffix})`
  if (isTTY) {
    process.stdout.write(`${message}\n`)
    return
  }
  console.log(message)
}

export const serveWithControl = async (
  config: Parameters<typeof serve>[0] & { port?: number },
  options?: { controlSocket?: string },
) => {
  const basePort = resolveBasePort(config.port)
  const root = await resolveProjectRoot()
  const { id: serverId, name: serverName, shortName } = await resolveServerInfo()
  let serverWithMeta = await startServerWithAwareness(
    config,
    basePort,
    serverName,
    shortName,
    root,
    true,
    options?.controlSocket,
  )
  let server = serverWithMeta.server
  let replacedExisting = serverWithMeta.replacedExisting
  let controlSocket = serverWithMeta.controlSocket
  let controlServer: Server | null = null
  let controlCleanup: (() => Promise<void>) | null = null

  const stopServer = () => {
    server.stop(true)
  }

  const shutdown = async () => {
    stopServer()
    if (controlCleanup) {
      await controlCleanup()
    }
    process.exit(0)
  }

  const restartServer = async () => {
    const preferredPort = server.port ?? basePort
    server.stop(true)
    serverWithMeta = await startServerWithAwareness(
      config,
      preferredPort,
      serverName,
      shortName,
      root,
      false,
      options?.controlSocket,
    )
    server = serverWithMeta.server
    replacedExisting = serverWithMeta.replacedExisting
    if (serverWithMeta.controlSocket !== controlSocket) {
      await relistenControlServer(serverWithMeta.controlSocket)
    }
    await logHealthCheck(serverName, server.url.toString(), {
      starting: `🔁 Restarting "${serverName}" server at ${server.url}`,
      started: `✅ Restarted "${serverName}" server at ${server.url}`,
      errorPrefix: `⚠️ Restart failed for "${serverName}" at ${server.url}`,
    })
  }

  // key controls removed

  const listenControlServer = async (socketPath: string) => {
    await mkdir(path.dirname(socketPath), { recursive: true })
    if (existsSync(socketPath)) {
      const existing = await sendControlCommand(socketPath, 'info')
      if (!existing) {
        await rm(socketPath, { force: true })
      }
    }
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        controlServer?.off('error', onError)
        reject(error)
      }
      controlServer?.once('error', onError)
      controlServer?.listen(socketPath, () => {
        controlServer?.off('error', onError)
        resolve()
      })
    })
  }

  const relistenControlServer = async (socketPath: string) => {
    if (!controlServer || controlSocket === socketPath) return
    const previousSocket = controlSocket
    await new Promise<void>((resolve) => controlServer?.close(() => resolve()))
    if (existsSync(previousSocket)) {
      await rm(previousSocket, { force: true })
    }
    controlSocket = socketPath
    await listenControlServer(controlSocket)
  }

  controlServer = createServer((socket) => {
    socket.on('data', (data) => {
      try {
        const message = data.toString().trim()
        if (message === 'restart') {
          void restartServer()
          socket.end(`ok:${server.url}`)
          return
        }
        if (message === 'stop') {
          socket.end('ok')
          void shutdown()
          return
        }
        if (message === 'info') {
          socket.end(JSON.stringify({ id: serverId, name: serverName, port: server.port, url: server.url }))
          return
        }
        socket.end('error:unknown-command')
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        socket.end(`error:${message}`)
      }
    })
  })
  await listenControlServer(controlSocket)

  const cleanup = async () => {
    await new Promise<void>((resolve) => controlServer?.close(() => resolve()))
    if (existsSync(controlSocket)) {
      await rm(controlSocket, { force: true })
    }
  }
  controlCleanup = cleanup

  process.on('SIGINT', () => void shutdown())
  process.on('SIGTERM', () => void shutdown())

  if (!replacedExisting) {
    await logHealthCheck(serverName, server.url.toString())
  } else {
    await logHealthCheck(serverName, server.url.toString(), {
      starting: `🔁 Restarting "${serverName}" server at ${server.url}`,
      started: `✅ Restarted "${serverName}" server at ${server.url}`,
      errorPrefix: `⚠️ Restart failed for "${serverName}" at ${server.url}`,
    })
  }
  // key controls removed

  return server
}
