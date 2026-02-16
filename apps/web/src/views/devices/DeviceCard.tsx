import { useMemo, useState } from 'react'
import { Heading } from 'react-aria-components'
import { apiPost } from '../../lib/api'
import type { MerossCloudDevice } from '../../lib/types'
import { useDevicesActorRef, useDevicesSelector } from '../../state/devicesActor'
import { cls } from '../../ui/cls'
import { ClockIcon } from '../../ui/icons/ClockIcon'
import { RefreshIcon } from '../../ui/icons/RefreshIcon'
import { Button } from '../../ui/rac/Button'
import { Modal } from '../../ui/rac/Modal'
import { Switch } from '../../ui/rac/Switch'
import { Tab, TabList, TabPanel, TabPanels, Tabs } from '../../ui/rac/Tabs'
import { TextField } from '../../ui/rac/TextField'
import { SmartLightActionWidget, SmartLightControls } from './SmartLightControls'

type LanToggleXChannel = { channel: number; onoff: 0 | 1 }
type LanLightChannel = { channel: number; onoff: 0 | 1; luminance?: number; temperature?: number; rgb?: number }
type LanScheduleDigestEntry = { channel: number; id: string; count: number }
type DeviceState = {
  host: string
  kind?: string
  channel: number
  onoff: 0 | 1
  channels?: LanToggleXChannel[]
  lights?: LanLightChannel[]
  light?: LanLightChannel | null
  timerxDigest?: LanScheduleDigestEntry[]
  triggerxDigest?: LanScheduleDigestEntry[]
  updatedAt: number
  stale?: boolean
  source?: string
  error?: string
}

type DevicePower = {
  host: string
  channel: number
  voltageV?: number
  currentA?: number
  powerW?: number
  updatedAt: number
  stale?: boolean
  error?: string
}

type PowerHistoryPoint = {
  t: number
  powerWAvg: number | null
  powerWMax: number | null
  voltageVAvg: number | null
  currentAAvg: number | null
}

type SystemDump = { uuid: string; host: string; data: unknown }

type ManageTabId = 'color' | 'power' | 'schedules' | 'diagnostics'

type TimerXRule = {
  id: string
  enable?: 0 | 1
  channel?: number
  alias?: string
  type?: number
  week?: number
  time?: number
  sunOffset?: number
  duration?: number
  extend?: unknown
}

const isObjectRecord = (v: unknown): v is Record<string, unknown> =>
  Boolean(v && typeof v === 'object' && !Array.isArray(v))

const toggleOnoffFromExtend = (extend: unknown): 0 | 1 | null => {
  const ex = isObjectRecord(extend) ? extend : null
  const toggle = ex && isObjectRecord(ex.toggle) ? ex.toggle : null
  if (!toggle) return null
  if (toggle.onoff === undefined) return null
  return Number(toggle.onoff) === 1 ? 1 : 0
}

const randomTimerId = () => Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10)

const friendlyDeviceTypeFromModel = (model: string) => {
  const m = String(model ?? '')
    .trim()
    .toUpperCase()
  if (!m) return ''

  if (m.startsWith('MSS')) return 'Smart Wi-Fi Plug'
  if (m.startsWith('MSL')) return 'Smart Wi-Fi Light'
  if (m.startsWith('MSP')) return 'Smart Power Strip'
  if (m.startsWith('MTS')) return 'Smart Thermostat'
  if (m.startsWith('MSH')) return 'Smart Sensor'
  if (m.startsWith('MSG')) return 'Smart Garage Opener'
  if (m.startsWith('MRS')) return 'Smart Roller Shutter'

  return ''
}

const prefersToggleFor = (d: { deviceType?: unknown; subType?: unknown }) => {
  const typeKey = `${String(d.deviceType ?? '')} ${String(d.subType ?? '')}`.toLowerCase()
  return typeKey.includes('msl') || typeKey.includes('mss') || typeKey.includes('light') || typeKey.includes('switch')
}

const fmtRgbHex = (rgb: number) =>
  `#${Math.max(0, Math.min(0xffffff, Math.round(rgb)))
    .toString(16)
    .padStart(6, '0')}`

