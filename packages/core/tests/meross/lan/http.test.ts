import { describe, expect, it } from 'bun:test'
import { getSystemAll } from '../../../src/meross/lan/system-all'
import { setToggleX } from '../../../src/meross/lan/togglex'

describe('meross/lan http', () => {
  it('POSTs /config and returns parsed JSON', async () => {
    let lastPath = ''
    let lastBody: any = null

    const server = Bun.serve({
      port: 0,
      fetch(req) {
        lastPath = new URL(req.url).pathname
        return req
          .json()
          .then((json) => {
            lastBody = json
            return Response.json({ payload: { error: { code: 0 } } })
          })
          .catch(() => new Response('bad json', { status: 400 }))
      },
    })

    try {
      const host = `127.0.0.1:${server.port}`
      const key = 'k'

      const resp = await setToggleX<{ payload: { error: { code: number } } }>({ host, key, channel: 0, onoff: 1 })
      expect(resp.payload.error.code).toBe(0)
      expect(lastPath).toBe('/config')
      expect(lastBody?.header?.namespace).toBe('Appliance.Control.ToggleX')
      expect(lastBody?.header?.method).toBe('SET')
    } finally {
      server.stop(true)
    }
  })

  it('supports GET Appliance.System.All', async () => {
    let sawNamespace = ''

    const server = Bun.serve({
      port: 0,
      async fetch(req) {
        const json = (await req.json()) as any
        sawNamespace = json?.header?.namespace
        return Response.json({ payload: { all: { system: { hardware: { type: 'mock' } } } } })
      },
    })

    try {
      const host = `127.0.0.1:${server.port}`
      const key = 'k'

      const resp = await getSystemAll<any>({ host, key })
      expect(sawNamespace).toBe('Appliance.System.All')
      expect(resp?.payload?.all?.system?.hardware?.type).toBe('mock')
    } finally {
      server.stop(true)
    }
  })
})
