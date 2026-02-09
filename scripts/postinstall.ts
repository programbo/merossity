#!/usr/bin/env bun
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

const ROOT_DIR = path.resolve(import.meta.dir, '..')

const sanitizeName = (input: string) => {
  const lowered = input.toLowerCase().replace(/[^a-z0-9-._]/g, '-')
  const trimmed = lowered.replace(/^[._-]+/, '').replace(/-+/g, '-').replace(/\.+/g, '.').replace(/_+/g, '_')
  return trimmed || 'project'
}

const readJson = async <T>(filePath: string): Promise<T> => {
  const contents = await readFile(filePath, 'utf8')
  return JSON.parse(contents) as T
}

const writeJson = async (filePath: string, data: unknown) => {
  const contents = `${JSON.stringify(data, undefined, 2)}\n`
  await writeFile(filePath, contents, 'utf8')
}

const updatePackageName = async (filePath: string, newName: string) => {
  if (!existsSync(filePath)) return
  const pkg = await readJson<Record<string, unknown>>(filePath)
  if (pkg.name === newName) return
  pkg.name = newName
  await writeJson(filePath, pkg)
}

const replaceInFile = async (filePath: string, replacements: Array<[string, string]>) => {
  const contents = await readFile(filePath, 'utf8')
  let next = contents
  for (const [from, to] of replacements) {
    if (from && from !== to) {
      next = next.split(from).join(to)
    }
  }
  if (next !== contents) {
    await writeFile(filePath, next, 'utf8')
  }
}

const shouldIgnoreDir = (name: string) =>
  name === 'node_modules' || name === '.git' || name === '.dev' || name === '.bun-create' || name === 'dist'

const walk = async (dir: string, replacements: Array<[string, string]>) => {
  const entries = await readdir(dir, { withFileTypes: true })
  await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (shouldIgnoreDir(entry.name)) return
        await walk(fullPath, replacements)
        return
      }
      if (!entry.isFile()) return
      await replaceInFile(fullPath, replacements)
    }),
  )
}

const resolveScopedName = (value: unknown, fallback: string) => {
  if (typeof value !== 'string') return fallback
  if (value.startsWith('@') && value.includes('/')) return value
  return fallback
}

const main = async () => {
  const projectName = sanitizeName(path.basename(process.cwd()))
  const rootPkgPath = path.join(ROOT_DIR, 'package.json')
  const qaPkgPath = path.join(ROOT_DIR, 'packages', 'qa', 'package.json')
  const corePkgPath = path.join(ROOT_DIR, 'packages', 'core', 'package.json')
  const newPkgPath = path.join(ROOT_DIR, 'packages', 'new', 'package.json')

  const rootPkg = existsSync(rootPkgPath) ? await readJson<Record<string, unknown>>(rootPkgPath) : {}
  const qaPkg = existsSync(qaPkgPath) ? await readJson<Record<string, unknown>>(qaPkgPath) : {}
  const corePkg = existsSync(corePkgPath) ? await readJson<Record<string, unknown>>(corePkgPath) : {}
  const newPkg = existsSync(newPkgPath) ? await readJson<Record<string, unknown>>(newPkgPath) : {}

  const oldQaName = resolveScopedName(qaPkg.name, '@bun-monorepo-template/qa')
  const newQaName = `@${projectName}/qa`
  const oldCoreName = resolveScopedName(corePkg.name, '@bun-monorepo-template/core')
  const newCoreName = `@${projectName}/core`
  const oldNewName = resolveScopedName(newPkg.name, '@bun-monorepo-template/new')
  const newNewName = `@${projectName}/new`

  await updatePackageName(rootPkgPath, projectName)
  await updatePackageName(qaPkgPath, newQaName)
  await updatePackageName(corePkgPath, newCoreName)
  await updatePackageName(newPkgPath, newNewName)

  const replacements: Array<[string, string]> = [
    [oldQaName, newQaName],
  ]
  if (oldCoreName !== newCoreName) {
    replacements.push([oldCoreName, newCoreName])
  }
  if (oldNewName !== newNewName) {
    replacements.push([oldNewName, newNewName])
  }

  await walk(ROOT_DIR, replacements)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
