import { assign, fromPromise, setup } from 'xstate'
import { apiGet, apiPost } from '../lib/api'
import type { CloudSummary, StatusResponse } from '../lib/types'

type AuthContext = {
  useEnv: boolean
  email: string
  password: string
  totp: string
  status: StatusResponse | null
  cloud: CloudSummary | null
}

type AuthEvent =
  | { type: 'SET_USE_ENV'; useEnv: boolean }
  | { type: 'SET_EMAIL'; email: string }
  | { type: 'SET_PASSWORD'; password: string }
  | { type: 'SET_TOTP'; totp: string }
  | { type: 'SUBMIT' }

const isTotpValid = (s: string) => /^[0-9]{6}$/.test(String(s ?? '').trim())

export const authMachine = setup({
  types: {
    context: {} as AuthContext,
    events: {} as AuthEvent,
  },
  actions: {
    setUseEnv: assign({
      useEnv: (_, params: { useEnv: boolean }) => params.useEnv,
    }),
    setEmail: assign({
      email: (_, params: { email: string }) => params.email,
    }),
    setPassword: assign({
      password: (_, params: { password: string }) => params.password,
    }),
    setTotp: assign({
      totp: (_, params: { totp: string }) => params.totp,
    }),
    setStatusAndCloud: assign({
      status: (_, params: { status: StatusResponse; cloud: CloudSummary | null }) => params.status,
      cloud: (_, params: { status: StatusResponse; cloud: CloudSummary | null }) => params.cloud,
    }),
    clearSensitive: assign({
      password: '',
      totp: '',
    }),
  },
  guards: {
    canSubmit: ({ context }) => {
      const totpOk = isTotpValid(context.totp)
      if (!totpOk) return false

      if (context.useEnv) {
        const st = context.status
        return Boolean(st?.env.hasEmail && st?.env.hasPassword)
      }

      return Boolean(context.email.trim() && context.password)
    },
  },
  actors: {
    loginFlow: fromPromise(
      async ({ input }: { input: { useEnv: boolean; email: string; password: string; totp: string } }) => {
        const body: { email?: string; password?: string; mfaCode: string } = { mfaCode: input.totp.trim() }

        if (!input.useEnv) {
          body.email = input.email.trim()
          body.password = input.password
        } else {
          if (input.email.trim()) body.email = input.email.trim()
          if (input.password) body.password = input.password
        }

        const res = await apiPost<{ cloud: CloudSummary }>('/api/cloud/login', body)
        const [status, cloud] = await Promise.all([
          apiGet<StatusResponse>('/api/status'),
          apiGet<{ cloud: CloudSummary | null }>('/api/cloud/creds')
            .then((r) => r.cloud)
            .catch(() => null),
        ])
        return { status, cloud, resCloud: res.cloud }
      },
    ),
  },
}).createMachine({
  id: 'auth',
  initial: 'editing',
  context: {
    useEnv: false,
    email: '',
    password: '',
    totp: '',
    status: null,
    cloud: null,
  },
  on: {
    SET_USE_ENV: { actions: { type: 'setUseEnv', params: ({ event }) => ({ useEnv: event.useEnv }) } },
    SET_EMAIL: { actions: { type: 'setEmail', params: ({ event }) => ({ email: event.email }) } },
    SET_PASSWORD: { actions: { type: 'setPassword', params: ({ event }) => ({ password: event.password }) } },
    SET_TOTP: { actions: { type: 'setTotp', params: ({ event }) => ({ totp: event.totp }) } },
  },
  states: {
    editing: {
      on: {
        SUBMIT: [{ guard: 'canSubmit', target: 'submitting' }, { actions: [] }],
      },
    },
    submitting: {
      entry: 'clearSensitive',
      invoke: {
        src: 'loginFlow',
        input: ({ context }) => ({
          useEnv: context.useEnv,
          email: context.email,
          password: context.password,
          totp: context.totp,
        }),
        onDone: {
          target: 'success',
          actions: [
            {
              type: 'setStatusAndCloud',
              params: ({ event }) => ({
                status: event.output.status,
                cloud: event.output.cloud ?? event.output.resCloud ?? null,
              }),
            },
          ],
        },
        onError: {
          target: 'editing',
          actions: [],
        },
      },
    },
    success: {
      type: 'final',
    },
  },
})
