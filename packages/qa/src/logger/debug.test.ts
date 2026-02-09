import { afterEach, beforeEach, expect, test } from 'bun:test'
import { debug, logger, withDebug } from './index'

const START = 1000
const END = 1500
const FIRST_CALL = 1
const INCREMENT = 1

let stdout: string[] = []
let originalWrite: typeof process.stdout.write = process.stdout.write.bind(process.stdout)
let stdoutDesc: PropertyDescriptor | undefined = undefined
let originalNow: () => number = Date.now

const setTTY = (value: boolean) => {
  if (!stdoutDesc || stdoutDesc.configurable) {
    Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value, writable: true })
    return
  }
  ;(process.stdout as NodeJS.WriteStream & { isTTY: boolean }).isTTY = value
}

const installWriteSpy = () => {
  originalWrite = process.stdout.write.bind(process.stdout)
  process.stdout.write = (chunk: any) => {
    stdout.push(String(chunk))
    return true
  }
}

const installClock = () => {
  originalNow = Date.now
  Date.now = () => START
}

beforeEach(() => {
  stdout = []
  installWriteSpy()
  stdoutDesc = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY')
  setTTY(false)
  installClock()
  logger.init?.({ debugNamespaces: [], json: false, level: 'debug' })
})

afterEach(() => {
  process.stdout.write = originalWrite
  if (stdoutDesc) {
    Object.defineProperty(process.stdout, 'isTTY', stdoutDesc)
  }
  Date.now = originalNow
})

test('debug glob patterns', () => {
  logger.init?.({ debugNamespaces: ['mycli:project:*', 'mycli:user'] })
  debug('mycli:project:list')('ok')
  debug('mycli:user')('ok')
  debug('mycli:admin')('nope')
  expect(stdout.join('')).toBe(
    'DEBUG [mycli:project:list] ok namespace=mycli:project:list\nDEBUG [mycli:user] ok namespace=mycli:user\n',
  )
})

test('withDebug emits timing', async () => {
  logger.init?.({ debugNamespaces: ['batch'] })
  let calls = 0
  Date.now = () => {
    calls += INCREMENT
    return calls === FIRST_CALL ? START : END
  }
  await withDebug('batch', () => 'ok')
  expect(stdout.join('')).toBe('DEBUG [batch] start namespace=batch\nDEBUG [batch] done +500ms namespace=batch\n')
})

test('debug is silent when disabled', () => {
  logger.init?.({ debugNamespaces: [] })
  debug('nope')('silent')
  expect(stdout.join('')).toBe('')
})
