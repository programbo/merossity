import path from 'node:path'
import { fileURLToPath } from 'node:url'
import os from 'node:os'

import tailwindPlugin from 'bun-plugin-tailwind'
import {
  MerossCloudError,
  defaultMerossConfigPath,
  getSystemAll,
  loadMerossConfig,
  listHostsInCidr,
  merossCloudListDevices,
  merossCloudLogin,
  normalizeMac,
  pingSweep,
  resolveIpv4FromMac,
  saveMerossConfig,
  setToggleX,
  type MerossCloudCredentials,
  type MerossCloudDevice,
} from '@merossity/core/meross'
import { serveWithControl } from './dev/serve-with-control'

const isProduction = process.env.NODE_ENV === 'production'

const nowIso = () => new Date().toISOString()

const loadEnvFromRootIfPresent = async () => {
  // Bun loads .env from the current working directory. In this monorepo, the
  // secrets are often stored at repo root, while `apps/web` runs with cwd=apps/web.
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '..', '.env'),
    path.resolve(process.cwd(), '..', '..', '.env'),
  ]

  for (const p of candidates) {
    try {
      const text = await Bun.file(p).text()
      if (!text.trim()) continue
      for (const rawLine of text.split('\n')) {
        const line = rawLine.trim()
        if (!line || line.startsWith('#')) continue

        // Support `export KEY='value'` (as in the user's .env) and `KEY=value`.
        const cleaned = line.startsWith('export ') ? line.slice('export '.length).trim() : line
        const eq = cleaned.indexOf('=')
        if (eq <= 0) continue

        const key = cleaned.slice(0, eq).trim()
        let value = cleaned.slice(eq + 1).trim()
        if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
          value = value.slice(1, -1)
        }

        if (!key) continue
        if (process.env[key] === undefined) process.env[key] = value
      }
      return
    } catch {
      // ignore
    }
  }
}

await loadEnvFromRootIfPresent()

const srcDir = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.resolve(srcDir, '..', 'dist')

const srcIndex = Bun.file(new URL('./index.html', import.meta.url))
const distIndex = Bun.file(path.join(distDir, 'index.html'))

const ensureDevBuild = async () => {
  if (isProduction) return

  const { readdir, stat } = await import('node:fs/promises')

  // The server runs with `bun --hot`, but the UI build is a separate Bun.build output in `dist/`.
  // If we only "build once", it's easy to accidentally serve stale UI assets (and miss UI changes).
  //
  // Set DEV_BUILD_ALWAYS=1 to force rebuild on every server start.
  const always = process.env.DEV_BUILD_ALWAYS === '1'

  const newestMtimeMs = async (dir: string): Promise<number> => {
    let newest = 0
    let entries: Array<import('node:fs').Dirent>
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return 0
    }

    for (const ent of entries) {
      const p = path.join(dir, ent.name)

      if (ent.isDirectory()) {
        // Avoid scanning the build output or dependencies.
        if (ent.name === 'dist' || ent.name === 'node_modules') continue
        newest = Math.max(newest, await newestMtimeMs(p))
        continue
      }

      // Only consider "UI-affecting" sources.
      if (!/\.(tsx?|css|html)$/.test(ent.name)) continue
      try {
        const s = await stat(p)
        newest = Math.max(newest, s.mtimeMs)
      } catch {
        // ignore
      }
    }

    return newest
  }

  const shouldBuild = async () => {
    if (always) return true
    if (!(await distIndex.exists())) return true

    try {
      const distStat = await stat(path.join(distDir, 'index.html'))
      const srcNewest = await newestMtimeMs(srcDir)
      return srcNewest > distStat.mtimeMs
    } catch {
      return true
    }
  }

  if (!(await shouldBuild())) return

  const result = await Bun.build({
    entrypoints: [path.join(srcDir, 'index.html')],
    outdir: distDir,
    plugins: [tailwindPlugin],
    minify: false,
    target: 'browser',
    sourcemap: 'linked',
    define: {
      'process.env.NODE_ENV': JSON.stringify('development'),
    },
  })

  if (!result.success) {
    // Best-effort: keep the server up so the UI can display API errors, even if the frontend build failed.
    console.warn(`⚠️ Dev build failed (${result.logs.length} logs). Serving source index.html fallback.`)
  }
}