const fmtW = (w: number) => {
  const n = Number.isFinite(w) ? w : 0
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(2)} kW`
  if (Math.abs(n) >= 100) return `${n.toFixed(0)} W`
  if (Math.abs(n) >= 10) return `${n.toFixed(1)} W`
  return `${n.toFixed(2)} W`
}

const fmtV = (v: number) => `${v.toFixed(v >= 100 ? 0 : 1)} V`
const fmtA = (a: number) => `${a.toFixed(a >= 10 ? 1 : 2)} A`

const sparklinePath = (values: Array<number | null>, width: number, height: number, pad: number = 2): string => {
  const pts = values.map((v, i) => ({ v, i })).filter((p) => typeof p.v === 'number' && Number.isFinite(p.v)) as Array<{
    v: number
    i: number
  }>
  if (pts.length < 2) return ''

  const min = Math.min(...pts.map((p) => p.v))
  const max = Math.max(...pts.map((p) => p.v))
  const span = Math.max(0.0001, max - min)

  const xFor = (i: number) => pad + (i / Math.max(1, values.length - 1)) * (width - pad * 2)
  const yFor = (v: number) => {
    const t = (v - min) / span
    return pad + (1 - t) * (height - pad * 2)
  }

  let d = ''
  for (let idx = 0; idx < values.length; idx++) {
    const v = values[idx]
    if (typeof v !== 'number' || !Number.isFinite(v)) continue
    const x = xFor(idx)
    const y = yFor(v)
    d += d ? ` L ${x.toFixed(2)} ${y.toFixed(2)}` : `M ${x.toFixed(2)} ${y.toFixed(2)}`
  }
  return d
}

export function DeviceCard(props: { uuid: string; device: MerossCloudDevice | null }) {
  const devices = useDevicesActorRef()
  const uuid = props.uuid

  const hostEntry = useDevicesSelector(
    (s) => s.context.hosts[uuid] as { host: string; updatedAt: string; mac?: string } | undefined,
  )
  const deviceState = useDevicesSelector((s) => s.context.deviceStates[uuid] as DeviceState | undefined)
  const devicePower = useDevicesSelector((s) => s.context.devicePower[uuid] as DevicePower | undefined)
  const isToggling = useDevicesSelector(
    (s) => s.matches({ operations: 'toggling' }) && s.context.activeDeviceUuid === uuid,
  )
  const isFetchingDiagnostics = useDevicesSelector(
    (s) => s.matches({ operations: 'fetchingDiagnostics' }) && s.context.activeDeviceUuid === uuid,
  )

  const systemDump = useDevicesSelector((s) => s.context.systemDump as SystemDump | null)

  const [manageOpen, setManageOpen] = useState(false)
  const [manageTab, setManageTab] = useState<ManageTabId>('diagnostics')

  const [powerHistory, setPowerHistory] = useState<PowerHistoryPoint[] | null>(null)
  const [powerHistoryError, setPowerHistoryError] = useState<string | null>(null)
  const [powerHistoryLoading, setPowerHistoryLoading] = useState(false)

  const [timerxLoading, setTimerxLoading] = useState(false)
  const [timerxError, setTimerxError] = useState<string | null>(null)
  const [timerxDigest, setTimerxDigest] = useState<LanScheduleDigestEntry[] | null>(null)
  const [timerxTimers, setTimerxTimers] = useState<TimerXRule[] | null>(null)
  const [timerxPending, setTimerxPending] = useState<Record<string, boolean>>({})
  const [timerEditor, setTimerEditor] = useState<{
    mode: 'create' | 'edit'
    id: string
    alias: string
    channel: string
    enable: boolean
    type: string
    week: string
    time: string
    sunOffset: string
    duration: string
    toggleOnoff: boolean
  } | null>(null)

  const [triggerxLoading, setTriggerxLoading] = useState(false)
  const [triggerxError, setTriggerxError] = useState<string | null>(null)
  const [triggerxDigest, setTriggerxDigest] = useState<LanScheduleDigestEntry[] | null>(null)
  const [triggerJson, setTriggerJson] = useState<string>('')
  const [activeTriggerId, setActiveTriggerId] = useState<string | null>(null)
  const [triggerxPending, setTriggerxPending] = useState<Record<string, boolean>>({})

  const d = props.device ?? ({ uuid } as MerossCloudDevice)

  const host = hostEntry?.host ? String(hostEntry.host) : ''
  const hostUpdatedAt = hostEntry?.updatedAt ? String(hostEntry.updatedAt) : ''

  const title = String(d.devName ?? '') || uuid
  const model = String(d.deviceType ?? '').trim()
  const typeLabel = friendlyDeviceTypeFromModel(model)
  const subtitle = [typeLabel, model].filter(Boolean).join(' / ')

  const macCloud = (d.macAddress as string | undefined) ?? (d.mac as string | undefined) ?? ''
  const macLan = hostEntry?.mac ? String(hostEntry.mac) : ''
  const mac = macCloud || macLan

  const ready = Boolean(host)

  const isPlugLike = useMemo(() => {
    const m = model.trim().toUpperCase()
    if (m.startsWith('MSS') || m.startsWith('MSP')) return true
    // Fallback heuristics
    const typeKey = `${String(d.deviceType ?? '')} ${String(d.subType ?? '')}`.toUpperCase()
    return typeKey.includes('MSS') || typeKey.includes('MSP') || typeKey.includes('PLUG') || typeKey.includes('STRIP')
  }, [d.deviceType, d.subType, model])

  const light0 = deviceState?.light ?? deviceState?.lights?.find((l) => l.channel === 0) ?? null
  const ch0 =
    deviceState?.channels?.find((c) => c.channel === 0) ??
    (deviceState ? { channel: 0, onoff: deviceState.onoff } : null)
  const lanOn = (light0 ?? ch0) ? (light0 ?? ch0)!.onoff === 1 : null

  const togglable = ready && prefersToggleFor(d)
  const toggleDisabled = !ready || isToggling
  const isSmartLight =
    String(d.deviceType ?? '')
      .trim()
      .toUpperCase()
      .startsWith('MSL') ||
    deviceState?.kind === 'light' ||
    deviceState?.kind === 'mixed' ||
    Boolean(deviceState?.lights?.length)

  const cardClass = useMemo(() => {
    const base = 'device-card'
    if (!ready) return cls(base, 'device-card--inaccessible')
    if (lanOn === true) return cls(base, 'device-card--on')
    if (lanOn === false) return cls(base, 'device-card--off')
    return base
  }, [lanOn, ready])

  const availableTabs = useMemo(() => {
    const tabs: ManageTabId[] = []
    if (isSmartLight) tabs.push('color')
    if (isPlugLike) tabs.push('power')
    tabs.push('schedules')
    tabs.push('diagnostics')
    return tabs
  }, [isPlugLike, isSmartLight])

  const coerceTab = (k: unknown): ManageTabId => {
    const s = String(k ?? '')
    if (s === 'color' || s === 'power' || s === 'schedules' || s === 'diagnostics') return s
    return availableTabs.includes('diagnostics') ? 'diagnostics' : (availableTabs[0] ?? 'diagnostics')
  }

  const normalizeTab = (t: ManageTabId): ManageTabId =>
    availableTabs.includes(t) ? t : (availableTabs[0] ?? 'diagnostics')

  const refreshPowerHistory = async () => {
    if (!ready || !isPlugLike) return
    const now = Date.now()
    const fromMs = now - 6 * 60 * 60 * 1000
    setPowerHistoryError(null)
    setPowerHistoryLoading(true)
    try {
      const res = await apiPost<{ points: PowerHistoryPoint[] }>('/api/telemetry/power/history', {
        uuid,
        channel: 0,
        fromMs,
        toMs: now,
        bucketMs: 60_000,
      })
      setPowerHistory(res.points ?? [])
    } catch (e) {
      setPowerHistory(null)
      setPowerHistoryError(e instanceof Error ? e.message : String(e))
    } finally {
      setPowerHistoryLoading(false)
    }
  }

  const refreshTimerX = async () => {
    if (!ready) return
    setTimerxError(null)
    setTimerxLoading(true)
    try {
      const res = await apiPost<{
        host: string
        digest: LanScheduleDigestEntry[]
        timers: TimerXRule[]
      }>('/api/device/timerx/list', { uuid })
      setTimerxDigest(res.digest ?? [])
      setTimerxTimers(res.timers ?? [])
    } catch (e) {
      setTimerxError(e instanceof Error ? e.message : String(e))
    } finally {
      setTimerxLoading(false)
    }
  }

  const refreshTriggerX = async () => {
    if (!ready) return
    setTriggerxError(null)
    setTriggerxLoading(true)
    try {
      const res = await apiPost<{
        host: string
        digest: LanScheduleDigestEntry[]
        rawById: Record<string, unknown>
      }>('/api/device/triggerx/list', { uuid })
      setTriggerxDigest(res.digest ?? [])
      const firstId = (res.digest ?? [])[0]?.id ?? null
      if (firstId) {
        setActiveTriggerId(firstId)
        const raw = (res.rawById ?? {})[firstId]
        const payload = isObjectRecord(raw) ? (raw as any).payload : null
        const rule = payload && isObjectRecord(payload.triggerx) ? payload.triggerx : null
        setTriggerJson(JSON.stringify(rule ?? { id: firstId }, null, 2))
      }
    } catch (e) {
      setTriggerxError(e instanceof Error ? e.message : String(e))
    } finally {
      setTriggerxLoading(false)
    }
  }

  const refreshDiagnostics = () => {
    if (ready) devices.send({ type: 'monitor_REQUEST_REFRESH', uuid })
    if (!ready) return
    devices.send({ type: 'device_DIAGNOSTICS', uuid })
  }

  const startFetchForTab = (tab: ManageTabId) => {
    if (tab === 'color') {
      if (ready) devices.send({ type: 'monitor_REQUEST_REFRESH', uuid })
      return
    }
    if (tab === 'power') {
      void refreshPowerHistory()
      return
    }
    if (tab === 'schedules') {
      void refreshTimerX()
      void refreshTriggerX()
      return
    }
    if (tab === 'diagnostics') {
      refreshDiagnostics()
    }
  }

  const openManage = (desired: ManageTabId) => {
    const tab = normalizeTab(desired)
    setManageTab(tab)
    setManageOpen(true)
    startFetchForTab(tab)
  }

  return (
    <article className={cardClass}>
      <header className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-3 px-4 pt-4 pb-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-foreground text-[18px] leading-tight font-[var(--font-display)]">{title}</div>
          </div>
          <div className="text-muted mt-1 text-[12px] tracking-[0.14em] uppercase">{subtitle || 'device'}</div>
          {isPlugLike ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px]">
              <span className="text-[11px] tracking-[0.14em] text-white/45 uppercase">power</span>
              {devicePower?.stale ? (
                <span className="text-white/70">{devicePower.error ? 'unavailable' : 'stale'}</span>
              ) : typeof devicePower?.powerW === 'number' ? (
                <span className="text-white/90">{fmtW(devicePower.powerW)}</span>
              ) : (
                <span className="text-white/70">(pending)</span>
              )}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 justify-self-end">
          {ready ? (
            <Button
              tone="quiet"
              className="h-11 w-11 px-0"
              icon={<ClockIcon />}
              aria-label="Schedules"
              onPress={() => openManage('schedules')}
            >
              {null}
            </Button>
          ) : null}

          {ready && togglable ? (
            <Switch
              isSelected={lanOn === true}
              onChange={(next) => {
                devices.send({ type: 'device_TOGGLE', uuid, onoff: next ? 1 : 0 })
              }}
              isDisabled={toggleDisabled}
              label="Power"
              description={undefined}
            />
          ) : ready ? (
            <>
              <Button
                tone="ghost"
                onPress={() => devices.send({ type: 'device_TOGGLE', uuid, onoff: 1 })}
                isDisabled={toggleDisabled}
                isPending={isToggling}
              >
                On
              </Button>
              <Button
                tone="danger"
                onPress={() => devices.send({ type: 'device_TOGGLE', uuid, onoff: 0 })}
                isDisabled={toggleDisabled}
                isPending={isToggling}
              >
                Off
              </Button>
            </>
          ) : null}
        </div>

        {ready && isSmartLight ? (
          <div className="col-span-2 flex justify-end">
            <SmartLightActionWidget
              uuid={uuid}
              state={deviceState}
              onRequestRefresh={() => devices.send({ type: 'monitor_REQUEST_REFRESH', uuid })}
              onOpenTuning={() => {
                devices.send({ type: 'monitor_REQUEST_REFRESH', uuid })
                openManage('color')
              }}
            />
          </div>
        ) : null}
      </header>

      <Modal
        isDismissable
        isOpen={manageOpen}
        onOpenChange={(open) => {
          setManageOpen(open)
          if (!open) {
            setTimerEditor(null)
            setTimerxError(null)
            setTriggerxError(null)
            devices.send({ type: 'CLOSE_SYSTEM_DUMP' })
            return
          }
          const tab = normalizeTab(manageTab)
          setManageTab(tab)
          startFetchForTab(tab)
        }}
      >
        <div className="grid max-h-[min(78vh,740px)] gap-3 overflow-auto p-4">
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <Heading slot="title" className="m-0 text-[20px] leading-tight font-[var(--font-display)]">
                {title}
              </Heading>
              <div className="text-muted mt-1 text-[12px] tracking-[0.14em] uppercase">{subtitle || 'device'}</div>
            </div>
            <Button tone="ghost" slot="close">
              Close
            </Button>
          </header>

          <Tabs
            selectedKey={manageTab}
            onSelectionChange={(k) => {
              const next = normalizeTab(coerceTab(k))
              setManageTab(next)
              startFetchForTab(next)
            }}
          >
            <TabList aria-label="Device view tabs">
              {isSmartLight ? <Tab id="color">Color</Tab> : null}
              {isPlugLike ? <Tab id="power">Power</Tab> : null}
              <Tab id="schedules">Schedules</Tab>
              <Tab id="diagnostics">Diagnostics</Tab>
            </TabList>
            <TabPanels>
              {isSmartLight ? (
                <TabPanel id="color">
                  <div className="grid gap-3">
                    <div className="text-muted text-[13px] leading-relaxed">
                      Fine tune brightness, white temperature, and color.
                    </div>
                    <SmartLightControls
                      uuid={uuid}
                      state={deviceState}
                      onRequestRefresh={() => {
                        devices.send({ type: 'monitor_REQUEST_REFRESH', uuid })
                      }}
                    />
                  </div>
                </TabPanel>
              ) : null}

              {isPlugLike ? (
                <TabPanel id="power">
                  <div className="grid gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="text-muted text-[12px] tracking-[0.14em] uppercase">Live power</div>
                      <Button
                        tone="quiet"
                        onPress={() => void refreshPowerHistory()}
                        isDisabled={!ready || powerHistoryLoading}
                      >
                        {powerHistoryLoading ? 'Refreshing…' : 'Refresh history'}
                      </Button>
                    </div>

                    <div className="grid gap-2 rounded-[var(--radius-md)] border border-white/10 bg-black/15 p-3">
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
                        <div>
                          <span className="mr-2 text-[11px] tracking-[0.14em] text-white/45 uppercase">now</span>
                          <span className="text-foreground/90">
                            {typeof devicePower?.powerW === 'number' ? fmtW(devicePower.powerW) : '(pending)'}
                          </span>
                        </div>
                        {typeof devicePower?.voltageV === 'number' ? (
                          <div>
                            <span className="mr-2 text-[11px] tracking-[0.14em] text-white/45 uppercase">v</span>
                            <span className="text-foreground/90">{fmtV(devicePower.voltageV)}</span>
                          </div>
                        ) : null}
                        {typeof devicePower?.currentA === 'number' ? (
                          <div>
                            <span className="mr-2 text-[11px] tracking-[0.14em] text-white/45 uppercase">a</span>
                            <span className="text-foreground/90">{fmtA(devicePower.currentA)}</span>
                          </div>
                        ) : null}
                        {devicePower?.stale ? (
                          <div className="text-[11px] tracking-[0.14em] text-white/50 uppercase">
                            {devicePower.error ? 'unavailable' : 'stale'}
                          </div>
                        ) : null}
                      </div>

                      <div className="rounded-[var(--radius-md)] border border-white/10 bg-black/25 p-2">
                        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                          <div className="text-[11px] tracking-[0.14em] text-white/45 uppercase">last 6h</div>
                          <div className="text-[11px] text-white/45">{powerHistoryError ? 'error' : ' '}</div>
                        </div>
                        {powerHistoryError ? (
                          <div className="text-[12px] text-white/75">{powerHistoryError}</div>
                        ) : (
                          <svg viewBox="0 0 300 56" className="h-14 w-full">
                            <defs>
                              <linearGradient id={`spark-${uuid}`} x1="0" x2="1" y1="0" y2="0">
                                <stop offset="0" stopColor="rgba(255,255,255,0.22)" />
                                <stop offset="1" stopColor="rgba(255,255,255,0.62)" />
                              </linearGradient>
                            </defs>
                            <rect x="0" y="0" width="300" height="56" rx="10" fill="rgba(255,255,255,0.03)" />
                            {powerHistory && powerHistory.length ? (
                              <path
                                d={sparklinePath(
                                  powerHistory.map((p) => (typeof p.powerWAvg === 'number' ? p.powerWAvg : null)),
                                  300,
                                  56,
                                  6,
                                )}
                                fill="none"
                                stroke={`url(#spark-${uuid})`}
                                strokeWidth="2.25"
                                strokeLinejoin="round"
                                strokeLinecap="round"
                              />
                            ) : (
                              <text x="12" y="34" fontSize="12" fill="rgba(255,255,255,0.55)">
                                No samples yet
                              </text>
                            )}
                          </svg>
                        )}
                      </div>
                    </div>
                  </div>
                </TabPanel>
              ) : null}

              <TabPanel id="schedules">
                <div className="grid gap-3">
                  <div className="text-muted text-[13px] leading-relaxed">
                    TimerX and TriggerX schemas vary by device. This UI is best-effort and uses raw numeric fields for
                    schedule timing. “Delete” may degrade to “disable” if the device does not support hard deletion.
                  </div>

                  <Tabs defaultSelectedKey="timers">
                    <TabList aria-label="Schedules tabs">
                      <Tab id="timers">Timers</Tab>
                      <Tab id="triggers">Triggers</Tab>
                    </TabList>
                    <TabPanels>
                      <TabPanel id="timers">
                        <div className="grid gap-3">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="text-muted text-[12px] tracking-[0.14em] uppercase">TimerX</div>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                tone="quiet"
                                onPress={async () => {
                                  setTimerxError(null)
                                  setTimerxLoading(true)
                                  try {
                                    const res = await apiPost<{
                                      host: string
                                      digest: LanScheduleDigestEntry[]
                                      timers: TimerXRule[]
                                    }>('/api/device/timerx/list', { uuid })
                                    setTimerxDigest(res.digest ?? [])
                                    setTimerxTimers(res.timers ?? [])
                                  } catch (e) {
                                    setTimerxError(e instanceof Error ? e.message : String(e))
                                  } finally {
                                    setTimerxLoading(false)
                                  }
                                }}
                                isDisabled={!ready || timerxLoading}
                              >
                                {timerxLoading ? 'Refreshing…' : 'Refresh'}
                              </Button>
                              <Button
                                tone="primary"
                                onPress={() => {
                                  setTimerEditor({
                                    mode: 'create',
                                    id: randomTimerId(),
                                    alias: '',
                                    channel: '0',
                                    enable: true,
                                    type: '0',
                                    week: '0',
                                    time: '-1',
                                    sunOffset: '0',
                                    duration: '0',
                                    toggleOnoff: true,
                                  })
                                }}
                                isDisabled={!ready}
                              >
                                New timer
                              </Button>
                            </div>
                          </div>

                          {timerxError ? (
                            <div className="rounded-[var(--radius-md)] border border-[color:color-mix(in_srgb,var(--color-danger)_30%,transparent)] bg-[color:color-mix(in_srgb,var(--color-danger)_10%,transparent)] p-2 text-[12px] text-white/90">
                              {timerxError}
                            </div>
                          ) : null}

                          {timerEditor ? (
                            <div className="grid gap-3 rounded-[var(--radius-lg)] border border-white/15 bg-black/20 p-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="text-[12px] tracking-[0.14em] text-white/70 uppercase">
                                  {timerEditor.mode === 'create' ? 'Create Timer' : 'Edit Timer'}
                                </div>
                                <Button tone="ghost" onPress={() => setTimerEditor(null)}>
                                  Cancel
                                </Button>
                              </div>
                              <div className="grid gap-3 md:grid-cols-2">
                                <TextField
                                  label="ID"
                                  value={timerEditor.id}
                                  onChange={(v) => setTimerEditor((s) => (s ? { ...s, id: v } : s))}
                                  inputProps={{ spellCheck: false }}
                                />
                                <TextField
                                  label="Alias"
                                  value={timerEditor.alias}
                                  onChange={(v) => setTimerEditor((s) => (s ? { ...s, alias: v } : s))}
                                />
                                <TextField
                                  label="Channel"
                                  value={timerEditor.channel}
                                  onChange={(v) => setTimerEditor((s) => (s ? { ...s, channel: v } : s))}
                                  inputProps={{ inputMode: 'numeric' }}
                                />
                                <TextField
                                  label="Type"
                                  value={timerEditor.type}
                                  onChange={(v) => setTimerEditor((s) => (s ? { ...s, type: v } : s))}
                                  inputProps={{ inputMode: 'numeric' }}
                                />
                                <TextField
                                  label="Week (raw)"
                                  value={timerEditor.week}
                                  onChange={(v) => setTimerEditor((s) => (s ? { ...s, week: v } : s))}
                                  inputProps={{ inputMode: 'numeric' }}
                                />
                                <TextField
                                  label="Time (raw)"
                                  value={timerEditor.time}
                                  onChange={(v) => setTimerEditor((s) => (s ? { ...s, time: v } : s))}
                                  inputProps={{ inputMode: 'numeric' }}
                                />
                                <TextField
                                  label="Sun offset (raw)"
                                  value={timerEditor.sunOffset}
                                  onChange={(v) => setTimerEditor((s) => (s ? { ...s, sunOffset: v } : s))}
                                  inputProps={{ inputMode: 'numeric' }}
                                />
                                <TextField
                                  label="Duration (raw)"
                                  value={timerEditor.duration}
                                  onChange={(v) => setTimerEditor((s) => (s ? { ...s, duration: v } : s))}
                                  inputProps={{ inputMode: 'numeric' }}
                                />
                              </div>
                              <div className="flex flex-wrap gap-4">
                                <Switch
                                  label="Enabled"
                                  isSelected={timerEditor.enable}
                                  onChange={(next) => setTimerEditor((s) => (s ? { ...s, enable: next } : s))}
                                />
                                <Switch
                                  label="Action on/off"
                                  isSelected={timerEditor.toggleOnoff}
                                  onChange={(next) => setTimerEditor((s) => (s ? { ...s, toggleOnoff: next } : s))}
                                />
                              </div>
                              <div className="flex flex-wrap justify-end gap-3">
                                <Button
                                  tone="primary"
                                  onPress={async () => {
                                    if (!timerEditor) return
                                    setTimerxError(null)
                                    const id = timerEditor.id.trim()
                                    if (!id) {
                                      setTimerxError('Missing timer id')
                                      return
                                    }
                                    const timer = {
                                      id,
                                      alias: timerEditor.alias,
                                      channel: Number(timerEditor.channel),
                                      enable: timerEditor.enable ? 1 : 0,
                                      type: Number(timerEditor.type),
                                      week: Number(timerEditor.week),
                                      time: Number(timerEditor.time),
                                      sunOffset: Number(timerEditor.sunOffset),
                                      duration: Number(timerEditor.duration),
                                      extend: { toggle: { onoff: timerEditor.toggleOnoff ? 1 : 0 } },
                                      createTime: 0,
                                    }
                                    setTimerxPending((p) => ({ ...p, [`${id}:save`]: true }))
                                    try {
                                      if (timerEditor.mode === 'create') {
                                        await apiPost('/api/device/timerx/set', { uuid, timer })
                                      } else {
                                        await apiPost('/api/device/timerx/patch', {
                                          uuid,
                                          id,
                                          patch: {
                                            alias: timerEditor.alias,
                                            channel: Number(timerEditor.channel),
                                            enable: timerEditor.enable ? 1 : 0,
                                            type: Number(timerEditor.type),
                                            week: Number(timerEditor.week),
                                            time: Number(timerEditor.time),
                                            sunOffset: Number(timerEditor.sunOffset),
                                            duration: Number(timerEditor.duration),
                                            toggleOnoff: timerEditor.toggleOnoff ? 1 : 0,
                                          },
                                        })
                                      }
                                      const res = await apiPost<{
                                        digest: LanScheduleDigestEntry[]
                                        timers: TimerXRule[]
                                      }>('/api/device/timerx/list', { uuid })
                                      setTimerxDigest(res.digest ?? [])
                                      setTimerxTimers(res.timers ?? [])
                                      setTimerEditor(null)
                                      devices.send({ type: 'monitor_REQUEST_REFRESH', uuid })
                                    } catch (e) {
                                      setTimerxError(e instanceof Error ? e.message : String(e))
                                    } finally {
                                      setTimerxPending((p) => ({ ...p, [`${id}:save`]: false }))
                                    }
                                  }}
                                  isDisabled={!ready || Boolean(timerxPending[`${timerEditor.id.trim()}:save`])}
                                >
                                  {timerxPending[`${timerEditor.id.trim()}:save`] ? 'Saving…' : 'Save'}
                                </Button>
                              </div>
                            </div>
                          ) : null}

                          <div className="grid gap-2">
                            {(timerxTimers ?? []).length ? (
                              (timerxTimers ?? []).map((t) => {
                                const label = String(t.alias ?? '').trim() || t.id
                                const enabled = t.enable === 1
                                const action = toggleOnoffFromExtend(t.extend)
                                return (
                                  <div
                                    key={t.id}
                                    className="grid gap-2 rounded-[var(--radius-lg)] border border-white/10 bg-black/15 p-3"
                                  >
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                      <div className="min-w-0">
                                        <div className="text-foreground/90 truncate text-[13px]">{label}</div>
                                        <div className="text-muted mt-0.5 text-[11px] tracking-[0.12em] uppercase">
                                          {[
                                            t.channel !== undefined ? `ch ${t.channel}` : '',
                                            t.type !== undefined ? `type ${t.type}` : '',
                                            t.week !== undefined ? `week ${t.week}` : '',
                                            t.time !== undefined ? `time ${t.time}` : '',
                                            t.sunOffset !== undefined ? `sun ${t.sunOffset}` : '',
                                            t.duration !== undefined ? `dur ${t.duration}` : '',
                                          ]
                                            .filter(Boolean)
                                            .join(' · ') || t.id}
                                        </div>
                                      </div>
                                      <div className="flex flex-wrap items-center gap-2">
                                        <Button
                                          tone="quiet"
                                          onPress={() => {
                                            setTimerEditor({
                                              mode: 'edit',
                                              id: t.id,
                                              alias: String(t.alias ?? ''),
                                              channel: String(t.channel ?? 0),
                                              enable: enabled,
                                              type: String(t.type ?? 0),
                                              week: String(t.week ?? 0),
                                              time: String(t.time ?? -1),
                                              sunOffset: String(t.sunOffset ?? 0),
                                              duration: String(t.duration ?? 0),
                                              toggleOnoff: (action ?? 0) === 1,
                                            })
                                          }}
                                          isDisabled={!ready}
                                        >
                                          Edit
                                        </Button>
                                        <Button
                                          tone="danger"
                                          onPress={async () => {
                                            setTimerxError(null)
                                            setTimerxPending((p) => ({ ...p, [`${t.id}:delete`]: true }))
                                            try {
                                              await apiPost('/api/device/timerx/delete', { uuid, id: t.id })
                                              const res = await apiPost<{
                                                digest: LanScheduleDigestEntry[]
                                                timers: TimerXRule[]
                                              }>('/api/device/timerx/list', { uuid })
                                              setTimerxDigest(res.digest ?? [])
                                              setTimerxTimers(res.timers ?? [])
                                              devices.send({ type: 'monitor_REQUEST_REFRESH', uuid })
                                            } catch (e) {
                                              setTimerxError(e instanceof Error ? e.message : String(e))
                                            } finally {
                                              setTimerxPending((p) => ({ ...p, [`${t.id}:delete`]: false }))
                                            }
                                          }}
                                          isDisabled={!ready || Boolean(timerxPending[`${t.id}:delete`])}
                                        >
                                          {timerxPending[`${t.id}:delete`] ? 'Deleting…' : 'Delete'}
                                        </Button>
                                      </div>
                                    </div>
                                    <div className="text-muted text-[11px] tracking-[0.12em] uppercase">
                                      enabled: {enabled ? 'yes' : 'no'} · action:{' '}
                                      {action === null ? 'n/a' : action === 1 ? 'on' : 'off'}
                                    </div>
                                  </div>
                                )
                              })
                            ) : timerxDigest && timerxDigest.length ? (
                              <div className="text-muted text-[13px]">
                                Timer IDs exist in digest, but no rules parsed yet. Hit Refresh.
                              </div>
                            ) : (
                              <div className="text-muted text-[13px]">No timers reported.</div>
                            )}
                          </div>
                        </div>
                      </TabPanel>

                      <TabPanel id="triggers">
                        <div className="grid gap-3">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="text-muted text-[12px] tracking-[0.14em] uppercase">TriggerX</div>
                            <Button
                              tone="quiet"
                              onPress={async () => {
                                setTriggerxError(null)
                                setTriggerxLoading(true)
                                try {
                                  const res = await apiPost<{
                                    host: string
                                    digest: LanScheduleDigestEntry[]
                                    rawById: Record<string, unknown>
                                  }>('/api/device/triggerx/list', { uuid })
                                  setTriggerxDigest(res.digest ?? [])
                                  const firstId = (res.digest ?? [])[0]?.id ?? null
                                  if (firstId) {
                                    setActiveTriggerId(firstId)
                                    const raw = (res.rawById ?? {})[firstId]
                                    const payload = isObjectRecord(raw) ? (raw as any).payload : null
                                    const rule = payload && isObjectRecord(payload.triggerx) ? payload.triggerx : null
                                    setTriggerJson(JSON.stringify(rule ?? { id: firstId }, null, 2))
                                  }
                                } catch (e) {
                                  setTriggerxError(e instanceof Error ? e.message : String(e))
                                } finally {
                                  setTriggerxLoading(false)
                                }
                              }}
                              isDisabled={!ready || triggerxLoading}
                            >
                              {triggerxLoading ? 'Refreshing…' : 'Refresh'}
                            </Button>
                          </div>

                          {triggerxError ? (
                            <div className="rounded-[var(--radius-md)] border border-[color:color-mix(in_srgb,var(--color-danger)_30%,transparent)] bg-[color:color-mix(in_srgb,var(--color-danger)_10%,transparent)] p-2 text-[12px] text-white/90">
                              {triggerxError}
                            </div>
                          ) : null}

                          <div className="grid gap-3 md:grid-cols-[260px_1fr]">
                            <div className="grid gap-2 rounded-[var(--radius-lg)] border border-white/10 bg-black/15 p-3">
                              <div className="text-[11px] tracking-[0.16em] text-white/55 uppercase">Trigger IDs</div>
                              <div className="grid gap-2">
                                {(triggerxDigest ?? []).length ? (
                                  (triggerxDigest ?? []).map((d) => (
                                    <Button
                                      key={d.id}
                                      tone={activeTriggerId === d.id ? 'primary' : 'quiet'}
                                      onPress={() => {
                                        setActiveTriggerId(d.id)
                                        setTriggerJson(JSON.stringify({ id: d.id }, null, 2))
                                      }}
                                      isDisabled={!ready}
                                    >
                                      {d.id}
                                    </Button>
                                  ))
                                ) : (
                                  <div className="text-muted text-[13px]">No triggers reported.</div>
                                )}
                              </div>
                              <Button
                                tone="primary"
                                onPress={() => {
                                  const id = randomTimerId()
                                  setActiveTriggerId(id)
                                  setTriggerJson(JSON.stringify({ id, enable: 1 }, null, 2))
                                }}
                                isDisabled={!ready}
                              >
                                New trigger
                              </Button>
                            </div>

                            <div className="grid gap-2 rounded-[var(--radius-lg)] border border-white/10 bg-black/15 p-3">
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="text-[11px] tracking-[0.16em] text-white/55 uppercase">
                                  Trigger JSON {activeTriggerId ? `(${activeTriggerId})` : ''}
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  <Button
                                    tone="quiet"
                                    onPress={async () => {
                                      if (!activeTriggerId) return
                                      setTriggerxError(null)
                                      setTriggerxPending((p) => ({ ...p, [`${activeTriggerId}:delete`]: true }))
                                      try {
                                        await apiPost('/api/device/triggerx/delete', { uuid, id: activeTriggerId })
                                        const res = await apiPost<{ digest: LanScheduleDigestEntry[] }>(
                                          '/api/device/triggerx/list',
                                          {
                                            uuid,
                                          },
                                        )
                                        setTriggerxDigest(res.digest ?? [])
                                        setActiveTriggerId(null)
                                        setTriggerJson('')
                                        devices.send({ type: 'monitor_REQUEST_REFRESH', uuid })
                                      } catch (e) {
                                        setTriggerxError(e instanceof Error ? e.message : String(e))
                                      } finally {
                                        setTriggerxPending((p) => ({ ...p, [`${activeTriggerId}:delete`]: false }))
                                      }
                                    }}
                                    isDisabled={
                                      !ready ||
                                      !activeTriggerId ||
                                      Boolean(activeTriggerId && triggerxPending[`${activeTriggerId}:delete`])
                                    }
                                  >
                                    {activeTriggerId && Boolean(triggerxPending[`${activeTriggerId}:delete`])
                                      ? 'Deleting…'
                                      : 'Delete'}
                                  </Button>
                                  <Button
                                    tone="primary"
                                    onPress={async () => {
                                      setTriggerxError(null)
                                      let obj: any = null
                                      try {
                                        obj = JSON.parse(triggerJson || 'null')
                                      } catch {
                                        setTriggerxError('Invalid JSON')
                                        return
                                      }
                                      if (
                                        !obj ||
                                        typeof obj !== 'object' ||
                                        Array.isArray(obj) ||
                                        !String(obj.id ?? '').trim()
                                      ) {
                                        setTriggerxError('Trigger JSON must be an object with a non-empty "id"')
                                        return
                                      }
                                      const id = String(obj.id).trim()
                                      setTriggerxPending((p) => ({ ...p, [`${id}:save`]: true }))
                                      try {
                                        await apiPost('/api/device/triggerx/set', { uuid, trigger: obj })
                                        const res = await apiPost<{ digest: LanScheduleDigestEntry[] }>(
                                          '/api/device/triggerx/list',
                                          { uuid },
                                        )
                                        setTriggerxDigest(res.digest ?? [])
                                        setActiveTriggerId(id)
                                        devices.send({ type: 'monitor_REQUEST_REFRESH', uuid })
                                      } catch (e) {
                                        setTriggerxError(e instanceof Error ? e.message : String(e))
                                      } finally {
                                        setTriggerxPending((p) => ({ ...p, [`${id}:save`]: false }))
                                      }
                                    }}
                                    isDisabled={!ready}
                                  >
                                    {(() => {
                                      const id = (() => {
                                        try {
                                          const o = JSON.parse(triggerJson || 'null')
                                          return o && typeof o === 'object' && !Array.isArray(o)
                                            ? String((o as any).id ?? '')
                                            : ''
                                        } catch {
                                          return ''
                                        }
                                      })()
                                      return id && Boolean(triggerxPending[`${id}:save`]) ? 'Saving…' : 'Save'
                                    })()}
                                  </Button>
                                </div>
                              </div>

                              <textarea
                                value={triggerJson}
                                onChange={(e) => setTriggerJson(e.currentTarget.value)}
                                spellCheck={false}
                                className="text-foreground min-h-[320px] w-full resize-y rounded-[var(--radius-md)] border border-white/15 bg-black/25 p-3 font-mono text-[12px] leading-relaxed outline-none"
                                placeholder='{"id":"...","enable":1}'
                              />
                            </div>
                          </div>
                        </div>
                      </TabPanel>
                    </TabPanels>
                  </Tabs>
                </div>
              </TabPanel>

              <TabPanel id="diagnostics">
                <div className="grid gap-3">
                  <div className="grid gap-2 rounded-[var(--radius-md)] border border-white/10 bg-black/15 p-3 text-[12px]">
                    <div>
                      <span className="mr-2 text-[11px] tracking-[0.14em] text-white/45 uppercase">ip</span>
                      <span className="text-foreground/90 break-all">{host || '(unknown)'}</span>
                    </div>
                    <div>
                      <span className="mr-2 text-[11px] tracking-[0.14em] text-white/45 uppercase">uuid</span>
                      <span className="text-foreground/90 break-all">{uuid}</span>
                    </div>
                    {mac ? (
                      <div>
                        <span className="mr-2 text-[11px] tracking-[0.14em] text-white/45 uppercase">mac</span>
                        <span className="text-foreground/90 break-all">{mac}</span>
                      </div>
                    ) : null}
                    {hostUpdatedAt ? (
                      <div>
                        <span className="mr-2 text-[11px] tracking-[0.14em] text-white/45 uppercase">last seen</span>
                        <span className="text-foreground/90 break-all">{hostUpdatedAt}</span>
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap justify-end gap-3">
                    <Button
                      tone="quiet"
                      onPress={() => devices.send({ type: 'monitor_REQUEST_REFRESH', uuid })}
                      isDisabled={!ready}
                      icon={<RefreshIcon />}
                    >
                      Refresh state
                    </Button>
                    <Button
                      tone="ghost"
                      onPress={() => refreshDiagnostics()}
                      isDisabled={isFetchingDiagnostics || !ready}
                      isPending={isFetchingDiagnostics}
                    >
                      Fetch diagnostics
                    </Button>
                  </div>

                  {systemDump && systemDump.uuid === uuid ? (
                    <div className="grid gap-2">
                      <div className="text-muted text-[11px] tracking-[0.14em] uppercase">
                        Appliance.System.All (raw)
                      </div>
                      <pre className="m-0 max-h-[44vh] overflow-auto rounded-[var(--radius-lg)] border border-white/15 bg-black/30 p-4 text-[12px] leading-relaxed text-white/90">
                        {JSON.stringify(systemDump.data, null, 2)}
                      </pre>
                    </div>
                  ) : (
                    <div className="text-muted text-[13px] leading-relaxed">
                      No diagnostics JSON yet. Switch to this tab (or click Fetch diagnostics) to pull{' '}
                      <span className="font-mono">Appliance.System.All</span>.
                    </div>
                  )}
                </div>
              </TabPanel>
            </TabPanels>
          </Tabs>
        </div>
      </Modal>
    </article>
  )
}
