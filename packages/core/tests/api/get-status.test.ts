import os from 'node:os'
import path from 'node:path'
import { mkdtemp, rm } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { createGetStatusHandler } from '../../src/api/get-status'
import { saveMerossConfig } from '../../src/meross/config'

describe('api/status', () => {
  let tmpDir = ''
  let prevConfigPath: string | undefined

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'merossity-get-status-'))
    prevConfigPath = process.env.MEROSS_CONFIG_PATH
    process.env.MEROSS_CONFIG_PATH = path.join(tmpDir, 'config.json')
  })

  afterEach(async () => {
    if (prevConfigPath === undefined) delete process.env.MEROSS_CONFIG_PATH
    else process.env.MEROSS_CONFIG_PATH = prevConfigPath
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('returns config readiness only (no env block)', async () => {
    await saveMerossConfig(
      {
        cloud: {
          domain: 'iotx.meross.com',
          token: 't',
          key: 'k',
          userId: 'u',
          userEmail: 'u@example.com',
          updatedAt: '2026-02-14T00:00:00.000Z',
        },
        devices: {
          updatedAt: '2026-02-14T00:00:00.000Z',
          list: [{ uuid: 'abc' } as any],
        },
        hosts: {
          abc: {
            host: '192.168.1.2',
            updatedAt: '2026-02-14T00:00:00.000Z',
          },
        },
      },
      process.env.MEROSS_CONFIG_PATH,
    )

    const handler = createGetStatusHandler()
    const res = await handler.GET()
    const json = (await res.json()) as any

    expect(json.ok).toBe(true)
    expect('env' in json.data).toBe(false)
    expect(json.data.config.hasCloudCreds).toBe(true)
    expect(json.data.config.hasDevices).toBe(true)
    expect(json.data.config.hasHosts).toBe(true)
  })
})
