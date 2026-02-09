import { writeFile } from 'node:fs/promises'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const safeSegment = (input: string) => input.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-')
const JSON_INDENT_SPACES = 2
const SINGLE_OPTION_ARGUMENTS = 1

type ArtifactContents = string | ArrayBuffer | ArrayBufferView
interface WriteArtifactOptions {
  type: string
  filename: string
  contents: ArtifactContents
  start?: string
}
type WriteArtifactArgs = [WriteArtifactOptions] | [string, string, ArtifactContents, string?]
interface WriteJsonArtifactOptions {
  type: string
  filename: string
  data: unknown
  start?: string
}

const hasWorkspaceConfig = (dir: string) => {
  const pkgPath = path.join(dir, 'package.json')
  if (!existsSync(pkgPath)) {
    return false
  }
  try {
    const raw = readFileSync(pkgPath, 'utf8')
    const pkg = JSON.parse(raw) as { workspaces?: unknown }
    return Boolean(pkg.workspaces)
  } catch {
    return false
  }
}

const isRepoRoot = (dir: string) => existsSync(path.join(dir, 'bun.lock')) || hasWorkspaceConfig(dir)

export const findRepoRoot = (start = process.cwd()) => {
  let current = path.resolve(start)
  while (true) {
    if (isRepoRoot(current)) {
      return current
    }
    const parent = path.dirname(current)
    if (parent === current) {
      return start
    }
    current = parent
  }
}

export const resolveOutputRoot = (start = process.cwd()) => path.join(findRepoRoot(start), 'output')

export const artifactDir = (type: string, start = process.cwd()) => {
  const dir = path.join(resolveOutputRoot(start), safeSegment(type))
  mkdirSync(dir, { recursive: true })
  return dir
}

export const artifactPath = (type: string, filename: string, start = process.cwd()) =>
  path.join(artifactDir(type, start), safeSegment(filename))

const normalizeArtifactContents = (contents: ArtifactContents) => {
  if (typeof contents === 'string') {
    return contents
  }

  if (contents instanceof ArrayBuffer) {
    return new Uint8Array(contents)
  }

  return new Uint8Array(contents.buffer, contents.byteOffset, contents.byteLength)
}

const resolveWriteArtifactOptions = (args: WriteArtifactArgs): WriteArtifactOptions => {
  const [firstArg] = args
  if (args.length === SINGLE_OPTION_ARGUMENTS) {
    return firstArg as WriteArtifactOptions
  }
  const [type, filename, contents, start] = args as [string, string, ArtifactContents, string?]
  return { contents, filename, start, type }
}

export const writeArtifact = async (...args: WriteArtifactArgs) => {
  const options = resolveWriteArtifactOptions(args)

  const filePath = artifactPath(options.type, options.filename, options.start ?? process.cwd())
  const payload = normalizeArtifactContents(options.contents)
  await writeFile(filePath, payload)
  return filePath
}

const resolveWriteJsonArtifactOptions = (
  args: [string, string, unknown, string?] | [WriteJsonArtifactOptions],
): WriteJsonArtifactOptions => {
  const [firstArg] = args
  if (args.length === SINGLE_OPTION_ARGUMENTS) {
    return firstArg as WriteJsonArtifactOptions
  }
  const [type, filename, data, start] = args as [string, string, unknown, string?]
  return { data, filename, start, type }
}

export const writeJsonArtifact = async (...args: [string, string, unknown, string?] | [WriteJsonArtifactOptions]) => {
  const options = resolveWriteJsonArtifactOptions(args)

  const payload = `${JSON.stringify(options.data, undefined, JSON_INDENT_SPACES)}\n`
  return await writeArtifact({
    contents: payload,
    filename: options.filename,
    start: options.start,
    type: options.type,
  })
}
