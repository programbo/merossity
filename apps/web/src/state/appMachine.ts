import { assign, fromPromise, setup } from 'xstate'
import { apiGet } from '../lib/api'
import type { CloudSummary } from '../lib/types'

export type AppMachineInput = {
  initialCidr: string
}

type AppContext = {
  cloud: CloudSummary | null
}

type AppEvent = { type: 'auth_loginSuccess'; cloud: CloudSummary } | { type: 'auth_logout' }

export const appMachine = setup({
  types: {
    context: {} as AppContext,
    events: {} as AppEvent,
    input: {} as AppMachineInput,
  },
  actors: {
    checkCloudCreds: fromPromise(async (): Promise<{ cloud: CloudSummary | null }> => {
      try {
        const res = await apiGet<{ cloud: CloudSummary | null }>('/api/cloud/creds')
        return { cloud: res.cloud }
      } catch {
        return { cloud: null }
      }
    }),
  },
  actions: {
    setCloudFromOutput: assign(({ event }) => {
      const e = event as unknown as { output: { cloud: CloudSummary | null } }
      return { cloud: e.output.cloud }
    }),
    setCloudFromEvent: assign(({ event }) => {
      const e = event as unknown as { cloud: CloudSummary }
      return { cloud: e.cloud }
    }),
    clearCloud: assign({ cloud: null }),
  },
  guards: {
    hasCloudKey: ({ context }) => Boolean(context.cloud?.key),
  },
}).createMachine({
  id: 'merossityApp',
  initial: 'booting',
  context: {
    cloud: null,
  },
  states: {
    booting: {
      invoke: {
        src: 'checkCloudCreds',
        onDone: {
          target: 'active',
          actions: { type: 'setCloudFromOutput' },
        },
        onError: {
          target: 'active',
          actions: { type: 'setCloudFromOutput', params: () => ({ output: { cloud: null } }) },
        },
      },
    },
    active: {
      initial: 'determiningView',
      states: {
        determiningView: {
          always: [{ guard: 'hasCloudKey', target: 'devices' }, { target: 'auth' }],
        },
        auth: {
          on: {
            auth_loginSuccess: {
              target: '#merossityApp.active.devices',
              actions: { type: 'setCloudFromEvent' },
            },
          },
        },
        devices: {
          on: {
            auth_logout: {
              target: '#merossityApp.active.auth',
              actions: { type: 'clearCloud' },
            },
          },
        },
      },
    },
  },
})
