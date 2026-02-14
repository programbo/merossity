import crypto from 'node:crypto'
import os from 'node:os'
import type { MerossCloudApiResponse, MerossCloudCredentials, MerossCloudDevice } from './types'
import { MerossCloudError } from './types'

const SECRET = '23x17ahWarFH6w29'
const DEFAULT_DOMAIN = 'iotx.meross.com'
// MerossIot documents distinct regional API bases. Hitting the wrong one can yield 1004.
const DEFAULT_FALLBACK_DOMAINS = [
  DEFAULT_DOMAIN,
  'iotx-ap.meross.com',
  'iotx-us.meross.com',
  'iotx-eu.meross.com',
] as const

const md5Hex = (s: string): string => crypto.createHash('md5').update(s, 'utf8').digest('hex')
const base64 = (s: string): string => Buffer.from(s, 'utf8').toString('base64')

const randomNonce = (): string => crypto.randomBytes(16).toString('hex')
const LOG_IDENTIFIER = crypto.randomUUID()

const stripScheme = (domain: string): string => domain.replace(/^https?:\/\//, '').replace(/\/+$/, '')

// Align defaults with MerossIot (python) to reduce auth drift.
const DEFAULT_APP_TYPE = 'MerossIOT'
const DEFAULT_APP_VERSION = '0.4.10.3'
const DEFAULT_UA_HEADER = `MerossIOT/${DEFAULT_APP_VERSION}`
const DEFAULT_COUNTRY_CODE = 'us'

const authDebugLevel = (): 0 | 1 | 2 => {
  const raw = String(process.env.MEROSS_DEBUG_AUTH ?? '')
    .trim()
    .toLowerCase()
  if (!raw || raw === '0' || raw === 'false' || raw === 'off') return 0
  if (raw === '2' || raw === 'verbose' || raw === 'debug') return 2
  return 1
}

const logAuthDebug = (level: 0 | 1 | 2, requiredLevel: 1 | 2, message: string, data?: unknown) => {
  if (level < requiredLevel) return
  if (data === undefined) {
    console.log(`[auth-debug] ${message}`)
    return
  }
  console.log(`[auth-debug] ${message}`, data)
}

export type MerossCloudHttpOptions = {
  fetch?: typeof fetch
  timeoutMs?: number
  // Override initial domain if you already know it (otherwise defaults to iotx.meross.com).
  domain?: string
  scheme?: 'https' | 'http'
  // Meross supports an encrypted payload mode. This client does not implement it yet,
  // so default to plaintext.
  encryption?: 0 | 1
}

type LoginResult = {
  creds: MerossCloudCredentials
  raw: unknown
}

type LoginParams = {
  email: string
  password: string
  mfaCode?: string
}

const authenticatedPost = async <TData>(
  endpoint: string,
  params: Record<string, unknown>,
  opts: {
    token?: string
    domain: string
    scheme: 'https' | 'http'
    fetchImpl: typeof fetch
    timeoutMs: number
    debugLevel?: 0 | 1 | 2
  },
): Promise<MerossCloudApiResponse<TData>> => {
  const nonce = randomNonce()
  const timestampMs = Date.now()
  const encodedParams = base64(JSON.stringify(params))

  // Per Meross app protocol (as implemented by meross-cloud): md5(SECRET + timestamp + nonce + paramsB64)
  const sign = md5Hex(`${SECRET}${timestampMs}${nonce}${encodedParams}`)

  const payload = {
    params: encodedParams,
    sign,
    timestamp: timestampMs,
    nonce,
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs)
  try {
    const url = `${opts.scheme}://${opts.domain}${endpoint}`
    logAuthDebug(opts.debugLevel ?? 0, 1, 'HTTP request', {
      url,
      endpoint,
      timeoutMs: opts.timeoutMs,
      hasToken: Boolean(opts.token),
      timestampMs,
      nonce,
    })
    logAuthDebug(opts.debugLevel ?? 0, 2, 'HTTP request payload', {
      sign,
      params,
      paramsB64: encodedParams,
    })

    const startedAt = Date.now()
    const headers: Record<string, string> = {
      AppVersion: DEFAULT_APP_VERSION,
      // MerossIot uses header key 'vender' with lowercase value.
      vender: 'meross',
      AppType: DEFAULT_APP_TYPE,
      AppLanguage: 'EN',
      'User-Agent': DEFAULT_UA_HEADER,
      'Content-Type': 'application/json',
      // Match MerossIot: 'Basic' with no token for login.
      Authorization: opts.token ? `Basic ${opts.token}` : 'Basic',
    }

    const res = await opts.fetchImpl(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    })

    const rawText = await res.text().catch(() => '')
    const elapsedMs = Date.now() - startedAt
    logAuthDebug(opts.debugLevel ?? 0, 1, 'HTTP response', {
      url,
      status: res.status,
      ok: res.ok,
      elapsedMs,
    })
    logAuthDebug(opts.debugLevel ?? 0, 2, 'HTTP response raw body', rawText)

    const json = (() => {
      try {
        return rawText ? (JSON.parse(rawText) as MerossCloudApiResponse<TData>) : null
      } catch {
        return null
      }
    })()
    if (!json || typeof json !== 'object' || typeof (json as any).apiStatus !== 'number') {
      throw new MerossCloudError(`Invalid cloud response (${res.status})`)
    }
    logAuthDebug(opts.debugLevel ?? 0, 1, 'Meross API response', {
      url,
      apiStatus: json.apiStatus,
      info: (json as any).info,
      dataKeys: json.data && typeof json.data === 'object' ? Object.keys(json.data as any).slice(0, 12) : [],
    })
    return json
  } finally {
    clearTimeout(timeout)
  }
}

