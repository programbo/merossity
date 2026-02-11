import { useMemo } from 'react'
import { Heading } from 'react-aria-components'
import { groupDevicesForControl } from '@merossity/core/meross/inventory'
import './index.css'
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
                    <div className="callout__copy">
                      Email/password: {envReady ? 'present' : 'missing'}.
                    </div>
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

  const groups = useMemo(() => groupDevicesForControl(devices, hosts as any), [devices, hosts])

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
              <div className="panel__kicker">inventory</div>
              <h2 className="panel__title">Devices</h2>
            </div>
          </header>

          <div className="panel__body">
            <div className="actionRow">
              <Button
                tone="primary"
                onPress={() => app.send({ type: 'DEVICES.REFRESH_FROM_CLOUD' })}
                isDisabled={busy.refreshDevices}
                isPending={busy.refreshDevices}
              >
                Refresh devices
              </Button>
              <Button
                tone="ghost"
                onPress={() => app.send({ type: 'DEVICES.DISCOVER_HOSTS' })}
                isDisabled={busy.scanLan || busy.suggestCidr}
                isPending={busy.scanLan || busy.suggestCidr}
              >
                Scan LAN (find IPs)
              </Button>
            </div>

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
                <div className="emptyState__copy">Refresh devices to pull inventory from cloud.</div>
              </div>
            ) : (
              <div className="deviceGroups mt-5">
                <DeviceGroup
                  title="Ready to control"
                  count={groups.ready.length}
                  devices={devices}
                  hosts={hosts}
                  uuids={new Set(groups.ready.map((d) => d.uuid))}
                />
                <DeviceGroup
                  title="Inaccessible"
                  count={groups.inaccessible.length}
                  devices={devices}
                  hosts={hosts}
                  uuids={new Set(groups.inaccessible.map((d) => d.uuid))}
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
}) {
  const { title, count, devices, hosts, uuids } = props
  const filtered = devices.filter((d) => uuids.has(String(d.uuid ?? '')))

  return (
    <section className="deviceGroup">
      <header className="deviceGroup__head">
        <div className="deviceGroup__title">{title}</div>
        <div className="chip chip--muted">{count}</div>
      </header>
      <div className="deviceList">
        {filtered.map((d) => (
          <DeviceRow key={String(d.uuid)} device={d} hostEntry={hosts[String(d.uuid)]} />
        ))}
      </div>
    </section>
  )
}

function DeviceRow(props: { device: any; hostEntry: { host?: string; mac?: string; updatedAt?: string } | undefined }) {
  const app = useAppActorRef()
  const busy = useAppSelector((s) => s.context.busy)

  const d = props.device
  const uuid = String(d.uuid ?? '')

  const host = props.hostEntry?.host ? String(props.hostEntry.host) : ''
  const hostUpdatedAt = props.hostEntry?.updatedAt ? String(props.hostEntry.updatedAt) : ''

  const online = String(d.onlineStatus ?? '').toLowerCase()
  const onlineTone =
    online.includes('online') || online === '1'
      ? 'ok'
      : online.includes('offline') || online === '0'
        ? 'err'
        : 'muted'

  const title = String(d.devName ?? '') || uuid
  const subtitle = [d.deviceType, d.subType].filter(Boolean).join(' / ')

  const macCloud = (d.macAddress as string | undefined) ?? (d.mac as string | undefined) ?? ''
  const macLan = props.hostEntry?.mac ? String(props.hostEntry.mac) : ''
  const mac = macCloud || macLan
  const macForResolve = macCloud || macLan || ''

  const ready = Boolean(host)
  const disableToggle = busy.toggleUuid !== null
  const disableResolve = busy.resolveUuid !== null

  return (
    <article className="device">
      <header className="device__head">
        <div className="device__id">
          <div className="device__titleRow">
            <div className="device__title">{title}</div>
            <div className={`chip chip--${onlineTone}`}>{online || 'unknown'}</div>
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
          ) : (
            <>
              <Button
                tone="ghost"
                onPress={() => app.send({ type: 'DEVICES.TOGGLE', uuid, onoff: 1 })}
                isDisabled={disableToggle}
                isPending={busy.toggleUuid === uuid}
              >
                On
              </Button>
              <Button
                tone="danger"
                onPress={() => app.send({ type: 'DEVICES.TOGGLE', uuid, onoff: 0 })}
                isDisabled={disableToggle}
                isPending={busy.toggleUuid === uuid}
              >
                Off
              </Button>
            </>
          )}
        </div>
      </header>

      <details className="details details--device">
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
                <span className="device__factKey">ip seen</span> <span className="device__factVal">{hostUpdatedAt}</span>
              </div>
            ) : null}
          </div>

          {ready ? (
            <div className="actionRow mt-3">
              <Button
                tone="ghost"
                onPress={() => app.send({ type: 'DEVICES.SYSTEM_SNAPSHOT', uuid })}
                isDisabled={busy.diagnosticsUuid !== null || !host}
                isPending={busy.diagnosticsUuid === uuid}
              >
                Fetch diagnostics
              </Button>
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
