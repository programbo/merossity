import { describe, expect, it } from 'bun:test'
import { createActor, fromPromise, waitFor } from 'xstate'

import { appMachine } from './appMachine'

const STATUS_OK = {
  env: { hasEmail: true, hasPassword: true, hasKey: false },
  config: {
    path: '/tmp/config.json',
    hasCloudCreds: false,
    hasDevices: false,
    hasHosts: false,
    updatedAt: {},
  },
} as any

describe('appMachine', () => {
  it('boots into needsCloudKey when no cloud creds exist', async () => {
    const machine = appMachine.provide({
      actors: {
        bootstrap: (fromPromise(async () => ({
          status: STATUS_OK,
          cloud: null,
          devices: [],
          hosts: {},
        })) as any),
      },
    })

    const actor = createActor(machine, { input: { initialCidr: '' } })
    actor.start()

    await waitFor(actor, (s) => s.matches({ app: { gate: { needsCloudKey: 'editing' } } }))
  })

  it('requires a 6-digit TOTP before submitting', async () => {
    const machine = appMachine.provide({
      actors: {
        bootstrap: (fromPromise(async () => ({
          status: STATUS_OK,
          cloud: null,
          devices: [],
          hosts: {},
        })) as any),
      },
    })

    const actor = createActor(machine, { input: { initialCidr: '' } })
    actor.start()
    await waitFor(actor, (s) => s.matches({ app: { gate: { needsCloudKey: 'editing' } } }))

    actor.send({ type: 'CONNECT.SET_EMAIL', email: 'a@example.com' })
    actor.send({ type: 'CONNECT.SET_PASSWORD', password: 'pw' })
    actor.send({ type: 'CONNECT.SET_TOTP', totp: '12345' })
    actor.send({ type: 'CONNECT.SUBMIT' })

    // Still editing (guard blocks submit).
    expect(actor.getSnapshot().matches({ app: { gate: { needsCloudKey: 'editing' } } })).toBe(true)
  })

  it('after successful login, hydrates inventory then enters idle', async () => {
    const machine = appMachine.provide({
      actors: {
        bootstrap: (fromPromise(async () => ({
          status: STATUS_OK,
          cloud: null,
          devices: [],
          hosts: {},
        })) as any),
        loginFlow: (fromPromise(async () => ({
          status: STATUS_OK,
          cloud: {
            domain: 'iotx.meross.com',
            userId: 'u',
            userEmail: 'a@example.com',
            key: 'k',
            tokenRedacted: 't',
          },
          resCloud: {
            domain: 'iotx.meross.com',
            userId: 'u',
            userEmail: 'a@example.com',
            key: 'k',
            tokenRedacted: 't',
          },
        })) as any),
        refreshDevicesFromCloud: (fromPromise(async () => ({ count: 0, list: [] })) as any),
        cidrSuggest: (fromPromise(async () => ({ suggestions: [], default: '192.168.0.0/24' })) as any),
        discoverHosts: (fromPromise(async () => ({ cidr: '192.168.0.0/24', count: 0, hosts: {}, hostsAll: {} })) as any),
      },
    })

    const actor = createActor(machine, { input: { initialCidr: '' } })
    actor.start()
    await waitFor(actor, (s) => s.matches({ app: { gate: { needsCloudKey: 'editing' } } }))

    actor.send({ type: 'CONNECT.SET_EMAIL', email: 'a@example.com' })
    actor.send({ type: 'CONNECT.SET_PASSWORD', password: 'pw' })
    actor.send({ type: 'CONNECT.SET_TOTP', totp: '123456' })
    actor.send({ type: 'CONNECT.SUBMIT' })

    await waitFor(actor, (s) =>
      s.matches({ app: { gate: { hasCloudKey: { inventory: 'idle', scan: 'idle', control: 'idle' } } } }),
    )
  })
})
