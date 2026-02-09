#!/usr/bin/env bun
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

const ROOT_DIR = path.resolve(import.meta.dir, '../../..')
const APPS_DIR = path.join(ROOT_DIR, 'apps')
const DEFAULT_UI_DEP = '@bun-monorepo-template/ui'

const readJson = async <T>(filePath: string): Promise<T> => {
  const contents = await readFile(filePath, 'utf8')
  return JSON.parse(contents) as T
}

const writeJson = async (filePath: string, data: unknown) => {
  const contents = `${JSON.stringify(data, null, 2)}\n`
  await writeFile(filePath, contents, 'utf8')
}

const hasTailwind = (pkg: Record<string, unknown>) => {
  const deps = (pkg.dependencies ?? {}) as Record<string, string>
  const devDeps = (pkg.devDependencies ?? {}) as Record<string, string>
  return Boolean(deps.tailwindcss || devDeps.tailwindcss)
}

const hasUi = (pkg: Record<string, unknown>, uiDep: string) => {
  const deps = (pkg.dependencies ?? {}) as Record<string, string>
  const devDeps = (pkg.devDependencies ?? {}) as Record<string, string>
  return Boolean(deps[uiDep] || devDeps[uiDep])
}

const promptYesNo = async (message: string) => {
  if (!process.stdin.isTTY) return false
  process.stdin.resume()
  process.stdout.write(`${message} [y/N] `)

  const data = await new Promise<string>((resolve) => {
    const onData = (chunk: Buffer) => {
      process.stdin.off('data', onData)
      resolve(chunk.toString('utf8').trim())
    }
    process.stdin.on('data', onData)
  })

  return data.toLowerCase() === 'y' || data.toLowerCase() === 'yes'
}

const findCssImportTarget = async (appDir: string) => {
  const candidate = path.join(appDir, 'src', 'index.ts')
  if (!existsSync(candidate)) return null
  return candidate
}

const addCssImport = async (filePath: string, uiDep: string) => {
  const contents = await readFile(filePath, 'utf8')
  const cssImport = `${uiDep}/index.css`
  if (contents.includes(cssImport)) return

  const lines = contents.split('\n')
  const importIndex = lines.findIndex((line) => line.startsWith('import '))
  const insertIndex = importIndex >= 0 ? importIndex + 1 : 0
  lines.splice(insertIndex, 0, `import '${cssImport}'`)

  await writeFile(filePath, `${lines.join('\n')}\n`, 'utf8')
}

const resolveUiDep = async () => {
  const pkgPath = path.resolve(import.meta.dir, '..', 'package.json')
  if (!existsSync(pkgPath)) return DEFAULT_UI_DEP
  const pkg = await readJson<{ name?: string }>(pkgPath)
  return pkg.name ?? DEFAULT_UI_DEP
}

const main = async () => {
  if (!existsSync(APPS_DIR)) return
  const uiDep = await resolveUiDep()

  const entries = await readdir(APPS_DIR)

  for (const appName of entries) {
    const appDir = path.join(APPS_DIR, appName)
    const packageJsonPath = path.join(appDir, 'package.json')
    if (!existsSync(packageJsonPath)) continue

    const pkg = await readJson<Record<string, unknown>>(packageJsonPath)
    if (!hasTailwind(pkg) || hasUi(pkg, uiDep)) continue

    const allow = await promptYesNo(`Add ${uiDep} dependency to ${appName}?`)
    if (!allow) continue

    const deps = (pkg.dependencies ?? {}) as Record<string, string>
    deps[uiDep] = 'workspace:*'
    pkg.dependencies = deps

    await writeJson(packageJsonPath, pkg)

    const cssTarget = await findCssImportTarget(appDir)
    if (cssTarget) {
      const addCss = await promptYesNo(`Add UI CSS import to ${path.relative(ROOT_DIR, cssTarget)}?`)
      if (addCss) {
        await addCssImport(cssTarget, uiDep)
      }
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
