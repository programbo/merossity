import { describe, expect, it } from 'bun:test'
import crypto from 'node:crypto'

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
        const bodyText = await req.text()
        const sp = new URLSearchParams(bodyText)
        const paramsB64 = sp.get('params') ?? ''
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
})
