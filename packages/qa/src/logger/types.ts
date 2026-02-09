export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent'
export type LogMeta = Record<string, unknown>

export interface LoggerInit {
  level?: LogLevel
  json?: boolean
  debugNamespaces?: string[]
  stdout?: NodeJS.WriteStream
  stderr?: NodeJS.WriteStream
  isTTY?: boolean
  timestamp?: () => number
}

export interface LoggerOptions extends LoggerInit {
  baseMeta?: LogMeta
}

export interface Logger {
  level: LogLevel
  json: boolean
  init?: (options: LoggerInit) => void
  debug: (msg: string, meta?: LogMeta) => void
  info: (msg: string, meta?: LogMeta) => void
  warn: (msg: string, meta?: LogMeta) => void
  error: (msg: string, meta?: LogMeta) => void
  child: (meta: LogMeta) => Logger
}

export interface SpinnerOptions {
  text: string
  interval?: number
  stdout?: NodeJS.WriteStream
  isTTY?: boolean
}
