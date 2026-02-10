#!/usr/bin/env bun
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

const USAGE = `
Usage:
  bun run --cwd packages/qa qa:init --dir <path> [--kind web|cli|lib|auto] [--tailwind] [--force]
  bun run --cwd packages/qa qa:init <path> [--kind web|cli|lib|auto] [--tailwind] [--force]

Examples:
  bun run --cwd packages/qa qa:init --dir apps/web --kind auto
  bun run --cwd packages/qa qa:init apps/web --kind auto
  bun run --cwd packages/qa qa:init --dir packages/cli --kind cli
  bun run --cwd packages/qa qa:init --dir packages/lib --kind lib
`

type Kind = 'web' | 'cli' | 'lib' | 'auto'

interface Options {
  dir?: string
  kind: Kind
  tailwind?: boolean
  force: boolean
}

const ARGV_START_INDEX = 2
const INDEX_STEP = 1
const NEXT_INDEX_STEP = 2
const EXIT_SUCCESS = 0
const EXIT_FAILURE = 1
const JSON_INDENT = 2

type ArgHandler = (args: string[], index: number, options: Options) => number

const parseArgs = (): Options => parseArgsList(process.argv.slice(ARGV_START_INDEX))

const parseArgsList = (args: string[]): Options => {
  const options: Options = {
    force: false,
    kind: 'auto',
  }
  let index = 0

  while (index < args.length) {
    index = consumeArg(args, index, options)
  }

  return options
}

const consumeArg = (args: string[], index: number, options: Options) => {
  const arg = args[index]
  if (!arg) {
    return index + INDEX_STEP
  }

  if (isBareDirArg(arg, options)) {
    options.dir = arg
    return index + INDEX_STEP
  }

  const handler = argHandlers[arg]
  if (handler) {
    return handler(args, index, options)
  }

  return index + INDEX_STEP
}

const isBareDirArg = (arg: string, options: Options) => !arg.startsWith('--') && !options.dir

const handleDirFlag = (args: string[], index: number, options: Options) => {
  options.dir = args[index + INDEX_STEP]
  return index + NEXT_INDEX_STEP
}

const handleKindFlag = (args: string[], index: number, options: Options) => {
  const next = args[index + INDEX_STEP]
  if (next === 'web' || next === 'cli' || next === 'lib' || next === 'auto') {
    options.kind = next
    return index + NEXT_INDEX_STEP
  }
  throw new Error(`Invalid --kind: ${next ?? '(missing)'}`)
}

const handleTailwindFlag = (_args: string[], index: number, options: Options) => {
  options.tailwind = true
  return index + INDEX_STEP
}

const handleForceFlag = (_args: string[], index: number, options: Options) => {
  options.force = true
  return index + INDEX_STEP
}

const handleHelpFlag = (_args: string[], index: number, _options: Options) => {
  console.log(USAGE.trim())
  process.exit(EXIT_SUCCESS)
  return index
}

const argHandlers: Record<string, ArgHandler> = {
  '--dir': handleDirFlag,
  '--force': handleForceFlag,
  '--help': handleHelpFlag,
  '--kind': handleKindFlag,
  '--tailwind': handleTailwindFlag,
  '-h': handleHelpFlag,
}

const ensureDir = async (dir: string) => {
  await mkdir(dir, { recursive: true })
}

// eslint-disable-next-line max-statements
const stripJsonComments = (input: string) => {
  let output = ''
  let inString = false
  let stringChar = ''
  let index = 0

  while (index < input.length) {
    const char = input[index]
    const next = input[index + INDEX_STEP]

    if (inString) {
      output += char
      if (char === '\\' && next) {
        output += next
        index += NEXT_INDEX_STEP
      } else {
        if (char === stringChar) {
          inString = false
        }
        index += INDEX_STEP
      }
    } else if (char === '"' || char === "'") {
      inString = true
      stringChar = char
      output += char
      index += INDEX_STEP
    } else if (char === '/' && next === '/') {
      index += NEXT_INDEX_STEP
      while (index < input.length && input[index] !== '\n') {
        index += INDEX_STEP
      }
    } else if (char === '/' && next === '*') {
      index += NEXT_INDEX_STEP
      while (index < input.length && !(input[index] === '*' && input[index + INDEX_STEP] === '/')) {
        index += INDEX_STEP
      }
      index += NEXT_INDEX_STEP
    } else {
      output += char
      index += INDEX_STEP
    }
  }

  return output
}

const readJson = async <TData>(filePath: string): Promise<TData> => {
  const contents = await readFile(filePath, 'utf8')
  const cleaned = stripJsonComments(contents)
  return JSON.parse(cleaned) as TData
}

const writeJson = async (filePath: string, data: unknown) => {
  const contents = `${JSON.stringify(data, undefined, JSON_INDENT)}\n`
  await writeFile(filePath, contents, 'utf8')
}

