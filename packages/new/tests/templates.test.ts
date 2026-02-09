import { lstat, readFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'bun:test'

const PACKAGE_DIR = path.resolve(import.meta.dir, '..')
const REPO_ROOT = path.resolve(PACKAGE_DIR, '../..')
const TEMPLATES_DIR = path.join(PACKAGE_DIR, 'templates')
const BUN_CREATE = path.join(REPO_ROOT, '.bun-create')
const POSTINSTALL = path.join(PACKAGE_DIR, 'scripts', 'postinstall.ts')

const template = (name: string) => path.join(TEMPLATES_DIR, name)

const readJson = async (filePath: string) => JSON.parse(await readFile(filePath, 'utf8')) as Record<string, unknown>

describe('@bun-monorepo-template/new templates', () => {
  it('includes required templates', async () => {
    expect(existsSync(template('web'))).toBeTrue()
    expect(existsSync(template('api'))).toBeTrue()
    expect(existsSync(template('cli'))).toBeTrue()
    expect(existsSync(template('lib'))).toBeTrue()
    expect(existsSync(template('ui'))).toBeTrue()
  })

  it('web template contains expected files', async () => {
    expect(existsSync(path.join(template('web'), 'package.json'))).toBeTrue()
    expect(existsSync(path.join(template('web'), 'src', 'App.tsx'))).toBeTrue()
    expect(existsSync(path.join(template('web'), 'src', 'index.ts'))).toBeTrue()
  })

  it('api template contains expected files', async () => {
    expect(existsSync(path.join(template('api'), 'package.json'))).toBeTrue()
    expect(existsSync(path.join(template('api'), 'src', 'index.ts'))).toBeTrue()
    expect(existsSync(path.join(template('api'), 'tests', 'api.test.ts'))).toBeTrue()
  })

  it('cli template has bunup build', async () => {
    const pkg = await readJson(path.join(template('cli'), 'package.json'))
    const scripts = (pkg.scripts ?? {}) as Record<string, string>
    expect(scripts.build).toBe('bunup')
    expect(scripts.dev).toContain('bunup')
  })

  it('lib template has bunup dev/build', async () => {
    const pkg = await readJson(path.join(template('lib'), 'package.json'))
    const scripts = (pkg.scripts ?? {}) as Record<string, string>
    expect(scripts.build).toBe('bunup')
    expect(scripts.dev).toContain('bunup')
  })

  it('ui template exports per-path modules', async () => {
    const pkg = await readJson(path.join(template('ui'), 'package.json'))
    const exportsField = (pkg.exports ?? {}) as Record<string, unknown>
    expect(exportsField['./radio']).toBeDefined()
    expect(exportsField['./utils']).toBeDefined()
    expect(exportsField['./index.css']).toBeDefined()
  })

  it('postinstall creates .bun-create symlink', async () => {
    if (existsSync(BUN_CREATE)) {
      await rm(BUN_CREATE, { recursive: true, force: true })
    }

    const proc = Bun.spawn(['bun', POSTINSTALL], {
      cwd: PACKAGE_DIR,
      stdout: 'ignore',
      stderr: 'pipe',
    })
    const exitCode = await proc.exited
    if (exitCode !== 0) {
      const err = await new Response(proc.stderr).text()
      throw new Error(err || `postinstall failed with code ${exitCode}`)
    }

    const stat = await lstat(BUN_CREATE)
    expect(stat.isSymbolicLink()).toBeTrue()
  })
})
