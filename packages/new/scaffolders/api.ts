import path from 'node:path'
import { ensureTargetDir, ensureTemplates, ROOT_DIR, run, runQaInit, runWorkspaceInstall, updatePackageName } from './utils'

export const metadata = {
  defaultRoot: 'apps',
} as const

export const scaffoldApi = async (targetDir: string, options: { install: boolean }) => {
  await ensureTargetDir(targetDir)
  ensureTemplates()
  await run('bun', ['create', 'api', path.relative(ROOT_DIR, targetDir), '--no-install', '--no-git'], ROOT_DIR)
  await runQaInit(targetDir, 'lib', false)
  await updatePackageName(targetDir)
  if (options.install) {
    await runWorkspaceInstall()
  }
}
