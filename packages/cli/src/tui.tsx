import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  defaultMerossConfigPath,
  defaultSuggestedCidr,
  extractLanMac,
  extractLanUuid,
  getSystemAll,
  groupDevicesForControl,
  listHostsInCidr,
  loadMerossConfig,
  merossCloudListDevices,
  merossCloudLogin,
  pingSweep,
  saveMerossConfig,
  setToggleX,
  type MerossCloudDevice,
  type MerossConfig,
  type MerossDeviceHostMap,
} from '@merossity/core/meross'
import { Box, Text, render, useApp, useInput } from 'ink'

const nowIso = () => new Date().toISOString()

const configPath = () => process.env.MEROSS_CONFIG_PATH || defaultMerossConfigPath()
const readConfig = async (): Promise<MerossConfig> => await loadMerossConfig(configPath())
const writeConfig = async (next: MerossConfig): Promise<void> => await saveMerossConfig(next, configPath())

const mask = (s: string) => (s ? '•'.repeat(Math.min(12, s.length)) : '')

type Phase = 'boot' | 'login' | 'hydrating' | 'inventory' | 'diagnostics'

function App() {
  const app = useApp()

  const [phase, setPhase] = useState<Phase>('boot')
  const [cfg, setCfg] = useState<MerossConfig | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const [devices, setDevices] = useState<MerossCloudDevice[]>([])
  const [hosts, setHosts] = useState<MerossDeviceHostMap>({})
  const [cidr, setCidr] = useState<string>('')

  const [selectedUuid, setSelectedUuid] = useState<string | null>(null)
  const [expandedUuid, setExpandedUuid] = useState<string | null>(null)

  const [diag, setDiag] = useState<{ uuid: string; host: string; json: string } | null>(null)

  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginTotp, setLoginTotp] = useState('')
  const [loginUseEnv, setLoginUseEnv] = useState(false)
  const [loginAdvanced, setLoginAdvanced] = useState(false)
  const [loginFocus, setLoginFocus] = useState<'email' | 'password' | 'totp' | 'submit'>('email')

  const envReady = Boolean(process.env.MEROSS_EMAIL && process.env.MEROSS_PASSWORD)
  const totpOk = /^[0-9]{6}$/.test(loginTotp.trim())
  const canSubmitLogin = totpOk && (loginUseEnv ? envReady : Boolean(loginEmail.trim() && loginPassword))

  const load = useCallback(async () => {
    setBusy('loading')
    setError(null)
    try {
      const next = await readConfig()
      setCfg(next)
      setDevices((next.devices?.list ?? []) as MerossCloudDevice[])
      setHosts((next.hosts ?? {}) as MerossDeviceHostMap)
      setPhase(next.cloud?.key ? 'hydrating' : 'login')
    } catch (e) {
      setCfg({})
      setDevices([])
      setHosts({})
      setPhase('login')
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }, [])

  const refreshDevices = useCallback(async () => {
    if (!cfg?.cloud) throw new Error('Not logged in (missing cloud creds).')
    setBusy('refreshing devices')
    const list = await merossCloudListDevices(cfg.cloud)
    const next: MerossConfig = { ...cfg, devices: { updatedAt: nowIso(), list } }
    await writeConfig(next)
    setCfg(next)
    setDevices(list)
  }, [cfg])

  const discoverHosts = useCallback(
    async (overrideCidr?: string) => {
      const key = cfg?.cloud?.key || process.env.MEROSS_KEY
      if (!key) throw new Error('Missing Meross key (cloud not linked and MEROSS_KEY not set).')

      const effectiveCidr = (overrideCidr ?? cidr).trim() || defaultSuggestedCidr() || ''
      if (!effectiveCidr) {
        throw new Error('Missing CIDR and no auto-suggested CIDR found. Set CIDR or pass "--cidr".')
      }

      setBusy(`scanning ${effectiveCidr}`)

      await pingSweep(effectiveCidr, { timeoutMs: 200, concurrency: 64 }).catch(() => {})

      const ips = listHostsInCidr(effectiveCidr)
      let i = 0
      const found: MerossDeviceHostMap = {}

      const perHostTimeoutMs = 900
      const concurrency = 24

      await Promise.all(
        Array.from({ length: concurrency }, () =>
          (async () => {
            for (;;) {
              const idx = i++
              if (idx >= ips.length) return
              const ip = ips[idx]!
              try {
                const resp = await getSystemAll<any>({ host: ip, key, timeoutMs: perHostTimeoutMs })
                const uuid = extractLanUuid(resp)
                if (!uuid) continue
                const mac = extractLanMac(resp) ?? undefined
                found[uuid] = { host: ip, updatedAt: nowIso(), ...(mac ? { mac } : {}) }
              } catch {
                // ignore
              }
            }
          })(),
        ),
      )

      const next: MerossConfig = { ...cfg, hosts: { ...cfg?.hosts, ...found } }
      await writeConfig(next)
      setCfg(next)
      setHosts(next.hosts ?? {})
      if (!cidr.trim()) setCidr(effectiveCidr)
    },
    [cfg, cidr],
  )

  const hydrate = useCallback(async () => {
    try {
      setError(null)
      await refreshDevices()
      await discoverHosts()
      setPhase('inventory')
    } catch (e) {
      setPhase('inventory')
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }, [discoverHosts, refreshDevices])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (phase === 'hydrating') void hydrate()
  }, [phase, hydrate])

  const groups = useMemo(() => groupDevicesForControl(devices, hosts), [devices, hosts])

  const flat = useMemo(() => {
    const out: Array<{ group: 'ready' | 'inaccessible'; uuid: string; name: string }> = []
    for (const d of groups.ready) out.push({ group: 'ready', uuid: d.uuid, name: d.name || d.uuid })
    for (const d of groups.inaccessible) out.push({ group: 'inaccessible', uuid: d.uuid, name: d.name || d.uuid })
    return out
  }, [groups.inaccessible, groups.ready])

  useEffect(() => {
    if (!selectedUuid) {
      setSelectedUuid(flat.length ? flat[0]!.uuid : null)
      return
    }
    if (selectedUuid && !flat.some((r) => r.uuid === selectedUuid)) {
      setSelectedUuid(flat.length ? flat[0]!.uuid : null)
    }
  }, [flat, selectedUuid])

  const selected = useMemo(() => {
    const uuid = selectedUuid ?? ''
    const d = devices.find((x) => String(x.uuid) === uuid) ?? null
    const h = hosts[uuid] ?? null
    return { uuid, device: d, host: h }
  }, [devices, hosts, selectedUuid])

  const doLogin = useCallback(async () => {
    if (!canSubmitLogin) return
    setBusy('logging in')
    setError(null)

    const email = loginUseEnv ? String(process.env.MEROSS_EMAIL ?? '') : loginEmail.trim()
    const password = loginUseEnv ? String(process.env.MEROSS_PASSWORD ?? '') : loginPassword
    const totp = loginTotp.trim()

    try {
      const res = await merossCloudLogin({ email, password, mfaCode: totp })
      const next: MerossConfig = { ...cfg, cloud: { ...res.creds, updatedAt: nowIso() } }
      await writeConfig(next)
      setCfg(next)
      setPhase('hydrating')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }, [canSubmitLogin, cfg, loginEmail, loginPassword, loginTotp, loginUseEnv])

  const doToggle = useCallback(
    async (onoff: 0 | 1) => {
      const key = cfg?.cloud?.key || process.env.MEROSS_KEY
      if (!key) throw new Error('Missing Meross key.')
      const uuid = selected.uuid
      const host = selected.host?.host
      if (!uuid || !host) throw new Error('No host known for selection. Scan LAN first.')

      setBusy(onoff ? 'turning on' : 'turning off')
      setError(null)
      try {
        await setToggleX<any>({ host, key, channel: 0, onoff, timeoutMs: 5000 })
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setBusy(null)
      }
    },
    [cfg, selected.host?.host, selected.uuid],
  )

  const doDiagnostics = useCallback(async () => {
    const key = cfg?.cloud?.key || process.env.MEROSS_KEY
    if (!key) throw new Error('Missing Meross key.')
    const uuid = selected.uuid
    const host = selected.host?.host
    if (!uuid || !host) throw new Error('No host known for selection. Scan LAN first.')

    setBusy('fetching diagnostics')
    setError(null)
    try {
      const resp = await getSystemAll<any>({ host, key, timeoutMs: 5000 })
      setDiag({ uuid, host, json: JSON.stringify(resp, null, 2) })
      setPhase('diagnostics')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }, [cfg, selected.host?.host, selected.uuid])

  useInput((input, key) => {
    if (input === 'q' || key.escape) {
      if (phase === 'diagnostics') {
        setPhase('inventory')
        setDiag(null)
        return
      }
      app.exit()
      return
    }

    if (phase === 'login') {
      if (input === 'a') {
        setLoginAdvanced((v) => !v)
        return
      }
      if (loginAdvanced && input === 'e') {
        setLoginUseEnv((v) => !v)
        if (!loginUseEnv) setLoginFocus('totp')
        return
      }

      if (key.tab || key.downArrow || input === 'j') {
        const order: Array<typeof loginFocus> = loginUseEnv
          ? ['totp', 'submit']
          : ['email', 'password', 'totp', 'submit']
        const idx = Math.max(0, order.indexOf(loginFocus))
        setLoginFocus(order[(idx + 1) % order.length]!)
        return
      }
      if (key.upArrow || input === 'k') {
        const order: Array<typeof loginFocus> = loginUseEnv
          ? ['totp', 'submit']
          : ['email', 'password', 'totp', 'submit']
        const idx = Math.max(0, order.indexOf(loginFocus))
        setLoginFocus(order[(idx - 1 + order.length) % order.length]!)
        return
      }

      if (key.return) {
        if (loginFocus === 'submit') void doLogin()
        return
      }

      const isEdit = loginFocus !== 'submit'
      if (!isEdit) return

      if (key.backspace || key.delete) {
        if (loginFocus === 'email') setLoginEmail((s) => s.slice(0, -1))
        if (loginFocus === 'password') setLoginPassword((s) => s.slice(0, -1))
        if (loginFocus === 'totp') setLoginTotp((s) => s.slice(0, -1))
        return
      }

      if (!input) return
      if (loginFocus === 'email') setLoginEmail((s) => s + input)
      if (loginFocus === 'password') setLoginPassword((s) => s + input)
      if (loginFocus === 'totp') setLoginTotp((s) => (s + input).replace(/[^0-9]/g, '').slice(0, 6))
      return
    }

    if (phase === 'inventory') {
      if (input === 'r') {
        void (async () => {
          try {
            setError(null)
            await refreshDevices()
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e))
          } finally {
            setBusy(null)
          }
        })()
        return
      }

      if (input === 's') {
        void (async () => {
          try {
            setError(null)
            await discoverHosts()
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e))
          } finally {
            setBusy(null)
          }
        })()
        return
      }

      if (key.downArrow || input === 'j') {
        if (!flat.length) return
        const idx = Math.max(
          0,
          flat.findIndex((r) => r.uuid === selectedUuid),
        )
        const next = flat[Math.min(flat.length - 1, idx + 1)]!
        setSelectedUuid(next.uuid)
        return
      }
      if (key.upArrow || input === 'k') {
        if (!flat.length) return
        const idx = Math.max(
          0,
          flat.findIndex((r) => r.uuid === selectedUuid),
        )
        const next = flat[Math.max(0, idx - 1)]!
        setSelectedUuid(next.uuid)
        return
      }

      if (key.return) {
        if (!selected.uuid) return
        setExpandedUuid((cur) => (cur === selected.uuid ? null : selected.uuid))
        return
      }

      if (input === 'o') {
        void doToggle(1)
        return
      }
      if (input === 'f') {
        void doToggle(0)
        return
      }
      if (input === 'd') {
        void doDiagnostics()
        return
      }
    }
  })

  const title = useMemo(() => {
    const email = cfg?.cloud?.userEmail ? cfg.cloud.userEmail : 'not linked'
    return `merossity · ${email}`
  }, [cfg?.cloud?.userEmail])

  const cfgPath = useMemo(() => configPath(), [])
  const effectiveCidrLabel = cidr.trim() || defaultSuggestedCidr() || '(no suggestion)'

  if (phase === 'boot') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold>{title}</Text>
        <Text dimColor>Loading…</Text>
      </Box>
    )
  }

  if (phase === 'login') {
    return (
      <Box flexDirection="column" padding={1} gap={1}>
        <Text bold>{title}</Text>
        <Text dimColor>q/Esc: quit · Tab/j/k/arrows: focus · Enter: submit · a: advanced</Text>
        <Text dimColor>Config: {cfgPath}</Text>

        {error ? <Text color="red">{error}</Text> : null}
        {busy ? <Text dimColor>Busy: {busy}</Text> : null}

        <Box flexDirection="column" marginTop={1}>
          <Text bold>Meross Cloud Key</Text>
          <Text dimColor>Enter email, password, and TOTP (6 digits).</Text>
        </Box>

        <Box flexDirection="column" marginTop={1}>
          <Text color={loginFocus === 'email' ? 'cyan' : undefined}>
            {loginFocus === 'email' ? '>' : ' '} Email: {loginUseEnv ? '(env)' : loginEmail || '(empty)'}
          </Text>
          <Text color={loginFocus === 'password' ? 'cyan' : undefined}>
            {loginFocus === 'password' ? '>' : ' '} Password: {loginUseEnv ? '(env)' : mask(loginPassword) || '(empty)'}
          </Text>
          <Text color={loginFocus === 'totp' ? 'cyan' : undefined}>
            {loginFocus === 'totp' ? '>' : ' '} TOTP: {loginTotp || '(empty)'} {totpOk ? '' : '(needs 6 digits)'}
          </Text>
          <Text color={loginFocus === 'submit' ? 'cyan' : undefined}>
            {loginFocus === 'submit' ? '>' : ' '} Fetch key {canSubmitLogin ? '' : '(disabled)'}
          </Text>
        </Box>

        {loginAdvanced ? (
          <Box flexDirection="column" marginTop={1}>
            <Text bold>Advanced</Text>
            <Text dimColor>e: toggle env mode · env email/password: {envReady ? 'present' : 'missing'}</Text>
            <Text>Use env for email/password: {loginUseEnv ? 'ON' : 'OFF'}</Text>
          </Box>
        ) : null}
      </Box>
    )
  }

  if (phase === 'hydrating') {
    return (
      <Box flexDirection="column" padding={1} gap={1}>
        <Text bold>{title}</Text>
        <Text dimColor>q/Esc: quit</Text>
        {error ? <Text color="red">{error}</Text> : null}
        <Text>Building inventory…</Text>
        <Text dimColor>Devices: refresh from cloud</Text>
        <Text dimColor>LAN: scan for IPs ({effectiveCidrLabel})</Text>
        {busy ? <Text dimColor>Busy: {busy}</Text> : null}
      </Box>
    )
  }

  if (phase === 'diagnostics') {
    return (
      <Box flexDirection="column" padding={1} gap={1}>
        <Text bold>Diagnostics</Text>
        <Text dimColor>q/Esc: back</Text>
        {diag ? (
          <Box flexDirection="column" marginTop={1}>
            <Text dimColor>
              {diag.uuid} · {diag.host}
            </Text>
            <Text>{diag.json}</Text>
          </Box>
        ) : (
          <Text dimColor>(no data)</Text>
        )}
      </Box>
    )
  }

  // inventory
  const row = (uuid: string) => {
    const d = devices.find((x) => String(x.uuid) === uuid)
    const h = hosts[uuid]
    const name = String(d?.devName ?? '') || uuid
    const ip = h?.host ? String(h.host) : '-'
    const sel = uuid === selectedUuid
    const expanded = uuid === expandedUuid
    const online = String(d?.onlineStatus ?? '')
    return (
      <Box key={uuid} flexDirection="column">
        <Text color={sel ? 'cyan' : undefined}>
          {sel ? '>' : ' '} {name} <Text dimColor>({online || 'unknown'})</Text> <Text dimColor>{ip}</Text>
        </Text>
        {expanded ? (
          <Box flexDirection="column" paddingLeft={2}>
            <Text dimColor>uuid: {uuid}</Text>
            {h?.mac ? <Text dimColor>mac: {h.mac}</Text> : null}
            {h?.updatedAt ? <Text dimColor>ip seen: {h.updatedAt}</Text> : null}
            <Text dimColor>actions: {h?.host ? 'o=on f=off d=diagnostics' : 's=scan LAN to find IP'}</Text>
          </Box>
        ) : null}
      </Box>
    )
  }

  return (
    <Box flexDirection="column" padding={1} gap={1}>
      <Text bold>{title}</Text>
      <Text dimColor>
        q/Esc: quit · j/k or arrows: move · Enter: open · r: refresh · s: scan · o/on f/off · d: diagnostics
      </Text>
      <Text dimColor>Config: {cfgPath}</Text>
      {error ? <Text color="red">{error}</Text> : null}
      {busy ? <Text dimColor>Busy: {busy}</Text> : null}

      <Box flexDirection="column" marginTop={1}>
        <Text bold>
          Ready to control <Text dimColor>({groups.ready.length})</Text>
        </Text>
        {groups.ready.length ? groups.ready.map((d) => row(d.uuid)) : <Text dimColor>(none)</Text>}
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text bold>
          Inaccessible <Text dimColor>({groups.inaccessible.length})</Text>
        </Text>
        {groups.inaccessible.length ? groups.inaccessible.map((d) => row(d.uuid)) : <Text dimColor>(none)</Text>}
      </Box>
    </Box>
  )
}

export const runTui = async () => {
  const { waitUntilExit } = render(<App />)
  await waitUntilExit()
}
