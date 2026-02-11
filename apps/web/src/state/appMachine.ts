import { assertEvent, assign, fromPromise, raise, setup } from 'xstate'
import { ApiError, apiGet, apiPost } from '../lib/api'
import type { CloudSummary, MerossCloudDevice, StatusResponse } from '../lib/types'

export type HostsMap = Record<string, { host: string; updatedAt: string; mac?: string }>

export type ToastData = {
  kind: 'ok' | 'err'
  title: string
  detail?: string
}

type SystemDump = { uuid: string; host: string; data: unknown }

type ConnectState = {
  // Hidden behind "Advanced" in the UI. When enabled, the server uses MEROSS_EMAIL/MEROSS_PASSWORD defaults.
  useEnv: boolean
  email: string
  password: string
  totp: string
}

type DevicesUiState = {
  cidr: string
  systemDump: SystemDump | null
}

type BusyState = {
  bootstrap: boolean
  login: boolean
  refreshDevices: boolean
  suggestCidr: boolean
  scanLan: boolean
  resolveUuid: string | null
  toggleUuid: string | null
  diagnosticsUuid: string | null
}

type BootstrapData = {
  status: StatusResponse | null
  cloud: CloudSummary | null
  devices: MerossCloudDevice[]
  hosts: HostsMap
}

export type AppMachineInput = {
  initialCidr: string
}

type AppContext = {
  status: StatusResponse | null
  cloud: CloudSummary | null
  devices: MerossCloudDevice[]
  hosts: HostsMap
  busy: BusyState
  connect: ConnectState
  devicesUi: DevicesUiState
  toast: ToastData | null
}

type AppEvent =
  | { type: 'CONNECT.SET_USE_ENV'; useEnv: boolean }
  | { type: 'CONNECT.SET_EMAIL'; email: string }
  | { type: 'CONNECT.SET_PASSWORD'; password: string }
  | { type: 'CONNECT.SET_TOTP'; totp: string }
  | { type: 'CONNECT.SUBMIT' }
  | { type: 'DEVICES.SET_CIDR'; cidr: string }
  | { type: 'DEVICES.CLOSE_SYSTEM_DUMP' }
  | { type: 'DEVICES.REFRESH_FROM_CLOUD' }
  | { type: 'DEVICES.DISCOVER_HOSTS' }
  | { type: 'DEVICES.RESOLVE_HOST'; uuid: string; mac: string; title: string }
  | { type: 'DEVICES.TOGGLE'; uuid: string; onoff: 0 | 1 }
  | { type: 'DEVICES.SYSTEM_SNAPSHOT'; uuid: string }
  | { type: 'TOAST.SHOW'; toast: ToastData }
  | { type: 'TOAST.DISMISS' }

