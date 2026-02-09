import { normalizeLevel } from './core'
import { logger } from './index'
import type { LoggerInit, LogLevel } from './types'

export interface CliFlags {
  debug?: string
  logLevel?: string
  verbose?: boolean
  json?: boolean
}

export const init = (flags: CliFlags): void => {
  const level = normalizeLevel(flags.logLevel) ?? (flags.verbose ? 'debug' : undefined)
  const debugNamespaces = flags.debug ? flags.debug.split(',').filter(Boolean) : []
  const options: LoggerInit = {
    debugNamespaces,
    json: Boolean(flags.json),
    level: level as LogLevel | undefined,
  }
  logger.init?.(options)
}
