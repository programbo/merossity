import { mkdir, readFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'

const REPO_ROOT = path.resolve(import.meta.dir, '../../..')
const NEW_POSTINSTALL = path.join(REPO_ROOT, 'packages', 'new', 'scripts', 'postinstall.ts')
const BUN_CREATE = path.join(REPO_ROOT, '.bun-create')

const readJson = async (filePath: string) => JSON.parse(await readFile(filePath, 'utf8')) as Record<string, unknown>

const run = async (args: string[], cwd: string, env?: Record<string, string | undefined>) => {
  const proc = Bun.spawn(['bun', ...args], {
    cwd,
    env: {
      ...process.env,
      ...env,
    },
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const exitCode = await proc.exited
  if (exitCode !== 0) {
    const err = await new Response(proc.stderr).text()
    throw new Error(err || `bun ${args.join(' ')} failed with code ${exitCode}`)
  }
}

const ensureExists = (filePath: string) => {
  expect(existsSync(filePath)).toBeTrue()
}

const ensureExtends = (value: unknown, expected: string) => {
  if (Array.isArray(value)) {
    expect(value.includes(expected)).toBeTrue()
    return
  }
  if (typeof value === 'string') {
    expect(value).toBe(expected)
    return
  }
  throw new Error(`Expected extends to include ${expected}`)
}

describe('@bun-monorepo-template/new scaffolds', () => {
  const runId = randomUUID()
  const tmpRoot = path.join(REPO_ROOT, '.tmp', `@bun-monorepo-template/new-scaffolds-${runId}`)
  const bunTmpDir = path.join(tmpRoot, 'bun-tmp')

  const webDir = path.join(tmpRoot, 'apps', 'web-fixture')
  const apiDir = path.join(tmpRoot, 'apps', 'api-fixture')
  const cliDir = path.join(tmpRoot, 'packages', 'cli-fixture')
  const libDir = path.join(tmpRoot, 'packages', 'lib-fixture')
  const uiDir = path.join(tmpRoot, 'packages', 'ui-fixture')
  const cliInkDir = path.join(tmpRoot, 'packages', 'cli-ink-fixture')
  const cliFullscreenDir = path.join(tmpRoot, 'packages', 'cli-fullscreen-fixture')

  beforeAll(async () => {
    if (!existsSync(BUN_CREATE)) {
      const proc = Bun.spawn(['bun', NEW_POSTINSTALL], {
        cwd: REPO_ROOT,
        stdout: 'ignore',
        stderr: 'pipe',
      })
      const exitCode = await proc.exited
      if (exitCode !== 0) {
        const err = await new Response(proc.stderr).text()
        throw new Error(err || `postinstall failed with code ${exitCode}`)
      }
    }

    await mkdir(bunTmpDir, { recursive: true })
    const env = {
      BUN_TMPDIR: bunTmpDir,
      TMPDIR: bunTmpDir,
      TEMP: bunTmpDir,
      TMP: bunTmpDir,
      BUN_NEW_WEB_TEMPLATE: '1',
    }
    await run(
      ['run', 'packages/new/index.ts', 'web', path.relative(REPO_ROOT, webDir), '--no-install'],
      REPO_ROOT,
      env,
    )
    await run(
      ['run', 'packages/new/index.ts', 'api', path.relative(REPO_ROOT, apiDir), '--no-install'],
      REPO_ROOT,
      env,
    )
    await run(
      ['run', 'packages/new/index.ts', 'cli', path.relative(REPO_ROOT, cliDir), '--no-install'],
      REPO_ROOT,
      env,
    )
    await run(
      ['run', 'packages/new/index.ts', 'cli', path.relative(REPO_ROOT, cliInkDir), '--no-install', '--tui'],
      REPO_ROOT,
      env,
    )
    await run(
      [
        'run',
        'packages/new/index.ts',
        'cli',
        path.relative(REPO_ROOT, cliFullscreenDir),
        '--no-install',
        '--tui=fullscreen',
      ],
      REPO_ROOT,
      env,
    )
    await run(
      ['run', 'packages/new/index.ts', 'lib', path.relative(REPO_ROOT, libDir), '--no-install'],
      REPO_ROOT,
      env,
    )
    await run(
      ['run', 'packages/new/index.ts', 'ui', path.relative(REPO_ROOT, uiDir), '--no-install'],
      REPO_ROOT,
      env,
    )
  })

  afterAll(async () => {
    await rm(tmpRoot, { recursive: true, force: true })
  })

  it('scaffolds a web app with QA config', async () => {
    ensureExists(path.join(webDir, 'package.json'))
    ensureExists(path.join(webDir, 'bunfig.toml'))
    ensureExists(path.join(webDir, 'build.ts'))
    ensureExists(path.join(webDir, 'bun-env.d.ts'))
    ensureExists(path.join(webDir, 'src', 'App.tsx'))
    ensureExists(path.join(webDir, 'src', 'index.ts'))
    ensureExists(path.join(webDir, 'src', 'index.html'))
    ensureExists(path.join(webDir, 'src', 'index.css'))

    ensureExists(path.join(webDir, 'prettier.config.cjs'))
    ensureExists(path.join(webDir, 'oxlint.json'))
    ensureExists(path.join(webDir, 'tsconfig.json'))

    const pkg = await readJson(path.join(webDir, 'package.json'))
    const scripts = (pkg.scripts ?? {}) as Record<string, string>
    const devDependencies = (pkg.devDependencies ?? {}) as Record<string, string>

    expect(scripts.lint).toBeDefined()
    expect(scripts.format).toBeDefined()
    expect(scripts.typecheck).toBeDefined()
    expect(devDependencies['@bun-monorepo-template/qa']).toBeDefined()

    const prettierConfig = await readFile(path.join(webDir, 'prettier.config.cjs'), 'utf8')
    expect(prettierConfig).toContain('@bun-monorepo-template/qa/prettier-tailwind')

    const oxlint = await readJson(path.join(webDir, 'oxlint.json'))
    ensureExtends(oxlint.extends, '@bun-monorepo-template/qa/oxlint')

    const tsconfig = await readJson(path.join(webDir, 'tsconfig.json'))
    expect(tsconfig.extends).toBe('@bun-monorepo-template/qa/tsconfig/web')
  })

  it('scaffolds cli/lib/ui packages with QA config', async () => {
    const packages = [
      { dir: apiDir, kind: 'api', tsconfig: '@bun-monorepo-template/qa/tsconfig/node', tailwind: false },
      { dir: cliDir, kind: 'cli', tsconfig: '@bun-monorepo-template/qa/tsconfig/node', tailwind: false },
      { dir: cliInkDir, kind: 'cli', tsconfig: '@bun-monorepo-template/qa/tsconfig/node', tailwind: false },
      { dir: cliFullscreenDir, kind: 'cli', tsconfig: '@bun-monorepo-template/qa/tsconfig/node', tailwind: false },
      { dir: libDir, kind: 'lib', tsconfig: '@bun-monorepo-template/qa/tsconfig/node', tailwind: false },
      { dir: uiDir, kind: 'ui', tsconfig: '@bun-monorepo-template/qa/tsconfig/react-lib', tailwind: true },
    ]

    for (const pkgInfo of packages) {
      const { dir, tsconfig: tsconfigPreset, tailwind } = pkgInfo
      ensureExists(path.join(dir, 'package.json'))
      ensureExists(path.join(dir, 'src', 'index.ts'))
      ensureExists(path.join(dir, 'bunup.config.ts'))
      ensureExists(path.join(dir, 'prettier.config.cjs'))
      ensureExists(path.join(dir, 'oxlint.json'))
      ensureExists(path.join(dir, 'tsconfig.json'))
      if (pkgInfo.kind === 'api') {
        ensureExists(path.join(dir, 'tests', 'api.test.ts'))
      }

      const pkg = await readJson(path.join(dir, 'package.json'))
      const scripts = (pkg.scripts ?? {}) as Record<string, string>
      const devDependencies = (pkg.devDependencies ?? {}) as Record<string, string>

      expect(scripts.lint).toBeDefined()
      expect(scripts.format).toBeDefined()
      expect(scripts.typecheck).toBeDefined()
      expect(scripts.build).toBeDefined()
      expect(devDependencies['@bun-monorepo-template/qa']).toBeDefined()

      const prettierConfig = await readFile(path.join(dir, 'prettier.config.cjs'), 'utf8')
      const expectedPrettier = tailwind
        ? '@bun-monorepo-template/qa/prettier-tailwind'
        : '@bun-monorepo-template/qa/prettier'
      expect(prettierConfig).toContain(expectedPrettier)

      const oxlint = await readJson(path.join(dir, 'oxlint.json'))
      ensureExtends(oxlint.extends, '@bun-monorepo-template/qa/oxlint')

      const tsconfig = await readJson(path.join(dir, 'tsconfig.json'))
      expect(tsconfig.extends).toBe(tsconfigPreset)
    }
  })

  it('scaffolds cli --tui with ink files and deps', async () => {
    ensureExists(path.join(cliInkDir, 'src', 'tui.tsx'))

    const pkg = await readJson(path.join(cliInkDir, 'package.json'))
    const deps = (pkg.dependencies ?? {}) as Record<string, string>
    const devDeps = (pkg.devDependencies ?? {}) as Record<string, string>
    expect(deps.ink).toBeDefined()
    expect(deps.react).toBeDefined()
    expect(devDeps['@types/react']).toBeDefined()

    const tsconfig = await readJson(path.join(cliInkDir, 'tsconfig.json'))
    const compilerOptions = (tsconfig.compilerOptions ?? {}) as Record<string, unknown>
    expect(compilerOptions.jsx).toBe('react-jsx')
  })

  it('scaffolds cli --tui=fullscreen with fullscreen-ink', async () => {
    ensureExists(path.join(cliFullscreenDir, 'src', 'tui.tsx'))

    const pkg = await readJson(path.join(cliFullscreenDir, 'package.json'))
    const deps = (pkg.dependencies ?? {}) as Record<string, string>
    expect(deps.ink).toBeDefined()
    expect(deps.react).toBeDefined()
    expect(deps['fullscreen-ink']).toBeDefined()
  })
})
