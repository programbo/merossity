import { useEffect, useMemo, useState } from 'react'
import { groupDevicesForControl } from '@merossity/core/meross/inventory'
import { Heading } from 'react-aria-components'
import './index.css'
import { apiPost } from './lib/api'
import { AppProvider, useAppActorRef, useAppSelector } from './state/appActor'
import { Button } from './ui/rac/Button'
import { Modal } from './ui/rac/Modal'
import { Switch } from './ui/rac/Switch'
import { TextField } from './ui/rac/TextField'

const clampText = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n)}…`)

const INPUT_COMMON = { autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false } as const
const INPUT_PASSWORD = { ...INPUT_COMMON, type: 'password' as const } as const
const INPUT_NUMERIC = { ...INPUT_COMMON, inputMode: 'numeric' as const } as const

const isTotpValid = (s: string) => /^[0-9]{6}$/.test(String(s ?? '').trim())

type LanToggleXChannel = { channel: number; onoff: 0 | 1 }
type LanState = { host: string; channel: number; onoff: 0 | 1; channels?: LanToggleXChannel[]; updatedAt: number }

type HostEntry = { host?: string; mac?: string; updatedAt?: string } | undefined

function RefreshIcon(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <polyline points="21 3 21 9 15 9" />
    </svg>
  )
}

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

export function App() {
  return (
    <AppProvider>
      <AppView />
    </AppProvider>
  )
}

function AppView() {
  const busy = useAppSelector((s) => s.context.busy)
  const linked = useAppSelector((s) => Boolean(s.context.cloud?.key))
  if (busy.bootstrap) return <BootView />
  return <div className="lab-bg min-h-screen">{linked ? <InventoryView /> : <KeyGateView />}</div>
}

function BootView() {
  return (
    <div className="app-shell">
      <header className="app-header app-header--simple">
        <div className="brand">
          <div className="brand__title">Merossity</div>
          <div className="brand__sub">Loading…</div>
        </div>
      </header>
    </div>
  )
}

function KeyGateView() {
  const app = useAppActorRef()
  const status = useAppSelector((s) => s.context.status)
  const connect = useAppSelector((s) => s.context.connect)
  const busy = useAppSelector((s) => s.context.busy)
  const toast = useAppSelector((s) => s.context.toast)

  const envReady = Boolean(status?.env.hasEmail && status?.env.hasPassword)
  const canSubmit = useMemo(() => {
    if (!isTotpValid(connect.totp)) return false
    if (connect.useEnv) return envReady
    return Boolean(connect.email.trim() && connect.password)
  }, [connect.email, connect.password, connect.totp, connect.useEnv, envReady])

  return (
    <div className="app-shell">
      <header className="app-header app-header--simple">
        <div className="brand">
          <div className="brand__title">Meross Cloud Key</div>
        </div>
      </header>

      <main className="app-main">
        <section className="panel">
          <header className="panel__head">
            <div>
              <div className="panel__kicker">required</div>
              <h2 className="panel__title">Link your account</h2>
            </div>
          </header>

          <div className="panel__body">
            <div className="grid gap-4">
              <TextField
                label={connect.useEnv ? 'Email (disabled: using server env)' : 'Email'}
                value={connect.email}
                onChange={(email) => app.send({ type: 'CONNECT.SET_EMAIL', email })}
                placeholder="name@example.com"
                isDisabled={busy.login || busy.bootstrap || connect.useEnv}
                inputProps={INPUT_COMMON}
              />

              <TextField
                label={connect.useEnv ? 'Password (disabled: using server env)' : 'Password'}
                value={connect.password}
                onChange={(password) => app.send({ type: 'CONNECT.SET_PASSWORD', password })}
                placeholder="••••••••"
                isDisabled={busy.login || busy.bootstrap || connect.useEnv}
                inputProps={INPUT_PASSWORD}
              />

              <TextField
                label="TOTP (6 digits)"
                value={connect.totp}
                onChange={(totp) => app.send({ type: 'CONNECT.SET_TOTP', totp })}
                placeholder="123456"
                hint="Required."
                isDisabled={busy.login || busy.bootstrap}
                inputProps={INPUT_NUMERIC}
              />
            </div>

            <details className="details mt-4">
              <summary className="details__summary">Advanced</summary>
              <div className="details__body">
                <div className="callout">
                  <div>
                    <div className="callout__title">Server env credentials</div>
                    <div className="callout__copy">Email/password: {envReady ? 'present' : 'missing'}.</div>
                  </div>
                  <div className="callout__right">
                    <Switch
                      isSelected={connect.useEnv}
                      onChange={(useEnv) => app.send({ type: 'CONNECT.SET_USE_ENV', useEnv })}
                      isDisabled={busy.login || busy.bootstrap}
                      label="Use server env"
                      description={connect.useEnv ? 'Email/password disabled' : 'Manual entry'}
                    />
                  </div>
                </div>
              </div>
            </details>

            <div className="actionRow mt-5">
              <Button
                tone="primary"
                onPress={() => app.send({ type: 'CONNECT.SUBMIT' })}
                isDisabled={busy.login || busy.bootstrap || !canSubmit}
                isPending={busy.login}
              >
                Fetch key
              </Button>
            </div>
          </div>
        </section>
      </main>

      {toast ? <Toast /> : null}
    </div>
  )
}

function InventoryView() {
  const app = useAppActorRef()
  const cloud = useAppSelector((s) => s.context.cloud)
  const devices = useAppSelector((s) => s.context.devices)
  const hosts = useAppSelector((s) => s.context.hosts)
  const busy = useAppSelector((s) => s.context.busy)
  const devicesUi = useAppSelector((s) => s.context.devicesUi)
  const toast = useAppSelector((s) => s.context.toast)

  const canLan = Boolean(cloud?.key)
  const reloadBusy = Boolean(busy.refreshDevices || busy.scanLan || busy.suggestCidr)

  const groups = useMemo(() => groupDevicesForControl(devices, hosts as any), [devices, hosts])

  const [lanState, setLanState] = useState<Record<string, LanState>>({})
  const [lanErr, setLanErr] = useState<Record<string, string>>({})
  const [toggleBusy, setToggleBusy] = useState<Record<string, boolean>>({})
  const [refreshLanCount, setRefreshLanCount] = useState<Record<string, number>>({})

  const refreshLanState = async (uuid: string) => {
    setRefreshLanCount((prev) => ({ ...prev, [uuid]: (prev[uuid] ?? 0) + 1 }))
    try {
      const res = await apiPost<{ host: string; channel: number; onoff: 0 | 1; channels?: LanToggleXChannel[] }>(
        '/api/lan/state',
        { uuid, channel: 0 },
      )
      setLanState((prev) => ({
        ...prev,
        [uuid]: {
          host: res.host,
          channel: res.channel,
          onoff: res.onoff,
          channels: res.channels,
          updatedAt: Date.now(),
        },
      }))
      setLanErr((prev) => {
        if (!prev[uuid]) return prev
        const next = { ...prev }
        delete next[uuid]
        return next
      })
    } catch (e) {
      setLanErr((prev) => ({ ...prev, [uuid]: e instanceof Error ? e.message : String(e) }))
    } finally {
      setRefreshLanCount((prev) => {
        const cur = prev[uuid] ?? 0
        const nextCount = cur - 1
        if (nextCount > 0) return { ...prev, [uuid]: nextCount }
        if (!cur) return prev
        const next = { ...prev }
        delete next[uuid]
        return next
      })
    }
  }

  const toggleLan = async (uuid: string, host: string, onoff: 0 | 1) => {
    setToggleBusy((prev) => ({ ...prev, [uuid]: true }))

    // Optimistic UI: reflect immediately so the card updates.
    setLanState((prev) => ({
      ...prev,
      [uuid]: {
        host: host || prev[uuid]?.host || '',
        channel: 0,
        onoff,
        channels: prev[uuid]?.channels,
        updatedAt: Date.now(),
      },
    }))

    try {
      await apiPost('/api/lan/toggle', { uuid, channel: 0, onoff })
      app.send({
        type: 'TOAST.SHOW',
        toast: { kind: 'ok', title: onoff ? 'Switched on' : 'Switched off', detail: clampText(uuid, 12) },
      })
      setTimeout(() => void refreshLanState(uuid), 700)
    } catch (e) {
      app.send({
        type: 'TOAST.SHOW',
        toast: { kind: 'err', title: 'Toggle failed', detail: e instanceof Error ? e.message : String(e) },
      })
      // Best-effort: correct optimistic UI.
      setTimeout(() => void refreshLanState(uuid), 700)
    } finally {
      setToggleBusy((prev) => ({ ...prev, [uuid]: false }))
    }
  }

  // Once we have IPs, fetch state for a small number of likely-switch devices so cards can reflect power.
  useEffect(() => {
    if (!canLan) return

    let alive = true
    const run = async () => {
      const uuids: string[] = []
      for (const d of groups.ready ?? []) {
        if (!alive) return
        const uuid = String((d as any)?.uuid ?? '').trim()
        if (!uuid) continue
        const host = (hosts as any)?.[uuid]?.host
        if (!host) continue
        if (!prefersToggleFor(d as any)) continue
        if (lanState[uuid]) continue
        if (lanErr[uuid]) continue
        uuids.push(uuid)
        if (uuids.length >= 8) break
      }

      for (const uuid of uuids) {
        if (!alive) return
        await refreshLanState(uuid)
        await new Promise((r) => setTimeout(r, 120))
      }
    }

    void run()
    return () => {
      alive = false
    }
  }, [canLan, groups.ready, hosts, lanState, lanErr])

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      app.send({ type: 'TOAST.SHOW', toast: { kind: 'ok', title: 'Copied' } })
    } catch (e) {
      app.send({
        type: 'TOAST.SHOW',
        toast: { kind: 'err', title: 'Copy failed', detail: e instanceof Error ? e.message : String(e) },
      })
    }
  }

  const cloudHint = cloud ? `${cloud.userEmail} · ${cloud.domain}` : ''

  return (
    <div className="app-shell">
      <header className="app-header app-header--inventory">
        <div className="brand">
          <div className="brand__title">Merossity</div>
          <div className="brand__sub">{cloudHint}</div>
        </div>

        {cloud ? (
          <div className="app-actions">
            <Button tone="primary" onPress={() => void copy(cloud.key)}>
              Copy key
            </Button>
          </div>
        ) : null}
      </header>

      <main className="app-main">
        <section className="panel">
          <header className="panel__head">
            <div>
              <h2 className="panel__title">Devices</h2>
            </div>
            <div className="panel__headActions">
              <Button
                tone="quiet"
                className={`is-iconOnly reloadButton${reloadBusy ? 'is-busy' : ''}`}
                aria-label="Reload devices (refresh + scan LAN)"
                onPress={() => {
                  app.send({ type: 'DEVICES.REFRESH_FROM_CLOUD' })
                  app.send({ type: 'DEVICES.DISCOVER_HOSTS' })
                }}
                isDisabled={reloadBusy}
                icon={<RefreshIcon className={reloadBusy ? 'iconSpin' : undefined} />}
              />
            </div>
          </header>

          <div className="panel__body">
            {busy.scanLan || busy.suggestCidr ? (
              <div className="callout mt-4">
                <div>
                  <div className="callout__title">Scanning LAN</div>
                  <div className="callout__copy">
                    Looking up IPs. Devices with a known IP remain controllable while the scan runs.
                  </div>
                </div>
              </div>
            ) : null}

            <div className="subpanel mt-4">
              <TextField
                label="CIDR (optional)"
                value={devicesUi.cidr}
                onChange={(cidr) => app.send({ type: 'DEVICES.SET_CIDR', cidr })}
                placeholder="auto (recommended)"
                hint="Leave blank to auto-suggest; set a CIDR to speed up scanning."
                isDisabled={busy.scanLan || busy.suggestCidr}
                inputProps={INPUT_COMMON}
              />
            </div>

            {devices.length === 0 ? (
              <div className="emptyState mt-4">
                <div className="emptyState__title">No devices yet.</div>
                <div className="emptyState__copy">Reload to pull devices from cloud and scan your LAN for IPs.</div>
              </div>
            ) : (
              <div className="deviceGroups mt-5">
                <DeviceGroup
                  title="Ready to control"
                  count={groups.ready.length}
                  devices={devices}
                  hosts={hosts}
                  uuids={new Set(groups.ready.map((d: any) => d.uuid))}
                  lanState={lanState}
                  lanErr={lanErr}
                  toggleBusy={toggleBusy}
                  refreshLanCount={refreshLanCount}
                  onRefreshLanState={refreshLanState}
                  onToggleLan={toggleLan}
                />
                <DeviceGroup
                  title="Inaccessible"
                  count={groups.inaccessible.length}
                  devices={devices}
                  hosts={hosts}
                  uuids={new Set(groups.inaccessible.map((d: any) => d.uuid))}
                  lanState={lanState}
                  lanErr={lanErr}
                  toggleBusy={toggleBusy}
                  refreshLanCount={refreshLanCount}
                  onRefreshLanState={refreshLanState}
                  onToggleLan={toggleLan}
                />
              </div>
            )}
          </div>

          <Modal
            isDismissable
            isOpen={Boolean(devicesUi.systemDump)}
            onOpenChange={(open) => {
              if (!open) app.send({ type: 'DEVICES.CLOSE_SYSTEM_DUMP' })
            }}
          >
            {devicesUi.systemDump ? (
              <div className="dump">
                <Heading slot="title" className="dump__title">
                  Diagnostics: Appliance.System.All
                </Heading>
                <div className="dump__meta">
                  <div className="dump__uuid">{clampText(devicesUi.systemDump.uuid, 22)}</div>
                  <div className="dump__host">{devicesUi.systemDump.host}</div>
                </div>
                <pre className="dump__pre">{JSON.stringify(devicesUi.systemDump.data, null, 2)}</pre>
                <div className="dump__actions">
                  <Button tone="ghost" slot="close" onPress={() => app.send({ type: 'DEVICES.CLOSE_SYSTEM_DUMP' })}>
                    Close
                  </Button>
                </div>
              </div>
            ) : null}
          </Modal>
        </section>
      </main>

      {toast ? <Toast /> : null}
    </div>
  )
}

function DeviceGroup(props: {
  title: string
  count: number
  devices: any[]
  hosts: Record<string, any>
  uuids: Set<string>
  lanState: Record<string, LanState>
  lanErr: Record<string, string>
  toggleBusy: Record<string, boolean>
  refreshLanCount: Record<string, number>
  onRefreshLanState: (uuid: string) => Promise<void>
  onToggleLan: (uuid: string, host: string, onoff: 0 | 1) => Promise<void>
}) {
  const {
    title,
    count,
    devices,
    hosts,
    uuids,
    lanState,
    lanErr,
    toggleBusy,
    refreshLanCount,
    onRefreshLanState,
    onToggleLan,
  } = props
  const filtered = devices.filter((d) => uuids.has(String(d.uuid ?? '')))

  return (
    <section className="deviceGroup">
      <header className="deviceGroup__head">
        <div className="deviceGroup__title">{title}</div>
        <div className="chip chip--muted">{count}</div>
      </header>
      <div className="deviceList">
        {filtered.map((d) => {
          const uuid = String(d.uuid ?? '')
          return (
            <DeviceRow
              key={uuid}
              device={d}
              hostEntry={hosts[uuid] as HostEntry}
              lan={lanState[uuid]}
              lanError={lanErr[uuid]}
              isRefreshingLanState={Boolean(refreshLanCount[uuid])}
              isToggling={Boolean(toggleBusy[uuid])}
              onRefreshLanState={onRefreshLanState}
              onToggleLan={onToggleLan}
            />
          )
        })}
      </div>
    </section>
  )
}

function DeviceRow(props: {
  device: any
  hostEntry: HostEntry
  lan: LanState | undefined
  lanError: string | undefined
  isRefreshingLanState: boolean
  isToggling: boolean
  onRefreshLanState: (uuid: string) => Promise<void>
  onToggleLan: (uuid: string, host: string, onoff: 0 | 1) => Promise<void>
}) {
  const app = useAppActorRef()
  const busy = useAppSelector((s) => s.context.busy)

  const d = props.device
  const uuid = String(d.uuid ?? '')

  const host = props.hostEntry?.host ? String(props.hostEntry.host) : ''
  const hostUpdatedAt = props.hostEntry?.updatedAt ? String(props.hostEntry.updatedAt) : ''

  const online = String(d.onlineStatus ?? '').toLowerCase()
  const onlineTone =
    online.includes('online') || online === '1' ? 'ok' : online.includes('offline') || online === '0' ? 'err' : 'muted'

  const title = String(d.devName ?? '') || uuid
  const model = String(d.deviceType ?? '').trim()
  const typeLabel = friendlyDeviceTypeFromModel(model)
  const subtitle = [typeLabel, model].filter(Boolean).join(' / ')

  const macCloud = (d.macAddress as string | undefined) ?? (d.mac as string | undefined) ?? ''
  const macLan = props.hostEntry?.mac ? String(props.hostEntry.mac) : ''
  const mac = macCloud || macLan
  const macForResolve = macCloud || macLan || ''

  const ready = Boolean(host)
  const disableResolve = busy.resolveUuid !== null

  const l = props.lan
  const ch0 = l?.channels?.find((c) => c.channel === 0) ?? (l ? { channel: 0, onoff: l.onoff } : null)
  const lanOn = ch0 ? ch0.onoff === 1 : null
  const powerClass = lanOn === null ? '' : lanOn ? 'device--power-on' : 'device--power-off'
  const lanChipTone = lanOn === null ? 'muted' : lanOn ? 'ok' : 'muted'

  const togglable = ready && prefersToggleFor(d)
  const toggleDisabled = !ready || props.isToggling

  const lanDesc = !ready
    ? 'Find IP to query'
    : props.lanError
      ? `state error: ${props.lanError}`
      : l
        ? `state @ ${new Date(l.updatedAt).toLocaleTimeString()}`
        : 'state unknown'

  return (
    <article className={powerClass ? `device ${powerClass}` : 'device'}>
      <header className="device__head">
        <div className="device__id">
          <div className="device__titleRow">
            <div className="device__title">{title}</div>
            <div className={`chip chip--${onlineTone}`}>{online || 'unknown'}</div>
            <div className={`chip chip--${lanChipTone}`}>lan: {lanOn === null ? 'unknown' : lanOn ? 'on' : 'off'}</div>
          </div>
          <div className="device__subtitle">{subtitle || 'device'}</div>
          <div className="device__facts">
            <div>
              <span className="device__factKey">ip</span>{' '}
              <span className="device__factVal">{host ? host : '(unknown)'}</span>
            </div>
          </div>
        </div>

        <div className="device__rowActions">
          {!ready ? (
            <Button
              tone="primary"
              onPress={() =>
                app.send({
                  type: 'DEVICES.RESOLVE_HOST',
                  uuid,
                  mac: macForResolve,
                  title,
                })
              }
              isDisabled={disableResolve}
            >
              Find IP
            </Button>
          ) : togglable ? (
            <>
              <Switch
                isSelected={lanOn === true}
                onChange={(next) => {
                  void props.onToggleLan(uuid, host, next ? 1 : 0)
                }}
                isDisabled={toggleDisabled}
                label="Power"
                description={undefined}
              />
              <Button
                tone="quiet"
                className="is-iconOnly"
                aria-label="Refresh device state"
                onPress={() => void props.onRefreshLanState(uuid)}
                isDisabled={toggleDisabled}
                icon={<RefreshIcon className={props.isRefreshingLanState ? 'iconSpin' : undefined} />}
              />
            </>
          ) : (
            <>
              <Button
                tone="ghost"
                onPress={() => void props.onToggleLan(uuid, host, 1)}
                isDisabled={toggleDisabled}
                isPending={props.isToggling}
              >
                On
              </Button>
              <Button
                tone="danger"
                onPress={() => void props.onToggleLan(uuid, host, 0)}
                isDisabled={toggleDisabled}
                isPending={props.isToggling}
              >
                Off
              </Button>
            </>
          )}
        </div>
      </header>

      <details
        className="details details--device"
        onToggle={(e) => {
          const el = e.currentTarget as HTMLDetailsElement
          if (!el.open) return
          if (!ready) return
          void props.onRefreshLanState(uuid)
        }}
      >
        <summary className="details__summary">Details</summary>
        <div className="details__body">
          <div className="device__facts device__facts--open">
            <div>
              <span className="device__factKey">uuid</span> <span className="device__factVal">{uuid}</span>
            </div>
            {mac ? (
              <div>
                <span className="device__factKey">mac</span> <span className="device__factVal">{mac}</span>
              </div>
            ) : null}
            {hostUpdatedAt ? (
              <div>
                <span className="device__factKey">ip seen</span>{' '}
                <span className="device__factVal">{hostUpdatedAt}</span>
              </div>
            ) : null}
          </div>

          {ready ? (
            <div className="device__open">
              <div className="device__power">
                <div className={`chip chip--${lanChipTone}`}>{lanDesc}</div>
              </div>

              <div className="device__actions">
                <Button
                  tone="ghost"
                  onPress={() => app.send({ type: 'DEVICES.SYSTEM_SNAPSHOT', uuid })}
                  isDisabled={busy.diagnosticsUuid !== null || !host}
                  isPending={busy.diagnosticsUuid === uuid}
                >
                  Fetch diagnostics
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </details>
    </article>
  )
}

function Toast() {
  const toast = useAppSelector((s) => s.context.toast)
  if (!toast) return null

  return (
    <div className="toastRegion" role="status" aria-live="polite">
      <div className={`toast toast--${toast.kind}`}>
        <div className="toast__row">
          <div className="toast__badge">{toast.kind === 'ok' ? 'OK' : 'ERROR'}</div>
          <div className="toast__brand">merossity</div>
        </div>
        <div className="toast__title">{toast.title}</div>
        {toast.detail ? <div className="toast__detail">{toast.detail}</div> : null}
      </div>
    </div>
  )
}

export default App
