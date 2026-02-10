import type { MerossCloudDump } from './types'

export class MerossDumpParseError extends Error {
  override name = 'MerossDumpParseError'
}

export const parseMerossCloudDump = (json: string): MerossCloudDump => {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch (e) {
    throw new MerossDumpParseError(`Invalid JSON: ${(e as Error).message}`)
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new MerossDumpParseError('Expected object')
  }

  const obj = parsed as Record<string, unknown>
  const cloud = obj.cloud as Record<string, unknown> | undefined
  const devices = obj.devices as unknown

  if (!cloud || typeof cloud !== 'object') {
    throw new MerossDumpParseError('Missing cloud object')
  }
  if (typeof cloud.domain !== 'string' || typeof cloud.key !== 'string' || typeof cloud.mqtt_domain !== 'string') {
    throw new MerossDumpParseError('cloud.domain, cloud.key, cloud.mqtt_domain are required')
  }
  if (!Array.isArray(devices)) {
    throw new MerossDumpParseError('devices must be an array')
  }

  // Trust device shape loosely (SDK fields vary). We only require uuid when we use it.
  return parsed as MerossCloudDump
}

export const loadMerossCloudDumpFile = async (path: string): Promise<MerossCloudDump> => {
  const text = await Bun.file(path).text()
  return parseMerossCloudDump(text)
}

