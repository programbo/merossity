import { describe, expect, it } from 'bun:test'
import { merossCloudListDevices } from '../../../src/meross/cloud/http'
import type { MerossCloudCredentials } from '../../../src/meross/cloud/types'

const CREDS: MerossCloudCredentials = {
  domain: 'iotx.meross.com',
  token: 't',
  key: 'k',
  userId: 'u',
  userEmail: 'e@example.com',
}

const makeFetch = (payload: unknown) =>
  (async (_url: string, _init: RequestInit): Promise<Response> => {
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as any

describe('merossCloudListDevices', () => {
  it('parses data.devList[]', async () => {
    const fetch = makeFetch({ apiStatus: 0, data: { devList: [{ uuid: 'abc' }] } })
    const list = await merossCloudListDevices(CREDS, { fetch: fetch as any })
    expect(list.map((d) => d.uuid)).toEqual(['abc'])
  })

  it('parses data.list[]', async () => {
    const fetch = makeFetch({ apiStatus: 0, data: { list: [{ uuid: 'def' }] } })
    const list = await merossCloudListDevices(CREDS, { fetch: fetch as any })
    expect(list.map((d) => d.uuid)).toEqual(['def'])
  })

  it('parses data as array', async () => {
    const fetch = makeFetch({ apiStatus: 0, data: [{ uuid: 'ghi' }] })
    const list = await merossCloudListDevices(CREDS, { fetch: fetch as any })
    expect(list.map((d) => d.uuid)).toEqual(['ghi'])
  })

  it('throws with diagnostic metadata when unrecognized', async () => {
    const fetch = makeFetch({ apiStatus: 0, data: { ok: true, device: { uuid: 'nope' } } })
    await expect(merossCloudListDevices(CREDS, { fetch: fetch as any })).rejects.toThrow(/missing devList/)
    await expect(merossCloudListDevices(CREDS, { fetch: fetch as any })).rejects.toThrow(/dataType=object/)
  })
})
