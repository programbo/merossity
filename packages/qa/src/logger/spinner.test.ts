import { afterEach, beforeEach, expect, test } from 'bun:test'
import { Spinner } from './spinner'

const ESC = '\x1b'
const INTERVAL_ID = 1

let stdout: string[] = []
let originalWrite: typeof process.stdout.write = process.stdout.write.bind(process.stdout)
let stdoutDesc: PropertyDescriptor | undefined = undefined
let originalSetInterval: typeof setInterval = globalThis.setInterval
let originalClearInterval: typeof clearInterval = globalThis.clearInterval
let intervalCb: (() => void) | undefined = undefined

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

const installTimers = () => {
  originalSetInterval = globalThis.setInterval
  originalClearInterval = globalThis.clearInterval
  globalThis.setInterval = ((cb: () => void) => {
    intervalCb = cb
    return INTERVAL_ID as unknown as NodeJS.Timeout
  }) as typeof setInterval
  globalThis.clearInterval = (() => undefined) as typeof clearInterval
}

beforeEach(() => {
  stdout = []
  installWriteSpy()
  stdoutDesc = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY')
  setTTY(false)
  intervalCb = undefined
  installTimers()
})

afterEach(() => {
  process.stdout.write = originalWrite
  if (stdoutDesc) {
    Object.defineProperty(process.stdout, 'isTTY', stdoutDesc)
  }
  globalThis.setInterval = originalSetInterval
  globalThis.clearInterval = originalClearInterval
})

test('spinner tty lifecycle', () => {
  setTTY(true)
  const spin = new Spinner('Build').start()
  intervalCb?.()
  spin.succeed()
  const output = stdout
    .join('')
    .replaceAll('\r', String.raw`\r`)
    .replaceAll('\n', String.raw`\n`)
    .replaceAll(ESC, String.raw`\x1b`)
  expect(output).toMatchInlineSnapshot(`"\\r- Build\\r\\ Build\\r\\x1b[2K[ok] Build\\n"`)
})

test('spinner non-tty lifecycle', () => {
  setTTY(false)
  const spin = new Spinner('Build').start()
  spin.fail()
  const output = stdout
    .join('')
    .replaceAll('\r', String.raw`\r`)
    .replaceAll('\n', String.raw`\n`)
    .replaceAll(ESC, String.raw`\x1b`)
  expect(output).toMatchInlineSnapshot(`"Build...\\n[fail] Build\\n"`)
})