await ensureDevBuild()

const index = (await distIndex.exists()) ? distIndex : srcIndex

const tryServeDistAsset = async (pathname: string): Promise<Response | null> => {
  // Serve built assets (e.g. /chunk-*.js, /chunk-*.css, sourcemaps).

  const clean = pathname.replace(/^\/+/, '')
  if (!clean) return null

  const file = Bun.file(path.join(distDir, clean))
  if (!(await file.exists())) return null
  return new Response(file)
}

const applySecurityHeaders = (response: Response) => {
  if (!isProduction) return response

  const headers = new Headers(response.headers)
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  headers.set('Cross-Origin-Opener-Policy', 'same-origin')
  headers.set('Cross-Origin-Resource-Policy', 'same-origin')
  headers.set('Cross-Origin-Embedder-Policy', 'require-corp')
  headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self'",
      // Allow Google Fonts for the UI typography. This is only enabled in production.
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data:",
      "font-src 'self' data: https://fonts.gstatic.com",
      "connect-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
  )

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

const json = (data: unknown, init?: ResponseInit) => applySecurityHeaders(Response.json(data, init))

const html = (body: BodyInit) => {
  const headers = new Headers()
  headers.set('Content-Type', 'text/html; charset=utf-8')
  return applySecurityHeaders(new Response(body, { headers }))
}

type ApiOk<T> = { ok: true; data: T }
type ApiErr = { ok: false; error: { message: string; code?: string; details?: unknown } }
const apiOk = <T>(data: T): ApiOk<T> => ({ ok: true, data })
const apiErr = (message: string, code?: string, details?: unknown): ApiErr => ({
  ok: false,
  error: { message, code, details },
})

const parseJsonBody = async (req: Request) => {
  const ct = req.headers.get('content-type') ?? ''
  if (!ct.toLowerCase().includes('application/json')) return null
  return (await req.json().catch(() => null)) as any
}

const configPath = () => process.env.MEROSS_CONFIG_PATH || defaultMerossConfigPath()

const readConfig = async () => await loadMerossConfig(configPath())
const writeConfig = async (next: Awaited<ReturnType<typeof readConfig>>) => await saveMerossConfig(next, configPath())

const summarizeCloud = (cloud: MerossCloudCredentials) => ({
  domain: cloud.domain,
  mqttDomain: cloud.mqttDomain,
  userId: cloud.userId,
  userEmail: cloud.userEmail,
  key: cloud.key,
  tokenRedacted: cloud.token ? `${cloud.token.slice(0, 4)}…${cloud.token.slice(-4)}` : '',
})

const inferMfaRequired = (e: unknown) => {
  if (!(e instanceof MerossCloudError)) return false
  const info = (e.info ?? '').toLowerCase()
  // Best-effort: Meross cloud uses a variety of info strings.
  return info.includes('mfa') || info.includes('totp') || info.includes('verify') || info.includes('verification')
}

const requireLanHost = async (uuid: string) => {
  const cfg = await readConfig()
  const host = cfg.hosts?.[uuid]?.host
  if (!host) throw new Error(`No LAN host known for device uuid=${uuid}. Resolve host first.`)
  return host
}

const requireLanKey = async () => {
  const cfg = await readConfig()
  const key = cfg.cloud?.key || process.env.MEROSS_KEY
  if (!key) throw new Error(`Missing Meross key. Login (cloud) or set MEROSS_KEY.`)
  return key
}

const ipToInt = (ip: string): number => {
  const parts = ip.split('.').map((p) => Number.parseInt(p, 10))
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) {
    throw new Error(`Invalid IPv4: ${ip}`)
  }
  const [a, b, c, d] = parts as [number, number, number, number]
  return ((a << 24) | (b << 16) | (c << 8) | d) >>> 0
}

const intToIp = (n: number): string =>
  `${(n >>> 24) & 255}.${(n >>> 16) & 255}.${(n >>> 8) & 255}.${n & 255}`

const netmaskToPrefix = (mask: string): number => {
  const n = ipToInt(mask)
  let seenZero = false
  let bits = 0
  for (let i = 31; i >= 0; i--) {
    const bit = (n >>> i) & 1
    if (bit === 1) {
      if (seenZero) throw new Error(`Non-contiguous netmask: ${mask}`)
      bits++
    } else {
      seenZero = true
    }
  }
  return bits
}

