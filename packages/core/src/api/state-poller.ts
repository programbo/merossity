import { applySecurityHeaders } from './applySecurityHeaders'
import { extractLanToggleX, nowIso, readConfig, requireLanKey, writeConfig } from './shared'
import { defaultSuggestedCidr, getSystemAll, normalizeMac, pingSweep, resolveHostByUuidScan, resolveIpv4FromMac } from '../meross'

type LanToggleXChannel = { channel: number; onoff: 0 | 1 }

export type DeviceStateDto = {
  uuid: string
  host: string
  channel: number
  onoff: 0 | 1
  channels: LanToggleXChannel[]
  updatedAt: number
  source: 'poller' | 'manual'
  stale: boolean
  error?: string
}

export type PollErrorDto = {
  uuid: string
  code: string
  message: string
  at: string
}

export type PollMeta = {
  nextDueAt: number
  failureCount: number
  lastSuccessAt: number | null
  lastChangeAt: number | null
  lastResolveAttemptAt: number | null
  boostUntilAt: number | null
}

export type PollerStats = {
  running: boolean
  inFlight: number
  queueDepth: number
  cycleMsP50: number
  cycleMsP95: number
  lastCycleAt: string | null
}

type PollReason = 'poller' | 'manual'

type PollResult = { state?: DeviceStateDto; error?: PollErrorDto }

type Subscriber = {
  id: number
  controller: ReadableStreamDefaultController<Uint8Array>
  heartbeat: ReturnType<typeof setInterval>
}

type KnownHost = {
  host: string
  mac?: string
}

const DEFAULT_POLL_TIMEOUT_MS = 2500
const POLL_MAX_CONCURRENCY = 6
const POLL_TICK_MS = 1000
const STABLE_INTERVAL_MS = 45_000
const HOT_INTERVAL_MS = 12_000
const BOOST_INTERVAL_MS = 8_000
const HOT_WINDOW_MS = 2 * 60_000
const BOOST_WINDOW_MS = 30_000
const SYNC_HOSTS_EVERY_MS = 5_000
const RESOLVE_COOLDOWN_MS = 5 * 60_000
const HEALTH_BROADCAST_EVERY_MS = 5_000
const FAILURE_BACKOFF_SEQUENCE_MS = [30_000, 60_000, 120_000, 300_000] as const

export const failureBackoffMs = (failureCount: number): number => {
  if (failureCount <= 0) return 0
  const idx = Math.min(FAILURE_BACKOFF_SEQUENCE_MS.length - 1, failureCount - 1)
  return FAILURE_BACKOFF_SEQUENCE_MS[idx]!
}

export const withJitterMs = (baseMs: number, percent: number, randomValue: number = Math.random()): number => {
  const boundedPercent = Math.max(0, Math.min(percent, 1))
  const delta = baseMs * boundedPercent
  const centered = (Math.max(0, Math.min(randomValue, 1)) * 2 - 1) * delta
  return Math.max(1000, Math.round(baseMs + centered))
}

const normalizeChannels = (channels: LanToggleXChannel[]): LanToggleXChannel[] =>
  [...channels].sort((a, b) => a.channel - b.channel)

const sameChannels = (a: LanToggleXChannel[], b: LanToggleXChannel[]): boolean => {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const left = a[i]!
    const right = b[i]!
    if (left.channel !== right.channel || left.onoff !== right.onoff) return false
  }
  return true
}

export const hasMaterialStateChange = (prev: DeviceStateDto | undefined, next: DeviceStateDto): boolean => {
  if (!prev) return true
  if (prev.host !== next.host) return true
  if (prev.channel !== next.channel) return true
  if (prev.onoff !== next.onoff) return true
  if (prev.stale !== next.stale) return true
  if (!sameChannels(prev.channels, next.channels)) return true
  return false
}

const percentile = (values: number[], p: number): number => {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)))
  return sorted[idx]!
}

const pollCodeFromError = (message: string): string => {
  const m = message.toLowerCase()
  if (m.includes('missing meross key')) return 'missing_key'
  if (m.includes('no lan host known')) return 'host_unavailable'
  if (m.includes('state unavailable') || m.includes('togglex state not found')) return 'state_unavailable'
  return 'lan_error'
}

const createMeta = (now: number): PollMeta => ({
  nextDueAt: now,
  failureCount: 0,
  lastSuccessAt: null,
  lastChangeAt: null,
  lastResolveAttemptAt: null,
  boostUntilAt: null,
})

