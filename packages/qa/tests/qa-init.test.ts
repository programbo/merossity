import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'bun:test'

const ROOT_DIR = path.resolve(import.meta.dir, '../..')
const QA_INIT = path.join(ROOT_DIR, 'qa', 'scripts', 'qa-init.ts')
const EXIT_SUCCESS = 0
const JSON_INDENT = 2
const TEMP_ROOT = '/tmp'

const runQaInit = async (args: string[]) => {
  const proc = Bun.spawn(['bun', QA_INIT, ...args], {
    cwd: ROOT_DIR,
    stderr: 'pipe',
    stdout: 'ignore',
  })
  const exitCode = await proc.exited
  if (exitCode !== EXIT_SUCCESS) {
    const err = await new Response(proc.stderr).text()
    throw new Error(err || `qa-init failed with code ${exitCode}`)
  }
}

const writeJson = async (filePath: string, data: unknown) => {
  await writeFile(filePath, `${JSON.stringify(data, undefined, JSON_INDENT)}\n`, 'utf8')
}

const createTempPackage = async (name: string, extras: Record<string, unknown> = {}) => {
  const tempDir = path.join(TEMP_ROOT, `qa-init-${name}-${Date.now()}`)
  await mkdir(tempDir, { recursive: true })
  await writeJson(path.join(tempDir, 'package.json'), {
    name,
    private: true,
    version: '0.0.0',
    ...extras,
  })
  return tempDir
}

const readPackageJson = async (dir: string) => {
  const raw = await readFile(path.join(dir, 'package.json'), 'utf8')
  return JSON.parse(raw) as {
    scripts: Record<string, string>
    devDependencies: Record<string, string>
  }
}

const expectLibScripts = (pkg: { scripts: Record<string, string>; devDependencies: Record<string, string> }) => {
  expect(pkg.scripts.build).toBe('bunup')
  expect(pkg.scripts.lint).toContain('oxlint')
  expect(pkg.scripts.format).toContain('prettier')
  expect(pkg.scripts.typecheck).toContain('tsc')
  expect(pkg.devDependencies['@bun-monorepo-template/qa']).toBe('workspace:*')
}

const expectConfigFiles = (dir: string) => {
  expect(existsSync(path.join(dir, 'prettier.config.cjs'))).toBeTrue()
  expect(existsSync(path.join(dir, 'oxlint.json'))).toBeTrue()
  expect(existsSync(path.join(dir, 'tsconfig.json'))).toBeTrue()
}

describe('qa:init', () => {
  it('writes configs and scripts for lib packages', async () => {
    const dir = await createTempPackage('sample-lib')

    try {
      await runQaInit([dir, '--kind', 'lib'])

      const pkg = await readPackageJson(dir)
      expectLibScripts(pkg)
      expectConfigFiles(dir)
    } finally {
      await rm(dir, { force: true, recursive: true })
    }
  })

  it('detects Tailwind and uses the Tailwind Prettier config', async () => {
    const dir = await createTempPackage('sample-ui', {
      devDependencies: {
        tailwindcss: '^4.0.0',
      },
    })

    try {
      await runQaInit([dir, '--kind', 'lib'])

      const prettierConfig = await readFile(path.join(dir, 'prettier.config.cjs'), 'utf8')
      expect(prettierConfig).toContain('@bun-monorepo-template/qa/prettier-tailwind')
    } finally {
      await rm(dir, { force: true, recursive: true })
    }
  })

  it('parses JSON with comments', async () => {
    const dir = await createTempPackage('sample-jsonc')

    const tsconfig = `{
  // comment
  "compilerOptions": {
    "target": "ESNext"
  }
}\n`

    await writeFile(path.join(dir, 'tsconfig.json'), tsconfig, 'utf8')

    try {
      await runQaInit([dir, '--kind', 'lib'])
      const config = JSON.parse(await readFile(path.join(dir, 'tsconfig.json'), 'utf8')) as {
        extends?: string
      }
      expect(config.extends).toBe('@bun-monorepo-template/qa/tsconfig/node')
    } finally {
      await rm(dir, { force: true, recursive: true })
    }
  })
})
