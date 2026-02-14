import os from 'node:os'
import path from 'node:path'
import type { MerossCloudCredentials, MerossCloudDevice } from './cloud'

export type MerossDeviceHostMap = Record<
  string,
  {
    host: string
    updatedAt: string
    mac?: string
  }
>

export type MerossConfig = {
  cloud?: MerossCloudCredentials & { updatedAt: string }
  devices?: { updatedAt: string; list: MerossCloudDevice[] }
  hosts?: MerossDeviceHostMap
  network?: { cidr?: string; updatedAt: string }
}

export function defaultMerossConfigPath(): string {
  const dir = path.join(os.homedir(), '.config', 'merossity')
  return path.join(dir, 'config.json')
}

export async function loadMerossConfig(filePath: string = defaultMerossConfigPath()): Promise<MerossConfig> {
  try {
    const text = await Bun.file(filePath).text()
    const parsed = JSON.parse(text) as MerossConfig
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed
  } catch {
    return {}
  }
}

export async function saveMerossConfig(
  config: MerossConfig,
  filePath: string = defaultMerossConfigPath(),
): Promise<void> {
  const dir = path.dirname(filePath)
  // Bun.write doesn't create directories.
  const { mkdir } = await import('node:fs/promises')
  await mkdir(dir, { recursive: true })
  await Bun.write(filePath, `${JSON.stringify(config, null, 2)}\n`)
}
