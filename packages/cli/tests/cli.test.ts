import path from 'node:path'
import { describe, expect, it } from 'bun:test'

const CLI_PATH = path.join(import.meta.dir, '..', 'src', 'index.ts')

const runCli = async (args: string[], opts: { env?: Record<string, string> } = {}) => {
  const proc = Bun.spawn(['bun', CLI_PATH, ...args], {
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, ...opts.env },
  })

  const exitCode = await proc.exited
  const stdout = proc.stdout ? await new Response(proc.stdout).text() : ''
  const stderr = proc.stderr ? await new Response(proc.stderr).text() : ''

  return { exitCode, stdout, stderr }
}

describe('cli (ink)', () => {
  it('prints help with --help (does not start the TUI)', async () => {
    const { exitCode, stdout, stderr } = await runCli(['--help'])
    expect(exitCode).toBe(0)
    expect(stderr).toBe('')
    expect(stdout).toContain('Usage')
    expect(stdout).toContain('cli')
  })

  it('runs greet', async () => {
    const { exitCode, stdout, stderr } = await runCli(['greet', 'bun'])
    expect(exitCode).toBe(0)
    expect(stderr).toBe('')
    expect(stdout).toContain('Hello, bun!')
  })

  it('can toggle via meross:togglex against a local test server', async () => {
    let sawRequest = false

    const server = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      async fetch(req) {
        if (new URL(req.url).pathname !== '/config') return new Response('not found', { status: 404 })
        const body = await req.json()
        if (body?.header?.namespace === 'Appliance.Control.ToggleX' && body?.header?.method === 'SET') {
          sawRequest = true
        }
        return Response.json({ payload: { error: { code: 0 } } })
      },
    })

    try {
      const host = `127.0.0.1:${server.port}`
      const { exitCode, stdout, stderr } = await runCli([
        'meross:togglex',
        '--host',
        host,
        '--on',
        '--channel',
        '0',
        '--key',
        'test-key',
      ])

      expect(exitCode).toBe(0)
      expect(stderr).toBe('')
      expect(stdout).toContain('"error_code":0')
      expect(sawRequest).toBe(true)
    } finally {
      server.stop(true)
    }
  })
})
