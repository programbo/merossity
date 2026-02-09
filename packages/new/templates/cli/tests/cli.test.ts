import path from 'node:path'
import { describe, expect, it } from 'bun:test'

const CLI_PATH = path.join(import.meta.dir, '..', 'src', 'index.ts')

const runCli = async (args: string[]) => {
  const proc = Bun.spawn(['bun', CLI_PATH, ...args], {
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  })

  const exitCode = await proc.exited
  const stdout = proc.stdout ? await new Response(proc.stdout).text() : ''
  const stderr = proc.stderr ? await new Response(proc.stderr).text() : ''

  return { exitCode, stdout, stderr }
}

describe('cli', () => {
  it('prints help with --help', async () => {
    const { exitCode, stdout, stderr } = await runCli(['--help'])
    expect(exitCode).toBe(0)
    expect(stderr).toBe('')
    expect(stdout).toContain('Usage')
    expect(stdout).toContain('cli')
  })

  it('prints help when no command is specified', async () => {
    const { exitCode, stdout, stderr } = await runCli([])
    expect(exitCode).toBe(0)
    expect(stderr).toBe('')
    expect(stdout).toContain('No command specified')
    expect(stdout).toContain('Usage')
  })

  it('runs greet', async () => {
    const { exitCode, stdout, stderr } = await runCli(['greet', 'bun'])
    expect(exitCode).toBe(0)
    expect(stderr).toBe('')
    expect(stdout).toContain('Hello, bun!')
  })
})
