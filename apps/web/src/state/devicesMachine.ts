import { assign, fromPromise, setup, assertEvent } from 'xstate'
import { apiGet, apiPost } from '../lib/api'
import type { CloudSummary, MerossCloudDevice } from '../lib/types'

export type HostsMap = Record<string, { host: string; updatedAt: string; mac?: string }>

type LanToggleXChannel = { channel: number; onoff: 0 | 1 }

type DeviceState = {
  host: string
  channel: number
  onoff: 0 | 1
  channels?: LanToggleXChannel[]
  updatedAt: number
  error?: string
}

type SystemDump = { uuid: string; host: string; data: unknown }

type DevicesContext = {
  devices: MerossCloudDevice[]
  hosts: HostsMap
  cidr: string
  deviceStates: Record<string, DeviceState>
  systemDump: SystemDump | null
  activeDeviceUuid: string | null
  toggleRollback: { uuid: string; previous: DeviceState | null } | null
}

type DevicesEvent =
  | { type: 'REFRESH' }
  | { type: 'SET_CIDR'; cidr: string }
  | { type: 'SCAN' }
  | { type: 'device_RESOLVE'; uuid: string; mac: string; title: string }
  | { type: 'device_TOGGLE'; uuid: string; onoff: 0 | 1 }
  | { type: 'device_REFRESH_STATE'; uuid: string }
  | { type: 'device_DIAGNOSTICS'; uuid: string }
  | { type: 'CLOSE_SYSTEM_DUMP' }

type DevicesInput = {
  cloud: CloudSummary
  initialCidr: string
}

// Actor output types (inferred from fromPromise return types)
type SuggestCidrOutput = { suggestions: Array<{ cidr: string }>; default: string | null }

