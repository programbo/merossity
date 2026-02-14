import crypto from 'node:crypto'
import { describe, expect, it } from 'bun:test'
import { merossCloudLogin } from '../../../src/meross/cloud/http'

describe('meross/cloud signing', () => {
  it('hashes password as md5 before sending', async () => {
    let sawPassword = ''

    // Fake cloud server: just decode params and inspect.
    let server: ReturnType<typeof Bun.serve>
    server = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      async fetch(req: Request): Promise<Response> {
        const json = (await req.json().catch(() => null)) as any
        const paramsB64 = String(json?.params ?? '')
        const decoded = Buffer.from(paramsB64, 'base64').toString('utf8')
        const parsed = JSON.parse(decoded) as any
        sawPassword = String(parsed.password ?? '')

        return Response.json({
          apiStatus: 0,
          data: { token: 't', key: 'k', userid: 'u', email: 'e', domain: `http://127.0.0.1:${server.port}` },
        })
      },
    })

    try {
      const res = await merossCloudLogin(
        { email: 'a@b.c', password: 'pw' },
        { domain: `127.0.0.1:${server.port}`, scheme: 'http', fetch: fetch },
      )
      expect(res.creds.token).toBe('t')

      const expected = crypto.createHash('md5').update('pw', 'utf8').digest('hex')
      expect(sawPassword).toBe(expected)
    } finally {
      server.stop(true)
    }
  })

  it('retries login on ap endpoint when default endpoint returns 1004', async () => {
    const seenHosts: string[] = []

    const mockFetch = (async (url: string | URL): Promise<Response> => {
      const u = new URL(String(url))
      seenHosts.push(u.host)

      if (u.host === 'iotx.meross.com' || u.host === 'iotx-us.meross.com' || u.host === 'iotx-eu.meross.com') {
        return Response.json({
          apiStatus: 1004,
          info: 'Wrong email or password',
          data: {},
        })
      }

      if (u.host === 'iotx-ap.meross.com') {
        return Response.json({
          apiStatus: 0,
          data: {
            token: 't',
            key: 'k',
            userid: 'u',
            email: 'e@example.com',
            domain: 'iotx-ap.meross.com',
          },
        })
      }

      return Response.json({
        apiStatus: 5000,
        info: `unexpected host ${u.host}`,
        data: {},
      })
    }) as unknown as typeof fetch

    const res = await merossCloudLogin({ email: 'a@b.c', password: 'pw' }, { fetch: mockFetch })
    expect(res.creds.domain).toBe('iotx-ap.meross.com')
    expect(seenHosts).toEqual(['iotx.meross.com', 'iotx-ap.meross.com'])
  })

  it('retries alternate built-in region even when a built-in domain is explicitly provided', async () => {
    const seenHosts: string[] = []

    const mockFetch = (async (url: string | URL): Promise<Response> => {
      const u = new URL(String(url))
      seenHosts.push(u.host)

      if (u.host === 'iotx-ap.meross.com') {
        return Response.json({
          apiStatus: 1004,
          info: 'Wrong password',
          data: {},
        })
      }

      if (u.host === 'iotx.meross.com') {
        return Response.json({
          apiStatus: 0,
          data: {
            token: 't',
            key: 'k',
            userid: 'u',
            email: 'e@example.com',
            domain: 'iotx.meross.com',
          },
        })
      }

      return Response.json({ apiStatus: 5000, info: 'unexpected host', data: {} })
    }) as unknown as typeof fetch

    const res = await merossCloudLogin(
      { email: 'a@b.c', password: 'pw' },
      { fetch: mockFetch, domain: 'iotx-ap.meross.com' },
    )
    expect(res.creds.domain).toBe('iotx.meross.com')
    expect(seenHosts).toEqual(['iotx-ap.meross.com', 'iotx.meross.com'])
  })
})
