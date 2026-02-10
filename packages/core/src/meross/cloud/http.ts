import crypto from 'node:crypto'

import type { MerossCloudApiResponse, MerossCloudCredentials, MerossCloudDevice } from './types'
import { MerossCloudError } from './types'

const SECRET = '23x17ahWarFH6w29'
const DEFAULT_DOMAIN = 'iotx.meross.com'

const md5Hex = (s: string): string => crypto.createHash('md5').update(s, 'utf8').digest('hex')
const base64 = (s: string): string => Buffer.from(s, 'utf8').toString('base64')

const randomNonce = (): string => crypto.randomBytes(16).toString('hex')

const stripScheme = (domain: string): string => domain.replace(/^https?:\/\//, '').replace(/\/+$/, '')

export type MerossCloudHttpOptions = {
  fetch?: typeof fetch
  timeoutMs?: number
  // Override initial domain if you already know it (otherwise defaults to iotx.meross.com).
  domain?: string
  scheme?: 'https' | 'http'
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
  },
): Promise<MerossCloudApiResponse<TData>> => {
  const nonce = randomNonce()
  const timestampMs = Date.now()
  const encodedParams = base64(JSON.stringify(params))

  // Per Meross app protocol (as implemented by meross-cloud): md5(SECRET + timestamp + nonce + paramsB64)
  const sign = md5Hex(`${SECRET}${timestampMs}${nonce}${encodedParams}`)

  const body = new URLSearchParams()
  body.set('params', encodedParams)
  body.set('sign', sign)
  body.set('timestamp', String(timestampMs))
  body.set('nonce', nonce)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs)
  try {
    const url = `${opts.scheme}://${opts.domain}${endpoint}`
    const res = await opts.fetchImpl(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${opts.token ?? ''}`,
        Vendor: 'Meross',
        AppVersion: '1.3.0',
        AppLanguage: 'en',
        'User-Agent': 'okhttp/3.6.0',
      },
      body,
      signal: controller.signal,
    })

    const json = (await res.json().catch(() => null)) as MerossCloudApiResponse<TData> | null
    if (!json || typeof json !== 'object' || typeof (json as any).apiStatus !== 'number') {
      throw new MerossCloudError(`Invalid cloud response (${res.status})`)
    }
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

export const merossCloudLogin = async (params: LoginParams, options: MerossCloudHttpOptions = {}): Promise<LoginResult> => {
  const fetchImpl = options.fetch ?? fetch
  const timeoutMs = options.timeoutMs ?? 15000
  const domain = stripScheme(options.domain ?? DEFAULT_DOMAIN)
  const scheme = options.scheme ?? 'https'

  const passwordHash = md5Hex(params.password)

  const deviceInfo = {
    os: process.platform,
    osVersion: process.version,
    uuid: crypto.randomUUID(),
    model: 'Bun',
  }

  const signInParams: Record<string, unknown> = {
    email: params.email,
    password: passwordHash,
    accountCountryCode: '',
    agree: 1,
    // Many clients set encryption=1 even if they don't implement encrypted payloads.
    encryption: 1,
    mobileInfo: deviceInfo,
  }
  if (params.mfaCode) signInParams.mfaCode = params.mfaCode

  const { domain: resolvedDomain, resp } = await postWithRedirect<any>('/v1/Auth/signIn', signInParams, {
    domain,
    scheme,
    fetchImpl,
    timeoutMs,
  })

  if (resp.apiStatus !== 0) {
    throw new MerossCloudError(`Cloud signIn failed`, resp.apiStatus, resp.info)
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

  const devList = (resp.data as any)?.devList
  if (!Array.isArray(devList)) {
    throw new MerossCloudError('Cloud devList response missing devList[]')
  }
  return devList as MerossCloudDevice[]
}
