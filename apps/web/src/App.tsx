import { useMemo, useEffect, useRef } from 'react'
import { groupDevicesForControl } from '@merossity/core/meross/inventory'
import { Heading } from 'react-aria-components'
import './index.css'
import { AppProvider, useAppActorRef, useAppSelector } from './state/appActor'
import { AuthProvider, useAuthActorRef, useAuthSelector } from './state/authActor'
import { DevicesProvider, useDevicesActorRef, useDevicesSelector } from './state/devicesActor'
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

const getInitialCidr = (): string => {
  try {
    if (typeof localStorage === 'undefined') return ''
    return localStorage.getItem('merossity.cidr') ?? ''
  } catch {
    return ''
  }
}

export function App() {
  return (
    <AppProvider>
      <AppView />
    </AppProvider>
  )
}

function AppView() {
  const isBooting = useAppSelector((s) => s.matches('booting'))
  const isInActive = useAppSelector((s) => s.matches('active'))
  const isAuthView = useAppSelector((s) => s.matches({ active: 'auth' }))
  const isDevicesView = useAppSelector((s) => s.matches({ active: 'devices' }))

  if (isBooting) return <BootView />
  return (
    <div className="lab-bg min-h-screen">
      {isInActive ? (
        isAuthView ? (
          <AuthProvider>
            <KeyGateView />
          </AuthProvider>
        ) : isDevicesView ? (
          <DevicesWrapper />
        ) : null
      ) : null}
    </div>
  )
}