const clampText = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n)}…`)
const isTotpValid = (s: string) => /^[0-9]{6}$/.test(String(s ?? '').trim())

export const appMachine = setup({
  types: {
    context: {} as AppContext,
    events: {} as AppEvent,
    input: {} as AppMachineInput,
  },
  actions: {
    setBootstrapBusy: assign(({ context }, params: { busy: boolean }) => ({
      busy: { ...context.busy, bootstrap: params.busy },
    })),
    setLoginBusy: assign(({ context }, params: { busy: boolean }) => ({
      busy: { ...context.busy, login: params.busy },
    })),
    setRefreshDevicesBusy: assign(({ context }, params: { busy: boolean }) => ({
      busy: { ...context.busy, refreshDevices: params.busy },
    })),
    setSuggestCidrBusy: assign(({ context }, params: { busy: boolean }) => ({
      busy: { ...context.busy, suggestCidr: params.busy },
    })),
    setScanLanBusy: assign(({ context }, params: { busy: boolean }) => ({
      busy: { ...context.busy, scanLan: params.busy },
    })),
    setResolveBusy: assign(({ context }, params: { uuid: string | null }) => ({
      busy: { ...context.busy, resolveUuid: params.uuid },
    })),
    setToggleBusy: assign(({ context }, params: { uuid: string | null }) => ({
      busy: { ...context.busy, toggleUuid: params.uuid },
    })),
    setDiagnosticsBusy: assign(({ context }, params: { uuid: string | null }) => ({
      busy: { ...context.busy, diagnosticsUuid: params.uuid },
    })),

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
    setTotp: assign(({ context }, params: { totp: string }) => ({
      connect: { ...context.connect, totp: params.totp },
    })),
    clearSensitiveConnect: assign(({ context }) => ({
      connect: { ...context.connect, password: '', totp: '' },
    })),

    setCidr: assign(({ context }, params: { cidr: string }) => ({
      devicesUi: { ...context.devicesUi, cidr: params.cidr },
    })),
    setCidrIfEmpty: assign(({ context }, params: { cidr: string }) => {
      const cur = context.devicesUi.cidr.trim()
      if (cur) return {}
      return { devicesUi: { ...context.devicesUi, cidr: params.cidr } }
    }),
    persistCidr: ({ context }) => {
      try {
        if (typeof localStorage === 'undefined') return
        localStorage.setItem('merossity.cidr', context.devicesUi.cidr)
      } catch {
        // ignore
      }
    },
    clearSystemDump: assign(({ context }) => ({ devicesUi: { ...context.devicesUi, systemDump: null } })),
    setSystemDump: assign(({ context }, params: { systemDump: SystemDump | null }) => ({
      devicesUi: { ...context.devicesUi, systemDump: params.systemDump },
    })),

    setToast: assign((_, params: { toast: ToastData | null }) => ({ toast: params.toast })),
  },
  guards: {
    isCloudLinked: ({ context }) => Boolean(context.cloud?.key),
    needsCidrSuggest: ({ context }) => !context.devicesUi.cidr.trim(),
    canSubmitLogin: ({ context }) => {
      const totpOk = isTotpValid(context.connect.totp)
      if (!totpOk) return false

      if (context.connect.useEnv) {
        const st = context.status
        return Boolean(st?.env.hasEmail && st?.env.hasPassword)
      }

      return Boolean(context.connect.email.trim() && context.connect.password)
    },
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

    loginFlow: fromPromise(async ({ input }: { input: { useEnv: boolean; email: string; password: string; totp: string } }) => {
      const body: any = {}

      if (!input.useEnv) {
        body.email = input.email.trim()
        body.password = input.password
      } else {
        // Allow overrides while defaulting to env creds on the server.
        if (input.email.trim()) body.email = input.email.trim()
        if (input.password) body.password = input.password
      }

      // Always sent (UI requires it). If the account doesn't use MFA, the cloud should ignore it.
      body.mfaCode = input.totp.trim()

      const res = await apiPost<{ cloud: CloudSummary }>('/api/cloud/login', body)
      const [status, cloud] = await Promise.all([
        apiGet<StatusResponse>('/api/status'),
        apiGet<{ cloud: CloudSummary | null }>('/api/cloud/creds')
          .then((r) => r.cloud)
          .catch(() => null),
      ])
      return { status, cloud, resCloud: res.cloud }
    }),

    refreshDevicesFromCloud: fromPromise(async () => {
      return await apiPost<{ count: number; list: MerossCloudDevice[] }>('/api/cloud/devices/refresh', {})
    }),

    cidrSuggest: fromPromise(async () => {
      return await apiGet<{ suggestions: Array<{ cidr: string }>; default: string | null }>('/api/lan/cidr-suggest')
    }),

    resolveHost: fromPromise(async ({ input }: { input: { uuid: string; mac: string; cidr: string; title: string } }) => {
      const res = await apiPost<{ uuid: string; host: string; mac?: string }>('/api/hosts/resolve', {
        uuid: input.uuid,
        mac: input.mac,
        cidr: input.cidr.trim() || undefined,
      })
      const hostsRes = await apiGet<{ hosts: HostsMap }>('/api/hosts')
      return { title: input.title, resolved: res, hosts: hostsRes.hosts }
    }),

    discoverHosts: fromPromise(async ({ input }: { input: { cidr: string } }) => {
      const res = await apiPost<{ cidr: string; count: number; hosts: HostsMap }>('/api/hosts/discover', {
        cidr: input.cidr.trim() || undefined,
      })
      const hostsRes = await apiGet<{ hosts: HostsMap }>('/api/hosts')
      return { ...res, hostsAll: hostsRes.hosts }
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
    status: null,
    cloud: null,
    devices: [],
    hosts: {},
    busy: {
      bootstrap: false,
      login: false,
      refreshDevices: false,
      suggestCidr: false,
      scanLan: false,
      resolveUuid: null,
      toggleUuid: null,
      diagnosticsUuid: null,
    },
    connect: { useEnv: false, email: '', password: '', totp: '' },
    devicesUi: { cidr: input.initialCidr, systemDump: null },
    toast: null,
  }),
  on: {
    'CONNECT.SET_USE_ENV': { actions: { type: 'setUseEnv', params: ({ event }) => ({ useEnv: event.useEnv }) } },
    'CONNECT.SET_EMAIL': { actions: { type: 'setEmail', params: ({ event }) => ({ email: event.email }) } },
    'CONNECT.SET_PASSWORD': { actions: { type: 'setPassword', params: ({ event }) => ({ password: event.password }) } },
    'CONNECT.SET_TOTP': { actions: { type: 'setTotp', params: ({ event }) => ({ totp: event.totp }) } },

    'DEVICES.SET_CIDR': { actions: { type: 'setCidr', params: ({ event }) => ({ cidr: event.cidr }) } },
    'DEVICES.CLOSE_SYSTEM_DUMP': { actions: { type: 'clearSystemDump' } },
  },
  states: {
    app: {
      initial: 'booting',
      states: {
        booting: {
          entry: { type: 'setBootstrapBusy', params: () => ({ busy: true }) },
          invoke: {
            src: 'bootstrap',
            onDone: {
              target: 'gate',
              actions: [
                { type: 'setBootstrapBusy', params: () => ({ busy: false }) },
                { type: 'setStatus', params: ({ event }) => ({ status: event.output.status }) },
                { type: 'setCloud', params: ({ event }) => ({ cloud: event.output.cloud }) },
                { type: 'setDevices', params: ({ event }) => ({ devices: event.output.devices }) },
                { type: 'setHosts', params: ({ event }) => ({ hosts: event.output.hosts }) },
              ],
            },
            onError: {
              target: 'gate',
              actions: [
                { type: 'setBootstrapBusy', params: () => ({ busy: false }) },
                raise(({ event }) => ({
                  type: 'TOAST.SHOW',
                  toast: { kind: 'err', title: 'Bootstrap failed', detail: String(event.error ?? '') },
                })),
              ],
            },
          },
        },

        gate: {
          initial: 'deciding',
          states: {
            deciding: {
              always: [
                { guard: 'isCloudLinked', target: 'hasCloudKey' },
                { target: 'needsCloudKey.editing' },
              ],
            },

            needsCloudKey: {
              initial: 'editing',
              states: {
                editing: {
                  on: {
                    'CONNECT.SUBMIT': [
                      { guard: 'canSubmitLogin', target: 'submitting' },
                      // Button should be disabled when invalid; keep this as a no-op fallback.
                      { actions: [] },
                    ],
                  },
                },
                submitting: {
                  entry: { type: 'setLoginBusy', params: () => ({ busy: true }) },
                  invoke: {
                    src: 'loginFlow',
                    input: ({ context }) => ({
                      useEnv: context.connect.useEnv,
                      email: context.connect.email,
                      password: context.connect.password,
                      totp: context.connect.totp,
                    }),
                    onDone: {
                      target: '#merossityApp.app.gate.hasCloudKey',
                      actions: [
                        { type: 'setLoginBusy', params: () => ({ busy: false }) },
                        { type: 'clearSensitiveConnect' },
                        { type: 'setStatus', params: ({ event }) => ({ status: event.output.status }) },
                        { type: 'setCloud', params: ({ event }) => ({ cloud: event.output.cloud }) },
                        raise(({ event }) => ({
                          type: 'TOAST.SHOW',
                          toast: { kind: 'ok', title: 'Cloud linked', detail: `Domain: ${event.output.resCloud.domain}` },
                        })),
                      ],
                    },
                    onError: {
                      target: 'editing',
                      actions: [
                        { type: 'setLoginBusy', params: () => ({ busy: false }) },
                        raise(({ event }) => {
                          const e = event.error
                          if (e instanceof ApiError && e.code === 'missing_creds') {
                            return {
                              type: 'TOAST.SHOW',
                              toast: { kind: 'err', title: 'Missing credentials', detail: e.message },
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
              },
            },

            hasCloudKey: {
              type: 'parallel',
              entry: [raise({ type: 'DEVICES.REFRESH_FROM_CLOUD' }), raise({ type: 'DEVICES.DISCOVER_HOSTS' })],
              states: {
                inventory: {
                  initial: 'idle',
                  states: {
                    idle: {
                      on: {
                        'DEVICES.REFRESH_FROM_CLOUD': { target: 'refreshing' },
                      },
                    },
                    refreshing: {
                      entry: { type: 'setRefreshDevicesBusy', params: () => ({ busy: true }) },
                      invoke: {
                        src: 'refreshDevicesFromCloud',
                        onDone: {
                          target: 'idle',
                          actions: [
                            { type: 'setRefreshDevicesBusy', params: () => ({ busy: false }) },
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
                            { type: 'setRefreshDevicesBusy', params: () => ({ busy: false }) },
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
                  },
                },

                scan: {
                  initial: 'idle',
                  states: {
                    idle: {
                      on: {
                        'DEVICES.DISCOVER_HOSTS': [
                          { guard: 'needsCidrSuggest', target: 'suggestingCidr' },
                          { target: 'discoveringHosts' },
                        ],
                      },
                    },

                    suggestingCidr: {
                      entry: { type: 'setSuggestCidrBusy', params: () => ({ busy: true }) },
                      invoke: {
                        src: 'cidrSuggest',
                        onDone: {
                          target: 'discoveringHosts',
                          actions: [
                            { type: 'setSuggestCidrBusy', params: () => ({ busy: false }) },
                            { type: 'setCidrIfEmpty', params: ({ event }) => ({ cidr: event.output.default ?? '' }) },
                          ],
                        },
                        onError: {
                          target: 'discoveringHosts',
                          actions: [{ type: 'setSuggestCidrBusy', params: () => ({ busy: false }) }],
                        },
                      },
                    },

                    discoveringHosts: {
                      entry: [{ type: 'persistCidr' }, { type: 'setScanLanBusy', params: () => ({ busy: true }) }],
                      invoke: {
                        src: 'discoverHosts',
                        input: ({ context }) => ({ cidr: context.devicesUi.cidr }),
                        onDone: {
                          target: 'idle',
                          actions: [
                            { type: 'setScanLanBusy', params: () => ({ busy: false }) },
                            { type: 'setHosts', params: ({ event }) => ({ hosts: event.output.hostsAll }) },
                            raise(({ event }) => ({
                              type: 'TOAST.SHOW',
                              toast: {
                                kind: 'ok',
                                title: 'LAN scan complete',
                                detail: `${event.output.count} devices found (${event.output.cidr}).`,
                              },
                            })),
                          ],
                        },
                        onError: {
                          target: 'idle',
                          actions: [
                            { type: 'setScanLanBusy', params: () => ({ busy: false }) },
                            raise(({ event }) => ({
                              type: 'TOAST.SHOW',
                              toast: {
                                kind: 'err',
                                title: 'LAN scan failed',
                                detail: event.error instanceof Error ? event.error.message : String(event.error),
                              },
                            })),
                          ],
                        },
                      },
                    },
                  },
                },

                control: {
                  initial: 'idle',
                  states: {
                    idle: {
                      on: {
                        'DEVICES.RESOLVE_HOST': { target: 'resolvingHost' },
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
                              toast: { kind: 'err', title: 'Host not resolved', detail: 'Find IP first.' },
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
                              toast: { kind: 'err', title: 'Host not resolved', detail: 'Find IP first.' },
                            }),
                          },
                        ],
                      },
                    },

                    resolvingHost: {
                      entry: [
                        { type: 'persistCidr' },
                        {
                          type: 'setResolveBusy',
                          params: ({ event }) => {
                            assertEvent(event, 'DEVICES.RESOLVE_HOST')
                            return { uuid: event.uuid }
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
                            { type: 'setResolveBusy', params: () => ({ uuid: null }) },
                            { type: 'setHosts', params: ({ event }) => ({ hosts: event.output.hosts }) },
                            raise(({ event }) => ({
                              type: 'TOAST.SHOW',
                              toast: { kind: 'ok', title: 'IP found', detail: `${event.output.title}: ${event.output.resolved.host}` },
                            })),
                          ],
                        },
                        onError: {
                          target: 'idle',
                          actions: [
                            { type: 'setResolveBusy', params: () => ({ uuid: null }) },
                            raise(({ event }) => ({
                              type: 'TOAST.SHOW',
                              toast: {
                                kind: 'err',
                                title: 'Find IP failed',
                                detail: event.error instanceof Error ? event.error.message : String(event.error),
                              },
                            })),
                          ],
                        },
                      },
                    },

                    togglingLan: {
                      entry: {
                        type: 'setToggleBusy',
                        params: ({ event }) => {
                          assertEvent(event, 'DEVICES.TOGGLE')
                          return { uuid: event.uuid }
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
                            { type: 'setToggleBusy', params: () => ({ uuid: null }) },
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
                            { type: 'setToggleBusy', params: () => ({ uuid: null }) },
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
                        type: 'setDiagnosticsBusy',
                        params: ({ event }) => {
                          assertEvent(event, 'DEVICES.SYSTEM_SNAPSHOT')
                          return { uuid: event.uuid }
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
                            { type: 'setDiagnosticsBusy', params: () => ({ uuid: null }) },
                            {
                              type: 'setSystemDump',
                              params: ({ event }) => ({
                                systemDump: { uuid: event.output.uuid, host: event.output.host, data: event.output.data },
                              }),
                            },
                            raise(({ event }) => ({
                              type: 'TOAST.SHOW',
                              toast: { kind: 'ok', title: 'Diagnostics fetched', detail: event.output.host },
                            })),
                          ],
                        },
                        onError: {
                          target: 'idle',
                          actions: [
                            { type: 'setDiagnosticsBusy', params: () => ({ uuid: null }) },
                            raise(({ event }) => ({
                              type: 'TOAST.SHOW',
                              toast: {
                                kind: 'err',
                                title: 'Diagnostics failed',
                                detail: event.error instanceof Error ? event.error.message : String(event.error),
                              },
                            })),
                          ],
                        },
                      },
                    },
                  },
                },
              },
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
