import { afterEach, beforeEach, expect, test } from 'bun:test'
import { logger } from './index'

const NOW = 1_700_000_000_123

let stdout: string[] = []
let originalWrite: typeof process.stdout.write = process.stdout.write.bind(process.stdout)
let originalNow: () => number = Date.now

const installWriteSpy = () => {
  originalWrite = process.stdout.write.bind(process.stdout)
  process.stdout.write = (chunk: any) => {
    stdout.push(String(chunk))
    return true
  }
}

const installClock = () => {
  originalNow = Date.now
  Date.now = () => NOW
}

beforeEach(() => {
  stdout = []
  installWriteSpy()
  installClock()
  logger.init?.({ debugNamespaces: [], json: true, level: 'info' })
})

afterEach(() => {
  process.stdout.write = originalWrite
  Date.now = originalNow
})

test('child meta chains', () => {
  const taskLog = logger.child({ app: 'cli' }).child({ task: '123' })
  taskLog.info('done')
  const line = stdout.join('').trim()
  expect(JSON.parse(line)).toEqual({
    app: 'cli',
    level: 'info',
    msg: 'done',
    task: '123',
    timestamp: NOW,
  })
})
