import { afterEach, beforeEach, expect, test } from 'bun:test'
import { logger } from './index'

const NOW = 1_700_000_000_000
const COUNT = 42
const WARN_COUNT = 1
const ERROR_COUNT = 2

let stdout: string[] = []
let stderr: string[] = []
let originalStdoutWrite: typeof process.stdout.write = process.stdout.write.bind(process.stdout)
let originalStderrWrite: typeof process.stderr.write = process.stderr.write.bind(process.stderr)
let stdoutDesc: PropertyDescriptor | undefined = undefined
let stderrDesc: PropertyDescriptor | undefined = undefined
let originalNow: () => number = Date.now

const setTTY = (stream: NodeJS.WriteStream, value: boolean, desc?: PropertyDescriptor) => {
  if (!desc || desc.configurable) {
    Object.defineProperty(stream, 'isTTY', { configurable: true, value, writable: true })
    return
  }
  ;(stream as NodeJS.WriteStream & { isTTY: boolean }).isTTY = value
}

const installWriteSpies = () => {
  originalStdoutWrite = process.stdout.write.bind(process.stdout)
  originalStderrWrite = process.stderr.write.bind(process.stderr)
  process.stdout.write = (chunk: any) => {
    stdout.push(String(chunk))
    return true
  }
  process.stderr.write = (chunk: any) => {
    stderr.push(String(chunk))
    return true
  }
}

const installTTYSpies = (stdoutTTY: boolean, stderrTTY: boolean) => {
  stdoutDesc = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY')
  stderrDesc = Object.getOwnPropertyDescriptor(process.stderr, 'isTTY')
  setTTY(process.stdout, stdoutTTY, stdoutDesc)
  setTTY(process.stderr, stderrTTY, stderrDesc)
}

const installClock = () => {
  originalNow = Date.now
  Date.now = () => NOW
}

beforeEach(() => {
  stdout = []
  stderr = []
  installWriteSpies()
  installTTYSpies(false, false)
  installClock()
  logger.init?.({ debugNamespaces: [], json: false, level: 'debug' })
})

afterEach(() => {
  process.stdout.write = originalStdoutWrite
  process.stderr.write = originalStderrWrite
  if (stdoutDesc) {
    Object.defineProperty(process.stdout, 'isTTY', stdoutDesc)
  }
  if (stderrDesc) {
    Object.defineProperty(process.stderr, 'isTTY', stderrDesc)
  }
  Date.now = originalNow
})

const OUTPUT_CASES = [
  {
    expected: '\u001b[36mINFO\u001b[0m Test count=42\n',
    isTTY: true,
    json: false,
  },
  {
    expected: '{"level":"info","msg":"Test","timestamp":1700000000000,"count":42}\n',
    isTTY: true,
    json: true,
  },
  {
    expected: '{"level":"info","msg":"Test","timestamp":1700000000000,"count":42}\n',
    isTTY: false,
    json: true,
  },
  {
    expected: 'INFO Test count=42\n',
    isTTY: false,
    json: false,
  },
]

test.each(OUTPUT_CASES)('output modes $isTTY/$json', ({ isTTY, json, expected }) => {
  setTTY(process.stdout, isTTY, stdoutDesc)
  logger.init?.({ json })
  logger.info('Test', { count: COUNT })
  expect(stdout.join('')).toBe(expected)
})

test('warn/error go to stderr', () => {
  logger.warn('Warn', { count: WARN_COUNT })
  logger.error('Error', { count: ERROR_COUNT })
  expect(stdout.join('')).toBe('')
  expect(stderr.join('')).toBe('WARN Warn count=1\nERROR Error count=2\n')
})

test('respects log level filtering', () => {
  logger.init?.({ level: 'warn' })
  logger.debug('no')
  logger.info('no')
  logger.warn('yes')
  expect(stdout.join('')).toBe('')
  expect(stderr.join('')).toBe('WARN yes\n')
})
