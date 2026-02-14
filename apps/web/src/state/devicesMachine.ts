import { assign, assertEvent, fromCallback, fromPromise, setup } from 'xstate'
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
  stale?: boolean
  source?: string
  error?: string
}

type StreamDeviceState = {
  uuid: string
  host: string
  channel: number
  onoff: 0 | 1
  channels?: LanToggleXChannel[]
  updatedAt: number
  stale: boolean
  source?: string
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
  | { type: 'monitor_STREAM_CONNECTED' }
  | { type: 'monitor_STREAM_DISCONNECTED' }
  | { type: 'monitor_STATE_RECEIVED'; state: StreamDeviceState }
  | { type: 'monitor_DEVICE_STALE'; state: StreamDeviceState }
  | { type: 'monitor_SNAPSHOT'; states: StreamDeviceState[] }
  | { type: 'monitor_REQUEST_REFRESH'; uuid: string }
  | { type: 'CLOSE_SYSTEM_DUMP' }

type DevicesInput = {
  cloud: CloudSummary
  initialCidr: string
}

type SuggestCidrOutput = { suggestions: Array<{ cidr: string }>; default: string | null }

const isObjectRecord = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === 'object')

const parseChannels = (v: unknown): LanToggleXChannel[] => {
  if (!Array.isArray(v)) return []
  const out: LanToggleXChannel[] = []
  for (const item of v) {
    const entry = isObjectRecord(item) ? item : null
    const channel = Number(entry?.channel)
    if (!Number.isInteger(channel) || channel < 0) continue
    const onoff: 0 | 1 = Number(entry?.onoff) === 1 ? 1 : 0
    out.push({ channel, onoff })
  }
  return out.sort((a, b) => a.channel - b.channel)
}

const parseStreamState = (raw: unknown): StreamDeviceState | null => {
  const v = isObjectRecord(raw) ? raw : null
  if (!v) return null

  const uuid = String(v.uuid ?? '').trim()
  const host = String(v.host ?? '')
  const channel = Number(v.channel)
  const onoff: 0 | 1 = Number(v.onoff) === 1 ? 1 : 0
  const updatedAt = Number(v.updatedAt)

  if (!uuid) return null
  if (!Number.isInteger(channel) || channel < 0) return null
  if (!Number.isFinite(updatedAt) || updatedAt <= 0) return null

  return {
    uuid,
    host,
    channel,
    onoff,
    channels: parseChannels(v.channels),
    updatedAt,
    stale: Boolean(v.stale),
    source: typeof v.source === 'string' ? v.source : undefined,
    error: typeof v.error === 'string' ? v.error : undefined,
  }
}

const parseSnapshotStates = (raw: unknown): StreamDeviceState[] => {
  const payload = isObjectRecord(raw) ? raw : null
  const statesRaw = Array.isArray(payload?.states) ? payload.states : []
  return statesRaw.map(parseStreamState).filter((v): v is StreamDeviceState => Boolean(v))
}

