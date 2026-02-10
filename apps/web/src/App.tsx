import { useEffect, useMemo, useRef, useState, type ButtonHTMLAttributes } from 'react'
import './index.css'
import { ApiError, apiGet, apiPost } from './lib/api'
import type { CloudSummary, MerossCloudDevice, StatusResponse } from './lib/types'

type HostsMap = Record<string, { host: string; updatedAt: string }>

type Tab = 'connect' | 'devices' | 'settings'

const clampText = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n)}…`)

const getHashTab = (): Tab => {
  const raw = (location.hash || '').replace(/^#/, '').trim()
  if (raw === 'devices') return 'devices'
  if (raw === 'settings') return 'settings'
  return 'connect'
}

const setHashTab = (t: Tab) => {
  location.hash = `#${t}`
}

const Button = (props: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'ink' | 'accent' | 'danger' }) => {
  const tone = props.tone ?? 'ink'
  const cls =
    tone === 'accent'
      ? 'bg-[var(--accent)] text-[var(--ink)]'
      : tone === 'danger'
        ? 'bg-[var(--danger)] text-white'
        : 'bg-[rgba(11,16,32,0.92)] text-[var(--paper)]'

  return (
    <button
      {...props}
      className={[
        'font-mono',
        'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-[13px] tracking-[0.12em] uppercase',
        'shadow-[0_10px_24px_rgba(0,0,0,0.18)]',
        'transition-transform duration-150 active:translate-y-[1px] disabled:opacity-50 disabled:active:translate-y-0',
        cls,
        props.className ?? '',
      ].join(' ')}
    />
  )
}

const Card = (props: { title: string; kicker?: string; children: React.ReactNode; right?: React.ReactNode }) => {
  return (
    <section className="paper-grid panel-shadow overflow-hidden rounded-[22px] border border-black/10">
      <div className="flex items-start justify-between gap-4 border-b border-black/10 px-5 py-4">
        <div>
          {props.kicker ? (
            <div className="font-mono text-[11px] tracking-[0.14em] text-black/50 uppercase">{props.kicker}</div>
          ) : null}
          <div className="font-display text-[22px] leading-[1.05]">{props.title}</div>
        </div>
        {props.right ? <div className="pt-1">{props.right}</div> : null}
      </div>
      <div className="px-5 py-5">{props.children}</div>
    </section>
  )
}

const Field = (props: {
  label: string
  hint?: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
}) => {
  return (
    <label className="block">
      <div className="font-mono text-[11px] tracking-[0.14em] text-black/60 uppercase">{props.label}</div>
      <input
        className={[
          'mt-2 w-full rounded-xl border border-black/15 bg-[rgba(255,255,255,0.55)] px-4 py-3',
          'font-mono text-[14px] outline-none placeholder:text-black/35 focus:border-black/30 focus:bg-white',
        ].join(' ')}
        value={props.value}
        type={props.type ?? 'text'}
        placeholder={props.placeholder}
        onChange={(e) => props.onChange(e.target.value)}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
      />
      {props.hint ? <div className="mt-2 text-[13px] text-black/60">{props.hint}</div> : null}
    </label>
  )
}

const Toast = (props: { kind: 'ok' | 'err'; title: string; detail?: string }) => {
  const border = props.kind === 'ok' ? 'border-[rgba(45,212,191,0.35)]' : 'border-[rgba(255,59,59,0.35)]'
  const chip =
    props.kind === 'ok' ? 'bg-[rgba(45,212,191,0.18)] text-black/85' : 'bg-[rgba(255,59,59,0.16)] text-black/85'
  return (
    <div className={['paper panel-shadow rounded-2xl border px-4 py-3', border].join(' ')}>
      <div className="flex items-center justify-between gap-3">
        <div className={['rounded-full px-3 py-1 font-mono text-[11px] tracking-[0.12em] uppercase', chip].join(' ')}>
          {props.kind === 'ok' ? 'OK' : 'ERROR'}
        </div>
        <div className="font-mono text-[11px] tracking-[0.14em] text-black/50 uppercase">merossity</div>
      </div>
      <div className="font-display mt-2 text-[16px] leading-tight">{props.title}</div>
      {props.detail ? <div className="mt-1 text-[13px] text-black/65">{props.detail}</div> : null}
    </div>
  )
}