const writeIfMissing = async (filePath: string, contents: string, force: boolean) => {
  if (existsSync(filePath) && !force) {
    return false
  }
  await writeFile(filePath, contents, 'utf8')
  return true
}

const getPackageJson = async (dir: string) => {
  const packagePath = path.join(dir, 'package.json')
  if (!existsSync(packagePath)) {
    throw new Error(`Missing package.json at ${packagePath}`)
  }

  return {
    data: await readJson<Record<string, unknown>>(packagePath),
    path: packagePath,
  }
}

const coerceDeps = (pkg: Record<string, unknown>) => {
  const deps = (pkg.dependencies ?? {}) as Record<string, string>
  const devDeps = (pkg.devDependencies ?? {}) as Record<string, string>
  return { deps, devDeps }
}

const detectKind = (pkg: Record<string, unknown>): Exclude<Kind, 'auto'> => {
  const { deps, devDeps } = coerceDeps(pkg)
  const allDeps = new Set([...Object.keys(deps), ...Object.keys(devDeps)])

  if (allDeps.has('react') || allDeps.has('react-dom') || allDeps.has('next') || allDeps.has('vite')) {
    return 'web'
  }

  if (typeof pkg.bin === 'string' || typeof pkg.bin === 'object') {
    return 'cli'
  }

  if (typeof pkg.name === 'string' && pkg.name.toLowerCase().includes('cli')) {
    return 'cli'
  }

  return 'lib'
}

const detectTailwind = (pkg: Record<string, unknown>) => {
  const { deps, devDeps } = coerceDeps(pkg)
  return Boolean(deps.tailwindcss || devDeps.tailwindcss)
}

const detectReact = (pkg: Record<string, unknown>) => {
  const { deps, devDeps } = coerceDeps(pkg)
  return Boolean(deps.react || devDeps.react)
}

const ensurePackageJson = async (dir: string, pkg: Record<string, unknown>, kind: Exclude<Kind, 'auto'>) => {
  const scripts = (pkg.scripts ?? {}) as Record<string, string>
  const devDependencies = (pkg.devDependencies ?? {}) as Record<string, string>

  applyQaScripts(scripts, kind)
  applyQaDevDependencies(devDependencies, kind)
  await writePackageJson({ devDependencies, dir, pkg, scripts })
}

const ensurePrettierConfig = async (dir: string, tailwind: boolean, force: boolean) => {
  const configPath = path.join(dir, 'prettier.config.cjs')
  const target = resolvePrettierTarget(tailwind)
  const contents = `module.exports = require('${target}')\n`
  await writeIfMissing(configPath, contents, force)
}

const ensureOxlintConfig = async (dir: string, force: boolean) => {
  const configPath = path.join(dir, 'oxlint.json')
  if (!existsSync(configPath) || force) {
    const contents = `{
  "$schema": "../../node_modules/oxlint/configuration_schema.json",
  "extends": ["@merossity/qa/oxlint"]
}\n`
    await writeFile(configPath, contents, 'utf8')
  } else {
    await updateOxlintConfig(configPath)
  }
}

const resolveTsconfigPreset = (kind: Exclude<Kind, 'auto'>, pkg: Record<string, unknown>) => {
  if (kind === 'web') {
    return '@merossity/qa/tsconfig/web'
  }
  // CLI packages may use React (e.g. Ink) but still want "node" defaults (no DOM libs).
  if (kind === 'cli') {
    return '@merossity/qa/tsconfig/node'
  }
  const isReact = detectReact(pkg)
  if (isReact) {
    return '@merossity/qa/tsconfig/react-lib'
  }
  return '@merossity/qa/tsconfig/node'
}

interface TsconfigOptions {
  dir: string
  kind: Exclude<Kind, 'auto'>
  pkg: Record<string, unknown>
  force: boolean
}

const ensureTsconfig = async ({ dir, kind, pkg, force }: TsconfigOptions) => {
  const preset = resolveTsconfigPreset(kind, pkg)
  const configPath = path.join(dir, 'tsconfig.json')
  if (!existsSync(configPath)) {
    await writeJson(configPath, { extends: preset })
    return
  }

  const existing = await readJson<Record<string, unknown>>(configPath)
  if (force || !existing.extends) {
    existing.extends = preset
  }
  await writeJson(configPath, existing)
}

const ensureBunupConfig = async (dir: string, kind: Exclude<Kind, 'auto'>, force: boolean) => {
  if (kind === 'web') {
    return
  }

  const configPath = path.join(dir, 'bunup.config.ts')
  if (existsSync(configPath) && !force) {
    return
  }

  const isLib = kind === 'lib'
  const format = buildBunupFormat(isLib)
  const extraFields = buildBunupExtraFields(isLib)
  const contents = `import { defineConfig } from "bunup";

export default defineConfig({
  entry: ["src/index.ts"],
  outDir: "dist",
  format: [${format}],
  target: "node",
  sourcemap: true${extraFields}
});
`

  await writeFile(configPath, contents, 'utf8')
}

