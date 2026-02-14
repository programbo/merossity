import { describe, expect, it } from 'bun:test'
import { createActor, fromPromise, waitFor } from 'xstate'
import type { CloudSummary } from '../lib/types'
import { appMachine } from './appMachine'

const CLOUD: CloudSummary = {
  domain: 'iotx.meross.com',
  userId: 'user-1',
  userEmail: 'a@example.com',
  key: 'k',
  tokenRedacted: 't',
}

const checkCloudCredsActor = (cloud: CloudSummary | null) =>
  fromPromise(async (): Promise<{ cloud: CloudSummary | null }> => ({ cloud }))

describe('appMachine', () => {
  it('boots to auth when cloud creds are missing', async () => {
    const machine = appMachine.provide({
      actors: {
        checkCloudCreds: checkCloudCredsActor(null),
      },
    })

    const actor = createActor(machine, { input: { initialCidr: '' } })
    actor.start()

    await waitFor(actor, (s) => s.matches({ active: 'auth' }))
    expect(actor.getSnapshot().context.cloud).toBeNull()
  })

  it('boots to devices when cloud creds are present', async () => {
    const machine = appMachine.provide({
      actors: {
        checkCloudCreds: checkCloudCredsActor(CLOUD),
      },
    })

    const actor = createActor(machine, { input: { initialCidr: '' } })
    actor.start()

    await waitFor(actor, (s) => s.matches({ active: 'devices' }))
    expect(actor.getSnapshot().context.cloud?.key).toBe('k')
  })

  it('moves from auth to devices after auth_loginSuccess', async () => {
    const machine = appMachine.provide({
      actors: {
        checkCloudCreds: checkCloudCredsActor(null),
      },
    })

    const actor = createActor(machine, { input: { initialCidr: '' } })
    actor.start()
    await waitFor(actor, (s) => s.matches({ active: 'auth' }))

    actor.send({ type: 'auth_loginSuccess', cloud: CLOUD })

    await waitFor(actor, (s) => s.matches({ active: 'devices' }))
    expect(actor.getSnapshot().context.cloud?.userEmail).toBe('a@example.com')
  })

  it('moves from devices to auth after auth_logout and clears cloud', async () => {
    const machine = appMachine.provide({
      actors: {
        checkCloudCreds: checkCloudCredsActor(CLOUD),
      },
    })

    const actor = createActor(machine, { input: { initialCidr: '' } })
    actor.start()
    await waitFor(actor, (s) => s.matches({ active: 'devices' }))

    actor.send({ type: 'auth_logout' })

    await waitFor(actor, (s) => s.matches({ active: 'auth' }))
    expect(actor.getSnapshot().context.cloud).toBeNull()
  })
})