class StatePollerServiceImpl {
  private readonly stateByUuid = new Map<string, DeviceStateDto>()
  private readonly metaByUuid = new Map<string, PollMeta>()
  private readonly knownHosts = new Map<string, KnownHost>()
  private readonly inFlight = new Map<string, Promise<PollResult>>()
  private readonly resolving = new Set<string>()
  private readonly subscribers = new Map<number, Subscriber>()
  private readonly encoder = new TextEncoder()
  private readonly interval: ReturnType<typeof setInterval>

  private lastSyncHostsAt = 0
  private lastCycleAt: string | null = null
  private lastHealthBroadcastAt = 0
  private queueDepth = 0
  private readonly cycleSamples: number[] = []
  private tickBusy = false
  private nextSubscriberId = 1

  constructor() {
    this.interval = setInterval(() => void this.tick(), POLL_TICK_MS)
    ;(this.interval as any).unref?.()
  }

  getStatus(): PollerStats & { activeClients: number } {
    return {
      running: true,
      inFlight: this.inFlight.size,
      queueDepth: this.queueDepth,
      cycleMsP50: percentile(this.cycleSamples, 50),
      cycleMsP95: percentile(this.cycleSamples, 95),
      lastCycleAt: this.lastCycleAt,
      activeClients: this.subscribers.size,
    }
  }

  boostDevice(uuid: string) {
    if (!uuid) return
    const now = Date.now()
    const meta = this.ensureMeta(uuid, now)
    meta.boostUntilAt = now + BOOST_WINDOW_MS
    meta.nextDueAt = now
  }

