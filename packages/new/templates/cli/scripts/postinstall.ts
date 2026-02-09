#!/usr/bin/env bun
import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

const PACKAGE_DIR = path.resolve(import.meta.dir, '..')
const REPO_ROOT = path.resolve(PACKAGE_DIR, '../..')
const QA_DIR = path.join(REPO_ROOT, 'packages', 'qa')

const readJson = async <TData>(filePath: string): Promise<TData> => {
  const contents = await readFile(filePath, 'utf8')
  return JSON.parse(contents) as TData
}

const writeJson = async (filePath: string, data: unknown) => {
  const contents = `${JSON.stringify(data, undefined, 2)}\n`
  await writeFile(filePath, contents, 'utf8')
}

const run = async (command: string, args: string[], cwd: string) => {
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

const ensureCoreDependency = async () => {
  const corePkgPath = path.join(REPO_ROOT, 'packages', 'core', 'package.json')
  if (!existsSync(corePkgPath)) return
  const packageJsonPath = path.join(PACKAGE_DIR, 'package.json')
  if (!existsSync(packageJsonPath)) return

  const corePkg = await readJson<{ name?: string }>(corePkgPath)
  if (!corePkg.name) return

  const pkg = await readJson<{ dependencies?: Record<string, string> }>(packageJsonPath)
  const dependencies = { ...pkg.dependencies }
  if (dependencies[corePkg.name]) return

  dependencies[corePkg.name] = 'workspace:*'
  pkg.dependencies = dependencies

  await writeJson(packageJsonPath, pkg)
}

const main = async () => {
  await ensureCoreDependency()

  if (!existsSync(QA_DIR)) return

  await run('bun', ['run', '--cwd', QA_DIR, 'qa:init', '--dir', PACKAGE_DIR, '--kind', 'cli'], REPO_ROOT)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