const isPrivateIpv4 = (ip: string): boolean => {
  try {
    const n = ipToInt(ip)
    const a = (n >>> 24) & 255
    const b = (n >>> 16) & 255
    if (a === 10) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    return false
  } catch {
    return false
  }
}

const suggestCidrs = (): Array<{ iface: string; address: string; netmask: string; cidr: string }> => {
  const ifs = os.networkInterfaces()
  const out: Array<{ iface: string; address: string; netmask: string; cidr: string }> = []

  for (const [iface, addrs] of Object.entries(ifs)) {
    for (const a of addrs ?? []) {
      if (!a) continue
      if (a.family !== 'IPv4') continue
      if (a.internal) continue
      if (!a.address || !a.netmask) continue

      try {
        const prefix = netmaskToPrefix(a.netmask)
        const ip = ipToInt(a.address)
        const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0
        const network = ip & mask
        const cidr = `${intToIp(network)}/${prefix}`
        out.push({ iface, address: a.address, netmask: a.netmask, cidr })
      } catch {
        // ignore
      }
    }
  }

  // Heuristic: prefer physical LAN interfaces and RFC1918 ranges.
  out.sort((a, b) => {
    const aPriv = isPrivateIpv4(a.address) ? 0 : 1
    const bPriv = isPrivateIpv4(b.address) ? 0 : 1
    if (aPriv !== bPriv) return aPriv - bPriv

    const aEn = a.iface === 'en0' ? 0 : 1
    const bEn = b.iface === 'en0' ? 0 : 1
    if (aEn !== bEn) return aEn - bEn

    return a.iface.localeCompare(b.iface)
  })

  return out
}

const defaultSuggestedCidr = (): string | null => {
  const s = suggestCidrs()
  return s.length ? s[0]!.cidr : null
}

const extractLanUuid = (resp: any): string | null => {
  const uuid =
    resp?.payload?.all?.system?.hardware?.uuid ??
    resp?.payload?.all?.system?.hardware?.UUID ??
    resp?.payload?.all?.system?.hardware?.deviceUuid ??
    resp?.payload?.all?.system?.hardware?.deviceUUID

  if (typeof uuid === 'string' && uuid.trim()) return uuid.trim()
  return null
}

const extractLanMac = (resp: any): string | null => {
  const raw =
    resp?.payload?.all?.system?.hardware?.macAddress ??
    resp?.payload?.all?.system?.hardware?.mac ??
    resp?.payload?.all?.system?.hardware?.macaddr ??
    resp?.payload?.all?.system?.hardware?.MAC ??
    resp?.payload?.all?.system?.network?.macAddress ??
    resp?.payload?.all?.system?.network?.mac ??
    resp?.payload?.all?.system?.wifi?.macAddress ??
    resp?.payload?.all?.system?.wifi?.mac

  if (typeof raw !== 'string' || !raw.trim()) return null
  try {
    return normalizeMac(raw)
  } catch {
    return null
  }
}

const resolveHostByUuidScan = async (
  uuid: string,
  cidr: string,
  key: string,
  options: { perHostTimeoutMs?: number; concurrency?: number; targetMac?: string } = {},
): Promise<{ host: string; mac?: string } | null> => {
  let ips: string[]
  try {
    ips = listHostsInCidr(cidr)
  } catch {
    return null
  }
  if (ips.length === 0) return null

  // Keep timeouts short to avoid a minutes-long scan on large CIDRs.
  const perHostTimeoutMs = Number.isFinite(options.perHostTimeoutMs) ? Math.max(200, options.perHostTimeoutMs!) : 900
  const concurrency = Number.isFinite(options.concurrency) ? Math.max(1, Math.floor(options.concurrency!)) : 24

  let found: { host: string; mac?: string } | null = null
  let i = 0

  const workers = Array.from({ length: concurrency }, () =>
    (async () => {
      for (;;) {
        if (found) return
        const idx = i++
        if (idx >= ips.length) return
        const ip = ips[idx]!

        try {
          const resp = await getSystemAll<any>({ host: ip, key, timeoutMs: perHostTimeoutMs })
          const got = extractLanUuid(resp)
          const mac = extractLanMac(resp) ?? undefined
          const macMatch = options.targetMac && mac ? mac === options.targetMac : false
          if ((got && got === uuid) || macMatch) {
            found = mac ? { host: ip, mac } : { host: ip }
            return
          }
        } catch {
          // ignore: not a Meross device / not reachable / timeout
        }
      }
    })(),
  )

  await Promise.all(workers)
  return found
}

