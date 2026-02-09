#!/usr/bin/env bun
import { lstat, mkdir, readlink, rm, symlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

const ROOT_DIR = path.resolve(import.meta.dir, '../../..')
const TARGET = path.join(ROOT_DIR, '.bun-create')
const SOURCE = path.join(ROOT_DIR, 'packages', 'new', 'templates')

const ensureSymlink = async () => {
  await mkdir(SOURCE, { recursive: true })

  if (existsSync(TARGET)) {
    const stat = await lstat(TARGET)
    if (stat.isSymbolicLink()) {
      const current = await readlink(TARGET)
      if (path.resolve(ROOT_DIR, current) === SOURCE) return
    }

    await rm(TARGET, { recursive: true, force: true })
  }

  await symlink(SOURCE, TARGET)
}

ensureSymlink().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