export const devicesMachine = setup({
  types: {
    context: {} as DevicesContext,
    events: {} as DevicesEvent,
    input: {} as DevicesInput,
  },
  actors: {
    streamEvents: fromCallback(({ sendBack }) => {
      const reconnectDelaysMs = [1000, 2000, 5000, 10_000, 30_000] as const
      let retryIndex = 0
      let source: EventSource | null = null
      let reconnectTimer: ReturnType<typeof setTimeout> | null = null
      let closed = false
      const parseMessage = (message: Event): unknown => {
        try {
          return JSON.parse((message as MessageEvent).data ?? 'null') as unknown
        } catch {
          return null
        }
      }

      const closeSource = () => {
        if (!source) return
        source.onopen = null
        source.onerror = null
        source.close()
        source = null
      }

      const scheduleReconnect = () => {
        if (closed || reconnectTimer) return
        const delay = reconnectDelaysMs[Math.min(retryIndex, reconnectDelaysMs.length - 1)]
        retryIndex += 1
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null
          openStream()
        }, delay)
      }

      const openStream = () => {
        if (closed) return
        closeSource()

        const ev = new EventSource('/api/events/stream')
        source = ev

        ev.onopen = () => {
          retryIndex = 0
          sendBack({ type: 'monitor_STREAM_CONNECTED' })
        }

        ev.onerror = () => {
          sendBack({ type: 'monitor_STREAM_DISCONNECTED' })
          closeSource()
          scheduleReconnect()
        }

        ev.addEventListener('snapshot', (message) => {
          const payload = parseMessage(message)
          sendBack({ type: 'monitor_SNAPSHOT', states: parseSnapshotStates(payload) })
        })

        ev.addEventListener('device_state', (message) => {
          const payload = parseMessage(message)
          const state = parseStreamState(payload)
          if (!state) return
          sendBack({ type: 'monitor_STATE_RECEIVED', state })
        })

        ev.addEventListener('device_stale', (message) => {
          const payload = parseMessage(message)
          const state = parseStreamState(payload)
          if (!state) return
          sendBack({ type: 'monitor_DEVICE_STALE', state })
        })
      }

      openStream()

      return () => {
        closed = true
        if (reconnectTimer) {
          clearTimeout(reconnectTimer)
          reconnectTimer = null
        }
        closeSource()
      }
    }),
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
    persistCidrRemote: (_, params: { cidr: string }) => {
      const cidr = params.cidr.trim()
      if (!cidr) return
      void apiPost('/api/network/cidr', { cidr }).catch(() => {})
    },
    requestDeviceRefresh: (_, params: { uuid: string }) => {
      if (!params.uuid) return
      void apiPost('/api/device/states', { uuids: [params.uuid], reason: 'manual' }).catch(() => {})
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
        stale: false,
        source: 'optimistic',
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
    setStreamDeviceState: assign(({ context }, params: { state: StreamDeviceState }) => ({
      deviceStates: {
        ...context.deviceStates,
        [params.state.uuid]: {
          host: params.state.host,
          channel: params.state.channel,
          onoff: params.state.onoff,
          channels: params.state.channels,
          updatedAt: params.state.updatedAt,
          stale: params.state.stale,
          source: params.state.source,
          ...(params.state.error ? { error: params.state.error } : {}),
        },
      },
    })),
    mergeSnapshot: assign(({ context }, params: { states: StreamDeviceState[] }) => {
      const next = { ...context.deviceStates }
      for (const state of params.states) {
        next[state.uuid] = {
          host: state.host,
          channel: state.channel,
          onoff: state.onoff,
          channels: state.channels,
          updatedAt: state.updatedAt,
          stale: state.stale,
          source: state.source,
          ...(state.error ? { error: state.error } : {}),
        }
      }
      return { deviceStates: next }
    }),
    setDeviceError: assign(({ context }, params: { uuid: string; error: string }) => ({
      deviceStates: {
        ...context.deviceStates,
        [params.uuid]: {
          ...(context.deviceStates[params.uuid] || { host: '', channel: 0, onoff: 0, updatedAt: 0 }),
          stale: true,
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
      actions: [
        {
          type: 'setCidr',
          params: ({ event }) => ({ cidr: event.cidr }),
        },
        { type: 'persistCidr' },
        {
          type: 'persistCidrRemote',
          params: ({ event }) => ({ cidr: event.cidr }),
        },
      ],
    },
    monitor_REQUEST_REFRESH: {
      actions: {
        type: 'requestDeviceRefresh',
        params: ({ event }) => ({ uuid: event.uuid }),
      },
    },
    monitor_SNAPSHOT: {
      actions: {
        type: 'mergeSnapshot',
        params: ({ event }) => ({ states: event.states }),
      },
    },
    monitor_STATE_RECEIVED: {
      actions: {
        type: 'setStreamDeviceState',
        params: ({ event }) => ({ state: event.state }),
      },
    },
    monitor_DEVICE_STALE: {
      actions: {
        type: 'setStreamDeviceState',
        params: ({ event }) => ({ state: event.state }),
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
            device_REFRESH_STATE: {
              actions: {
                type: 'requestDeviceRefresh',
                params: ({ event }) => ({ uuid: event.uuid }),
              },
            },
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
              actions: [
                {
                  type: 'requestDeviceRefresh',
                  params: ({ event }) => ({ uuid: event.output.uuid }),
                },
                { type: 'clearToggleRollback' },
                { type: 'clearActiveDeviceUuid' },
              ],
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
    monitor: {
      initial: 'connecting',
      invoke: {
        src: 'streamEvents',
      },
      states: {
        connecting: {
          on: {
            monitor_STREAM_CONNECTED: { target: 'live' },
            monitor_STREAM_DISCONNECTED: { target: 'degraded' },
          },
        },
        live: {
          on: {
            monitor_STREAM_DISCONNECTED: { target: 'degraded' },
          },
        },
        degraded: {
          on: {
            monitor_STREAM_CONNECTED: { target: 'live' },
          },
        },
      },
    },
  },
})