const postWithRedirect = async <TData>(
  endpoint: string,
  params: Record<string, unknown>,
  opts: {
    token?: string
    domain: string
    scheme: 'https' | 'http'
    fetchImpl: typeof fetch
    timeoutMs: number
    debugLevel?: 0 | 1 | 2
  },
): Promise<{ domain: string; resp: MerossCloudApiResponse<TData> }> => {
  let domain = stripScheme(opts.domain)

  for (let attempt = 0; attempt < 2; attempt++) {
    const resp = await authenticatedPost<TData>(endpoint, params, { ...opts, domain })

    // Some accounts get a redirect-like response telling you which regional domain to use.
    // apiStatus 1030 is commonly used for this.
    const nextDomain = (resp as any)?.data?.domain
    if (resp.apiStatus === 1030 && typeof nextDomain === 'string' && nextDomain.length > 0) {
      domain = stripScheme(nextDomain)
      continue
    }

    return { domain, resp }
  }

  // If we somehow loop, return the last known domain.
  const resp = await authenticatedPost<TData>(endpoint, params, { ...opts, domain })
  return { domain, resp }
}

export const merossCloudLogin = async (
  params: LoginParams,
  options: MerossCloudHttpOptions = {},
): Promise<LoginResult> => {
  const fetchImpl = options.fetch ?? fetch
  const timeoutMs = options.timeoutMs ?? 15000
  const domain = stripScheme(options.domain ?? DEFAULT_DOMAIN)
  const scheme = options.scheme ?? 'https'

  const passwordHash = md5Hex(params.password)
  const debugLevel = authDebugLevel()

  if (debugLevel > 0) {
    logAuthDebug(debugLevel, 1, 'Meross signIn payload', {
      email: params.email,
      password: params.password,
      passwordHash,
      mfaCode: params.mfaCode,
      domain,
      scheme,
    })
  }

  const deviceInfo = {
    deviceModel: typeof (os as any).machine === 'function' ? String((os as any).machine()) : process.arch,
    mobileOsVersion: typeof os.release === 'function' ? String(os.release()) : process.version,
    mobileOs: typeof os.platform === 'function' ? String(os.platform()) : process.platform,
    uuid: LOG_IDENTIFIER,
    carrier: '',
  }

  const signInParams: Record<string, unknown> = {
    email: params.email,
    password: passwordHash,
    accountCountryCode: DEFAULT_COUNTRY_CODE,
    agree: 0,
    // MerossIot uses encryption=1; Meross still returns plaintext for this flow.
    encryption: options.encryption ?? 1,
    mobileInfo: deviceInfo,
  }
  if (params.mfaCode) signInParams.mfaCode = params.mfaCode

  const domainCandidates = options.domain
    ? (() => {
        const defaults = DEFAULT_FALLBACK_DOMAINS.map((d) => stripScheme(d))
        if (!defaults.includes(domain as (typeof defaults)[number])) return [domain]
        return [domain, ...defaults.filter((d) => d !== domain)]
      })()
    : Array.from(new Set(DEFAULT_FALLBACK_DOMAINS.map((d) => stripScheme(d))))

  let resolvedDomain = domain
  let resp: MerossCloudApiResponse<any> | null = null

  logAuthDebug(debugLevel, 1, 'Meross signIn domain candidates', { domainCandidates })

  for (let i = 0; i < domainCandidates.length; i++) {
    const candidate = domainCandidates[i]!
    logAuthDebug(debugLevel, 1, 'Meross signIn attempt', { attempt: i + 1, total: domainCandidates.length, domain: candidate })
    const result = await postWithRedirect<any>('/v1/Auth/signIn', signInParams, {
      domain: candidate,
      scheme,
      fetchImpl,
      timeoutMs,
      debugLevel,
    })
    resolvedDomain = result.domain
    resp = result.resp

    if (resp.apiStatus === 0) break

    const canRetryAlternate = resp.apiStatus === 1004 && i < domainCandidates.length - 1
    if (canRetryAlternate) {
      logAuthDebug(debugLevel, 1, 'signIn failed on domain, retrying alternate domain', {
        triedDomain: candidate,
        nextDomain: domainCandidates[i + 1],
        apiStatus: resp.apiStatus,
        info: resp.info,
      })
    }
    if (!canRetryAlternate) break
  }

  if (!resp || resp.apiStatus !== 0) {
    logAuthDebug(debugLevel, 1, 'Meross signIn final failure', {
      apiStatus: resp?.apiStatus,
      info: resp?.info,
      resolvedDomain,
    })
    throw new MerossCloudError(`Cloud signIn failed`, resp?.apiStatus, resp?.info)
  }

  const data = resp.data ?? {}
  const token = String(data.token ?? '')
  const key = String(data.key ?? '')
  const userId = String(data.userid ?? data.userId ?? '')
  const userEmail = String(data.email ?? params.email)
  const mqttDomain = typeof data.mqttDomain === 'string' ? data.mqttDomain : undefined
  const finalDomain = stripScheme(typeof data.domain === 'string' ? data.domain : resolvedDomain)

  if (!token || !key || !userId) {
    throw new MerossCloudError('Cloud signIn did not return token/key/userid')
  }

  return {
    creds: {
      domain: finalDomain,
      mqttDomain,
      token,
      key,
      userId,
      userEmail,
    },
    raw: resp,
  }
}