function DevicesWrapper() {
  const cloud = useAppSelector((s) => s.context.cloud)
  const initialCidr = getInitialCidr()

  if (!cloud) return null
  return (
    <DevicesProvider cloud={cloud} initialCidr={initialCidr}>
      <InventoryViewInternal />
    </DevicesProvider>
  )
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
  const auth = useAuthActorRef()
  const useEnv = useAuthSelector((s) => s.context.useEnv)
  const email = useAuthSelector((s) => s.context.email)
  const password = useAuthSelector((s) => s.context.password)
  const totp = useAuthSelector((s) => s.context.totp)
  const status = useAuthSelector((s) => s.context.status)
  const isSubmitting = useAuthSelector((s) => s.matches('submitting'))

  const envReady = Boolean(status?.env.hasEmail && status?.env.hasPassword)
  const canSubmit = useMemo(() => {
    if (!isTotpValid(totp)) return false
    if (useEnv) return envReady
    return Boolean(email.trim() && password)
  }, [email, password, totp, useEnv, envReady])

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
                label={useEnv ? 'Email (disabled: using server env)' : 'Email'}
                value={email}
                onChange={(email) => auth.send({ type: 'SET_EMAIL', email })}
                placeholder="name@example.com"
                isDisabled={isSubmitting || useEnv}
                inputProps={INPUT_COMMON}
              />

              <TextField
                label={useEnv ? 'Password (disabled: using server env)' : 'Password'}
                value={password}
                onChange={(password) => auth.send({ type: 'SET_PASSWORD', password })}
                placeholder="•••••••••"
                isDisabled={isSubmitting || useEnv}
                inputProps={INPUT_PASSWORD}
              />

              <TextField
                label="TOTP (6 digits)"
                value={totp}
                onChange={(totp) => auth.send({ type: 'SET_TOTP', totp })}
                placeholder="123456"
                hint="Required."
                isDisabled={isSubmitting}
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
                      isSelected={useEnv}
                      onChange={(useEnv) => auth.send({ type: 'SET_USE_ENV', useEnv })}
                      isDisabled={isSubmitting}
                      label="Use server env"
                      description={useEnv ? 'Email/password disabled' : 'Manual entry'}
                    />
                  </div>
                </div>
              </div>
            </details>

            <div className="actionRow mt-5">
              <Button
                tone="primary"
                onPress={() => {
                  auth.send({ type: 'SUBMIT' })
                  const sub = auth.getSnapshot()
                  if (sub?.matches('success')) {
                    const cloud = sub.context.cloud
                    if (cloud) {
                      app.send({ type: 'auth_loginSuccess', cloud })
                    }
                  }
                }}
                isDisabled={isSubmitting || !canSubmit}
                isPending={isSubmitting}
              >
                Fetch key
              </Button>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

function InventoryViewInternal() {
  const cloud = useAppSelector((s) => s.context.cloud)
  const devices = useDevicesSelector((s) => s.context.devices)
  const hosts = useDevicesSelector((s) => s.context.hosts)
  const deviceStates = useDevicesSelector((s) => s.context.deviceStates)
  const cidr = useDevicesSelector((s) => s.context.cidr)
  const isScanning = useDevicesSelector(
    (s) => s.matches({ inventory: 'discoveringHosts' }) || s.matches({ inventory: 'suggestingCidr' }),
  )
  const isRefreshing = useDevicesSelector((s) => s.matches({ inventory: 'refreshingCloud' }))
  const streamConnecting = useDevicesSelector((s) => s.matches({ monitor: 'connecting' }))
  const streamLive = useDevicesSelector((s) => s.matches({ monitor: 'live' }))
  const systemDump = useDevicesSelector((s) => s.context.systemDump)
  const devicesActor = useDevicesActorRef()
  const didAutoLoadRef = useRef(false)
  const shouldScanAfterRefreshRef = useRef(false)
  const sawRefreshStartRef = useRef(false)

  const reloadBusy = Boolean(isRefreshing || isScanning)
  const streamTone = streamLive ? 'ok' : streamConnecting ? 'muted' : 'err'
  const streamLabel = streamLive ? 'live' : streamConnecting ? 'connecting' : 'degraded'

  const groups = useMemo(() => groupDevicesForControl(devices, hosts), [devices, hosts])

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      // Toast shown by machine
    } catch {
      // Toast shown by machine
    }
  }

  const cloudHint = cloud ? `${cloud.userEmail} · ${cloud.domain}` : ''

  const startReload = () => {
    shouldScanAfterRefreshRef.current = true
    devicesActor.send({ type: 'REFRESH' })
  }

  useEffect(() => {
    if (didAutoLoadRef.current) return
    didAutoLoadRef.current = true
    shouldScanAfterRefreshRef.current = true
    devicesActor.send({ type: 'REFRESH' })
  }, [devicesActor])

  useEffect(() => {
    if (isRefreshing) {
      sawRefreshStartRef.current = true
      return
    }
    if (!shouldScanAfterRefreshRef.current) return
    if (!sawRefreshStartRef.current) return
    sawRefreshStartRef.current = false
    shouldScanAfterRefreshRef.current = false
    devicesActor.send({ type: 'SCAN' })
  }, [isRefreshing, devicesActor])

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
              <div className={`chip chip--${streamTone}`}>stream: {streamLabel}</div>
              <Button
                tone="quiet"
                className={`is-iconOnly reloadButton${reloadBusy ? 'is-busy' : ''}`}
                aria-label="Reload devices (refresh + scan LAN)"
                onPress={startReload}
                isDisabled={reloadBusy}
                icon={<RefreshIcon className={reloadBusy ? 'iconSpin' : undefined} />}
              />
            </div>
          </header>

          <div className="panel__body">
            {isScanning ? (
              <div className="callout mt-4">
                <div>
                  <div className="callout__title">Scanning LAN</div>
                  <div className="callout__copy">
                    Looking up IPs. Devices with a known IP remain controllable while scan runs.
                  </div>
                </div>
              </div>
            ) : null}

            <div className="subpanel mt-4">
              <TextField
                label="CIDR (optional)"
                value={cidr}
                onChange={(cidr) => devicesActor.send({ type: 'SET_CIDR', cidr })}
                placeholder="auto (recommended)"
                hint="Leave blank to auto-suggest; set a CIDR to speed up scanning."
                isDisabled={isScanning}
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
                  deviceStates={deviceStates}
                  uuids={new Set(groups.ready.map((d: any) => d.uuid))}
                  emptyTitle="No devices ready yet."
                  emptyCopy="Discovered, controllable devices will appear here."
                />
                <DeviceGroup
                  title="Inaccessible"
                  count={groups.inaccessible.length}
                  devices={devices}
                  hosts={hosts}
                  deviceStates={deviceStates}
                  uuids={new Set(groups.inaccessible.map((d: any) => d.uuid))}
                  emptyTitle="No inaccessible devices."
                  emptyCopy="If all devices are reachable, this section stays empty."
                />
              </div>
            )}
          </div>

          <Modal
            isDismissable
            isOpen={Boolean(systemDump)}
            onOpenChange={(open) => {
              if (!open) devicesActor.send({ type: 'CLOSE_SYSTEM_DUMP' })
            }}
          >
            {systemDump ? (
              <div className="dump">
                <Heading slot="title" className="dump__title">
                  Diagnostics: Appliance.System.All
                </Heading>
                <div className="dump__meta">
                  <div className="dump__uuid">{clampText(systemDump.uuid, 22)}</div>
                  <div className="dump__host">{systemDump.host}</div>
                </div>
                <pre className="dump__pre">{JSON.stringify(systemDump.data, null, 2)}</pre>
                <div className="dump__actions">
                  <Button tone="ghost" slot="close" onPress={() => devicesActor.send({ type: 'CLOSE_SYSTEM_DUMP' })}>
                    Close
                  </Button>
                </div>
              </div>
            ) : null}
          </Modal>
        </section>
      </main>
    </div>
  )
}

