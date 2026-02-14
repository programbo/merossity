import { describe, expect, it } from 'bun:test'
import { createActor, fromPromise, waitFor } from 'xstate'
import { ApiError } from '../lib/api'
import type { CloudSummary } from '../lib/types'
import { authMachine } from './authMachine'

const CLOUD: CloudSummary = {
  domain: 'iotx.meross.com',
  userId: 'user-1',
  userEmail: 'a@example.com',
  key: 'k',
  tokenRedacted: 't',
}

describe('authMachine', () => {
  it('submits only when email, password, and valid TOTP are present', async () => {
    const machine = authMachine.provide({
      actors: {
        loginFlow: fromPromise(async () => ({ cloud: CLOUD })),
      },
    })
    const actor = createActor(machine)
    actor.start()

    actor.send({ type: 'SET_EMAIL', email: 'a@example.com' })
    actor.send({ type: 'SET_PASSWORD', password: 'pw' })
    actor.send({ type: 'SET_TOTP', totp: '123456' })
    actor.send({ type: 'SUBMIT' })

    await waitFor(actor, (s) => s.matches('success'))
    expect(actor.getSnapshot().context.cloud?.key).toBe('k')
  })

  it('blocks submit for invalid TOTP', async () => {
    const machine = authMachine.provide({
      actors: {
        loginFlow: fromPromise(async () => ({ cloud: CLOUD })),
      },
    })
    const actor = createActor(machine)
    actor.start()

    actor.send({ type: 'SET_EMAIL', email: 'a@example.com' })
    actor.send({ type: 'SET_PASSWORD', password: 'pw' })
    actor.send({ type: 'SET_TOTP', totp: '12345' })
    actor.send({ type: 'SUBMIT' })

    expect(actor.getSnapshot().matches('editing')).toBe(true)
    expect(actor.getSnapshot().context.cloud).toBeNull()
  })

  it('stores error message when login fails', async () => {
    const machine = authMachine.provide({
      actors: {
        loginFlow: fromPromise(async (): Promise<{ cloud: CloudSummary }> => {
          throw new Error('Invalid credentials')
        }),
      },
    })
    const actor = createActor(machine)
    actor.start()

    actor.send({ type: 'SET_EMAIL', email: 'a@example.com' })
    actor.send({ type: 'SET_PASSWORD', password: 'pw' })
    actor.send({ type: 'SET_TOTP', totp: '123456' })
    actor.send({ type: 'SUBMIT' })

    await waitFor(actor, (s) => s.matches('editing') && Boolean(s.context.error))
    expect(actor.getSnapshot().context.error).toBe('Invalid credentials')
  })

  it('uses Meross error details when present', async () => {
    const machine = authMachine.provide({
      actors: {
        loginFlow: fromPromise(async (): Promise<{ cloud: CloudSummary }> => {
          throw new ApiError('Cloud signIn failed', 'cloud_error', {
            apiStatus: 1004,
            info: 'Wrong email or password',
          })
        }),
      },
    })
    const actor = createActor(machine)
    actor.start()

    actor.send({ type: 'SET_EMAIL', email: 'a@example.com' })
    actor.send({ type: 'SET_PASSWORD', password: 'pw' })
    actor.send({ type: 'SET_TOTP', totp: '123456' })
    actor.send({ type: 'SUBMIT' })

    await waitFor(actor, (s) => s.matches('editing') && Boolean(s.context.error))
    expect(actor.getSnapshot().context.error).toBe('Wrong email or password (Meross status 1004).')
  })

  it('clears stale error on field edits', async () => {
    const machine = authMachine.provide({
      actors: {
        loginFlow: fromPromise(async (): Promise<{ cloud: CloudSummary }> => {
          throw new Error('Invalid credentials')
        }),
      },
    })
    const actor = createActor(machine)
    actor.start()

    actor.send({ type: 'SET_EMAIL', email: 'a@example.com' })
    actor.send({ type: 'SET_PASSWORD', password: 'pw' })
    actor.send({ type: 'SET_TOTP', totp: '123456' })
    actor.send({ type: 'SUBMIT' })
    await waitFor(actor, (s) => s.matches('editing') && Boolean(s.context.error))

    actor.send({ type: 'SET_TOTP', totp: '654321' })
    expect(actor.getSnapshot().context.error).toBeNull()
  })
})
