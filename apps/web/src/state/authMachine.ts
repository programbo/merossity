import { assign, fromPromise, setup } from 'xstate'
import { ApiError, apiPost } from '../lib/api'
import type { CloudSummary } from '../lib/types'

export type LoginRegion = 'auto' | 'global' | 'us' | 'eu' | 'ap'

const domainForRegion = (region: LoginRegion): string | undefined => {
  if (region === 'global') return 'iotx.meross.com'
  if (region === 'us') return 'iotx-us.meross.com'
  if (region === 'eu') return 'iotx-eu.meross.com'
  if (region === 'ap') return 'iotx-ap.meross.com'
  return undefined
}

type AuthContext = {
  email: string
  password: string
  totp: string
  region: LoginRegion
  cloud: CloudSummary | null
  error: string | null
}

type AuthEvent =
  | { type: 'SET_EMAIL'; email: string }
  | { type: 'SET_PASSWORD'; password: string }
  | { type: 'SET_TOTP'; totp: string }
  | { type: 'SET_REGION'; region: LoginRegion }
  | { type: 'SUBMIT' }

const isTotpValid = (s: string) => /^[0-9]{6}$/.test(String(s ?? '').trim())

const formatAuthError = (error: unknown): string => {
  if (!(error instanceof ApiError)) {
    return error instanceof Error ? error.message : String(error)
  }

  const details = error.details && typeof error.details === 'object' ? (error.details as Record<string, unknown>) : null
  const info = typeof details?.info === 'string' ? details.info.trim() : ''
  const apiStatus = typeof details?.apiStatus === 'number' ? details.apiStatus : null

  if (error.code === 'mfa_required') {
    return 'MFA required. Enter a current 6-digit TOTP code and try again.'
  }
  if (info && apiStatus !== null) return `${info} (Meross status ${apiStatus}).`
  if (info) return info
  if (apiStatus !== null) return `${error.message} (Meross status ${apiStatus}).`
  return error.message
}

export const authMachine = setup({
  types: {
    context: {} as AuthContext,
    events: {} as AuthEvent,
  },
  actions: {
    setEmail: assign((_, params: { email: string }) => ({
      email: params.email,
      error: null,
    })),
    setPassword: assign((_, params: { password: string }) => ({
      password: params.password,
      error: null,
    })),
    setTotp: assign((_, params: { totp: string }) => ({
      totp: params.totp,
      error: null,
    })),
    setRegion: assign((_, params: { region: LoginRegion }) => ({
      region: params.region,
      error: null,
    })),
    setCloud: assign({
      cloud: (_, params: { cloud: CloudSummary | null }) => params.cloud,
      error: null,
    }),
    setError: assign({
      error: (_, params: { message: string }) => params.message,
    }),
    clearSensitive: assign({
      password: '',
      totp: '',
    }),
  },
  guards: {
    canSubmit: ({ context }) => isTotpValid(context.totp) && Boolean(context.email.trim() && context.password),
  },
  actors: {
    loginFlow: fromPromise(
      async ({ input }: { input: { email: string; password: string; totp: string; region: LoginRegion } }) => {
        const domain = domainForRegion(input.region)
        const body: { email: string; password: string; mfaCode: string; domain?: string } = {
          email: input.email.trim(),
          password: input.password,
          mfaCode: input.totp.trim(),
        }
        if (domain) body.domain = domain

        const res = await apiPost<{ cloud: CloudSummary }>('/api/cloud/login', body)
        return { cloud: res.cloud }
      },
    ),
  },
}).createMachine({
  id: 'auth',
  initial: 'editing',
  context: {
    email: '',
    password: '',
    totp: '',
    region: 'auto',
    cloud: null,
    error: null,
  },
  on: {
    SET_EMAIL: { actions: { type: 'setEmail', params: ({ event }) => ({ email: event.email }) } },
    SET_PASSWORD: { actions: { type: 'setPassword', params: ({ event }) => ({ password: event.password }) } },
    SET_TOTP: { actions: { type: 'setTotp', params: ({ event }) => ({ totp: event.totp }) } },
    SET_REGION: { actions: { type: 'setRegion', params: ({ event }) => ({ region: event.region }) } },
  },
  states: {
    editing: {
      on: {
        SUBMIT: [{ guard: 'canSubmit', target: 'submitting' }, { actions: [] }],
      },
    },
    submitting: {
      invoke: {
        src: 'loginFlow',
        input: ({ context }) => ({
          email: context.email,
          password: context.password,
          totp: context.totp,
          region: context.region,
        }),
        onDone: {
          target: 'success',
          actions: [
            {
              type: 'setCloud',
              params: ({ event }) => ({
                cloud: event.output.cloud ?? null,
              }),
            },
            { type: 'clearSensitive' },
          ],
        },
        onError: {
          target: 'editing',
          actions: [
            {
              type: 'setError',
              params: ({ event }) => ({
                message: formatAuthError(event.error),
              }),
            },
          ],
        },
      },
    },
    success: {
      type: 'final',
    },
  },
})
