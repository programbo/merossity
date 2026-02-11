import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'bun:test'

const ROOT_DIR = path.resolve(import.meta.dir, '..')
const isScaffolded = existsSync(path.join(ROOT_DIR, 'prettier.config.cjs'))

const readText = async (segments: string[]) => {
  const filePath = path.join(ROOT_DIR, ...segments)
  return await Bun.file(filePath).text()
}

const readJson = async <T>(segments: string[]) => {
  const filePath = path.join(ROOT_DIR, ...segments)
  const contents = await Bun.file(filePath).text()
  return JSON.parse(contents) as T
}

const includesQaDependency = (deps?: Record<string, string>) => {
  if (!deps) return false
  return Object.keys(deps).some((name) => name.endsWith('/qa'))
}

describe('scaffolded app', () => {
  const testIt = isScaffolded ? it : it.skip

  testIt('updates the package name', async () => {
    const pkg = await readJson<{ name?: string }>(['package.json'])
    expect(pkg.name).toBeDefined()
    expect(pkg.name?.startsWith('@')).toBe(true)
    expect(pkg.name?.includes('/')).toBe(true)
  })

  testIt('installs QA scripts and dev dependency', async () => {
    const pkg = await readJson<{ scripts?: Record<string, string>; devDependencies?: Record<string, string> }>([
      'package.json',
    ])
    expect(pkg.scripts?.lint).toBe('oxlint --config oxlint.json --fix .')
    expect(pkg.scripts?.format).toBe('prettier --config prettier.config.cjs --write .')
    expect(pkg.scripts?.typecheck).toBe('tsc -p tsconfig.json --noEmit')
    expect(includesQaDependency(pkg.devDependencies)).toBe(true)
  })

  testIt('writes QA config files', async () => {
    const pkg = await readJson<{ devDependencies?: Record<string, string> }>(['package.json'])
    const qaPackage = Object.keys(pkg.devDependencies ?? {}).find((name) => name.endsWith('/qa')) ?? '@merossity/qa'
    const prettier = await readText(['prettier.config.cjs'])
    const oxlint = await readText(['oxlint.json'])
    const tsconfig = await readText(['tsconfig.json'])

    expect(prettier).toContain(`${qaPackage}/prettier-tailwind`)
    expect(oxlint).toContain(`${qaPackage}/oxlint`)
    expect(tsconfig).toContain(`${qaPackage}/tsconfig/web`)
  })

  testIt('resets the App component content', async () => {
    const app = await readText(['src', 'App.tsx'])
    expect(app).toContain('This is a fresh Bun + React + Tailwind app.')
  })

  testIt('uses serveWithControl after postinstall', async () => {
    const index = await readText(['src', 'index.ts'])
    expect(index).toContain('serveWithControl')
  })
})