function DeviceGroup(props: {
  title: string
  count: number
  devices: any[]
  hosts: Record<string, any>
  deviceStates: Record<string, DeviceState>
  uuids: Set<string>
  emptyTitle: string
  emptyCopy: string
}) {
  const { title, count, devices, hosts, deviceStates, uuids, emptyTitle, emptyCopy } = props
  const filtered = devices
    .filter((d) => uuids.has(String(d.uuid ?? '')))
    .toSorted((a, b) => {
      const aName = String(a.devName ?? '')
        .trim()
        .toLowerCase()
      const bName = String(b.devName ?? '')
        .trim()
        .toLowerCase()
      if (aName !== bName) return aName.localeCompare(bName)
      return String(a.uuid ?? '').localeCompare(String(b.uuid ?? ''))
    })

  return (
    <section className="deviceGroup">
      <header className="deviceGroup__head">
        <div className="deviceGroup__title">{title}</div>
        <div className="chip chip--muted">{count}</div>
      </header>
      <div className="deviceList">
        {filtered.length === 0 ? (
          <div className="emptyState">
            <div className="emptyState__title">{emptyTitle}</div>
            <div className="emptyState__copy">{emptyCopy}</div>
          </div>
        ) : (
          filtered.map((d) => {
            const uuid = String(d.uuid ?? '')
            return (
              <DeviceRow key={uuid} device={d} hostEntry={hosts[uuid] as HostEntry} deviceState={deviceStates[uuid]} />
            )
          })
        )}
      </div>
    </section>
  )
}

function DeviceRow(props: { device: any; hostEntry: HostEntry; deviceState: DeviceState | undefined }) {
  const devices = useDevicesActorRef()
  const uuid = String(props.device?.uuid ?? '')
  const isToggling = useDevicesSelector(
    (s) => s.matches({ operations: 'toggling' }) && s.context.activeDeviceUuid === uuid,
  )
  const isFetchingDiagnostics = useDevicesSelector(
    (s) => s.matches({ operations: 'fetchingDiagnostics' }) && s.context.activeDeviceUuid === uuid,
  )

  const d = props.device

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

  const ready = Boolean(host)

  const l = props.deviceState
  const ch0 = l?.channels?.find((c) => c.channel === 0) ?? (l ? { channel: 0, onoff: l.onoff } : null)
  const lanOn = ch0 ? ch0.onoff === 1 : null
  const powerClass = lanOn === null ? '' : lanOn ? 'device--power-on' : 'device--power-off'
  const lanChipTone = l?.stale ? 'err' : lanOn === null ? 'muted' : lanOn ? 'ok' : 'muted'

  const togglable = ready && prefersToggleFor(d)
  const toggleDisabled = !ready || isToggling

  const lanDesc = !ready
    ? 'ip unavailable'
    : l
      ? `${l.stale ? 'stale' : 'state'} @ ${new Date(l.updatedAt).toLocaleTimeString()}${l.source ? ` · ${l.source}` : ''}`
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
            <div className="chip chip--muted">IP unavailable</div>
          ) : togglable ? (
            <>
              <Switch
                isSelected={lanOn === true}
                onChange={(next) => {
                  devices.send({ type: 'device_TOGGLE', uuid, onoff: next ? 1 : 0 })
                }}
                isDisabled={toggleDisabled}
                label="Power"
                description={undefined}
              />
              <Button
                tone="quiet"
                className="is-iconOnly"
                aria-label="Refresh device state"
                onPress={() => devices.send({ type: 'monitor_REQUEST_REFRESH', uuid })}
                isDisabled={toggleDisabled}
                icon={<RefreshIcon />}
              />
            </>
          ) : (
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
          )}
        </div>
      </header>

      <details
        className="details details--device"
        onToggle={(e) => {
          const el = e.currentTarget as HTMLDetailsElement
          if (!el.open) return
          if (!ready) return
          devices.send({ type: 'monitor_REQUEST_REFRESH', uuid })
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
      </details>
    </article>
  )
}

export default App
