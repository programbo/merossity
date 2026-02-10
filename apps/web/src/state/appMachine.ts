import { assertEvent, assign, fromPromise, raise, setup } from 'xstate'
import { ApiError, apiGet, apiPost } from '../lib/api'
import type { Tab } from '../lib/nav'
import { setHashTab } from '../lib/nav'
import type { CloudSummary, MerossCloudDevice, StatusResponse } from '../lib/types'

export type HostsMap = Record<string, { host: string; updatedAt: string }>

export type ToastData = {
  kind: 'ok' | 'err'
  title: string
  detail?: string
}

type SystemDump = { uuid: string; host: string; data: unknown }

type ConnectState = {
  useEnv: boolean
  email: string
  password: string
  mfaCode: string
  mfaRequired: boolean
}

type DevicesUiState = {
  cidr: string
  expandedUuid: string | null
  systemDump: SystemDump | null
}

type BootstrapData = {
  status: StatusResponse | null
  cloud: CloudSummary | null
  devices: MerossCloudDevice[]
  hosts: HostsMap
}

export type AppMachineInput = {
  initialTab: Tab
  initialCidr: string
}

type AppContext = {
  tab: Tab
  status: StatusResponse | null
  cloud: CloudSummary | null
  devices: MerossCloudDevice[]
  hosts: HostsMap
  busy: string | null
  connect: ConnectState
  devicesUi: DevicesUiState
  toast: ToastData | null
}

type AppEvent =
  | { type: 'NAVIGATE'; tab: Tab }
  | { type: 'HASH_CHANGED'; tab: Tab }
  | { type: 'REFRESH_ALL' }
  | { type: 'CONNECT.SET_USE_ENV'; useEnv: boolean }
  | { type: 'CONNECT.SET_EMAIL'; email: string }
  | { type: 'CONNECT.SET_PASSWORD'; password: string }
  | { type: 'CONNECT.SET_MFA_CODE'; mfaCode: string }
  | { type: 'CONNECT.RESET_MFA' }
  | { type: 'CONNECT.SUBMIT' }
  | { type: 'DEVICES.SET_CIDR'; cidr: string }
  | { type: 'DEVICES.TOGGLE_EXPANDED'; uuid: string }
  | { type: 'DEVICES.CLOSE_SYSTEM_DUMP' }
  | { type: 'DEVICES.REFRESH_FROM_CLOUD' }
  | { type: 'DEVICES.RESOLVE_HOST'; uuid: string; mac: string; title: string }
  | { type: 'DEVICES.TOGGLE'; uuid: string; onoff: 0 | 1 }
  | { type: 'DEVICES.SYSTEM_SNAPSHOT'; uuid: string }
  | { type: 'TOAST.SHOW'; toast: ToastData }
  | { type: 'TOAST.DISMISS' }

