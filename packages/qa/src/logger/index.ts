/**
 * Example:
 * import { logger, debug, withDebug, Spinner } from "@bun-monorepo-template/qa/logger";
 * logger.info("Task started", { count: 42 });
 * const log = debug("mycli:project");
 * log("Found 3");
 * await withDebug("batch", () => heavyWork());
 * const spin = new Spinner("Building").start();
 * spin.succeed();
 */
import { createLogger, normalizeLevel } from './core'
import { debug, setDebugLogger, setDebugNamespaces, withDebug } from './debug'
import { Spinner } from './spinner'
import type { LoggerInit, LoggerOptions } from './types'

const envLevel = normalizeLevel(process.env.LOG_LEVEL)
const envDebug = process.env.DEBUG ? process.env.DEBUG.split(',').filter(Boolean) : []

const logger = createLogger({
  level: envLevel ?? 'info',
} satisfies LoggerOptions)

setDebugLogger((msg, meta) => logger.debug(msg, meta))
setDebugNamespaces(envDebug)

const baseInit = logger.init?.bind(logger)
logger.init = (options: LoggerInit = {}) => {
  const normalized = {
    ...options,
    level: normalizeLevel(options.level) ?? options.level,
  }
  baseInit?.(normalized)
  setDebugNamespaces(options.debugNamespaces ?? envDebug)
}

export { createLogger, logger, debug, withDebug, Spinner }
export * from './types'