const main = async () => {
  const options = parseArgs()
  const { dir, resolvedKind, resolvedTailwind, pkg } = await resolveRunOptions(options)

  await ensurePackageJson(dir, pkg, resolvedKind)
  await ensurePrettierConfig(dir, resolvedTailwind, options.force)
  await ensureOxlintConfig(dir, options.force)
  await ensureTsconfig({ dir, force: options.force, kind: resolvedKind, pkg })
  await ensureBunupConfig(dir, resolvedKind, options.force)

  console.log(`QA config applied to ${dir} (kind: ${resolvedKind}, tailwind: ${resolvedTailwind})`)
}

const applyQaScripts = (scripts: Record<string, string>, kind: Exclude<Kind, 'auto'>) => {
  scripts.lint = 'oxlint --config oxlint.json --fix .'
  scripts.format = 'prettier --config prettier.config.cjs --write .'
  scripts.typecheck = 'tsc -p tsconfig.json --noEmit'

  if (kind !== 'web') {
    scripts.build = 'bunup'
  }
}

const applyQaDevDependencies = (devDependencies: Record<string, string>, kind: Exclude<Kind, 'auto'>) => {
  devDependencies['@merossity/qa'] = 'workspace:*'
  if (kind !== 'web') {
    devDependencies.bunup = 'latest'
  }
}

interface PackageJsonUpdate {
  dir: string
  pkg: Record<string, unknown>
  scripts: Record<string, string>
  devDependencies: Record<string, string>
}

const writePackageJson = async ({ dir, pkg, scripts, devDependencies }: PackageJsonUpdate) => {
  pkg.scripts = scripts
  pkg.devDependencies = devDependencies
  await writeJson(path.join(dir, 'package.json'), pkg)
}

const resolvePrettierTarget = (tailwind: boolean) => {
  let target = '@merossity/qa/prettier'
  if (tailwind) {
    target = '@merossity/qa/prettier-tailwind'
  }
  return target
}

const updateOxlintConfig = async (configPath: string) => {
  const config = await readJson<Record<string, unknown>>(configPath)
  const extendsField = coerceExtendsField(config.extends)

  if (!extendsField.includes('@merossity/qa/oxlint')) {
    extendsField.push('@merossity/qa/oxlint')
  }

  config.$schema = '../../node_modules/oxlint/configuration_schema.json'
  config.extends = extendsField
  await writeJson(configPath, config)
}

const coerceExtendsField = (value: unknown) => {
  if (Array.isArray(value)) {
    return value as string[]
  }
  if (typeof value === 'string') {
    return [value]
  }
  return []
}

const buildBunupFormat = (isLib: boolean) => {
  if (isLib) {
    return '"esm", "cjs"'
  }
  return '"esm"'
}

const buildBunupExtraFields = (isLib: boolean) => {
  if (isLib) {
    return ',\n  dts: true'
  }
  return ''
}

interface ResolvedRunOptions {
  dir: string
  resolvedKind: Exclude<Kind, 'auto'>
  resolvedTailwind: boolean
  pkg: Record<string, unknown>
}

const resolveRunOptions = async (options: Options): Promise<ResolvedRunOptions> => {
  const dir = resolveDir(options)
  await ensureDirExists(dir)

  const { data: pkg } = await getPackageJson(dir)
  const resolvedKind = resolveKind(options.kind, pkg)
  const resolvedTailwind = resolveTailwind(options.tailwind, pkg, resolvedKind)

  return { dir, pkg, resolvedKind, resolvedTailwind }
}

const REPO_ROOT = path.resolve(import.meta.dir, '../../..')
const QA_CWD = path.join(REPO_ROOT, 'packages', 'qa')

const resolveDir = (options: Options) => {
  if (!options.dir) {
    console.error('Missing --dir')
    console.log(USAGE.trim())
    process.exit(EXIT_FAILURE)
  }

  if (path.isAbsolute(options.dir)) {
    return options.dir
  }

  const cwd = process.cwd()
  if (cwd === QA_CWD || cwd.startsWith(`${QA_CWD}${path.sep}`)) {
    return path.resolve(REPO_ROOT, options.dir)
  }

  return path.resolve(cwd, options.dir)
}

const ensureDirExists = async (dir: string) => {
  if (!existsSync(dir)) {
    await ensureDir(dir)
  }
}

const resolveKind = (kind: Kind, pkg: Record<string, unknown>) => {
  if (kind === 'auto') {
    return detectKind(pkg)
  }
  return kind
}

const resolveTailwind = (tailwind: boolean | undefined, pkg: Record<string, unknown>, kind: Exclude<Kind, 'auto'>) => {
  if (tailwind !== undefined) {
    return tailwind
  }
  return detectTailwind(pkg) || kind === 'web'
}

main().catch((error) => {
  let message = String(error)
  if (error instanceof Error) {
    ;({ message } = error)
  }
  console.error(message)
  process.exit(EXIT_FAILURE)
})