const clampText = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n)}…`)

export const appMachine = setup({
  types: {
    context: {} as AppContext,
    events: {} as AppEvent,
    input: {} as AppMachineInput,
  },
  actions: {
    setTab: assign((_, params: { tab: Tab }) => ({ tab: params.tab })),
    syncHashTab: (_, params: { tab: Tab }) => setHashTab(params.tab),

    setBusy: assign((_, params: { busy: string | null }) => ({ busy: params.busy })),

    setStatus: assign((_, params: { status: StatusResponse | null }) => ({ status: params.status })),
    setCloud: assign((_, params: { cloud: CloudSummary | null }) => ({ cloud: params.cloud })),
    setDevices: assign((_, params: { devices: MerossCloudDevice[] }) => ({ devices: params.devices })),
    setHosts: assign((_, params: { hosts: HostsMap }) => ({ hosts: params.hosts })),

    setUseEnv: assign(({ context }, params: { useEnv: boolean }) => ({
      connect: { ...context.connect, useEnv: params.useEnv },
    })),
    setEmail: assign(({ context }, params: { email: string }) => ({
      connect: { ...context.connect, email: params.email },
    })),
    setPassword: assign(({ context }, params: { password: string }) => ({
      connect: { ...context.connect, password: params.password },
    })),
    setMfaCode: assign(({ context }, params: { mfaCode: string }) => ({
      connect: { ...context.connect, mfaCode: params.mfaCode },
    })),
    setMfaRequired: assign(({ context }, params: { mfaRequired: boolean }) => ({
      connect: { ...context.connect, mfaRequired: params.mfaRequired },
    })),
    clearMfa: assign(({ context }) => ({ connect: { ...context.connect, mfaRequired: false, mfaCode: '' } })),

    setCidr: assign(({ context }, params: { cidr: string }) => ({
      devicesUi: { ...context.devicesUi, cidr: params.cidr },
    })),
    persistCidr: ({ context }) => {
      try {
        if (typeof localStorage === 'undefined') return
        localStorage.setItem('merossity.cidr', context.devicesUi.cidr)
      } catch {
        // ignore
      }
    },
    toggleExpanded: assign(({ context }, params: { uuid: string }) => ({
      devicesUi: {
        ...context.devicesUi,
        expandedUuid: context.devicesUi.expandedUuid === params.uuid ? null : params.uuid,
      },
    })),
    clearSystemDump: assign(({ context }) => ({ devicesUi: { ...context.devicesUi, systemDump: null } })),
    setSystemDump: assign(({ context }, params: { systemDump: SystemDump | null }) => ({
      devicesUi: { ...context.devicesUi, systemDump: params.systemDump },
    })),

    setToast: assign((_, params: { toast: ToastData | null }) => ({ toast: params.toast })),
  },
  guards: {
    hasCloud: ({ context }) => Boolean(context.cloud),
  },
  actors: {
    bootstrap: fromPromise(async (): Promise<BootstrapData> => {
      const safe = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
        try {
          return await fn()
        } catch {
          return fallback
        }
      }

      const status = await safe(() => apiGet<StatusResponse>('/api/status'), null)
      const [cloud, devicesRes, hostsRes] = await Promise.all([
        safe(
          async () => {
            const res = await apiGet<{ cloud: CloudSummary | null }>('/api/cloud/creds')
            return res.cloud
          },
          null,
        ),
        safe(() => apiGet<{ updatedAt: string | null; list: MerossCloudDevice[] }>('/api/cloud/devices'), {
          updatedAt: null,
          list: [],
        }),
        safe(() => apiGet<{ hosts: HostsMap }>('/api/hosts'), { hosts: {} }),
      ])

      return { status, cloud, devices: devicesRes.list, hosts: hostsRes.hosts }
    }),

    refreshAll: fromPromise(async (): Promise<BootstrapData> => {
      const status = await apiGet<StatusResponse>('/api/status')
      const cloud = await apiGet<{ cloud: CloudSummary | null }>('/api/cloud/creds')
        .then((r) => r.cloud)
        .catch(() => null)
      const devicesRes = await apiGet<{ updatedAt: string | null; list: MerossCloudDevice[] }>('/api/cloud/devices')
      const hostsRes = await apiGet<{ hosts: HostsMap }>('/api/hosts')
      return { status, cloud, devices: devicesRes.list, hosts: hostsRes.hosts }
    }),

    loginFlow: fromPromise(
      async ({ input }: { input: { useEnv: boolean; email: string; password: string; mfaCode: string } }) => {
      const body: any = {}

      if (!input.useEnv) {
        body.email = input.email
        body.password = input.password
      } else {
        // Allow overrides while defaulting to env creds on the server.
        if (input.email.trim()) body.email = input.email.trim()
        if (input.password) body.password = input.password
      }
      if (input.mfaCode.trim()) body.mfaCode = input.mfaCode.trim()

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

    refreshDevicesFromCloud: fromPromise(async () => {
      return await apiPost<{ count: number; list: MerossCloudDevice[] }>('/api/cloud/devices/refresh', {})
    }),

    resolveHost: fromPromise(async ({ input }: { input: { uuid: string; mac: string; cidr: string; title: string } }) => {
      const res = await apiPost<{ uuid: string; host: string }>('/api/hosts/resolve', {
        uuid: input.uuid,
        mac: input.mac,
        cidr: input.cidr.trim() || undefined,
      })
      const hostsRes = await apiGet<{ hosts: HostsMap }>('/api/hosts')
      return { title: input.title, resolved: res, hosts: hostsRes.hosts }
    }),

    toggleLan: fromPromise(async ({ input }: { input: { uuid: string; onoff: 0 | 1 } }) => {
      await apiPost('/api/lan/toggle', { uuid: input.uuid, channel: 0, onoff: input.onoff })
      return { uuid: input.uuid, onoff: input.onoff }
    }),

    systemSnapshot: fromPromise(async ({ input }: { input: { uuid: string } }) => {
      const res = await apiPost<{ host: string; data: unknown }>('/api/lan/system-all', { uuid: input.uuid })
      return { uuid: input.uuid, host: res.host, data: res.data }
    }),
  },
}).createMachine({
  id: 'merossityApp',
  type: 'parallel',
  context: ({ input }) => ({
    tab: input.initialTab,
    status: null,
    cloud: null,
    devices: [],
    hosts: {},
    busy: null,
    connect: { useEnv: true, email: '', password: '', mfaCode: '', mfaRequired: false },
    devicesUi: { cidr: input.initialCidr, expandedUuid: null, systemDump: null },
    toast: null,
  }),
  on: {
    NAVIGATE: {
      actions: [
        { type: 'setTab', params: ({ event }) => ({ tab: event.tab }) },
        { type: 'syncHashTab', params: ({ event }) => ({ tab: event.tab }) },
      ],
    },
    HASH_CHANGED: { actions: { type: 'setTab', params: ({ event }) => ({ tab: event.tab }) } },

    'CONNECT.SET_USE_ENV': { actions: { type: 'setUseEnv', params: ({ event }) => ({ useEnv: event.useEnv }) } },
    'CONNECT.SET_EMAIL': { actions: { type: 'setEmail', params: ({ event }) => ({ email: event.email }) } },
    'CONNECT.SET_PASSWORD': { actions: { type: 'setPassword', params: ({ event }) => ({ password: event.password }) } },
    'CONNECT.SET_MFA_CODE': { actions: { type: 'setMfaCode', params: ({ event }) => ({ mfaCode: event.mfaCode }) } },
    'CONNECT.RESET_MFA': {
      actions: [
        { type: 'clearMfa' },
        raise({ type: 'TOAST.SHOW', toast: { kind: 'ok', title: 'Cleared verification prompt' } }),
      ],
    },

    'DEVICES.SET_CIDR': { actions: { type: 'setCidr', params: ({ event }) => ({ cidr: event.cidr }) } },
    'DEVICES.TOGGLE_EXPANDED': { actions: { type: 'toggleExpanded', params: ({ event }) => ({ uuid: event.uuid }) } },
    'DEVICES.CLOSE_SYSTEM_DUMP': { actions: { type: 'clearSystemDump' } },

  },
  states: {
    app: {
      initial: 'booting',
      states: {
        booting: {
          entry: { type: 'setBusy', params: () => ({ busy: 'bootstrap' }) },
          invoke: {
            src: 'bootstrap',
            onDone: {
              target: 'idle',
              actions: [
                { type: 'setBusy', params: () => ({ busy: null }) },
                { type: 'setStatus', params: ({ event }) => ({ status: event.output.status }) },
                { type: 'setCloud', params: ({ event }) => ({ cloud: event.output.cloud }) },
                { type: 'setDevices', params: ({ event }) => ({ devices: event.output.devices }) },
                { type: 'setHosts', params: ({ event }) => ({ hosts: event.output.hosts }) },
              ],
            },
            onError: {
              target: 'idle',
              actions: [
                { type: 'setBusy', params: () => ({ busy: null }) },
                raise(({ event }) => ({
                  type: 'TOAST.SHOW',
                  toast: { kind: 'err', title: 'Bootstrap failed', detail: String(event.error ?? '') },
                })),
              ],
            },
          },
        },

        idle: {
          on: {
            REFRESH_ALL: { target: 'refreshing' },
            'CONNECT.SUBMIT': { target: 'loggingIn' },
            'DEVICES.REFRESH_FROM_CLOUD': [
              { guard: 'hasCloud', target: 'refreshingDevicesFromCloud' },
              {
                actions: raise({
                  type: 'TOAST.SHOW',
                  toast: { kind: 'err', title: 'Not linked', detail: 'Link cloud first.' },
                }),
              },
            ],
            'DEVICES.RESOLVE_HOST': [
              {
                guard: ({ event }) => {
                  assertEvent(event, 'DEVICES.RESOLVE_HOST')
                  return Boolean(event.mac.trim())
                },
                target: 'resolvingHost',
              },
              {
                actions: raise({
                  type: 'TOAST.SHOW',
                  toast: {
                    kind: 'err',
                    title: 'Missing MAC address',
                    detail: 'Device entry did not include mac/macAddress. Try a fresh device list.',
                  },
                }),
              },
            ],
            'DEVICES.TOGGLE': [
              {
                guard: ({ context, event }) => {
                  assertEvent(event, 'DEVICES.TOGGLE')
                  return Boolean(context.hosts[event.uuid]?.host)
                },
                target: 'togglingLan',
              },
              {
                actions: raise({
                  type: 'TOAST.SHOW',
                  toast: { kind: 'err', title: 'Host not resolved', detail: 'Resolve host first.' },
                }),
              },
            ],
            'DEVICES.SYSTEM_SNAPSHOT': [
              {
                guard: ({ context, event }) => {
                  assertEvent(event, 'DEVICES.SYSTEM_SNAPSHOT')
                  return Boolean(context.hosts[event.uuid]?.host)
                },
                target: 'fetchingSnapshot',
              },
              {
                actions: raise({
                  type: 'TOAST.SHOW',
                  toast: { kind: 'err', title: 'Host not resolved', detail: 'Resolve host first.' },
                }),
              },
            ],
          },
        },

        refreshing: {
          entry: { type: 'setBusy', params: () => ({ busy: 'refresh_all' }) },
          invoke: {
            src: 'refreshAll',
            onDone: {
              target: 'idle',
              actions: [
                { type: 'setBusy', params: () => ({ busy: null }) },
                { type: 'setStatus', params: ({ event }) => ({ status: event.output.status }) },
                { type: 'setCloud', params: ({ event }) => ({ cloud: event.output.cloud }) },
                { type: 'setDevices', params: ({ event }) => ({ devices: event.output.devices }) },
                { type: 'setHosts', params: ({ event }) => ({ hosts: event.output.hosts }) },
                raise({ type: 'TOAST.SHOW', toast: { kind: 'ok', title: 'Synced local' } }),
              ],
            },
            onError: {
              target: 'idle',
              actions: [
                { type: 'setBusy', params: () => ({ busy: null }) },
                raise(({ event }) => ({
                  type: 'TOAST.SHOW',
                  toast: {
                    kind: 'err',
                    title: 'Sync failed',
                    detail: event.error instanceof Error ? event.error.message : String(event.error),
                  },
                })),
              ],
            },
          },
        },

        loggingIn: {
          entry: { type: 'setBusy', params: () => ({ busy: 'login' }) },
          invoke: {
            src: 'loginFlow',
            input: ({ context }) => ({
              useEnv: context.connect.useEnv,
              email: context.connect.email,
              password: context.connect.password,
              mfaCode: context.connect.mfaCode,
            }),
            onDone: {
              target: 'idle',
              actions: [
                { type: 'setBusy', params: () => ({ busy: null }) },
                { type: 'clearMfa' },
                { type: 'setStatus', params: ({ event }) => ({ status: event.output.status }) },
                { type: 'setCloud', params: ({ event }) => ({ cloud: event.output.cloud }) },
                raise(({ event }) => ({
                  type: 'TOAST.SHOW',
                  toast: { kind: 'ok', title: 'Cloud linked', detail: `Domain: ${event.output.resCloud.domain}` },
                })),
                { type: 'setTab', params: () => ({ tab: 'devices' as const }) },
                { type: 'syncHashTab', params: () => ({ tab: 'devices' as const }) },
              ],
            },
            onError: {
              target: 'idle',
              actions: [
                { type: 'setBusy', params: () => ({ busy: null }) },
                assign(({ context, event }) => {
                  const e = event.error
                  if (e instanceof ApiError && e.code === 'mfa_required') {
                    return { connect: { ...context.connect, mfaRequired: true } }
                  }
                  return {}
                }),
                raise(({ event }) => {
                  const e = event.error
                  if (e instanceof ApiError && e.code === 'mfa_required') {
                    return {
                      type: 'TOAST.SHOW',
                      toast: {
                        kind: 'err',
                        title: 'Verification required',
                        detail: 'Enter your TOTP code and try again.',
                      },
                    }
                  }
                  return {
                    type: 'TOAST.SHOW',
                    toast: { kind: 'err', title: 'Login failed', detail: e instanceof Error ? e.message : String(e) },
                  }
                }),
              ],
            },
          },
        },

        refreshingDevicesFromCloud: {
          entry: { type: 'setBusy', params: () => ({ busy: 'refresh_devices' }) },
          invoke: {
            src: 'refreshDevicesFromCloud',
            onDone: {
              target: 'idle',
              actions: [
                { type: 'setBusy', params: () => ({ busy: null }) },
                { type: 'setDevices', params: ({ event }) => ({ devices: event.output.list }) },
                raise(({ event }) => ({
                  type: 'TOAST.SHOW',
                  toast: { kind: 'ok', title: 'Devices updated', detail: `${event.output.count} devices from cloud.` },
                })),
              ],
            },
            onError: {
              target: 'idle',
              actions: [
                { type: 'setBusy', params: () => ({ busy: null }) },
                raise(({ event }) => ({
                  type: 'TOAST.SHOW',
                  toast: {
                    kind: 'err',
                    title: 'Refresh failed',
                    detail: event.error instanceof Error ? event.error.message : String(event.error),
                  },
                })),
              ],
            },
          },
        },

        resolvingHost: {
          entry: [
            { type: 'persistCidr' },
            {
              type: 'setBusy',
              params: ({ event }) => {
                assertEvent(event, 'DEVICES.RESOLVE_HOST')
                return { busy: `resolve:${event.uuid}` }
              },
            },
          ],
          invoke: {
            src: 'resolveHost',
            input: ({ context, event }) => {
              assertEvent(event, 'DEVICES.RESOLVE_HOST')
              return { uuid: event.uuid, mac: event.mac, title: event.title, cidr: context.devicesUi.cidr }
            },
            onDone: {
              target: 'idle',
              actions: [
                { type: 'setBusy', params: () => ({ busy: null }) },
                { type: 'setHosts', params: ({ event }) => ({ hosts: event.output.hosts }) },
                raise(({ event }) => ({
                  type: 'TOAST.SHOW',
                  toast: {
                    kind: 'ok',
                    title: 'Host resolved',
                    detail: `${event.output.title}: ${event.output.resolved.host}`,
                  },
                })),
              ],
            },
            onError: {
              target: 'idle',
              actions: [
                { type: 'setBusy', params: () => ({ busy: null }) },
                raise(({ event }) => ({
                  type: 'TOAST.SHOW',
                  toast: {
                    kind: 'err',
                    title: 'Host resolve failed',
                    detail: event.error instanceof Error ? event.error.message : String(event.error),
                  },
                })),
              ],
            },
          },
        },

        togglingLan: {
          entry: {
            type: 'setBusy',
            params: ({ event }) => {
              assertEvent(event, 'DEVICES.TOGGLE')
              return { busy: `toggle:${event.uuid}` }
            },
          },
          invoke: {
            src: 'toggleLan',
            input: ({ event }) => {
              assertEvent(event, 'DEVICES.TOGGLE')
              return { uuid: event.uuid, onoff: event.onoff }
            },
            onDone: {
              target: 'idle',
              actions: [
                { type: 'setBusy', params: () => ({ busy: null }) },
                raise(({ event }) => ({
                  type: 'TOAST.SHOW',
                  toast: {
                    kind: 'ok',
                    title: event.output.onoff ? 'Switched on' : 'Switched off',
                    detail: clampText(event.output.uuid, 12),
                  },
                })),
              ],
            },
            onError: {
              target: 'idle',
              actions: [
                { type: 'setBusy', params: () => ({ busy: null }) },
                raise(({ event }) => ({
                  type: 'TOAST.SHOW',
                  toast: {
                    kind: 'err',
                    title: 'Toggle failed',
                    detail: event.error instanceof Error ? event.error.message : String(event.error),
                  },
                })),
              ],
            },
          },
        },

        fetchingSnapshot: {
          entry: {
            type: 'setBusy',
            params: ({ event }) => {
              assertEvent(event, 'DEVICES.SYSTEM_SNAPSHOT')
              return { busy: `system:${event.uuid}` }
            },
          },
          invoke: {
            src: 'systemSnapshot',
            input: ({ event }) => {
              assertEvent(event, 'DEVICES.SYSTEM_SNAPSHOT')
              return { uuid: event.uuid }
            },
            onDone: {
              target: 'idle',
              actions: [
                { type: 'setBusy', params: () => ({ busy: null }) },
                {
                  type: 'setSystemDump',
                  params: ({ event }) => ({
                    systemDump: { uuid: event.output.uuid, host: event.output.host, data: event.output.data },
                  }),
                },
                raise(({ event }) => ({
                  type: 'TOAST.SHOW',
                  toast: { kind: 'ok', title: 'Fetched system snapshot', detail: event.output.host },
                })),
              ],
            },
            onError: {
              target: 'idle',
              actions: [
                { type: 'setBusy', params: () => ({ busy: null }) },
                raise(({ event }) => ({
                  type: 'TOAST.SHOW',
                  toast: {
                    kind: 'err',
                    title: 'System snapshot failed',
                    detail: event.error instanceof Error ? event.error.message : String(event.error),
                  },
                })),
              ],
            },
          },
        },
      },
    },

    toast: {
      initial: 'hidden',
      states: {
        hidden: {
          on: {
            'TOAST.SHOW': {
              target: 'visible',
              actions: { type: 'setToast', params: ({ event }) => ({ toast: event.toast }) },
            },
          },
        },
        visible: {
          after: {
            4500: { target: 'hidden', actions: { type: 'setToast', params: () => ({ toast: null }) } },
          },
          on: {
            'TOAST.SHOW': {
              target: 'visible',
              reenter: true,
              actions: { type: 'setToast', params: ({ event }) => ({ toast: event.toast }) },
            },
            'TOAST.DISMISS': { target: 'hidden', actions: { type: 'setToast', params: () => ({ toast: null }) } },
          },
        },
      },
    },
  },
})