export const devicesMachine = setup({
  types: {
    context: {} as DevicesContext,
    events: {} as DevicesEvent,
    input: {} as DevicesInput,
  },
  actors: {
    refreshFromCloud: fromPromise(async () => {
      const [devicesRes, hostsRes] = await Promise.all([
        apiPost<{ count: number; list: MerossCloudDevice[] }>('/api/cloud/devices/refresh', {}),
        apiGet<{ hosts: HostsMap }>('/api/hosts').catch(() => ({ hosts: {} })),
      ])
      return { ...devicesRes, hosts: hostsRes.hosts }
    }),
    suggestCidr: fromPromise(async () => {
      return await apiGet<SuggestCidrOutput>('/api/lan/cidr-suggest')
    }),
    discoverHosts: fromPromise(async ({ input }: { input: { cidr: string } }) => {
      const res = await apiPost<{ cidr: string; count: number; hosts: HostsMap }>('/api/hosts/discover', {
        cidr: input.cidr.trim() || undefined,
      })
      const hostsRes = await apiGet<{ hosts: HostsMap }>('/api/hosts')
      return { ...res, hostsAll: hostsRes.hosts }
    }),
    resolveHost: fromPromise(async ({ input }: { input: { uuid: string; mac: string; cidr: string } }) => {
      const res = await apiPost<{ uuid: string; host: string; mac?: string }>('/api/hosts/resolve', {
        uuid: input.uuid,
        mac: input.mac,
        cidr: input.cidr.trim() || undefined,
      })
      const hostsRes = await apiGet<{ hosts: HostsMap }>('/api/hosts')
      return { resolved: res, hosts: hostsRes.hosts }
    }),
    fetchDeviceState: fromPromise(async ({ input }: { input: { uuid: string } }) => {
      const res = await apiPost<{
        host: string
        channel: number
        onoff: 0 | 1
        channels?: LanToggleXChannel[]
      }>('/api/device/state', { uuid: input.uuid, channel: 0 })
      return { uuid: input.uuid, state: res }
    }),
    toggleDevice: fromPromise(async ({ input }: { input: { uuid: string; onoff: 0 | 1 } }) => {
      await apiPost('/api/device/toggle', { uuid: input.uuid, channel: 0, onoff: input.onoff })
      return { uuid: input.uuid, onoff: input.onoff }
    }),
    fetchDiagnostics: fromPromise(async ({ input }: { input: { uuid: string } }) => {
      const res = await apiPost<{ host: string; data: unknown }>('/api/device/system-all', {
        uuid: input.uuid,
      })
      return { uuid: input.uuid, host: res.host, data: res.data }
    }),
  },
  actions: {
    setDevices: assign({
      devices: (_, params: { list: MerossCloudDevice[] }) => params.list,
    }),
    setHosts: assign({
      hosts: (_, params: { hosts: HostsMap }) => params.hosts,
    }),
    setCidr: assign({
      cidr: (_, params: { cidr: string }) => params.cidr,
    }),
    setCidrIfEmpty: assign((_, params: { default: string | null; currentCidr: string }) => {
      const cidr = params.default ?? ''
      const cur = params.currentCidr.trim()
      if (cur) return {}
      return { cidr }
    }),
    persistCidr: ({ context }) => {
      try {
        if (typeof localStorage === 'undefined') return
        localStorage.setItem('merossity.cidr', context.cidr)
      } catch {
        // ignore
      }
    },
    setActiveDeviceUuid: assign({
      activeDeviceUuid: (_, params: { uuid: string }) => params.uuid,
    }),
    clearActiveDeviceUuid: assign({
      activeDeviceUuid: null,
    }),
    prepareOptimisticToggle: assign(({ context }, params: { uuid: string; onoff: 0 | 1 }) => {
      const prevRaw = context.deviceStates[params.uuid]
      const previous = prevRaw
        ? {
            ...prevRaw,
            channels: prevRaw.channels ? [...prevRaw.channels] : undefined,
          }
        : null

      const host = previous?.host || context.hosts[params.uuid]?.host || ''
      const baseChannels = previous?.channels ? [...previous.channels] : []
      const hasChannel0 = baseChannels.some((c) => c.channel === 0)
      const channels = hasChannel0
        ? baseChannels.map((c) => (c.channel === 0 ? { ...c, onoff: params.onoff } : c))
        : [{ channel: 0, onoff: params.onoff }, ...baseChannels]

      const nextState: DeviceState = {
        host,
        channel: previous?.channel ?? 0,
        onoff: params.onoff,
        channels,
        updatedAt: Date.now(),
      }

      return {
        toggleRollback: { uuid: params.uuid, previous },
        deviceStates: {
          ...context.deviceStates,
          [params.uuid]: nextState,
        },
      }
    }),
    rollbackOptimisticToggle: assign(({ context }) => {
      const rollback = context.toggleRollback
      if (!rollback) return {}

      const next = { ...context.deviceStates }
      if (rollback.previous) next[rollback.uuid] = rollback.previous
      else delete next[rollback.uuid]

      return { deviceStates: next, toggleRollback: null }
    }),
    clearToggleRollback: assign({
      toggleRollback: null,
    }),
    setDeviceState: assign(({ context }, params: { uuid: string; state: DeviceState }) => ({
      deviceStates: {
        ...context.deviceStates,
        [params.uuid]: params.state,
      },
    })),
    clearDeviceError: assign(({ context }, params: { uuid: string }) => {
      const next = { ...context.deviceStates }
      const nextDeviceState = next[params.uuid]
      if (nextDeviceState && nextDeviceState.error) {
        delete nextDeviceState.error
      }
      return { deviceStates: next }
    }),
    setDeviceError: assign(({ context }, params: { uuid: string; error: string }) => ({
      deviceStates: {
        ...context.deviceStates,
        [params.uuid]: {
          ...(context.deviceStates[params.uuid] || { host: '', channel: 0, onoff: 0, updatedAt: 0 }),
          error: params.error,
        },
      },
    })),
    setSystemDump: assign({
      systemDump: (_, params: { systemDump: SystemDump | null }) => params.systemDump,
    }),
  },
  guards: {
    needsCidrSuggest: ({ context }) => !context.cidr.trim(),
    hasHost: ({ context }, params: { uuid: string }) => Boolean(context.hosts[params.uuid]?.host),
  },
}).createMachine({
  id: 'devices',
  type: 'parallel',
  context: ({ input }) => ({
    devices: [],
    hosts: {},
    cidr: input.initialCidr,
    deviceStates: {},
    systemDump: null,
    activeDeviceUuid: null,
    toggleRollback: null,
  }),
  on: {
    SET_CIDR: {
      actions: {
        type: 'setCidr',
        params: ({ event }) => ({ cidr: event.cidr }),
      },
    },
    CLOSE_SYSTEM_DUMP: {
      actions: {
        type: 'setSystemDump',
        params: () => ({ systemDump: null }),
      },
    },
  },
  states: {
    inventory: {
      initial: 'idle',
      states: {
        idle: {
          on: {
            REFRESH: { target: 'refreshingCloud' },
            SCAN: [{ guard: 'needsCidrSuggest', target: 'suggestingCidr' }, { target: 'discoveringHosts' }],
          },
        },
        refreshingCloud: {
          invoke: {
            src: 'refreshFromCloud',
            onDone: {
              target: 'idle',
              actions: [
                {
                  type: 'setDevices',
                  params: ({ event }) => ({ list: event.output.list }),
                },
                {
                  type: 'setHosts',
                  params: ({ event }) => ({ hosts: event.output.hosts }),
                },
              ],
            },
            onError: {
              target: 'idle',
            },
          },
        },
        suggestingCidr: {
          invoke: {
            src: 'suggestCidr',
            onDone: {
              target: 'discoveringHosts',
              actions: {
                type: 'setCidrIfEmpty',
                params: ({ event, context }) => ({
                  default: event.output.default,
                  currentCidr: context.cidr,
                }),
              },
            },
            onError: {
              target: 'discoveringHosts',
            },
          },
        },
        discoveringHosts: {
          entry: { type: 'persistCidr' },
          invoke: {
            src: 'discoverHosts',
            input: ({ context }) => ({ cidr: context.cidr }),
            onDone: {
              target: 'idle',
              actions: {
                type: 'setHosts',
                params: ({ event }) => ({ hosts: event.output.hostsAll }),
              },
            },
            onError: {
              target: 'idle',
            },
          },
        },
      },
    },
    operations: {
      initial: 'idle',
      states: {
        idle: {
          on: {
            device_RESOLVE: { target: 'resolving' },
            device_TOGGLE: [
              {
                guard: {
                  type: 'hasHost',
                  params: ({ event }) => ({ uuid: event.uuid }),
                },
                target: 'toggling',
              },
              { actions: [] },
            ],
            device_REFRESH_STATE: { target: 'fetchingState' },
            device_DIAGNOSTICS: [
              {
                guard: {
                  type: 'hasHost',
                  params: ({ event }) => ({ uuid: event.uuid }),
                },
                target: 'fetchingDiagnostics',
              },
              { actions: [] },
            ],
          },
        },
        resolving: {
          entry: {
            type: 'setActiveDeviceUuid',
            params: ({ event }) => {
              assertEvent(event, 'device_RESOLVE')
              return { uuid: event.uuid }
            },
          },
          invoke: {
            src: 'resolveHost',
            input: ({ context, event }) => {
              assertEvent(event, 'device_RESOLVE')
              return {
                uuid: event.uuid,
                mac: event.mac,
                cidr: context.cidr,
              }
            },
            onDone: {
              target: 'idle',
              actions: [
                {
                  type: 'setHosts',
                  params: ({ event }) => ({ hosts: event.output.hosts }),
                },
                { type: 'clearActiveDeviceUuid' },
              ],
            },
            onError: {
              target: 'idle',
              actions: [{ type: 'clearActiveDeviceUuid' }],
            },
          },
        },
        toggling: {
          entry: [
            {
              type: 'setActiveDeviceUuid',
              params: ({ event }) => {
                assertEvent(event, 'device_TOGGLE')
                return { uuid: event.uuid }
              },
            },
            {
              type: 'prepareOptimisticToggle',
              params: ({ event }) => {
                assertEvent(event, 'device_TOGGLE')
                return { uuid: event.uuid, onoff: event.onoff }
              },
            },
          ],
          invoke: {
            src: 'toggleDevice',
            input: ({ event }) => {
              assertEvent(event, 'device_TOGGLE')
              return { uuid: event.uuid, onoff: event.onoff }
            },
            onDone: {
              target: 'idle',
              actions: [{ type: 'clearToggleRollback' }, { type: 'clearActiveDeviceUuid' }],
            },
            onError: {
              target: 'idle',
              actions: [
                { type: 'rollbackOptimisticToggle' },
                {
                  type: 'setDeviceError',
                  params: ({ context, event }) => ({
                    uuid: context.activeDeviceUuid ?? '',
                    error: event.error instanceof Error ? event.error.message : String(event.error),
                  }),
                },
                { type: 'clearToggleRollback' },
                { type: 'clearActiveDeviceUuid' },
              ],
            },
          },
        },
        fetchingState: {
          entry: {
            type: 'setActiveDeviceUuid',
            params: ({ event }) => {
              assertEvent(event, 'device_REFRESH_STATE')
              return { uuid: event.uuid }
            },
          },
          invoke: {
            src: 'fetchDeviceState',
            input: ({ event }) => {
              assertEvent(event, 'device_REFRESH_STATE')
              return { uuid: event.uuid }
            },
            onDone: {
              target: 'idle',
              actions: [
                {
                  type: 'clearDeviceError',
                  params: ({ event }) => ({ uuid: event.output.uuid }),
                },
                {
                  type: 'setDeviceState',
                  params: ({ event }) => ({
                    uuid: event.output.uuid,
                    state: {
                      host: event.output.state.host,
                      channel: event.output.state.channel,
                      onoff: event.output.state.onoff,
                      channels: event.output.state.channels,
                      updatedAt: Date.now(),
                    },
                  }),
                },
                { type: 'clearActiveDeviceUuid' },
              ],
            },
            onError: {
              target: 'idle',
              actions: [
                {
                  type: 'setDeviceError',
                  params: ({ context, event }) => ({
                    uuid: context.activeDeviceUuid ?? '',
                    error: event.error instanceof Error ? event.error.message : String(event.error),
                  }),
                },
                { type: 'clearActiveDeviceUuid' },
              ],
            },
          },
        },
        fetchingDiagnostics: {
          entry: {
            type: 'setActiveDeviceUuid',
            params: ({ event }) => {
              assertEvent(event, 'device_DIAGNOSTICS')
              return { uuid: event.uuid }
            },
          },
          invoke: {
            src: 'fetchDiagnostics',
            input: ({ event }) => {
              assertEvent(event, 'device_DIAGNOSTICS')
              return { uuid: event.uuid }
            },
            onDone: {
              target: 'idle',
              actions: [
                {
                  type: 'setSystemDump',
                  params: ({ event }) => ({
                    systemDump: {
                      uuid: event.output.uuid,
                      host: event.output.host,
                      data: event.output.data,
                    },
                  }),
                },
                { type: 'clearActiveDeviceUuid' },
              ],
            },
            onError: {
              target: 'idle',
              actions: [{ type: 'clearActiveDeviceUuid' }],
            },
          },
        },
      },
    },
  },
})
