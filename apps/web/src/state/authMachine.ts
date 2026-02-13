import { assign, fromPromise, setup } from 'xstate'
import { ApiError, apiGet, apiPost } from '../lib/api'
import type { CloudSummary, StatusResponse } from '../lib/types'

type ConnectState = {
  useEnv: boolean
  email: string
  password: string
  totp: string
}

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
      useEnv: ({ event }) => (event as { useEnv: boolean }).useEnv,
    }),
    setEmail: assign({
      email: ({ event }) => (event as { email: string }).email,
    }),
    setPassword: assign({
      password: ({ event }) => (event as { password: string }).password,
    }),
    setTotp: assign({
      totp: ({ event }) => (event as { totp: string }).totp,
    }),
    setStatusAndCloud: assign({
      status: ({ event }) => (event as { output: { status: StatusResponse; cloud?: CloudSummary } }).output.status,
      cloud: ({ event }) => (event as { output: { cloud?: CloudSummary } }).output.cloud ?? null,
    }),
    clearSensitive: assign(({ context }) => ({
      password: '',
      totp: '',
    })),
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
        const body: any = {}

        if (!input.useEnv) {
          body.email = input.email.trim()
          body.password = input.password
        } else {
          if (input.email.trim()) body.email = input.email.trim()
          if (input.password) body.password = input.password
        }

        body.mfaCode = input.totp.trim()

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
    SET_USE_ENV: { actions: { type: 'setUseEnv' } },
    SET_EMAIL: { actions: { type: 'setEmail' } },
    SET_PASSWORD: { actions: { type: 'setPassword' } },
    SET_TOTP: { actions: { type: 'setTotp' } },
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
          actions: [{ type: 'setStatusAndCloud' }],
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
