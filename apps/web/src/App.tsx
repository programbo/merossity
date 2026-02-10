import { useEffect, useMemo } from 'react'
import { Heading } from 'react-aria-components'
import './index.css'
import type { Tab as AppTab } from './lib/nav'
import { getHashTab } from './lib/nav'
import { AppProvider, useAppActorRef, useAppSelector } from './state/appActor'
import { Button } from './ui/rac/Button'
import { Modal } from './ui/rac/Modal'
import { Switch } from './ui/rac/Switch'
import { TextField } from './ui/rac/TextField'
import { Tab, TabList, TabPanel, TabPanels, Tabs } from './ui/rac/Tabs'

const clampText = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n)}…`)

const INPUT_COMMON = { autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false } as const
const INPUT_PASSWORD = { ...INPUT_COMMON, type: 'password' as const } as const
const INPUT_NUMERIC = { ...INPUT_COMMON, inputMode: 'numeric' as const } as const

export function App() {
  return (
    <AppProvider>
      <AppView />
    </AppProvider>
  )
}

function AppView() {
  const app = useAppActorRef()
  const tab = useAppSelector((s) => s.context.tab)
  const status = useAppSelector((s) => s.context.status)
  const cloud = useAppSelector((s) => s.context.cloud)
  const busy = useAppSelector((s) => s.context.busy)
  const toast = useAppSelector((s) => s.context.toast)

  useEffect(() => {
    const onHash = () => app.send({ type: 'HASH_CHANGED', tab: getHashTab() })
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [app])

  const appTitle = useMemo(() => {
    const c = cloud?.userEmail ? cloud.userEmail : 'local control'
    return `Merossity · ${c}`
  }, [cloud?.userEmail])

  useEffect(() => {
    document.title = appTitle
  }, [appTitle])

  const envLabel = status ? (status.env.hasEmail && status.env.hasPassword ? 'ready' : 'partial') : '…'
  const envTone = status ? (status.env.hasEmail && status.env.hasPassword ? 'ok' : 'warn') : 'muted'

  const cloudLabel = cloud ? 'linked' : 'offline'
  const cloudTone = cloud ? 'ok' : 'muted'

  return (
    <div className="lab-bg min-h-screen">
      <div className="app-shell">
        <header className="app-header">
          <div className="brand">
            <div className="brand__kicker">switchboard</div>
            <div className="brand__title">Merossity</div>
            <div className="brand__tag">Cloud key, device inventory, LAN toggles. No dashboards. Just switches.</div>
          </div>

          <div className="status-strip" aria-label="Status">
            <div className={`chip chip--${envTone}`}>env: {envLabel}</div>
            <div className={`chip chip--${cloudTone}`}>cloud: {cloudLabel}</div>
          </div>

          <div className="app-actions">
            <Button tone="quiet" onPress={() => app.send({ type: 'REFRESH_ALL' })} isDisabled={busy !== null}>
              Sync
            </Button>
            <Button
              tone="primary"
              onPress={() => app.send({ type: 'NAVIGATE', tab: cloud ? 'devices' : 'connect' })}
              isDisabled={busy !== null}
            >
              {cloud ? 'Devices' : 'Link Cloud'}
            </Button>
            <Button tone="ghost" onPress={() => app.send({ type: 'NAVIGATE', tab: 'settings' })} isDisabled={busy !== null}>
              Config
            </Button>
          </div>
        </header>

        <main className="app-main">
          <Tabs
            selectedKey={tab}
            onSelectionChange={(key) => app.send({ type: 'NAVIGATE', tab: key as AppTab })}
          >
            <TabPanels>
              <TabPanel id="connect">
                <ConnectCard />
              </TabPanel>
              <TabPanel id="devices">
                <DevicesCard />
              </TabPanel>
              <TabPanel id="settings">
                <SettingsCard />
              </TabPanel>
            </TabPanels>

            <div className="dock">
              <TabList aria-label="Panels">
                <Tab id="connect">Connect</Tab>
                <Tab id="devices">Devices</Tab>
                <Tab id="settings">Settings</Tab>
              </TabList>
            </div>
          </Tabs>
        </main>
      </div>

      {toast ? (
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
      ) : null}
    </div>
  )
}

const ConnectCard = () => {
  const app = useAppActorRef()
  const status = useAppSelector((s) => s.context.status)
  const busy = useAppSelector((s) => s.context.busy)
  const connect = useAppSelector((s) => s.context.connect)

  const envReady = Boolean(status?.env.hasEmail && status?.env.hasPassword)

  return (
    <section className="panel">
      <header className="panel__head">
        <div>
          <div className="panel__kicker">step 1</div>
          <h2 className="panel__title">Connect Cloud</h2>
        </div>
        <div className={`chip chip--${envReady ? 'ok' : 'warn'}`}>{envReady ? 'env ready' : 'env missing'}</div>
      </header>

      <div className="panel__body">
        <div className="callout">
          <div className="callout__title">Credential source</div>
          <div className="callout__copy">
            Default is server-side `.env` (repo root). Override here if you want, or flip to manual entry.
          </div>
          <div className="callout__right">
            <Switch
              isSelected={connect.useEnv}
              onChange={(useEnv) => app.send({ type: 'CONNECT.SET_USE_ENV', useEnv })}
              isDisabled={busy !== null}
              label="Use env defaults"
              description={connect.useEnv ? 'Override allowed' : 'Manual mode'}
            />
          </div>
        </div>

        <div className="grid gap-4">
          <TextField
            label={connect.useEnv ? 'Email (optional override)' : 'Email'}
            value={connect.email}
            onChange={(email) => app.send({ type: 'CONNECT.SET_EMAIL', email })}
            placeholder={connect.useEnv ? 'leave blank to use .env' : 'name@example.com'}
            isDisabled={busy !== null}
            inputProps={INPUT_COMMON}
          />

          <TextField
            label={connect.useEnv ? 'Password (optional override)' : 'Password'}
            value={connect.password}
            onChange={(password) => app.send({ type: 'CONNECT.SET_PASSWORD', password })}
            placeholder={connect.useEnv ? 'leave blank to use .env' : '••••••••'}
            isDisabled={busy !== null}
            inputProps={INPUT_PASSWORD}
          />

          {connect.mfaRequired ? (
            <TextField
              label="Verification code (TOTP)"
              value={connect.mfaCode}
              onChange={(mfaCode) => app.send({ type: 'CONNECT.SET_MFA_CODE', mfaCode })}
              placeholder="123456"
              hint="Meross cloud sometimes requires an app-based verification code."
              isDisabled={busy !== null}
              inputProps={INPUT_NUMERIC}
            />
          ) : null}
        </div>

        <div className="actionRow">
          <Button tone="primary" onPress={() => app.send({ type: 'CONNECT.SUBMIT' })} isDisabled={busy !== null} isPending={busy === 'login'}>
            Link cloud
          </Button>
          <Button tone="ghost" onPress={() => app.send({ type: 'CONNECT.RESET_MFA' })} isDisabled={busy !== null}>
            Reset prompt
          </Button>
        </div>

        <div className="panel__note">
          Pro tip: set `MEROSS_EMAIL` and `MEROSS_PASSWORD` in the repo root `.env` to keep browser fields blank.
        </div>
      </div>
    </section>
  )
}

const DevicesCard = () => {
  const app = useAppActorRef()
  const status = useAppSelector((s) => s.context.status)
  const cloud = useAppSelector((s) => s.context.cloud)
  const devices = useAppSelector((s) => s.context.devices)
  const hosts = useAppSelector((s) => s.context.hosts)
  const busy = useAppSelector((s) => s.context.busy)
  const devicesUi = useAppSelector((s) => s.context.devicesUi)

  const cloudHint = cloud ? `${cloud.userEmail} · ${cloud.domain}` : 'Not linked'
  const canLan = Boolean(cloud || status?.env.hasKey)

  const deriveMacFromUuid = (uuid: string): string => {
    const u = String(uuid || '').trim()
    if (!/^[0-9a-f]{32}$/i.test(u)) return ''
    const suffix = u.slice(-12).toLowerCase()
    if (!/^[0-9a-f]{12}$/.test(suffix)) return ''
    return suffix.match(/.{2}/g)!.join(':')
  }

  return (
    <section className="panel">
      <header className="panel__head">
        <div>
          <div className="panel__kicker">step 2</div>
          <h2 className="panel__title">Devices</h2>
        </div>
        <div className="panel__meta">{cloudHint}</div>
      </header>

      <div className="panel__body">
        <div className="actionRow">
          <Button
            tone="primary"
            onPress={() => app.send({ type: 'DEVICES.REFRESH_FROM_CLOUD' })}
            isDisabled={busy !== null || !cloud}
            isPending={busy === 'refresh_devices'}
          >
            Refresh list
          </Button>
          <Button tone="ghost" onPress={() => app.send({ type: 'REFRESH_ALL' })} isDisabled={busy !== null}>
            Sync local
          </Button>
        </div>

        <div className="subpanel">
          <TextField
            label="LAN scan CIDR (optional)"
            value={devicesUi.cidr}
            onChange={(cidr) => app.send({ type: 'DEVICES.SET_CIDR', cidr })}
            placeholder="auto (e.g. 192.168.68.0/22)"
            hint="Optional. Leave blank to use the server's auto-detected LAN range, or enter your CIDR (e.g. 192.168.68.0/22) to speed up host discovery."
            isDisabled={busy !== null}
            inputProps={INPUT_COMMON}
          />
          <div className="actionRow mt-3">
            <Button
              tone="quiet"
              onPress={() => app.send({ type: 'DEVICES.DISCOVER_HOSTS' })}
              isDisabled={busy !== null || !canLan}
              isPending={busy === 'discover_hosts'}
            >
              Discover LAN
            </Button>
          </div>
        </div>

        {devices.length === 0 ? (
          <div className="emptyState">
            <div className="emptyState__title">No devices yet.</div>
            <div className="emptyState__copy">Link cloud, then refresh the list to populate inventory.</div>
            <div className="emptyState__actions">
              <Button tone="primary" onPress={() => app.send({ type: 'NAVIGATE', tab: 'connect' })} isDisabled={busy !== null}>
                Go to Connect
              </Button>
            </div>
          </div>
        ) : (
          <div className="deviceList">
            {devices.map((d) => {
              const host = hosts[d.uuid]?.host
              const online = String(d.onlineStatus ?? '').toLowerCase()
              const onlineTone =
                online.includes('online') || online === '1'
                  ? 'ok'
                  : online.includes('offline') || online === '0'
                    ? 'err'
                    : 'muted'

              const title = d.devName || d.uuid
              const subtitle = [d.deviceType, d.subType].filter(Boolean).join(' / ')
              const macCloud = (d.macAddress as string | undefined) ?? (d.mac as string | undefined) ?? ''
              const macLan = hosts[d.uuid]?.mac ?? ''
              const macDerived = !macCloud && !macLan ? deriveMacFromUuid(d.uuid) : ''
              const mac = macCloud || macLan || macDerived
              const macForResolve = macCloud || macLan || ''
              const expanded = devicesUi.expandedUuid === d.uuid

              return (
                <article key={d.uuid} className={expanded ? 'device device--open' : 'device'}>
                  <header className="device__head">
                    <div className="device__id">
                      <div className="device__titleRow">
                        <div className="device__title">{title}</div>
                        <div className={`chip chip--${onlineTone}`}>{online || 'unknown'}</div>
                      </div>
                      <div className="device__subtitle">{subtitle || 'device'}</div>
                      <div className="device__facts">
                        <div>
                          <span className="device__factKey">uuid</span> <span className="device__factVal">{d.uuid}</span>
                        </div>
                        {mac ? (
                          <div>
                            <span className="device__factKey">
                              {macCloud ? 'mac (cloud)' : macLan ? 'mac (lan)' : 'mac (guess)'}
                            </span>{' '}
                            <span className="device__factVal">{mac}</span>
                          </div>
                        ) : null}
                        <div>
                          <span className="device__factKey">host</span>{' '}
                          <span className="device__factVal">{host ? host : '(not resolved)'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="device__cta">
                      <Button tone="quiet" onPress={() => app.send({ type: 'DEVICES.TOGGLE_EXPANDED', uuid: d.uuid })} isDisabled={busy !== null}>
                        {expanded ? 'Collapse' : 'Open'}
                      </Button>
                    </div>
                  </header>

                  {expanded ? (
                    <div className="device__actions">
                      <Button
                        tone="primary"
                        onPress={() =>
                          app.send({
                            type: 'DEVICES.RESOLVE_HOST',
                            uuid: d.uuid,
                            // Never send derived MAC guesses to the server.
                            mac: macForResolve,
                            title: d.devName ?? d.uuid,
                          })
                        }
                        isDisabled={busy !== null}
                      >
                        Resolve host
                      </Button>
                      <Button
                        tone="ghost"
                        onPress={() => app.send({ type: 'DEVICES.SYSTEM_SNAPSHOT', uuid: d.uuid })}
                        isDisabled={busy !== null || !host}
                      >
                        System snapshot
                      </Button>
                      <Button tone="ghost" onPress={() => app.send({ type: 'DEVICES.TOGGLE', uuid: d.uuid, onoff: 1 })} isDisabled={busy !== null || !host}>
                        Toggle ON
                      </Button>
                      <Button tone="danger" onPress={() => app.send({ type: 'DEVICES.TOGGLE', uuid: d.uuid, onoff: 0 })} isDisabled={busy !== null || !host}>
                        Toggle OFF
                      </Button>
                    </div>
                  ) : null}
                </article>
              )
            })}
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
              Appliance.System.All
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
  )
}

const SettingsCard = () => {
  const app = useAppActorRef()
  const status = useAppSelector((s) => s.context.status)
  const cloud = useAppSelector((s) => s.context.cloud)

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      app.send({ type: 'TOAST.SHOW', toast: { kind: 'ok', title: 'Copied to clipboard' } })
    } catch (e) {
      app.send({
        type: 'TOAST.SHOW',
        toast: { kind: 'err', title: 'Copy failed', detail: e instanceof Error ? e.message : String(e) },
      })
    }
  }

  const cfg = status?.config

  return (
    <section className="panel">
      <header className="panel__head">
        <div>
          <div className="panel__kicker">notes</div>
          <h2 className="panel__title">Settings</h2>
        </div>
        <div className="panel__meta">paths + keys</div>
      </header>

      <div className="panel__body">
        <div className="subpanel">
          <div className="subpanel__title">Config</div>
          <div className="kv">
            <div className="kv__row">
              <div className="kv__k">path</div>
              <div className="kv__v">{cfg?.path ?? '…'}</div>
            </div>
            <div className="kv__row">
              <div className="kv__k">cloud creds</div>
              <div className="kv__v">{cfg?.hasCloudCreds ? 'yes' : 'no'}</div>
            </div>
            <div className="kv__row">
              <div className="kv__k">device list</div>
              <div className="kv__v">{cfg?.hasDevices ? 'yes' : 'no'}</div>
            </div>
            <div className="kv__row">
              <div className="kv__k">hosts</div>
              <div className="kv__v">{cfg?.hasHosts ? 'yes' : 'no'}</div>
            </div>
          </div>
        </div>

        <div className="subpanel">
          <div className="subpanel__title">Cloud key</div>
          {cloud ? (
            <div className="keyCard">
              <div className="keyCard__kicker">{cloud.userEmail}</div>
              <div className="keyCard__value">{cloud.key}</div>
              <div className="actionRow">
                <Button tone="primary" onPress={() => void copy(cloud.key)}>
                  Copy key
                </Button>
                <Button tone="ghost" onPress={() => void copy(cloud.domain)}>
                  Copy domain
                </Button>
              </div>
              <div className="keyCard__note">Token is stored server-side only. This UI shows only a redacted preview.</div>
            </div>
          ) : (
            <div className="emptyInline">No cloud creds yet. Go to Connect.</div>
          )}
        </div>

        <div className="subpanel subpanel--hint">
          Meross cloud device lists often omit MACs. If host resolution is flaky, provide a CIDR so the server can scan
          the LAN and match devices by `uuid` (via `Appliance.System.All`). That scan may also learn the MAC for display.
        </div>
      </div>
    </section>
  )
}

export default App
