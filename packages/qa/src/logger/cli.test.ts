import { expect, test } from 'bun:test'
import { join } from 'path'

const EXIT_SUCCESS = 0

const fixture = join(import.meta.dir, '__fixtures__', 'cli.ts')

test('--debug flag works', async () => {
  const proc = Bun.spawn(['bun', fixture, '--debug=mycli:*', '--log-level=debug'])
  const output = await new Response(proc.stdout).text()
  const code = await proc.exited
  expect(code).toBe(EXIT_SUCCESS)
  expect(output).toContain('[mycli:project]')
  expect(output).toContain('cli run')
})

test('--json flag emits JSON', async () => {
  const proc = Bun.spawn(['bun', fixture, '--json'])
  const output = await new Response(proc.stdout).text()
  const code = await proc.exited
  expect(code).toBe(EXIT_SUCCESS)
  const [line = ''] = output.trim().split('\n')
  const parsed = JSON.parse(line)
  expect(parsed.level).toBe('info')
  expect(parsed.msg).toBe('cli run')
  expect(parsed.cli).toBe(true)
})
