import path from 'node:path'
import {
  ensureTargetDir,
  ensureTemplates,
  run,
  runQaInit,
  runWorkspaceInstall,
  ROOT_DIR,
  updatePackageName,
} from './utils'

export const metadata = {
  defaultRoot: 'packages',
} as const

export const scaffoldUi = async (targetDir: string, options: { install: boolean }) => {
  await ensureTargetDir(targetDir)
  ensureTemplates()
  await run('bun', ['create', 'ui', path.relative(ROOT_DIR, targetDir), '--no-install', '--no-git'], ROOT_DIR)
  await runQaInit(targetDir, 'lib', true)
  await updatePackageName(targetDir)
  if (options.install) {
    await runWorkspaceInstall()
  }
}
