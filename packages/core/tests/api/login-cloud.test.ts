import os from 'node:os'
import path from 'node:path'
import { mkdtemp, rm } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { createLoginCloudHandler } from '../../src/api/login-cloud'
import { loadMerossConfig } from '../../src/meross/config'

const jsonRequest = (body: unknown) =>
  new Request('http://localhost/api/cloud/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('api/cloud/login', () => {
  let tmpDir = ''
  let prevConfigPath: string | undefined
  let prevEmail: string | undefined
  let prevPassword: string | undefined

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'merossity-login-cloud-'))
    prevConfigPath = process.env.MEROSS_CONFIG_PATH
    prevEmail = process.env.MEROSS_EMAIL
    prevPassword = process.env.MEROSS_PASSWORD
    process.env.MEROSS_CONFIG_PATH = path.join(tmpDir, 'config.json')
  })

  afterEach(async () => {
    if (prevConfigPath === undefined) delete process.env.MEROSS_CONFIG_PATH
    else process.env.MEROSS_CONFIG_PATH = prevConfigPath
    if (prevEmail === undefined) delete process.env.MEROSS_EMAIL
    else process.env.MEROSS_EMAIL = prevEmail
    if (prevPassword === undefined) delete process.env.MEROSS_PASSWORD
    else process.env.MEROSS_PASSWORD = prevPassword
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('returns missing_creds when body credentials are missing even if env vars are present', async () => {
    process.env.MEROSS_EMAIL = 'env@example.com'
    process.env.MEROSS_PASSWORD = 'env-pw'

    const handler = createLoginCloudHandler()
    const res = await handler.POST(jsonRequest({ mfaCode: '123456' }))
    const json = (await res.json()) as any

    expect(json.ok).toBe(false)
    expect(json.error.code).toBe('missing_creds')
  })

  it('accepts explicit body credentials and persists cloud creds', async () => {
    let server: ReturnType<typeof Bun.serve> | null = null
    server = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      async fetch(): Promise<Response> {
        return Response.json({
          apiStatus: 0,
          data: {
            token: 'token-1',
            key: 'key-1',
            userid: 'user-1',
            email: 'user@example.com',
            domain: `127.0.0.1:${server!.port}`,
          },
        })
      },
    })

    try {
      const handler = createLoginCloudHandler()
      const res = await handler.POST(
        jsonRequest({
          email: 'user@example.com',
          password: 'pw-1',
          mfaCode: '123456',
          domain: `127.0.0.1:${server.port}`,
          scheme: 'http',
        }),
      )
      const json = (await res.json()) as any

      expect(json.ok).toBe(true)
      expect(json.data.cloud.key).toBe('key-1')
      expect(json.data.cloud.userEmail).toBe('user@example.com')

      const cfg = await loadMerossConfig(process.env.MEROSS_CONFIG_PATH!)
      expect(cfg.cloud?.key).toBe('key-1')
      expect(cfg.cloud?.token).toBe('token-1')
      expect(cfg.cloud?.userId).toBe('user-1')
      expect(typeof cfg.cloud?.updatedAt).toBe('string')
    } finally {
      server.stop(true)
    }
  })

  it('maps MFA failures to mfa_required', async () => {
    let server: ReturnType<typeof Bun.serve> | null = null
    server = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      async fetch(): Promise<Response> {
        return Response.json({
          apiStatus: 5001,
          info: 'MFA verification required',
          data: {},
        })
      },
    })

    try {
      const handler = createLoginCloudHandler()
      const res = await handler.POST(
        jsonRequest({
          email: 'user@example.com',
          password: 'pw-1',
          mfaCode: '123456',
          domain: `127.0.0.1:${server.port}`,
          scheme: 'http',
        }),
      )
      const json = (await res.json()) as any

      expect(json.ok).toBe(false)
      expect(json.error.code).toBe('mfa_required')
    } finally {
      server.stop(true)
    }
  })
})