  createStreamResponse(): Response {
    let subscriberId: number | null = null
    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        const id = this.nextSubscriberId++
        subscriberId = id
        const heartbeat = setInterval(() => {
          this.pushToSubscriber(id, 'heartbeat', { at: nowIso() })
        }, 20_000)
        ;(heartbeat as any).unref?.()

        this.subscribers.set(id, { id, controller, heartbeat })

        this.pushToSubscriber(id, 'snapshot', {
          states: [...this.stateByUuid.values()].sort((a, b) => a.uuid.localeCompare(b.uuid)),
        })
        this.pushToSubscriber(id, 'poller_health', this.getStatus())
      },
      cancel: () => {
        if (subscriberId === null) return
        const sub = this.subscribers.get(subscriberId)
        if (!sub) return
        clearInterval(sub.heartbeat)
        this.subscribers.delete(subscriberId)
      },
    })

    const headers = new Headers()
    headers.set('content-type', 'text/event-stream')
    headers.set('cache-control', 'no-cache, no-transform')
    headers.set('connection', 'keep-alive')
    headers.set('x-accel-buffering', 'no')
    return applySecurityHeaders(new Response(stream, { headers }))
  }

  async pollNow(options: {
    uuids?: string[]
    reason?: PollReason
    timeoutMs?: number
  }): Promise<{ polledAt: string; states: DeviceStateDto[]; errors: PollErrorDto[] }> {
    await this.syncKnownHosts()
    const reason = options.reason ?? 'manual'
    const timeoutMs = Number.isFinite(options.timeoutMs) ? Math.max(500, Number(options.timeoutMs)) : undefined
    const uuids =
      options.uuids && options.uuids.length
        ? Array.from(new Set(options.uuids.filter((v) => typeof v === 'string' && v.trim()).map((v) => v.trim())))
        : [...this.knownHosts.keys()]

    const states: DeviceStateDto[] = []
    const errors: PollErrorDto[] = []
    for (const uuid of uuids) {
      this.boostDevice(uuid)
    }

    const workers = Array.from({ length: Math.max(1, Math.min(POLL_MAX_CONCURRENCY, uuids.length || 1)) }, () =>
      (async () => {
        for (;;) {
          const uuid = uuids.shift()
          if (!uuid) return
          const result = await this.pollDevice(uuid, reason, timeoutMs)
          if (result.state) states.push(result.state)
          if (result.error) errors.push(result.error)
        }
      })(),
    )
    await Promise.all(workers)

    return { polledAt: nowIso(), states, errors }
  }

  private ensureMeta(uuid: string, now: number): PollMeta {
    const existing = this.metaByUuid.get(uuid)
    if (existing) return existing
    const created = createMeta(now)
    this.metaByUuid.set(uuid, created)
    return created
  }

  private nextIntervalMs(meta: PollMeta, now: number): number {
    if (meta.failureCount > 0) return failureBackoffMs(meta.failureCount)
    if (meta.boostUntilAt && now < meta.boostUntilAt) return withJitterMs(BOOST_INTERVAL_MS, 0.1)
    if (meta.lastChangeAt && now - meta.lastChangeAt < HOT_WINDOW_MS) return withJitterMs(HOT_INTERVAL_MS, 0.15)
    return withJitterMs(STABLE_INTERVAL_MS, 0.15)
  }

  private nextUpdatedAt(prev: DeviceStateDto | undefined): number {
    const now = Date.now()
    if (!prev) return now
    return Math.max(now, prev.updatedAt + 1)
  }

  private pushToSubscriber(id: number, type: string, payload: unknown) {
    const sub = this.subscribers.get(id)
    if (!sub) return
    try {
      sub.controller.enqueue(this.encoder.encode(`event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`))
    } catch {
      clearInterval(sub.heartbeat)
      this.subscribers.delete(id)
    }
  }

  private broadcast(type: string, payload: unknown) {
    for (const id of this.subscribers.keys()) {
      this.pushToSubscriber(id, type, payload)
    }
  }

  private async tick() {
    if (this.tickBusy) return
    this.tickBusy = true
    const started = Date.now()
    try {
      if (Date.now() - this.lastSyncHostsAt > SYNC_HOSTS_EVERY_MS) {
        await this.syncKnownHosts()
      }

      const now = Date.now()
      const due: string[] = []
      for (const [uuid, meta] of this.metaByUuid) {
        if (!this.knownHosts.has(uuid)) continue
        if (this.inFlight.has(uuid)) continue
        if (meta.nextDueAt <= now) due.push(uuid)
      }

      due.sort((a, b) => {
        const ma = this.metaByUuid.get(a)?.nextDueAt ?? 0
        const mb = this.metaByUuid.get(b)?.nextDueAt ?? 0
        return ma - mb
      })

      this.queueDepth = due.length

      while (due.length && this.inFlight.size < POLL_MAX_CONCURRENCY) {
        const uuid = due.shift()
        if (!uuid) break
        void this.pollDevice(uuid, 'poller', undefined)
      }
    } finally {
      this.lastCycleAt = nowIso()
      this.cycleSamples.push(Date.now() - started)
      if (this.cycleSamples.length > 200) this.cycleSamples.shift()
      if (Date.now() - this.lastHealthBroadcastAt > HEALTH_BROADCAST_EVERY_MS) {
        this.lastHealthBroadcastAt = Date.now()
        this.broadcast('poller_health', this.getStatus())
      }
      this.tickBusy = false
    }
  }

  private async syncKnownHosts() {
    const cfg = await readConfig()
    this.lastSyncHostsAt = Date.now()
    this.knownHosts.clear()
    for (const [uuid, v] of Object.entries(cfg.hosts ?? {})) {
      if (!v?.host) continue
      this.knownHosts.set(uuid, { host: v.host, ...(v.mac ? { mac: v.mac } : {}) })
      this.ensureMeta(uuid, Date.now())
    }
  }

  private async pollDevice(uuid: string, reason: PollReason, timeoutMs: number | undefined): Promise<PollResult> {
    const existing = this.inFlight.get(uuid)
    if (existing) return await existing

    const task = (async (): Promise<PollResult> => {
      const now = Date.now()
      const meta = this.ensureMeta(uuid, now)
      try {
        const cfg = await readConfig()
        const hostEntry = cfg.hosts?.[uuid]
        if (!hostEntry?.host) {
          throw new Error('No LAN host known for device uuid. Resolve host first.')
        }

        const key = await requireLanKey()
        const resp = await getSystemAll<any>({
          host: hostEntry.host,
          key,
          timeoutMs: timeoutMs ?? DEFAULT_POLL_TIMEOUT_MS,
        })
        const channels = normalizeChannels(extractLanToggleX(resp) ?? [])
        if (!channels.length) {
          throw new Error('ToggleX state not found in Appliance.System.All digest (state unavailable).')
        }
        const ch0 = channels.find((c) => c.channel === 0) ?? channels[0]!
        const prev = this.stateByUuid.get(uuid)
        const next: DeviceStateDto = {
          uuid,
          host: hostEntry.host,
          channel: ch0.channel,
          onoff: ch0.onoff,
          channels,
          updatedAt: this.nextUpdatedAt(prev),
          source: reason,
          stale: false,
        }

        const changed = hasMaterialStateChange(prev, next)
        if (changed) {
          meta.lastChangeAt = now
          this.stateByUuid.set(uuid, next)
          this.broadcast('device_state', next)
        } else if (!prev) {
          this.stateByUuid.set(uuid, next)
        } else {
          this.stateByUuid.set(uuid, { ...prev, source: reason })
        }

        meta.failureCount = 0
        meta.lastSuccessAt = now
        meta.nextDueAt = now + this.nextIntervalMs(meta, now)
        return { state: this.stateByUuid.get(uuid) }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        meta.failureCount += 1
        meta.nextDueAt = now + this.nextIntervalMs(meta, now)

        const prev = this.stateByUuid.get(uuid)
        const staleNext: DeviceStateDto = {
          uuid,
          host: prev?.host ?? this.knownHosts.get(uuid)?.host ?? '',
          channel: prev?.channel ?? 0,
          onoff: prev?.onoff ?? 0,
          channels: prev?.channels ?? [],
          updatedAt: this.nextUpdatedAt(prev),
          source: reason,
          stale: true,
          error: message,
        }

        const becameStale = Boolean(!prev || !prev.stale)
        if (hasMaterialStateChange(prev, staleNext)) {
          this.stateByUuid.set(uuid, staleNext)
          this.broadcast('device_state', staleNext)
        } else if (!prev) {
          this.stateByUuid.set(uuid, staleNext)
        }
        if (becameStale) {
          this.broadcast('device_stale', staleNext)
        }

        if (meta.failureCount >= 3) {
          void this.tryResolveHost(uuid)
        }

        return {
          error: {
            uuid,
            code: pollCodeFromError(message),
            message,
            at: nowIso(),
          },
        }
      }
    })()

    this.inFlight.set(uuid, task)
    try {
      return await task
    } finally {
      this.inFlight.delete(uuid)
    }
  }

  private async tryResolveHost(uuid: string) {
    if (this.resolving.has(uuid)) return
    const now = Date.now()
    const meta = this.ensureMeta(uuid, now)
    if (meta.lastResolveAttemptAt && now - meta.lastResolveAttemptAt < RESOLVE_COOLDOWN_MS) return

    this.resolving.add(uuid)
    meta.lastResolveAttemptAt = now

    try {
      const cfg = await readConfig()
      const key = await requireLanKey()
      const cidr = String(cfg.network?.cidr ?? '').trim() || defaultSuggestedCidr() || ''
      const cloudDevice = (cfg.devices?.list ?? []).find((d) => String(d.uuid ?? '') === uuid)

      let mac = String(cfg.hosts?.[uuid]?.mac ?? cloudDevice?.macAddress ?? cloudDevice?.mac ?? '').trim() || null
      if (mac) {
        try {
          mac = normalizeMac(mac)
        } catch {
          // keep raw MAC for best-effort attempt
        }
      }

      let host: string | null = null

      if (mac && cidr) {
        await pingSweep(cidr, { timeoutMs: 200, concurrency: 64 }).catch(() => {})
      }
      if (mac) {
        host = await resolveIpv4FromMac(mac).catch(() => null)
      }

      if (!host && cidr) {
        const resolved = await resolveHostByUuidScan(uuid, cidr, key, {
          perHostTimeoutMs: 900,
          targetMac: mac ?? undefined,
        })
        if (resolved) {
          host = resolved.host
          if (resolved.mac) mac = resolved.mac
        }
      }

      if (!host) return

      const nextCfg = await readConfig()
      const nextHosts = { ...nextCfg.hosts }
      nextHosts[uuid] = {
        host,
        updatedAt: nowIso(),
        ...(nextHosts[uuid]?.mac ? { mac: nextHosts[uuid]?.mac } : {}),
        ...(mac ? { mac } : {}),
      }
      await writeConfig({ ...nextCfg, hosts: nextHosts })

      this.knownHosts.set(uuid, { host, ...(mac ? { mac } : {}) })
      meta.boostUntilAt = Date.now() + BOOST_WINDOW_MS
      meta.nextDueAt = Date.now()
    } catch {
      // best-effort host recovery
    } finally {
      this.resolving.delete(uuid)
    }
  }
}

export type StatePollerService = Pick<
  StatePollerServiceImpl,
  'createStreamResponse' | 'getStatus' | 'pollNow' | 'boostDevice'
>

let singleton: StatePollerServiceImpl | null = null

export const getStatePollerService = (): StatePollerServiceImpl => {
  singleton ??= new StatePollerServiceImpl()
  return singleton
}
