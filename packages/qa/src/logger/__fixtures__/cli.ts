#!/usr/bin/env bun
import { init } from '../cli-init'
import { debug, logger } from '../index'

const ARG_START = 2
const STEP = 1

const args = process.argv.slice(ARG_START)
const flags: { debug?: string; logLevel?: string; verbose?: boolean; json?: boolean } = {}
for (const arg of args) {
  if (arg.startsWith('--debug=')) {
    flags.debug = arg.slice('--debug='.length)
  } else if (arg.startsWith('--log-level=')) {
    flags.logLevel = arg.slice('--log-level='.length)
  } else if (arg === '--verbose') {
    flags.verbose = true
  } else if (arg === '--json') {
    flags.json = true
  }
}

init(flags)
logger.info('cli run', { cli: true })
const log = debug('mycli:project')
log('debug enabled', { step: STEP })
