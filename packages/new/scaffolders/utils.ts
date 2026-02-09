import { copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

export type AppType = 'web' | 'api' | 'cli' | 'lib' | 'ui'
export type DefaultRoot = 'apps' | 'packages'

export const ROOT_DIR = path.resolve(import.meta.dir, '../../..')
export const BUN_CREATE_DIR = path.join(ROOT_DIR, '.bun-create')
const WEB_TEMPLATE_DIR = path.join(ROOT_DIR, 'packages', 'new', 'templates', 'web')

export const run = async (command: string, args: string[], cwd: string) => {
  const proc = Bun.spawn([command, ...args], {
    cwd,
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  })
  const exitCode = await proc.exited
  if (exitCode !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(' ')}`)
  }
}

export const ensureEmptyDir = async (dir: string) => {
  if (!existsSync(dir)) return
  const entries = await readdir(dir)
  if (entries.length > 0) {
    throw new Error(`Target directory is not empty: ${dir}`)
  }
}

export const resolveTarget = (name: string, defaultRoot: DefaultRoot) => {
  const isPath = name.includes('/') || name.includes('\\') || name.startsWith('apps/') || name.startsWith('packages/')
  const resolved = isPath ? path.resolve(ROOT_DIR, name) : path.join(ROOT_DIR, defaultRoot, name)
  const rootWithSep = ROOT_DIR.endsWith(path.sep) ? ROOT_DIR : `${ROOT_DIR}${path.sep}`
  if (!resolved.startsWith(rootWithSep)) {
    throw new Error(`Target path must be inside repo root: ${ROOT_DIR}`)
  }
  return resolved
}

export const updateWebAppContent = async (targetDir: string) => {
  const candidates = [
    path.join(targetDir, 'src', 'App.tsx'),
    path.join(targetDir, 'src', 'App.jsx'),
    path.join(targetDir, 'src', 'app.tsx'),
    path.join(targetDir, 'src', 'app.jsx'),
  ]

  const appFile = candidates.find((candidate) => existsSync(candidate))
  if (!appFile) {
    throw new Error('Unable to locate App component to update.')
  }

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

const copyTemplateDir = async (sourceDir: string, targetDir: string) => {
  await mkdir(targetDir, { recursive: true })
  const entries = await readdir(sourceDir, { withFileTypes: true })
  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name)
    const targetPath = path.join(targetDir, entry.name)
    if (entry.isDirectory()) {
      await copyTemplateDir(sourcePath, targetPath)
      continue
    }
    if (entry.isFile()) {
      await copyFile(sourcePath, targetPath)
    }
  }
}

export const applyWebTemplateTests = async (targetDir: string) => {
  const sourceTests = path.join(WEB_TEMPLATE_DIR, 'tests')
  if (!existsSync(sourceTests)) return
  const targetTests = path.join(targetDir, 'tests')
  await copyTemplateDir(sourceTests, targetTests)
}

export const runQaInit = async (targetDir: string, kind: 'web' | 'cli' | 'lib', tailwind: boolean) => {
  const args = ['run', '--cwd', path.join(ROOT_DIR, 'packages', 'qa'), 'qa:init', '--dir', targetDir, '--kind', kind]
  if (tailwind) {
    args.push('--tailwind')
  }
  await run('bun', args, ROOT_DIR)
}

export const runWorkspaceInstall = async () => {
  await run('bun', ['install'], ROOT_DIR)
}

export const ensureTargetDir = async (targetDir: string) => {
  await ensureEmptyDir(targetDir)
  if (!existsSync(targetDir)) {
    await mkdir(targetDir, { recursive: true })
  }
}

export const ensureTemplates = () => {
  if (!existsSync(BUN_CREATE_DIR)) {
    throw new Error(
      'Missing .bun-create directory at repo root. Run bun install or bun run -w @bun-monorepo-template/new postinstall.',
    )
  }
}

const readJson = async <TData>(filePath: string): Promise<TData> => {
  const contents = await readFile(filePath, 'utf8')
  return JSON.parse(contents) as TData
}

const writeJson = async (filePath: string, data: unknown) => {
  const contents = `${JSON.stringify(data, undefined, 2)}\n`
  await writeFile(filePath, contents, 'utf8')
}

const resolveProjectName = async () => {
  const pkgPath = path.join(ROOT_DIR, 'package.json')
  if (!existsSync(pkgPath)) {
    return 'project'
  }
  const pkg = await readJson<{ name?: string }>(pkgPath)
  const raw = pkg.name ?? 'project'
  const withoutScope = raw.startsWith('@') ? (raw.split('/').pop() ?? raw) : raw
  return withoutScope
}

const resolvePackageName = (targetDir: string) => {
  const relative = path.relative(ROOT_DIR, targetDir).replace(/\\/g, '/')
  const cleaned = relative.replace(/^(apps|packages)\//, '')
  return cleaned.split('/').filter(Boolean).join('-')
}

export const updatePackageName = async (targetDir: string) => {
  const pkgPath = path.join(targetDir, 'package.json')
  if (!existsSync(pkgPath)) return
  const pkg = await readJson<Record<string, unknown>>(pkgPath)
  const projectName = await resolveProjectName()
  const packageName = resolvePackageName(targetDir)
  pkg.name = `@${projectName}/${packageName}`
  await writeJson(pkgPath, pkg)
}
