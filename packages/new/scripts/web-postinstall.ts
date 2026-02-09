#!/usr/bin/env bun
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

const ROOT_DIR = path.resolve(import.meta.dir, '../../..')
const TEMPLATE_SOURCE = path.resolve(
  ROOT_DIR,
  'packages',
  'new',
  'templates',
  'web',
  'src',
  'dev',
  'serve-with-control.ts',
)
const TEMPLATE_INDEX = path.resolve(ROOT_DIR, 'packages', 'new', 'templates', 'web', 'src', 'index.ts')

const USAGE = `
Usage:
  bun run web-postinstall --dir <path>
  bun run web-postinstall <path>
`.trim()

const parseArgs = () => {
  const args = process.argv.slice(2)
  let dir: string | undefined

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === '--dir') {
      dir = args[i + 1]
      i += 1
      continue
    }
    if (arg && !arg.startsWith('-') && !dir) {
      dir = arg
    }
  }

  if (!dir) {
    console.error('Missing --dir')
    console.log(USAGE)
    process.exit(1)
  }

  return path.resolve(ROOT_DIR, dir)
}

const isModuleProject = async (targetDir: string) => {
  const pkgPath = path.join(targetDir, 'package.json')
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

const updateAppContent = async (targetDir: string) => {
  const candidates = [
    path.join(targetDir, 'src', 'App.tsx'),
    path.join(targetDir, 'src', 'App.jsx'),
    path.join(targetDir, 'src', 'app.tsx'),
    path.join(targetDir, 'src', 'app.jsx'),
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

const removeExtras = async (targetDir: string) => {
  const extras = [
    path.join(targetDir, 'src', 'APITester.tsx'),
    path.join(targetDir, 'src', 'logo.svg'),
    path.join(targetDir, 'src', 'react.svg'),
  ]
  await Promise.all(extras.map((filePath) => rm(filePath, { force: true })))
}

const updateIndex = async (targetDir: string) => {
  const indexPath = path.join(targetDir, 'src', 'index.ts')
  if (!existsSync(indexPath)) return

  const contents = await readFile(indexPath, 'utf8')
  const hasServeStatement = contents.includes('serve(') || contents.includes('serveWithControl(')
  const needsTemplate =
    (!contents.includes('applySecurityHeaders') && contents.includes('/api/hello') && hasServeStatement) ||
    contents.includes('new Response(index') ||
    (contents.includes('const html = (') && !contents.includes('const html = async')) ||
    contents.includes("import index from './index.html'") ||
    contents.includes('import index from "./index.html"')
  if (needsTemplate) {
    const templateContents = await readFile(TEMPLATE_INDEX, 'utf8')
    await writeFile(indexPath, templateContents, 'utf8')
    return
  }
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
    const allowsTopLevelAwait = await isModuleProject(targetDir)
    if (!allowsTopLevelAwait && !updated.includes('(async () =>')) {
      updated = wrapInAsyncIife(updated)
    }
  }

  await writeFile(indexPath, updated, 'utf8')
}

const ensureHelper = async (targetDir: string) => {
  const helperPath = path.join(targetDir, 'src', 'dev', 'serve-with-control.ts')
  if (existsSync(helperPath)) return
  await mkdir(path.dirname(helperPath), { recursive: true })
  const contents = await readFile(TEMPLATE_SOURCE, 'utf8')
  await writeFile(helperPath, contents, 'utf8')
}

const main = async () => {
  const dir = parseArgs()
  await updateAppContent(dir)
  await removeExtras(dir)
  await ensureHelper(dir)
  await updateIndex(dir)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