const _server = await serveWithControl({
  routes: {
    // Production: serve built assets (dist/*). All other unmatched routes return index.html for SPA navigation.
    '/*': async (req) => {
      const url = new URL(req.url)
      const asset = await tryServeDistAsset(url.pathname)
      if (asset) return applySecurityHeaders(asset)
      return html(index)
    },

    '/api/lan/cidr-suggest': {
      async GET(_req) {
        return json(apiOk({ suggestions: suggestCidrs(), default: defaultSuggestedCidr() }))
      },
    },

    '/api/status': {
      async GET(_req) {
        const cfg = await readConfig()
        return json(
          apiOk({
            env: {
              hasEmail: Boolean(process.env.MEROSS_EMAIL),
              hasPassword: Boolean(process.env.MEROSS_PASSWORD),
              hasKey: Boolean(process.env.MEROSS_KEY),
            },
            config: {
              path: configPath(),
              hasCloudCreds: Boolean(cfg.cloud?.token && cfg.cloud?.key),
              hasDevices: Boolean(cfg.devices?.list?.length),
              hasHosts: Boolean(cfg.hosts && Object.keys(cfg.hosts).length > 0),
              updatedAt: {
                cloud: cfg.cloud?.updatedAt,
                devices: cfg.devices?.updatedAt,
              },
            },
          }),
        )
      },
    },

    '/api/cloud/login': {
      async POST(req) {
        const body = (await parseJsonBody(req)) ?? {}
        const email = String(body.email ?? process.env.MEROSS_EMAIL ?? '')
        const password = String(body.password ?? process.env.MEROSS_PASSWORD ?? '')
        const mfaCode = body.mfaCode ? String(body.mfaCode) : undefined
        const domain = body.domain ? String(body.domain) : undefined
        const scheme = body.scheme === 'http' || body.scheme === 'https' ? (body.scheme as 'http' | 'https') : undefined
        const timeoutMs = body.timeoutMs !== undefined ? Number(body.timeoutMs) : undefined
        if (!email || !password)
          return json(
            apiErr('Missing email/password (provide in request or set MEROSS_EMAIL/MEROSS_PASSWORD).', 'missing_creds'),
          )

        try {
          const res = await merossCloudLogin(
            { email, password, mfaCode },
            { domain, scheme, timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : undefined },
          )
          const cfg = await readConfig()
          await writeConfig({
            ...cfg,
            cloud: { ...res.creds, updatedAt: nowIso() },
          })
          return json(apiOk({ cloud: summarizeCloud(res.creds) }))
        } catch (e) {
          if (inferMfaRequired(e)) {
            return json(
              apiErr(
                'MFA required. Provide a TOTP code and try again.',
                'mfa_required',
                e instanceof MerossCloudError ? { apiStatus: e.apiStatus, info: e.info } : undefined,
              ),
            )
          }
          if (e instanceof MerossCloudError) {
            return json(apiErr(e.message, 'cloud_error', { apiStatus: e.apiStatus, info: e.info }))
          }
          return json(apiErr(e instanceof Error ? e.message : String(e), 'unknown'), { status: 500 })
        }
      },
    },

    '/api/cloud/creds': {
      async GET(_req) {
        const cfg = await readConfig()
        if (!cfg.cloud) return json(apiOk({ cloud: null }))
        return json(apiOk({ cloud: summarizeCloud(cfg.cloud) }))
      },
    },

    '/api/cloud/devices': {
      async GET(_req) {
        const cfg = await readConfig()
        const list = (cfg.devices?.list ?? []) as MerossCloudDevice[]
        return json(apiOk({ updatedAt: cfg.devices?.updatedAt ?? null, list }))
      },
    },

    '/api/cloud/devices/refresh': {
      async POST(req) {
        const body = (await parseJsonBody(req)) ?? {}
        const timeoutMs = body.timeoutMs !== undefined ? Number(body.timeoutMs) : undefined
        const cfg = await readConfig()
        if (!cfg.cloud)
          return json(apiErr('Not logged in. Run /api/cloud/login first.', 'not_logged_in'))

        try {
          const list = await merossCloudListDevices(cfg.cloud, {
            timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : undefined,
          })
          await writeConfig({
            ...cfg,
            devices: { updatedAt: nowIso(), list },
          })
          return json(apiOk({ count: list.length, list }))
        } catch (e) {
          if (e instanceof MerossCloudError) {
            return json(apiErr(e.message, 'cloud_error', { apiStatus: e.apiStatus, info: e.info }))
          }
          return json(apiErr(e instanceof Error ? e.message : String(e), 'unknown'), { status: 500 })
        }
      },
    },

    '/api/hosts': {
      async GET(_req) {
        const cfg = await readConfig()
        return json(apiOk({ hosts: cfg.hosts ?? {} }))
      },
    },

    '/api/hosts/resolve': {
      async POST(req) {
        const body = (await parseJsonBody(req)) ?? {}
        const uuid = String(body.uuid ?? '')
        const mac = String(body.mac ?? body.macAddress ?? '')
        const cidr = body.cidr ? String(body.cidr) : ''
        const perHostTimeoutMs = body.perHostTimeoutMs !== undefined ? Number(body.perHostTimeoutMs) : undefined
        if (!uuid) return json(apiErr('Missing uuid', 'missing_uuid'))

        let ip: string | null = null
        let normalizedMac: string | null = null
        let cidrTried: string | null = null

        // Only trust explicit MAC provided by the client. Do not infer MAC from UUID (it is not reliable).
        if (mac) {
          if (cidr) {
            // Populate ARP table best-effort, then resolve by MAC.
            await pingSweep(cidr, { timeoutMs: 200, concurrency: 64 }).catch(() => {})
          }
          ip = await resolveIpv4FromMac(mac)
          try {
            normalizedMac = normalizeMac(mac)
          } catch {
            // ignore
          }

          // If ARP-based MAC resolution fails, fall back to uuid scan (cloud lists often omit mac).
          if (!ip) {
            const effectiveCidr = cidr || defaultSuggestedCidr() || ''
            if (effectiveCidr) {
              cidrTried = effectiveCidr
              const key = await requireLanKey()
              try {
                await pingSweep(effectiveCidr, { timeoutMs: 200, concurrency: 64 }).catch(() => {})
              } catch {
                return json(apiErr(`Invalid CIDR: ${effectiveCidr}`, 'invalid_cidr'))
              }

              const resolved = await resolveHostByUuidScan(uuid, effectiveCidr, key, {
                perHostTimeoutMs,
                targetMac: normalizedMac ?? undefined,
              })
              if (resolved) {
                ip = resolved.host
                if (resolved.mac) normalizedMac = resolved.mac
              }
            }
          }
        } else {
          const effectiveCidr = cidr || defaultSuggestedCidr() || ''
          if (!effectiveCidr) {
            return json(
              apiErr(
                'No MAC address available. Provide a CIDR (e.g. 192.168.68.0/22) so we can scan the LAN by uuid.',
                'missing_mac',
              ),
            )
          }
          cidrTried = effectiveCidr

          // Fallback: scan the CIDR and identify devices by uuid using Appliance.System.All.
          const key = await requireLanKey()
          try {
            await pingSweep(effectiveCidr, { timeoutMs: 200, concurrency: 64 }).catch(() => {})
          } catch {
            return json(apiErr(`Invalid CIDR: ${effectiveCidr}`, 'invalid_cidr'))
          }

          const resolved = await resolveHostByUuidScan(uuid, effectiveCidr, key, { perHostTimeoutMs })
          ip = resolved?.host ?? null
          if (resolved?.mac) normalizedMac = resolved.mac
        }

        if (!ip)
          return json(
            apiErr(
              mac
                ? cidrTried
                  ? 'Could not resolve IP from MAC (and LAN scan by uuid did not find it). Ensure the device is online and CIDR is correct.'
                  : 'Could not resolve IP from MAC. Provide a CIDR (e.g. 192.168.1.0/24) so we can scan the LAN by uuid, and ensure the device is online.'
                : [
                    `Could not find device on LAN by uuid.`,
                    cidrTried ? `CIDR tried: ${cidrTried}.` : '',
                    (() => {
                      const suggested = defaultSuggestedCidr()
                      return suggested && suggested !== cidrTried ? `Suggested: ${suggested}.` : ''
                    })(),
                    `Confirm the device is awake on that network.`,
                  ]
                    .filter(Boolean)
                    .join(' '),
              'host_not_found',
            ),
          )

        const cfg = await readConfig()
        const nextHosts = { ...cfg.hosts }
        const prev = nextHosts[uuid]
        nextHosts[uuid] = {
          host: ip,
          updatedAt: nowIso(),
          ...(prev?.mac ? { mac: prev.mac } : {}),
          ...(normalizedMac ? { mac: normalizedMac } : {}),
        }
        await writeConfig({ ...cfg, hosts: nextHosts })
        return json(apiOk({ uuid, host: ip, ...(normalizedMac ? { mac: normalizedMac } : {}) }))
      },
    },

    '/api/hosts/discover': {
      async POST(req) {
        const body = (await parseJsonBody(req)) ?? {}
        const cidr = body.cidr ? String(body.cidr) : ''
        const effectiveCidr = cidr || defaultSuggestedCidr() || ''
        const perHostTimeoutMs =
          body.perHostTimeoutMs !== undefined ? Math.max(200, Number(body.perHostTimeoutMs)) : 900
        const concurrency = body.concurrency !== undefined ? Math.max(1, Math.floor(Number(body.concurrency))) : 24
        if (!effectiveCidr) return json(apiErr('Missing cidr', 'missing_cidr'))

        const key = await requireLanKey()
        try {
          await pingSweep(effectiveCidr, { timeoutMs: 200, concurrency: 64 }).catch(() => {})
        } catch {
          return json(apiErr(`Invalid CIDR: ${effectiveCidr}`, 'invalid_cidr'))
        }

        let ips: string[]
        try {
          ips = listHostsInCidr(effectiveCidr)
        } catch {
          return json(apiErr(`Invalid CIDR: ${effectiveCidr}`, 'invalid_cidr'))
        }

        let i = 0
        const found: Record<string, { host: string; updatedAt: string; mac?: string }> = {}

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
                  const mac = extractLanMac(resp)
                  found[uuid] = { host: ip, updatedAt: nowIso(), ...(mac ? { mac } : {}) }
                } catch {
                  // ignore
                }
              }
            })(),
          ),
        )

        const cfg = await readConfig()
        await writeConfig({ ...cfg, hosts: { ...cfg.hosts, ...found } })

        return json(apiOk({ cidr: effectiveCidr, count: Object.keys(found).length, hosts: found }))
      },
    },

    '/api/lan/system-all': {
      async POST(req) {
        const body = (await parseJsonBody(req)) ?? {}
        const uuid = String(body.uuid ?? '')
        if (!uuid) return json(apiErr('Missing uuid', 'missing_uuid'))

        try {
          const host = await requireLanHost(uuid)
          const key = await requireLanKey()
          const data = await getSystemAll<any>({ host, key })
          return json(apiOk({ host, data }))
        } catch (e) {
          return json(apiErr(e instanceof Error ? e.message : String(e), 'lan_error'))
        }
      },
    },

    '/api/lan/toggle': {
      async POST(req) {
        const body = (await parseJsonBody(req)) ?? {}
        const uuid = String(body.uuid ?? '')
        const channel = body.channel === undefined ? 0 : Number(body.channel)
        const onoff = Number(body.onoff) === 1 ? 1 : 0
        if (!uuid) return json(apiErr('Missing uuid', 'missing_uuid'))
        if (!Number.isInteger(channel) || channel < 0)
          return json(apiErr('Invalid channel', 'invalid_channel'))

        try {
          const host = await requireLanHost(uuid)
          const key = await requireLanKey()
          const resp = await setToggleX<any>({ host, key, channel, onoff })
          return json(apiOk({ host, channel, onoff, resp }))
        } catch (e) {
          return json(apiErr(e instanceof Error ? e.message : String(e), 'lan_error'))
        }
      },
    },
  },

  development: process.env.NODE_ENV !== 'production' && {
    // Enable browser hot reloading in development
    hmr: true,

    // Echo console logs from the browser to the server
    console: true,
  },
})
