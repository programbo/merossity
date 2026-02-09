import type { LogMeta } from './types'

const EMPTY = 0

export type DebugLog = (msg: string, meta?: LogMeta) => void

let debugNamespaces: string[] | undefined = undefined
let debugLogger: DebugLog = () => undefined

const noop: DebugLog = () => undefined

export const setDebugLogger = (logger: DebugLog): void => {
  debugLogger = logger
}

export const setDebugNamespaces = (namespaces?: string[]): void => {
  debugNamespaces = namespaces && namespaces.length ? namespaces : undefined
}

export const matchesNamespace = (namespace: string, patterns: string[]): boolean =>
  patterns.some((pattern) => {
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, String.raw`\$&`)
    const regex = new RegExp(`^${escaped.replace(/\*/g, '.*')}$`)
    return regex.test(namespace)
  })

export const debug = (namespace: string): DebugLog => {
  if (!debugNamespaces || debugNamespaces.length === EMPTY) {
    return noop
  }
  if (!matchesNamespace(namespace, debugNamespaces)) {
    return noop
  }
  return (msg: string, meta?: LogMeta) => {
    debugLogger(`[${namespace}] ${msg}`, { namespace, ...meta })
  }
}

export const withDebug = async <TResult>(
  namespace: string,
  task: () => TResult | Promise<TResult>,
): Promise<TResult> => {
  const log = debug(namespace)
  if (log === noop) {
    return await task()
  }
  const start = Date.now()
  log('start')
  return await Promise.resolve(task())
    .then((result) => {
      log(`done +${Date.now() - start}ms`)
      return result
    })
    .catch((error) => {
      log(`fail +${Date.now() - start}ms`)
      throw error
    })
}
