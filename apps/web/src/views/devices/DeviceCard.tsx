import { useMemo, useState } from 'react'
import { apiPost } from '../../lib/api'
import { Heading } from 'react-aria-components'
import type { MerossCloudDevice } from '../../lib/types'
import { useDevicesActorRef, useDevicesSelector } from '../../state/devicesActor'
import { cls } from '../../ui/cls'
import { RefreshIcon } from '../../ui/icons/RefreshIcon'
import { Button } from '../../ui/rac/Button'
import { Disclosure, DisclosurePanel, DisclosureTrigger } from '../../ui/rac/Disclosure'
import { Modal } from '../../ui/rac/Modal'
import { Switch } from '../../ui/rac/Switch'
import { Tab, TabList, TabPanel, TabPanels, Tabs } from '../../ui/rac/Tabs'
import { TextField } from '../../ui/rac/TextField'
import { SmartLightControls, SmartLightQuickStrip } from './SmartLightControls'

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

const isObjectRecord = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === 'object' && !Array.isArray(v))

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

const fmtRgbHex = (rgb: number) => `#${Math.max(0, Math.min(0xffffff, Math.round(rgb))).toString(16).padStart(6, '0')}`

export function DeviceCard(props: { uuid: string; device: MerossCloudDevice | null }) {
  const devices = useDevicesActorRef()
  const uuid = props.uuid

  const hostEntry = useDevicesSelector(
    (s) => s.context.hosts[uuid] as { host: string; updatedAt: string; mac?: string } | undefined,
  )
  const deviceState = useDevicesSelector((s) => s.context.deviceStates[uuid] as DeviceState | undefined)
  const isToggling = useDevicesSelector(
    (s) => s.matches({ operations: 'toggling' }) && s.context.activeDeviceUuid === uuid,
  )
  const isFetchingDiagnostics = useDevicesSelector(
    (s) => s.matches({ operations: 'fetchingDiagnostics' }) && s.context.activeDeviceUuid === uuid,
  )

  const [isExpanded, setExpanded] = useState(false)
  const [schedulesOpen, setSchedulesOpen] = useState(false)

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

  const lanDesc = !ready
    ? 'ip unavailable'
    : deviceState
      ? `${deviceState.stale ? 'stale' : 'state'} @ ${new Date(deviceState.updatedAt).toLocaleTimeString()}${deviceState.source ? ` · ${deviceState.source}` : ''}`
      : 'state unknown'

  const cardClass = useMemo(() => {
    const base = 'device-card'
    if (!ready) return cls(base, 'device-card--inaccessible')
    if (lanOn === true) return cls(base, 'device-card--on')
    if (lanOn === false) return cls(base, 'device-card--off')
    return base
  }, [lanOn, ready])

  return (
    <article className={cardClass}>
      <header className="grid gap-3 px-4 pt-4 pb-3 md:grid-cols-[1fr_auto] md:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-foreground text-[18px] leading-tight font-[var(--font-display)]">{title}</div>
          </div>
          <div className="text-muted mt-1 text-[12px] tracking-[0.14em] uppercase">{subtitle || 'device'}</div>
        </div>

        <div className="flex flex-wrap items-center justify-start gap-3 md:justify-end">
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

        {ready && isSmartLight && !isExpanded ? (
          <div className="md:col-span-2">
            <SmartLightQuickStrip
              uuid={uuid}
              state={deviceState}
              onRequestRefresh={() => devices.send({ type: 'monitor_REQUEST_REFRESH', uuid })}
              onOpenTuning={() => {
                setExpanded(true)
                devices.send({ type: 'monitor_REQUEST_REFRESH', uuid })
              }}
            />
          </div>
        ) : null}
      </header>

      <Disclosure
        isExpanded={isExpanded}
        onExpandedChange={(next) => {
          setExpanded(next)
          if (next && ready) {
            devices.send({ type: 'monitor_REQUEST_REFRESH', uuid })
          }
        }}
        className="mx-4 mb-4"
      >
        <DisclosureTrigger>
          <span>Details</span>
        </DisclosureTrigger>
        <DisclosurePanel>
          <div className="border-t border-white/10 px-3 py-3">
              <div className="text-muted grid gap-2 text-[12px]">
              <div>
                <span className="mr-2 text-[11px] tracking-[0.14em] text-white/45 uppercase">ip</span>{' '}
                <span className="text-foreground/90 break-all">{host || '(unknown)'}</span>
              </div>
              <div>
                <span className="mr-2 text-[11px] tracking-[0.14em] text-white/45 uppercase">uuid</span>{' '}
                <span className="text-foreground/90 break-all">{uuid}</span>
              </div>
              {mac ? (
                <div>
                  <span className="mr-2 text-[11px] tracking-[0.14em] text-white/45 uppercase">mac</span>{' '}
                  <span className="text-foreground/90 break-all">{mac}</span>
                </div>
              ) : null}
              {hostUpdatedAt ? (
                <div>
                  <span className="mr-2 text-[11px] tracking-[0.14em] text-white/45 uppercase">ip seen</span>{' '}
                  <span className="text-foreground/90 break-all">{hostUpdatedAt}</span>
                </div>
              ) : null}
            </div>

            {ready ? (
              <div className="mt-3 grid gap-3 border-t border-white/10 pt-3">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-white/10 bg-black/15 p-3">
                  <div
                    className={cls(
                      'rounded-full border px-3 py-1 text-[11px] tracking-[0.16em] uppercase',
                      deviceState?.stale
                        ? 'border-[color:color-mix(in_srgb,var(--color-danger)_35%,transparent)] bg-[color:color-mix(in_srgb,var(--color-danger)_10%,transparent)] text-white/90'
                        : 'border-white/15 bg-white/5 text-white/80',
                    )}
                  >
                    {lanDesc}
                  </div>
                </div>

                {light0 && (light0.luminance !== undefined || light0.temperature !== undefined || light0.rgb !== undefined) ? (
                  <div className="grid gap-2 rounded-[var(--radius-md)] border border-white/10 bg-black/15 p-3">
                    <div className="text-[11px] tracking-[0.16em] text-white/55 uppercase">Light</div>
                    <div className="text-muted grid gap-2 text-[12px]">
                      {light0.luminance !== undefined ? (
                        <div>
                          <span className="mr-2 text-[11px] tracking-[0.14em] text-white/45 uppercase">brightness</span>{' '}
                          <span className="text-foreground/90">{Math.round(light0.luminance)}</span>
                        </div>
                      ) : null}
                      {light0.temperature !== undefined ? (
                        <div>
                          <span className="mr-2 text-[11px] tracking-[0.14em] text-white/45 uppercase">temperature</span>{' '}
                          <span className="text-foreground/90">{Math.round(light0.temperature)}</span>
                        </div>
                      ) : null}
                      {light0.rgb !== undefined ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[11px] tracking-[0.14em] text-white/45 uppercase">color</span>
                          <span
                            className="h-3 w-3 rounded-full border border-white/20"
                            style={{ background: fmtRgbHex(light0.rgb) }}
                          />
                          <span className="text-foreground/90">{fmtRgbHex(light0.rgb)}</span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                <div className="grid gap-2 rounded-[var(--radius-md)] border border-white/10 bg-black/15 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-[11px] tracking-[0.16em] text-white/55 uppercase">Schedules</div>
                    <Button
                      tone="quiet"
                      onPress={() => {
                        setSchedulesOpen(true)
                      }}
                      isDisabled={!ready}
                    >
                      Manage
                    </Button>
                  </div>

                  {(() => {
                    const timerDigest = deviceState?.timerxDigest ?? []
                    const triggerDigest = deviceState?.triggerxDigest ?? []
                    const timerTotal = timerDigest.reduce((sum, d) => sum + (Number.isFinite(Number(d.count)) ? Number(d.count) : 0), 0)
                    const triggerTotal = triggerDigest.reduce(
                      (sum, d) => sum + (Number.isFinite(Number(d.count)) ? Number(d.count) : 0),
                      0,
                    )
                    const timerIds = [...new Set(timerDigest.map((d) => String(d.id ?? '').trim()).filter(Boolean))]
                    const triggerIds = [...new Set(triggerDigest.map((d) => String(d.id ?? '').trim()).filter(Boolean))]
                    return (
                      <div className="text-muted grid gap-2 text-[12px]">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                          <div>
                            <span className="mr-2 text-[11px] tracking-[0.14em] text-white/45 uppercase">timers</span>
                            <span className="text-foreground/90">{timerTotal || timerIds.length}</span>
                          </div>
                          <div>
                            <span className="mr-2 text-[11px] tracking-[0.14em] text-white/45 uppercase">triggers</span>
                            <span className="text-foreground/90">{triggerTotal || triggerIds.length}</span>
                          </div>
                        </div>
                        {timerIds.length ? (
                          <div className="text-white/70">
                            <span className="mr-2 text-[11px] tracking-[0.14em] text-white/45 uppercase">timer ids</span>
                            <span className="break-all">{timerIds.join(', ')}</span>
                          </div>
                        ) : null}
                        {triggerIds.length ? (
                          <div className="text-white/70">
                            <span className="mr-2 text-[11px] tracking-[0.14em] text-white/45 uppercase">trigger ids</span>
                            <span className="break-all">{triggerIds.join(', ')}</span>
                          </div>
                        ) : null}
                      </div>
                    )
                  })()}
                </div>

                {isSmartLight ? (
                  <SmartLightControls
                    uuid={uuid}
                    state={deviceState}
                    onRequestRefresh={() => {
                      devices.send({ type: 'monitor_REQUEST_REFRESH', uuid })
                    }}
                  />
                ) : null}

                <div className="grid gap-3 md:grid-cols-2">
                  <Button
                    tone="quiet"
                    onPress={() => devices.send({ type: 'monitor_REQUEST_REFRESH', uuid })}
                    isDisabled={!host}
                    icon={<RefreshIcon />}
                  >
                    Refresh state
                  </Button>
                  <Button
                    tone="ghost"
                    onPress={() => devices.send({ type: 'device_DIAGNOSTICS', uuid })}
                    isDisabled={isFetchingDiagnostics || !host}
                    isPending={isFetchingDiagnostics}
                  >
                    Fetch diagnostics
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </DisclosurePanel>
      </Disclosure>

      <Modal
        isDismissable
        isOpen={schedulesOpen}
        onOpenChange={(open) => {
          setSchedulesOpen(open)
          if (!open) {
            setTimerEditor(null)
            setTimerxError(null)
            setTriggerxError(null)
          }
        }}
      >
        <div className="grid gap-3 p-4">
          <Heading slot="title" className="m-0 text-[20px] leading-tight font-[var(--font-display)]">
            Schedules
          </Heading>
          <div className="text-muted text-[13px] leading-relaxed">
            TimerX and TriggerX schemas vary by device. This UI is best-effort and uses raw numeric fields for schedule
            timing. “Delete” may degrade to “disable” if the device does not support hard deletion.
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
                              const res = await apiPost<{ digest: LanScheduleDigestEntry[]; timers: TimerXRule[] }>(
                                '/api/device/timerx/list',
                                { uuid },
                              )
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
                          {Boolean(timerxPending[`${timerEditor.id.trim()}:save`]) ? 'Saving…' : 'Save'}
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
                          <div key={t.id} className="grid gap-2 rounded-[var(--radius-lg)] border border-white/10 bg-black/15 p-3">
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
                                      const res = await apiPost<{ digest: LanScheduleDigestEntry[]; timers: TimerXRule[] }>(
                                        '/api/device/timerx/list',
                                        { uuid },
                                      )
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
                                  {Boolean(timerxPending[`${t.id}:delete`]) ? 'Deleting…' : 'Delete'}
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
                      <div className="text-muted text-[13px]">Timer IDs exist in digest, but no rules parsed yet. Hit Refresh.</div>
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
                                const res = await apiPost<{ digest: LanScheduleDigestEntry[] }>('/api/device/triggerx/list', {
                                  uuid,
                                })
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
                            isDisabled={!ready || !activeTriggerId || Boolean(activeTriggerId && triggerxPending[`${activeTriggerId}:delete`])}
                          >
                            {activeTriggerId && Boolean(triggerxPending[`${activeTriggerId}:delete`]) ? 'Deleting…' : 'Delete'}
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
                              if (!obj || typeof obj !== 'object' || Array.isArray(obj) || !String(obj.id ?? '').trim()) {
                                setTriggerxError('Trigger JSON must be an object with a non-empty "id"')
                                return
                              }
                              const id = String(obj.id).trim()
                              setTriggerxPending((p) => ({ ...p, [`${id}:save`]: true }))
                              try {
                                await apiPost('/api/device/triggerx/set', { uuid, trigger: obj })
                                const res = await apiPost<{ digest: LanScheduleDigestEntry[] }>('/api/device/triggerx/list', { uuid })
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
                                  return o && typeof o === 'object' && !Array.isArray(o) ? String((o as any).id ?? '') : ''
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

          <div className="flex flex-wrap justify-end gap-3">
            <Button tone="ghost" slot="close" onPress={() => setSchedulesOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>
    </article>
  )
}
