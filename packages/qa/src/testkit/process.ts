import { pollUntil } from './time'

export type OutputMatcher = string | RegExp

const DEFAULT_OUTPUT_TIMEOUT_MS = 5000
const DEFAULT_QUIET_INTERVAL_MS = 200
const DEFAULT_QUIET_TIMEOUT_MS = 2000

export interface StreamCollector {
  done: Promise<void>
  text: () => string
  waitFor: (matcher: OutputMatcher, options?: { timeoutMs?: number }) => Promise<string>
}

export interface SpawnOptions {
  cwd?: string
  env?: Record<string, string | undefined>
  stdin?: 'pipe' | 'inherit' | 'ignore'
  stdout?: 'pipe' | 'inherit' | 'ignore'
  stderr?: 'pipe' | 'inherit' | 'ignore'
}

export interface SpawnedProcess {
  proc: Bun.Subprocess
  stdout: StreamCollector | undefined
  stderr: StreamCollector | undefined
  kill: (signal?: number | NodeJS.Signals) => void
  waitForExit: () => Promise<{ exitCode: number; stdout: string; stderr: string }>
}

const matchesOutput = (output: string, matcher: OutputMatcher) => {
  if (typeof matcher === 'string') {
    return output.includes(matcher)
  }
  return matcher.test(output)
}

interface Waiter {
  matcher: OutputMatcher
  resolve: (value: string) => void
  reject: (error: Error) => void
  timeoutId?: ReturnType<typeof setTimeout>
}

interface BufferRef {
  value: string
}

const createDoneSignal = () => {
  let resolveDone: (() => void) | undefined = undefined
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve
  })
  return { done, resolveDone }
}

const resolveWaiters = (waiters: Set<Waiter>, buffer: string) => {
  for (const waiter of waiters) {
    if (matchesOutput(buffer, waiter.matcher)) {
      if (waiter.timeoutId) {
        clearTimeout(waiter.timeoutId)
      }
      waiter.resolve(buffer)
      waiters.delete(waiter)
    }
  }
}

const rejectWaiters = (waiters: Set<Waiter>) => {
  for (const waiter of waiters) {
    if (waiter.timeoutId) {
      clearTimeout(waiter.timeoutId)
    }
    waiter.reject(new Error('Stream ended before output matched.'))
  }
  waiters.clear()
}

const startStreamPump = async (options: {
  stream: ReadableStream<Uint8Array>
  onChunk: (chunk: Uint8Array) => void
  onDone: () => void
}) => {
  try {
    for await (const chunk of options.stream) {
      options.onChunk(chunk)
    }
  } finally {
    options.onDone()
  }
}

const createWaitFor =
  (getBuffer: () => string, waiters: Set<Waiter>) =>
  async (matcher: OutputMatcher, options?: { timeoutMs?: number }) => {
    const current = getBuffer()
    if (matchesOutput(current, matcher)) {
      return current
    }

    let timeoutMs = DEFAULT_OUTPUT_TIMEOUT_MS
    if (options?.timeoutMs !== undefined) {
      ;({ timeoutMs } = options)
    }

    return await new Promise<string>((resolve, reject) => {
      const waiter: Waiter = { matcher, reject, resolve }
      waiter.timeoutId = setTimeout(() => {
        waiters.delete(waiter)
        reject(new Error(`Timed out after ${timeoutMs}ms waiting for output.`))
      }, timeoutMs)
      waiters.add(waiter)
    })
  }

const createStreamHandlers = (decoder: TextDecoder, bufferRef: BufferRef, resolveDone: (() => void) | undefined) => {
  const waiters = new Set<Waiter>()
  const waitFor = createWaitFor(() => bufferRef.value, waiters)
  const onChunk = (chunk: Uint8Array) => {
    bufferRef.value += decoder.decode(chunk, { stream: true })
    resolveWaiters(waiters, bufferRef.value)
  }
  const onDone = () => {
    bufferRef.value += decoder.decode()
    resolveDone?.()
    rejectWaiters(waiters)
  }

  return { onChunk, onDone, waitFor }
}

const createStreamCollector = (
  stream: ReadableStream<Uint8Array<ArrayBuffer>> | ReadableStream<Uint8Array<ArrayBufferLike>> | null | undefined,
): StreamCollector | undefined => {
  if (!stream) {
    return undefined
  }

  const decoder = new TextDecoder()
  const bufferRef: BufferRef = { value: '' }
  const { done, resolveDone } = createDoneSignal()
  const { onChunk, onDone, waitFor } = createStreamHandlers(decoder, bufferRef, resolveDone)

  void startStreamPump({ onChunk, onDone, stream: stream as ReadableStream<Uint8Array> })

  return {
    done,
    text: () => bufferRef.value,
    waitFor,
  }
}

export const spawnProcess = (command: string, args: string[] = [], options: SpawnOptions = {}): SpawnedProcess => {
  const proc = Bun.spawn([command, ...args], {
    cwd: options.cwd,
    env: options.env,
    stderr: options.stderr ?? 'pipe',
    stdin: options.stdin ?? 'ignore',
    stdout: options.stdout ?? 'pipe',
  })

  const stdout = createStreamCollector(proc.stdout)
  const stderr = createStreamCollector(proc.stderr)

  const waitForExit = async () => {
    const exitCode = await proc.exited
    await Promise.all([stdout?.done, stderr?.done])
    return { exitCode, stderr: stderr?.text() ?? '', stdout: stdout?.text() ?? '' }
  }

  const kill = (signal?: number | NodeJS.Signals) => {
    if (signal !== undefined) {
      proc.kill(signal)
    } else {
      proc.kill()
    }
  }

  return { kill, proc, stderr, stdout, waitForExit }
}

export const waitForOutput = async (
  collector: StreamCollector | undefined,
  matcher: OutputMatcher,
  timeoutMs = DEFAULT_OUTPUT_TIMEOUT_MS,
) => {
  if (!collector) {
    throw new Error('Output stream is not available (did you set stdout/stderr to "pipe"?)')
  }
  return await collector.waitFor(matcher, { timeoutMs })
}

export const expectOutput = async (
  collector: StreamCollector | undefined,
  matcher: OutputMatcher,
  timeoutMs = DEFAULT_OUTPUT_TIMEOUT_MS,
) => {
  const output = await waitForOutput(collector, matcher, timeoutMs)
  if (!matchesOutput(output, matcher)) {
    throw new Error('Expected output was not found.')
  }
  return output
}

export const waitForExit = async (proc: SpawnedProcess) => await proc.waitForExit()

export const waitForQuiet = async (
  collector: StreamCollector | undefined,
  quietMs = DEFAULT_QUIET_INTERVAL_MS,
  timeoutMs = DEFAULT_QUIET_TIMEOUT_MS,
) => {
  if (!collector) {
    return ''
  }
  let last = collector.text()
  await pollUntil(
    () => {
      const current = collector.text()
      const isQuiet = current === last
      last = current
      return isQuiet
    },
    { description: 'quiet output', intervalMs: quietMs, timeoutMs },
  )
  return collector.text()
}
