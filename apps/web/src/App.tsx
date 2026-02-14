import { useMemo, useEffect, useRef } from 'react'
import { groupDevicesForControl } from '@merossity/core/meross/inventory'
import { Heading } from 'react-aria-components'
import './index.css'
import { AppProvider, useAppActorRef, useAppSelector } from './state/appActor'
import { AuthProvider, useAuthActorRef, useAuthSelector } from './state/authActor'
import type { LoginRegion } from './state/authMachine'
import { DevicesProvider, useDevicesActorRef, useDevicesSelector } from './state/devicesActor'
import { Button } from './ui/rac/Button'
import { Modal } from './ui/rac/Modal'
import { Switch } from './ui/rac/Switch'
import { TextField } from './ui/rac/TextField'

const clampText = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n)}…`)

const INPUT_COMMON = { autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false } as const
const INPUT_EMAIL = { ...INPUT_COMMON, type: 'email' as const, autoComplete: 'email' } as const
const INPUT_PASSWORD = { ...INPUT_COMMON, type: 'password' as const } as const
const INPUT_NUMERIC = { ...INPUT_COMMON, inputMode: 'numeric' as const } as const

const isTotpValid = (s: string) => /^[0-9]{6}$/.test(String(s ?? '').trim())
const LOGIN_REGION_STORAGE_KEY = 'merossity.loginRegion'

const isLoginRegion = (v: string): v is LoginRegion => v === 'auto' || v === 'global' || v === 'us' || v === 'eu' || v === 'ap'

const getLikelyLoginRegion = (): { region: Exclude<LoginRegion, 'auto'>; reason: string } => {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''
  const languages = [...(navigator.languages ?? []), navigator.language].filter(Boolean).join(', ')

  if (timezone.startsWith('America/')) {
    return { region: 'us', reason: `timezone: ${timezone}` }
  }

  if (timezone.startsWith('Europe/')) {
    return { region: 'eu', reason: `timezone: ${timezone}` }
  }

  if (timezone.startsWith('Asia/') || timezone.startsWith('Australia/') || timezone.startsWith('Pacific/')) {
    return { region: 'ap', reason: `timezone: ${timezone}` }
  }

  const usLocale = /-(US|CA|MX)\b/i.test(languages)
  if (usLocale) {
    return { region: 'us', reason: `language: ${languages}` }
  }

  const euLocale = /-(GB|IE|FR|DE|ES|IT|NL|BE|SE|NO|DK|FI|PL|PT|AT|CH)\b/i.test(languages)
  if (euLocale) {
    return { region: 'eu', reason: `language: ${languages}` }
  }

  const apLocale = /-(AU|NZ|JP|KR|SG|HK|TW)\b/i.test(languages)
  if (apLocale) {
    return { region: 'ap', reason: `language: ${languages}` }
  }

  return { region: 'global', reason: timezone ? `timezone: ${timezone}` : 'default' }
}

const getStoredLoginRegion = (): LoginRegion | null => {
  try {
    if (typeof localStorage === 'undefined') return null
    const raw = localStorage.getItem(LOGIN_REGION_STORAGE_KEY) ?? ''
    return isLoginRegion(raw) ? raw : null
  } catch {
    return null
  }
}

const persistLoginRegion = (region: LoginRegion): void => {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(LOGIN_REGION_STORAGE_KEY, region)
  } catch {
    // ignore
  }
}

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
  // CIDR selection is intentionally not exposed in the main UI (auto-suggest only).
  return ''
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
  const email = useAuthSelector((s) => s.context.email)
  const password = useAuthSelector((s) => s.context.password)
  const totp = useAuthSelector((s) => s.context.totp)
  const region = useAuthSelector((s) => s.context.region)
  const cloud = useAuthSelector((s) => s.context.cloud)
  const error = useAuthSelector((s) => s.context.error)
  const isSubmitting = useAuthSelector((s) => s.matches('submitting'))
  const isSuccess = useAuthSelector((s) => s.matches('success'))
  const didInitRegionRef = useRef(false)

  const likelyRegion = useMemo(() => getLikelyLoginRegion(), [])
  const regionHint =
    region === 'auto'
      ? `Auto tries multiple regions on failure. Likely: ${likelyRegion.region}.`
      : `Likely: ${likelyRegion.region}.`

  const canSubmit = useMemo(() => {
    if (!isTotpValid(totp)) return false
    return Boolean(email.trim() && password)
  }, [email, password, totp])

  useEffect(() => {
    if (!isSuccess || !cloud) return
    app.send({ type: 'auth_loginSuccess', cloud })
  }, [app, cloud, isSuccess])

  useEffect(() => {
    if (didInitRegionRef.current) return
    didInitRegionRef.current = true
    const saved = getStoredLoginRegion()
    if (saved) {
      auth.send({ type: 'SET_REGION', region: saved })
      return
    }
    auth.send({ type: 'SET_REGION', region: getLikelyLoginRegion().region })
  }, [auth])

  return (
    <div className="app-shell">
      <header className="app-header app-header--simple">
        <div className="brand">
          <div className="brand__title">Meross Account Login</div>
        </div>
      </header>

      <main className="app-main">
        <section className="panel">
          <header className="panel__head">
            <div>
              <h2 className="panel__title">Sign In to Continue</h2>
            </div>
          </header>

          <form
            className="panel__body"
            onSubmit={(e) => {
              e.preventDefault()
              persistLoginRegion(region)
              auth.send({ type: 'SUBMIT' })
            }}
          >
            <div className="grid gap-4">
              <div className="rac-field">
                <label className="rac-field__label" htmlFor="login-region">
                  Region
                </label>
                <select
                  id="login-region"
                  name="region"
                  className="rac-field__input"
                  value={region}
                  onChange={(e) => {
                    const next = e.currentTarget.value
                    if (!isLoginRegion(next)) return
                    auth.send({ type: 'SET_REGION', region: next })
                  }}
                  disabled={isSubmitting}
                  required
                >
                  <option value="auto">Auto (Recommended)</option>
                  <option value="global">Global (iotx.meross.com)</option>
                  <option value="us">United States (iotx-us.meross.com)</option>
                  <option value="eu">Europe (iotx-eu.meross.com)</option>
                  <option value="ap">Asia-Pacific (iotx-ap.meross.com)</option>
                </select>
                <div className="rac-field__hint">{regionHint}</div>
                <div className="rac-field__hint">Heuristic basis: {likelyRegion.reason}.</div>
              </div>

              <TextField
                label="Email"
                value={email}
                onChange={(email) => auth.send({ type: 'SET_EMAIL', email })}
                placeholder="name@example.com…"
                isDisabled={isSubmitting}
                inputProps={{ ...INPUT_EMAIL, name: 'email', required: true }}
              />

              <TextField
                label="Password"
                value={password}
                onChange={(password) => auth.send({ type: 'SET_PASSWORD', password })}
                placeholder="Enter your password…"
                isDisabled={isSubmitting}
                inputProps={{ ...INPUT_PASSWORD, name: 'password', autoComplete: 'current-password', required: true }}
              />

              <TextField
                label="TOTP (6 digits)"
                value={totp}
                onChange={(totp) => auth.send({ type: 'SET_TOTP', totp: totp.replace(/[^0-9]/g, '').slice(0, 6) })}
                placeholder="123456…"
                isDisabled={isSubmitting}
                inputProps={{
                  ...INPUT_NUMERIC,
                  name: 'mfaCode',
                  autoComplete: 'one-time-code',
                  maxLength: 6,
                  pattern: '[0-9]{6}',
                  required: true,
                }}
              />
            </div>

            {error ? (
              <div className="panel__note panel__note--error" role="status" aria-live="polite">
                {error}
              </div>
            ) : null}

            <div className="actionRow mt-5">
              <Button tone="primary" type="submit" isDisabled={isSubmitting || !canSubmit} isPending={isSubmitting}>
                Fetch Key & Device List
              </Button>
            </div>
          </form>
        </section>
      </main>
    </div>
  )
}

function InventoryViewInternal() {
  const devices = useDevicesSelector((s) => s.context.devices)
  const hosts = useDevicesSelector((s) => s.context.hosts)
  const deviceStates = useDevicesSelector((s) => s.context.deviceStates)
  const isScanning = useDevicesSelector(
    (s) => s.matches({ inventory: 'discoveringHosts' }) || s.matches({ inventory: 'suggestingCidr' }),
  )
  const isRefreshing = useDevicesSelector((s) => s.matches({ inventory: 'refreshingCloud' }))
  const streamDegraded = useDevicesSelector((s) => s.matches({ monitor: 'degraded' }))
  const systemDump = useDevicesSelector((s) => s.context.systemDump)
  const devicesActor = useDevicesActorRef()
  const didAutoLoadRef = useRef(false)
  const shouldScanAfterRefreshRef = useRef(false)
  const sawRefreshStartRef = useRef(false)

  const reloadBusy = Boolean(isRefreshing || isScanning)
  const reloadWorkingLabel = isRefreshing ? 'Syncing devices' : isScanning ? 'Scanning LAN' : ''

  const groups = useMemo(() => groupDevicesForControl(devices, hosts), [devices, hosts])

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
        </div>
      </header>

      <main className="app-main">
        <section className="panel">
          <header className="panel__head">
            <div>
              <h2 className="panel__title">Devices</h2>
            </div>
            <div className="panel__headActions">
              {streamDegraded ? <div className="chip chip--err">Live updates degraded</div> : null}
              {reloadBusy ? <div className="reloadWorkingLabel">{reloadWorkingLabel}</div> : null}
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

            {devices.length === 0 ? (
              <div className="emptyState mt-4">
                <div className="emptyState__title">No devices yet.</div>
                <div className="emptyState__copy">Reload to pull devices from cloud and scan your LAN for IPs.</div>
              </div>
            ) : (
              <div className="deviceGroups mt-5">
                <DeviceGroup
                  title="Ready to control"
                  devices={devices}
                  hosts={hosts}
                  deviceStates={deviceStates}
                  uuids={new Set(groups.ready.map((d: any) => d.uuid))}
                  emptyTitle="No devices ready yet."
                  emptyCopy="Discovered, controllable devices will appear here."
                />
                <DeviceGroup
                  title="Inaccessible"
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
  devices: any[]
  hosts: Record<string, any>
  deviceStates: Record<string, DeviceState>
  uuids: Set<string>
  emptyTitle: string
  emptyCopy: string
}) {
  const { title, devices, hosts, deviceStates, uuids, emptyTitle, emptyCopy } = props
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

  const baseClass = `device${ready ? '' : ' device--inaccessible'}`
  return (
    <article className={powerClass ? `${baseClass} ${powerClass}` : baseClass}>
      <header className="device__head">
        <div className="device__id">
          <div className="device__titleRow">
            <div className="device__title">{title}</div>
          </div>
          <div className="device__subtitle">{subtitle || 'device'}</div>
        </div>

        <div className="device__rowActions">
          {ready && togglable ? (
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
            </>
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
              <span className="device__factKey">ip</span> <span className="device__factVal">{host || '(unknown)'}</span>
            </div>
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
      </details>
    </article>
  )
}

export default App
