#!/usr/bin/env bun
import { readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

const ROOT_DIR = path.resolve(import.meta.dir, '..')

const readJson = async <TData>(filePath: string): Promise<TData> => {
  const contents = await readFile(filePath, 'utf8')
  return JSON.parse(contents) as TData
}

const writeJson = async (filePath: string, data: unknown) => {
  const contents = `${JSON.stringify(data, undefined, 2)}\n`
  await writeFile(filePath, contents, 'utf8')
}

const findWorkspaceRoot = async (startDir: string) => {
  let current = startDir
  while (true) {
    const pkgPath = path.join(current, 'package.json')
    if (existsSync(pkgPath)) {
      try {
        const pkg = await readJson<{ workspaces?: unknown }>(pkgPath)
        if (pkg.workspaces) return current
      } catch {
        // ignore and keep walking
      }
    }
    const parent = path.dirname(current)
    if (parent === current) return null
    current = parent
  }
}

const isModuleProject = async () => {
  const pkgPath = path.join(ROOT_DIR, 'package.json')
  if (!existsSync(pkgPath)) return false
  try {
    const raw = await readFile(pkgPath, 'utf8')
    const pkg = JSON.parse(raw) as { type?: string }
    return pkg.type === 'module'
  } catch {
    return false
  }
}

const wrapInAsyncIife = (contents: string) => {
  const lines = contents.split('\n')
  let lastImportIndex = -1
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i]?.trim().startsWith('import ')) {
      lastImportIndex = i
    }
  }
  const head = lines.slice(0, lastImportIndex + 1).join('\n')
  const bodyLines = lines.slice(lastImportIndex + 1)
  const indentedBody = bodyLines.map((line) => `  ${line}`).join('\n')
  return `${head}\n\n(async () => {\n${indentedBody}\n})().catch((error) => {\n  console.error(error instanceof Error ? error.message : error)\n  process.exit(1)\n})\n`
}

const updateAppContent = async () => {
  const candidates = [
    path.join(ROOT_DIR, 'src', 'App.tsx'),
    path.join(ROOT_DIR, 'src', 'App.jsx'),
    path.join(ROOT_DIR, 'src', 'app.tsx'),
    path.join(ROOT_DIR, 'src', 'app.jsx'),
  ]

  const appFile = candidates.find((candidate) => existsSync(candidate))
  if (!appFile) return

  const contents = `export default function App() {
  return (
    <main className="min-h-screen bg-white text-slate-900">
      <div className="mx-auto max-w-3xl px-6 py-20">
        <h1 className="text-3xl font-semibold">Welcome</h1>
        <p className="mt-4 text-base text-slate-600">
          This is a fresh Bun + React + Tailwind app. Build something great.
        </p>
      </div>
    </main>
  );
}
`

  await writeFile(appFile, contents, 'utf8')
}

const removeExtras = async () => {
  const extras = [
    path.join(ROOT_DIR, 'src', 'APITester.tsx'),
    path.join(ROOT_DIR, 'src', 'logo.svg'),
    path.join(ROOT_DIR, 'src', 'react.svg'),
  ]
  await Promise.all(extras.map((filePath) => rm(filePath, { force: true })))
}

const updateIndex = async () => {
  const indexPath = path.join(ROOT_DIR, 'src', 'index.ts')
  if (!existsSync(indexPath)) return

  const contents = await readFile(indexPath, 'utf8')
  const hasServeWithControl = contents.includes('serveWithControl')
  const hasServeCall = /serve\s*\(\s*\{/.test(contents)
  if (!hasServeWithControl && !hasServeCall) return

  let updated = contents
  const importRegex = /import\s+\{\s*serve\s*\}\s+from\s+['"]bun['"]\s*;?\n?/
  if (importRegex.test(updated)) {
    updated = updated.replace(importRegex, "import { serveWithControl } from './dev/serve-with-control'\n")
  } else if (!updated.includes("from './dev/serve-with-control'")) {
    updated = `import { serveWithControl } from './dev/serve-with-control'\n${updated}`
  }

  if (hasServeCall) {
    updated = updated.replace(/const\s+server\s*=\s*serve\s*\(\s*\{/, 'const server = await serveWithControl({')
    const allowsTopLevelAwait = await isModuleProject()
    if (!allowsTopLevelAwait && !updated.includes('(async () =>')) {
      updated = wrapInAsyncIife(updated)
    }
  }

  await writeFile(indexPath, updated, 'utf8')
}

const ensureCoreDependency = async () => {
  const workspaceRoot = await findWorkspaceRoot(ROOT_DIR)
  if (!workspaceRoot) return

  const corePkgPath = path.join(workspaceRoot, 'packages', 'core', 'package.json')
  if (!existsSync(corePkgPath)) return

  const corePkg = await readJson<{ name?: string }>(corePkgPath)
  if (!corePkg.name) return

  const packageJsonPath = path.join(ROOT_DIR, 'package.json')
  if (!existsSync(packageJsonPath)) return

  const pkg = await readJson<{ dependencies?: Record<string, string> }>(packageJsonPath)
  const dependencies = { ...pkg.dependencies }
  if (dependencies[corePkg.name]) return

  dependencies[corePkg.name] = 'workspace:*'
  pkg.dependencies = dependencies

  await writeJson(packageJsonPath, pkg)
}

const main = async () => {
  await updateAppContent()
  await removeExtras()
  await updateIndex()
  await ensureCoreDependency()
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
