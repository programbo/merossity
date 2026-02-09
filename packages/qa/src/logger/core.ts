import type { LogLevel, LogMeta, Logger, LoggerInit, LoggerOptions } from './types'

const LEVEL_DEBUG = 10
const LEVEL_INFO = 20
const LEVEL_WARN = 30
const LEVEL_ERROR = 40
const LEVEL_SILENT = 50

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: LEVEL_DEBUG,
  error: LEVEL_ERROR,
  info: LEVEL_INFO,
  silent: LEVEL_SILENT,
  warn: LEVEL_WARN,
}

const COLORS = { cyan: '\x1b[36m', dim: '\x1b[2m', red: '\x1b[31m', reset: '\x1b[0m', yellow: '\x1b[33m' }

export const normalizeLevel = (level?: string): LogLevel | undefined => {
  if (!level) {
    return undefined
  }
  const value = level.toLowerCase()
  return value === 'debug' || value === 'info' || value === 'warn' || value === 'error' || value === 'silent'
    ? value
    : undefined
}

const stripMsg = (meta?: LogMeta) => {
  if (!meta) {
    return {}
  }
  const { msg: _msg, ...rest } = meta as { msg?: unknown } & LogMeta
  return rest
}

const formatMeta = (meta: LogMeta) =>
  Object.entries(meta)
    .map(([key, value]) => `${key}=${typeof value === 'string' ? value : JSON.stringify(value)}`)
    .join(' ')

const levelColor = (level: LogLevel) => {
  switch (level) {
    case 'debug': {
      return COLORS.dim
    }
    case 'info': {
      return COLORS.cyan
    }
    case 'warn': {
      return COLORS.yellow
    }
    case 'error': {
      return COLORS.red
    }
    default: {
      return COLORS.reset
    }
  }
}

const shouldLog = (level: LogLevel, configured: LogLevel) => LEVEL_ORDER[level] >= LEVEL_ORDER[configured]

interface FormatArgs {
  isTTY: boolean
  json: boolean
  level: LogLevel
  meta: LogMeta
  msg: string
  timestamp: () => number
}

export const formatMessage = ({ isTTY, json, level, meta, msg, timestamp }: FormatArgs): string => {
  if (json) {
    return `${JSON.stringify({ level, msg, timestamp: timestamp(), ...meta })}\n`
  }
  const levelLabel = level.toUpperCase()
  const colored = isTTY ? `${levelColor(level)}${levelLabel}${COLORS.reset}` : levelLabel
  const metaText = formatMeta(meta)
  return `${colored} ${msg}${metaText ? ` ${metaText}` : ''}\n`
}

export const createLogger = (options: LoggerOptions = {}): Logger => {
  const state = {
    baseMeta: stripMsg(options.baseMeta),
    isTTY: options.isTTY,
    json: options.json ?? false,
    level: options.level ?? 'info',
    stderr: options.stderr ?? process.stderr,
    stdout: options.stdout ?? process.stdout,
    timestamp: options.timestamp ?? (() => Date.now()),
  }

  const write = (level: LogLevel, msg: string, meta?: LogMeta): void => {
    if (!shouldLog(level, state.level)) {
      return
    }
    const stream = level === 'warn' || level === 'error' ? state.stderr : state.stdout
    const isTTY = state.isTTY ?? stream.isTTY ?? false
    const mergedMeta = { ...state.baseMeta, ...stripMsg(meta) }
    stream.write(formatMessage({ isTTY, json: state.json, level, meta: mergedMeta, msg, timestamp: state.timestamp }))
  }

  const applyInit = (next: LoggerInit) => {
    Object.assign(state, {
      ...(next.level && { level: next.level }),
      ...(next.stdout && { stdout: next.stdout }),
      ...(next.stderr && { stderr: next.stderr }),
      ...(next.timestamp && { timestamp: next.timestamp }),
      ...(next.json !== undefined && { json: next.json }),
      ...(next.isTTY !== undefined && { isTTY: next.isTTY }),
    })
  }

  const logger: Logger = {
    child: (meta) =>
      createLogger({
        baseMeta: { ...state.baseMeta, ...stripMsg(meta) },
        isTTY: state.isTTY,
        json: state.json,
        level: state.level,
        stderr: state.stderr,
        stdout: state.stdout,
        timestamp: state.timestamp,
      }),
    debug: (msg, meta) => write('debug', msg, meta),
    error: (msg, meta) => write('error', msg, meta),
    info: (msg, meta) => write('info', msg, meta),
    init: applyInit,
    json: state.json,
    level: state.level,
    warn: (msg, meta) => write('warn', msg, meta),
  }

  return logger
}