export function App() {
  const [tab, setTab] = useState<Tab>(() => getHashTab())
  const [status, setStatus] = useState<StatusResponse | null>(null)
  const [cloud, setCloud] = useState<CloudSummary | null>(null)
  const [devices, setDevices] = useState<MerossCloudDevice[]>([])
  const [hosts, setHosts] = useState<HostsMap>({})
  const [busy, setBusy] = useState<string | null>(null)

  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; title: string; detail?: string } | null>(null)
  const toastTimer = useRef<number | null>(null)
  const showToast = (t: typeof toast) => {
    setToast(t)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 4500)
  }

  useEffect(() => {
    const onHash = () => setTab(getHashTab())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const refreshStatus = async () => {
    const st = await apiGet<StatusResponse>('/api/status')
    setStatus(st)
    return st
  }

  const refreshCloud = async () => {
    try {
      const res = await apiGet<{ cloud: CloudSummary | null }>('/api/cloud/creds')
      setCloud(res.cloud)
    } catch {
      setCloud(null)
    }
  }

  const refreshDevices = async () => {
    const res = await apiGet<{ updatedAt: string | null; list: MerossCloudDevice[] }>('/api/cloud/devices')
    setDevices(res.list)
  }

  const refreshHosts = async () => {
    const res = await apiGet<{ hosts: HostsMap }>('/api/hosts')
    setHosts(res.hosts)
  }

  const bootstrap = async () => {
    await refreshStatus()
    await Promise.all([refreshCloud(), refreshDevices(), refreshHosts()])
  }

  useEffect(() => {
    void bootstrap()
  }, [])

  const appTitle = useMemo(() => {
    const c = cloud?.userEmail ? cloud.userEmail : 'local control'
    return `Merossity · ${c}`
  }, [cloud?.userEmail])

  useEffect(() => {
    document.title = appTitle
  }, [appTitle])

  return (
    <div className="switchboard-bg min-h-screen">
      <div className="mx-auto w-full max-w-[560px] px-4 pt-10 pb-24">
        <header className="mb-6">
          <div className="paper panel-shadow rounded-[26px] border border-white/10 p-5">
            <div className="flex items-end justify-between gap-4">
              <div>
                <div className="font-mono text-[11px] tracking-[0.16em] text-black/55 uppercase">
                  mobile switchboard
                </div>
                <div className="font-display text-[34px] leading-[0.95]">Merossity</div>
                <div className="mt-2 text-[14px] text-black/65">
                  Cloud key, device inventory, and LAN toggles. No dashboards. Just switches.
                </div>
              </div>
              <div className="hidden sm:block">
                <div className="font-mono text-[11px] tracking-[0.16em] text-black/55 uppercase">status</div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-[12px] text-black/70">
                  <div className="rounded-lg border border-black/10 bg-white/50 px-3 py-2">
                    env: {status ? (status.env.hasEmail && status.env.hasPassword ? 'ready' : 'partial') : '…'}
                  </div>
                  <div className="rounded-lg border border-black/10 bg-white/50 px-3 py-2">
                    cloud: {cloud ? 'linked' : 'offline'}
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button tone="ink" onClick={() => void bootstrap()} disabled={busy !== null}>
                Refresh
              </Button>
              <Button
                tone="accent"
                onClick={() => {
                  setHashTab(cloud ? 'devices' : 'connect')
                }}
                disabled={busy !== null}
              >
                {cloud ? 'Devices' : 'Connect'}
              </Button>
              <Button tone="ink" onClick={() => setHashTab('settings')} disabled={busy !== null}>
                Settings
              </Button>
            </div>
          </div>
        </header>

        <main className="space-y-4">
          {tab === 'connect' ? (
            <ConnectCard
              status={status}
              busy={busy}
              setBusy={setBusy}
              onToast={showToast}
              onAuthed={async () => {
                await Promise.all([refreshStatus(), refreshCloud()])
                setHashTab('devices')
              }}
            />
          ) : null}

          {tab === 'devices' ? (
            <DevicesCard
              cloud={cloud}
              devices={devices}
              hosts={hosts}
              busy={busy}
              setBusy={setBusy}
              onToast={showToast}
              refreshAll={async () => {
                await Promise.all([refreshStatus(), refreshCloud(), refreshDevices(), refreshHosts()])
              }}
              refreshHosts={refreshHosts}
              setDevices={setDevices}
            />
          ) : null}

          {tab === 'settings' ? <SettingsCard status={status} cloud={cloud} onToast={showToast} /> : null}
        </main>
      </div>

      <nav className="fixed right-0 bottom-0 left-0">
        <div className="mx-auto max-w-[560px] px-4 pb-4">
          <div className="paper panel-shadow grid grid-cols-3 overflow-hidden rounded-[22px] border border-black/10">
            <NavItem active={tab === 'connect'} label="Connect" onClick={() => setHashTab('connect')} />
            <NavItem active={tab === 'devices'} label="Devices" onClick={() => setHashTab('devices')} />
            <NavItem active={tab === 'settings'} label="Settings" onClick={() => setHashTab('settings')} />
          </div>
        </div>
      </nav>

      {toast ? (
        <div className="pointer-events-none fixed top-4 right-0 left-0 z-50">
          <div className="mx-auto max-w-[560px] px-4">
            <Toast {...toast} />
          </div>
        </div>
      ) : null}
    </div>
  )
}

const NavItem = (props: { active: boolean; label: string; onClick: () => void }) => {
  return (
    <button
      onClick={props.onClick}
      className={['px-4 py-4 text-center', props.active ? 'bg-white/70' : 'bg-transparent hover:bg-white/40'].join(' ')}
    >
      <div className="font-mono text-[11px] tracking-[0.16em] text-black/75 uppercase">{props.label}</div>
    </button>
  )
}

const ConnectCard = (props: {
  status: StatusResponse | null
  busy: string | null
  setBusy: (v: string | null) => void
  onToast: (t: { kind: 'ok' | 'err'; title: string; detail?: string } | null) => void
  onAuthed: () => Promise<void>
}) => {
  const [useEnv, setUseEnv] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mfaCode, setMfaCode] = useState('')
  const [mfaRequired, setMfaRequired] = useState(false)

  const envReady = Boolean(props.status?.env.hasEmail && props.status?.env.hasPassword)

  const doLogin = async () => {
    props.setBusy('login')
    try {
      const body: any = {}
      if (!useEnv) {
        body.email = email
        body.password = password
      } else {
        // If user typed creds, allow override while still defaulting to env.
        if (email.trim()) body.email = email.trim()
        if (password) body.password = password
      }
      if (mfaCode.trim()) body.mfaCode = mfaCode.trim()

      const res = await apiPost<{ cloud: CloudSummary }>('/api/cloud/login', body)
      setMfaRequired(false)
      props.onToast({ kind: 'ok', title: 'Cloud linked', detail: `Domain: ${res.cloud.domain}` })
      await props.onAuthed()
    } catch (e) {
      if (e instanceof ApiError && e.code === 'mfa_required') {
        setMfaRequired(true)
        props.onToast({ kind: 'err', title: 'Verification required', detail: 'Enter your TOTP code and try again.' })
        return
      }
      props.onToast({ kind: 'err', title: 'Login failed', detail: e instanceof Error ? e.message : String(e) })
    } finally {
      props.setBusy(null)
    }
  }

  return (
    <Card
      title="Connect Cloud"
      kicker="step 1"
      right={
        <div className="font-mono text-[11px] tracking-[0.14em] text-black/55 uppercase">
          {envReady ? 'env ready' : 'env missing'}
        </div>
      }
    >
      <div className="space-y-4">
        <div className="rounded-2xl border border-black/10 bg-white/55 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="font-mono text-[11px] tracking-[0.14em] text-black/60 uppercase">credential source</div>
              <div className="mt-1 text-[14px] text-black/70">
                Default is server-side `.env` (root). You can override here if you want.
              </div>
            </div>
            <button
              onClick={() => setUseEnv((v) => !v)}
              className={[
                'rounded-full border px-3 py-2',
                'font-mono text-[11px] tracking-[0.14em] uppercase',
                useEnv ? 'border-black/15 bg-white/70' : 'border-black/25 bg-white',
              ].join(' ')}
            >
              {useEnv ? 'use env' : 'manual'}
            </button>
          </div>
        </div>

        {!useEnv ? (
          <div className="grid gap-4">
            <Field label="email" value={email} onChange={setEmail} placeholder="name@example.com" />
            <Field label="password" value={password} onChange={setPassword} type="password" placeholder="••••••••" />
          </div>
        ) : (
          <div className="grid gap-4">
            <Field
              label="email (optional override)"
              value={email}
              onChange={setEmail}
              placeholder="leave blank to use .env"
            />
            <Field
              label="password (optional override)"
              value={password}
              onChange={setPassword}
              type="password"
              placeholder="leave blank to use .env"
            />
          </div>
        )}

        {mfaRequired ? (
          <Field
            label="verification code (TOTP)"
            value={mfaCode}
            onChange={setMfaCode}
            placeholder="123456"
            hint="Meross cloud sometimes requires an app-based verification code. Paste it here."
          />
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button tone="accent" onClick={() => void doLogin()} disabled={props.busy !== null}>
            {props.busy === 'login' ? 'Linking…' : 'Link cloud'}
          </Button>
          <Button
            tone="ink"
            onClick={() => {
              setMfaRequired(false)
              setMfaCode('')
              props.onToast({ kind: 'ok', title: 'Cleared verification prompt' })
            }}
            disabled={props.busy !== null}
          >
            Reset
          </Button>
        </div>

        <div className="text-[13px] text-black/65">
          If you set `MEROSS_EMAIL` and `MEROSS_PASSWORD` in the repo root `.env`, you can keep the browser fields
          blank.
        </div>
      </div>
    </Card>
  )
}

const DevicesCard = (props: {
  cloud: CloudSummary | null
  devices: MerossCloudDevice[]
  hosts: HostsMap
  busy: string | null
  setBusy: (v: string | null) => void
  onToast: (t: { kind: 'ok' | 'err'; title: string; detail?: string } | null) => void
  refreshAll: () => Promise<void>
  refreshHosts: () => Promise<void>
  setDevices: (d: MerossCloudDevice[]) => void
}) => {
  const [cidr, setCidr] = useState(() => localStorage.getItem('merossity.cidr') ?? '')
  const [expandedUuid, setExpandedUuid] = useState<string | null>(null)
  const [systemDump, setSystemDump] = useState<{ uuid: string; host: string; data: unknown } | null>(null)

  const refreshFromCloud = async () => {
    props.setBusy('refresh_devices')
    try {
      const res = await apiPost<{ count: number; list: MerossCloudDevice[] }>('/api/cloud/devices/refresh', {})
      props.setDevices(res.list)
      props.onToast({ kind: 'ok', title: 'Devices updated', detail: `${res.count} devices from cloud.` })
    } catch (e) {
      props.onToast({ kind: 'err', title: 'Refresh failed', detail: e instanceof Error ? e.message : String(e) })
    } finally {
      props.setBusy(null)
    }
  }

  const resolveHost = async (d: MerossCloudDevice) => {
    const mac = (d.macAddress as string | undefined) ?? (d.mac as string | undefined) ?? ''
    if (!mac) {
      props.onToast({
        kind: 'err',
        title: 'Missing MAC address',
        detail: 'Device entry did not include mac/macAddress. Try a fresh device list.',
      })
      return
    }

    localStorage.setItem('merossity.cidr', cidr)
    props.setBusy(`resolve:${d.uuid}`)
    try {
      const res = await apiPost<{ uuid: string; host: string }>('/api/hosts/resolve', {
        uuid: d.uuid,
        mac,
        cidr: cidr.trim() || undefined,
      })
      await props.refreshHosts()
      props.onToast({ kind: 'ok', title: 'Host resolved', detail: `${d.devName ?? d.uuid}: ${res.host}` })
    } catch (e) {
      props.onToast({ kind: 'err', title: 'Host resolve failed', detail: e instanceof Error ? e.message : String(e) })
    } finally {
      props.setBusy(null)
    }
  }

  const toggle = async (uuid: string, onoff: 0 | 1) => {
    props.setBusy(`toggle:${uuid}`)
    try {
      await apiPost('/api/lan/toggle', { uuid, channel: 0, onoff })
      props.onToast({ kind: 'ok', title: onoff ? 'Switched on' : 'Switched off', detail: clampText(uuid, 12) })
    } catch (e) {
      props.onToast({ kind: 'err', title: 'Toggle failed', detail: e instanceof Error ? e.message : String(e) })
    } finally {
      props.setBusy(null)
    }
  }

  const fetchSystemAll = async (uuid: string) => {
    props.setBusy(`system:${uuid}`)
    try {
      const res = await apiPost<{ host: string; data: unknown }>('/api/lan/system-all', { uuid })
      setSystemDump({ uuid, host: res.host, data: res.data })
      props.onToast({ kind: 'ok', title: 'Fetched system snapshot', detail: res.host })
    } catch (e) {
      props.onToast({
        kind: 'err',
        title: 'System snapshot failed',
        detail: e instanceof Error ? e.message : String(e),
      })
    } finally {
      props.setBusy(null)
    }
  }

  const cloudHint = props.cloud ? `${props.cloud.userEmail} · ${props.cloud.domain}` : 'Not linked'

  return (
    <Card
      title="Devices"
      kicker="step 2"
      right={<div className="font-mono text-[11px] tracking-[0.14em] text-black/55 uppercase">{cloudHint}</div>}
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button tone="accent" onClick={() => void refreshFromCloud()} disabled={props.busy !== null || !props.cloud}>
            {props.busy === 'refresh_devices' ? 'Refreshing…' : 'Refresh list'}
          </Button>
          <Button tone="ink" onClick={() => void props.refreshAll()} disabled={props.busy !== null}>
            Sync local
          </Button>
        </div>

        <div className="rounded-2xl border border-black/10 bg-white/55 p-4">
          <Field
            label="LAN scan CIDR (optional)"
            value={cidr}
            onChange={setCidr}
            placeholder="192.168.1.0/24"
            hint="If host resolve fails, supply your LAN range to populate ARP entries (quick ping sweep)."
          />
        </div>

        {props.devices.length === 0 ? (
          <div className="rounded-2xl border border-black/10 bg-white/60 p-4 text-[14px] text-black/70">
            No devices yet. Link cloud, then refresh.
          </div>
        ) : (
          <div className="grid gap-3">
            {props.devices.map((d) => {
              const host = props.hosts[d.uuid]?.host
              const online = String(d.onlineStatus ?? '').toLowerCase()
              const onlineChip =
                online.includes('online') || online === '1'
                  ? 'bg-[rgba(45,212,191,0.18)]'
                  : online.includes('offline') || online === '0'
                    ? 'bg-[rgba(255,59,59,0.14)]'
                    : 'bg-black/5'

              const title = d.devName || d.uuid
              const subtitle = [d.deviceType, d.subType].filter(Boolean).join(' / ')
              const mac = (d.macAddress as string | undefined) ?? (d.mac as string | undefined) ?? ''
              const expanded = expandedUuid === d.uuid

              return (
                <div key={d.uuid} className="rounded-[18px] border border-black/10 bg-white/55 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-display truncate text-[18px] leading-tight">{title}</div>
                        <div
                          className={[
                            'rounded-full border border-black/10 px-3 py-1 font-mono text-[11px] tracking-[0.12em] uppercase',
                            onlineChip,
                          ].join(' ')}
                        >
                          {online ? online : 'unknown'}
                        </div>
                      </div>
                      <div className="mt-1 font-mono text-[12px] text-black/55">{subtitle || 'device'}</div>
                      <div className="mt-2 grid gap-1 font-mono text-[12px] text-black/60">
                        <div>uuid: {d.uuid}</div>
                        {mac ? <div>mac: {mac}</div> : null}
                        {host ? <div>host: {host}</div> : <div>host: (not resolved)</div>}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Button
                        tone="ink"
                        onClick={() => setExpandedUuid(expanded ? null : d.uuid)}
                        disabled={props.busy !== null}
                      >
                        {expanded ? 'Close' : 'Open'}
                      </Button>
                    </div>
                  </div>

                  {expanded ? (
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      <Button tone="accent" onClick={() => void resolveHost(d)} disabled={props.busy !== null}>
                        Resolve host
                      </Button>
                      <Button
                        tone="ink"
                        onClick={() => void fetchSystemAll(d.uuid)}
                        disabled={props.busy !== null || !host}
                      >
                        System snapshot
                      </Button>
                      <Button tone="ink" onClick={() => void toggle(d.uuid, 1)} disabled={props.busy !== null || !host}>
                        Toggle ON
                      </Button>
                      <Button
                        tone="danger"
                        onClick={() => void toggle(d.uuid, 0)}
                        disabled={props.busy !== null || !host}
                      >
                        Toggle OFF
                      </Button>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {systemDump ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => {
            if (e.currentTarget === e.target) setSystemDump(null)
          }}
        >
          <div className="paper panel-shadow w-[min(96vw,720px)] overflow-hidden rounded-[22px] border border-black/15">
            <div className="paper-grid">
              <div className="flex items-start justify-between gap-4 border-b border-black/10 px-5 py-4">
                <div>
                  <div className="font-mono text-[11px] tracking-[0.14em] text-black/55 uppercase">
                    Appliance.System.All
                  </div>
                  <div className="font-display text-[20px] leading-tight">{clampText(systemDump.uuid, 18)}</div>
                  <div className="mt-1 font-mono text-[12px] text-black/55">{systemDump.host}</div>
                </div>
                <Button tone="ink" onClick={() => setSystemDump(null)}>
                  Close
                </Button>
              </div>
              <div className="px-5 py-5">
                <pre className="max-h-[55vh] overflow-auto rounded-2xl border border-black/10 bg-white/60 p-4 font-mono text-[12px] leading-relaxed text-black/80">
                  {JSON.stringify(systemDump.data, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </Card>
  )
}

const SettingsCard = (props: {
  status: StatusResponse | null
  cloud: CloudSummary | null
  onToast: (t: any) => void
}) => {
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      props.onToast({ kind: 'ok', title: 'Copied to clipboard' })
    } catch (e) {
      props.onToast({ kind: 'err', title: 'Copy failed', detail: e instanceof Error ? e.message : String(e) })
    }
  }

  const cloud = props.cloud
  const cfg = props.status?.config

  return (
    <Card title="Settings" kicker="notes">
      <div className="space-y-4">
        <div className="rounded-2xl border border-black/10 bg-white/55 p-4">
          <div className="font-mono text-[11px] tracking-[0.14em] text-black/60 uppercase">config</div>
          <div className="mt-2 grid gap-2 font-mono text-[12px] text-black/70">
            <div>path: {cfg?.path ?? '…'}</div>
            <div>cloud creds: {cfg?.hasCloudCreds ? 'yes' : 'no'}</div>
            <div>device list: {cfg?.hasDevices ? 'yes' : 'no'}</div>
            <div>hosts: {cfg?.hasHosts ? 'yes' : 'no'}</div>
          </div>
        </div>

        <div className="rounded-2xl border border-black/10 bg-white/55 p-4">
          <div className="font-mono text-[11px] tracking-[0.14em] text-black/60 uppercase">cloud key</div>
          {cloud ? (
            <div className="mt-2">
              <div className="rounded-2xl border border-black/10 bg-white/70 p-4 font-mono text-[13px] text-black/85">
                <div className="text-[11px] tracking-[0.14em] text-black/55 uppercase">{cloud.userEmail}</div>
                <div className="mt-2 break-all">{cloud.key}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button tone="accent" onClick={() => void copy(cloud.key)}>
                    Copy key
                  </Button>
                  <Button tone="ink" onClick={() => void copy(cloud.domain)}>
                    Copy domain
                  </Button>
                </div>
              </div>
              <div className="mt-3 text-[13px] text-black/65">
                Token is stored server-side only. This UI shows only a redacted preview.
              </div>
            </div>
          ) : (
            <div className="mt-2 text-[14px] text-black/70">No cloud creds yet. Go to Connect.</div>
          )}
        </div>

        <div className="rounded-2xl border border-black/10 bg-white/55 p-4 text-[13px] text-black/65">
          LAN control works best when a device exposes `mac/macAddress` via cloud device listing. If host resolution is
          flaky, provide a CIDR and ensure devices are awake.
        </div>
      </div>
    </Card>
  )
}

export default App
