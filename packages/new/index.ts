#!/usr/bin/env bun
import { metadata as apiMeta, scaffoldApi } from './scaffolders/api'
import { metadata as cliMeta, scaffoldCli } from './scaffolders/cli'
import { metadata as libMeta, scaffoldLib } from './scaffolders/lib'
import { metadata as uiMeta, scaffoldUi } from './scaffolders/ui'
import { resolveTarget, type AppType } from './scaffolders/utils'
import { metadata as webMeta, scaffoldWeb } from './scaffolders/web'

const USAGE = `
Usage:
  bun new <type> [name] [--no-install] [options]

Types:
  web   Creates a Bun React + Tailwind app in apps/<name>
  api   Creates a Bun + Hono API app in apps/<name>
  cli   Creates a CLI package in packages/<name>
  lib   Creates a library package in packages/<name>
  ui    Creates a Tailwind UI library in packages/<name> (via bun create)

CLI options:
  --tui                 Scaffold an Ink-based TUI CLI
  --tui=fullscreen      Scaffold a full-screen Ink TUI CLI (via fullscreen-ink)
`.trim()

type CliTuiOption = 'ink' | 'fullscreen'

const parseCliTui = (raw: string | undefined): CliTuiOption | undefined => {
  if (!raw) return 'ink'
  if (raw === 'fullscreen') return 'fullscreen'
  if (raw === 'ink') return 'ink'
  throw new Error(`Invalid --tui value: ${raw}`)
}

const main = async () => {
  const args = process.argv.slice(2)
  const [typeArg, ...rest] = args
  if (!typeArg) {
    console.log(USAGE)
    process.exit(1)
  }

  if (!['web', 'api', 'cli', 'lib', 'ui'].includes(typeArg)) {
    throw new Error(`Unsupported type: ${typeArg}`)
  }

  const type = typeArg as AppType
  let install = true
  let cliTui: CliTuiOption | undefined
  const positional: string[] = []

  for (let index = 0; index < rest.length; index++) {
    const arg = rest[index]
    if (!arg) continue

    if (arg === '--no-install') {
      install = false
      continue
    }

    if (arg === '--tui') {
      const next = rest[index + 1]
      if (next && !next.startsWith('-')) {
        cliTui = parseCliTui(next)
        index++
      } else {
        cliTui = parseCliTui(undefined)
      }
      continue
    }

    if (arg.startsWith('--tui=')) {
      cliTui = parseCliTui(arg.slice('--tui='.length))
      continue
    }

    if (!arg.startsWith('-')) {
      positional.push(arg)
    }
  }

  const nameArg = positional[0] ?? type
  const metadata: Record<AppType, { defaultRoot: 'apps' | 'packages' }> = {
    web: webMeta,
    api: apiMeta,
    cli: cliMeta,
    lib: libMeta,
    ui: uiMeta,
  }

  const targetDir = resolveTarget(nameArg, metadata[type].defaultRoot)
  const options = { install }
  const handlers: Record<AppType, (dir: string, options: { install: boolean }) => Promise<void>> = {
    web: scaffoldWeb,
    api: scaffoldApi,
    cli: (dir, baseOptions) => scaffoldCli(dir, { ...baseOptions, tui: cliTui }),
    lib: scaffoldLib,
    ui: scaffoldUi,
  }

  if (type !== 'cli' && cliTui) {
    throw new Error('--tui is only supported for `bun new cli`')
  }

  await handlers[type](targetDir, options)

  console.log(`Created ${type} app at ${targetDir}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