export const merossCloudListDevices = async (
  creds: MerossCloudCredentials,
  options: MerossCloudHttpOptions = {},
): Promise<MerossCloudDevice[]> => {
  const fetchImpl = options.fetch ?? fetch
  const timeoutMs = options.timeoutMs ?? 15000
  const scheme = options.scheme ?? 'https'

  const { domain, resp } = await postWithRedirect<{ devList: MerossCloudDevice[] }>(
    '/v1/Device/devList',
    {},
    {
      token: creds.token,
      domain: creds.domain,
      scheme,
      fetchImpl,
      timeoutMs,
    },
  )

  if (domain !== creds.domain) {
    // Caller can persist updated domain if desired.
  }

  if (resp.apiStatus !== 0) {
    throw new MerossCloudError('Cloud devList failed', resp.apiStatus, resp.info)
  }

  const devList = extractCloudDeviceList(resp.data)
  if (!devList) {
    const data: any = resp.data as any
    const dataType = data === null ? 'null' : Array.isArray(data) ? 'array' : typeof data
    const keys = data && typeof data === 'object' && !Array.isArray(data) ? Object.keys(data).slice(0, 20) : []

    // Keep the original error string for compatibility, but add enough metadata to debug.
    throw new MerossCloudError(
      `Cloud devList response missing devList[] (dataType=${dataType}${keys.length ? ` keys=${keys.join(',')}` : ''})`,
    )
  }
  return devList
}

const isDeviceLike = (v: any): v is MerossCloudDevice =>
  Boolean(v && typeof v === 'object' && typeof v.uuid === 'string')

const coerceJson = (v: unknown): unknown => {
  if (typeof v !== 'string') return v
  const s = v.trim()
  if (!s) return v
  if (!(s.startsWith('{') || s.startsWith('['))) return v
  try {
    return JSON.parse(s)
  } catch {
    return v
  }
}

const isDeviceList = (v: unknown): v is MerossCloudDevice[] => {
  if (!Array.isArray(v)) return false
  if (v.length === 0) return true
  return isDeviceLike(v[0])
}

const extractCloudDeviceList = (data: unknown): MerossCloudDevice[] | null => {
  const coerced = coerceJson(data)

  if (isDeviceList(coerced)) return coerced

  if (!coerced || typeof coerced !== 'object') return null

  const obj: any = coerced as any
  const candidates = [
    obj.devList,
    obj.deviceList,
    obj.list,
    obj.devices,
    obj.data?.devList,
    obj.data?.deviceList,
    obj.data?.list,
    obj.payload ? coerceJson(obj.payload) : undefined,
  ].map(coerceJson)

  for (const c of candidates) {
    if (isDeviceList(c)) return c
    if (c && typeof c === 'object') {
      const nested: any = c as any
      if (isDeviceList(nested.devList)) return nested.devList
      if (isDeviceList(nested.list)) return nested.list
      if (isDeviceList(nested.devices)) return nested.devices
    }
  }

  return null
}
