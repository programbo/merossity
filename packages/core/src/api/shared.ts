import {
  MerossCloudError,
  defaultMerossConfigPath,
  loadMerossConfig,
  saveMerossConfig,
  type MerossCloudCredentials,
  type MerossConfig,
} from '../meross'
import { applySecurityHeaders } from './applySecurityHeaders'

export type ApiOk<T> = { ok: true; data: T }
export type ApiErr = { ok: false; error: { message: string; code?: string; details?: unknown } }

export const apiOk = <T>(data: T): Response => jsonContent({ ok: true, data })

export const apiErr = (message: string, code?: string, details?: unknown, init?: ResponseInit): Response =>
  jsonContent(
    {
      ok: false,
      error: { message, code, details },
    },
    init,
  )

export const jsonContent = <T = unknown>(data: ApiOk<T> | ApiErr, init?: ResponseInit): Response =>
  applySecurityHeaders(Response.json(data, init))

export const htmlContent = (body: BodyInit): Response => {
  const headers = new Headers()
  headers.set('Content-Type', 'text/html; charset=utf-8')
  return applySecurityHeaders(new Response(body, { headers }))
}

export const nowIso = () => new Date().toISOString()

export const parseJsonBody = async (req: Request) => {
  const ct = req.headers.get('content-type') ?? ''
  if (!ct.toLowerCase().includes('application/json')) return null
  return (await req.json().catch(() => null)) as any
}

export const configPath = () => process.env.MEROSS_CONFIG_PATH || defaultMerossConfigPath()

export const readConfig = async (): Promise<MerossConfig> => await loadMerossConfig(configPath())

export const writeConfig = async (next: MerossConfig) => await saveMerossConfig(next, configPath())

export const summarizeCloud = (cloud: MerossCloudCredentials) => ({
  domain: cloud.domain,
  mqttDomain: cloud.mqttDomain,
  userId: cloud.userId,
  userEmail: cloud.userEmail,
  key: cloud.key,
  tokenRedacted: cloud.token ? `${cloud.token.slice(0, 4)}…${cloud.token.slice(-4)}` : '',
})

export const inferMfaRequired = (e: unknown) => {
  if (!(e instanceof MerossCloudError)) return false
  const info = (e.info ?? '').toLowerCase()
  // Best-effort: Meross cloud uses a variety of info strings.
  return info.includes('mfa') || info.includes('totp') || info.includes('verify') || info.includes('verification')
}

export const requireLanHost = async (uuid: string) => {
  const cfg = await readConfig()
  const host = cfg.hosts?.[uuid]?.host
  if (!host) throw new Error(`No LAN host known for device uuid=${uuid}. Resolve host first.`)
  return host
}

export const requireLanKey = async () => {
  const cfg = await readConfig()
  const key = cfg.cloud?.key || process.env.MEROSS_KEY
  if (!key) throw new Error('Missing Meross key. Login (cloud) or set MEROSS_KEY.')
  return key
}

export type LanToggleXState = { channel: number; onoff: 0 | 1 }

export const extractLanToggleX = (resp: any): LanToggleXState[] | null => {
  const candidates = [
    resp?.payload?.all?.digest?.togglex,
    resp?.payload?.all?.digest?.toggleX,
    resp?.payload?.all?.digest?.toggle,
    resp?.payload?.all?.digest?.togglex?.togglex,
  ]

  for (const c of candidates) {
    if (!c) continue

    const arr: any[] = Array.isArray(c) ? c : [c]
    const out: LanToggleXState[] = []

    for (const item of arr) {
      const channel = Number(item?.channel)
      const onoffNum = Number(item?.onoff)
      if (!Number.isInteger(channel) || channel < 0) continue
      const onoff: 0 | 1 = onoffNum === 1 ? 1 : 0
      out.push({ channel, onoff })
    }

    if (out.length) return out.sort((a, b) => a.channel - b.channel)
  }

  return null
}

export type LanLightState = {
  channel: number
  onoff: 0 | 1
  luminance?: number
  temperature?: number
  // Common Meross bulbs report packed RGB as an integer (0xRRGGBB).
  rgb?: number
}

const coerceFiniteNumber = (v: unknown): number | null => {
  const n = typeof v === 'string' && v.trim() ? Number(v) : typeof v === 'number' ? v : NaN
  return Number.isFinite(n) ? n : null
}

const coerceRgb = (v: unknown): number | null => {
  const n = coerceFiniteNumber(v)
  if (n !== null) return Math.round(n)

  if (Array.isArray(v) && v.length >= 3) {
    const r = coerceFiniteNumber(v[0])
    const g = coerceFiniteNumber(v[1])
    const b = coerceFiniteNumber(v[2])
    if (r === null || g === null || b === null) return null
    if (![r, g, b].every((c) => Number.isInteger(c) && c >= 0 && c <= 255)) return null
    return ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff)
  }

  if (v && typeof v === 'object') {
    const anyV = v as any
    const r = coerceFiniteNumber(anyV?.r ?? anyV?.red)
    const g = coerceFiniteNumber(anyV?.g ?? anyV?.green)
    const b = coerceFiniteNumber(anyV?.b ?? anyV?.blue)
    if (r === null || g === null || b === null) return null
    if (![r, g, b].every((c) => Number.isInteger(c) && c >= 0 && c <= 255)) return null
    return ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff)
  }

  return null
}

export const extractLanLight = (resp: any): LanLightState[] | null => {
  const candidates = [
    resp?.payload?.all?.digest?.light,
    resp?.payload?.all?.digest?.light?.light,
    resp?.payload?.all?.digest?.lamp,
    resp?.payload?.all?.digest?.lamp?.lamp,
  ]

  for (const c of candidates) {
    if (!c) continue

    const arr: any[] = Array.isArray(c) ? c : [c]
    const out: LanLightState[] = []

    for (const item of arr) {
      const channel = Number(item?.channel)
      const onoffNum = Number(item?.onoff ?? item?.state)
      if (!Number.isInteger(channel) || channel < 0) continue
      const onoff: 0 | 1 = onoffNum === 1 ? 1 : 0

      const luminance =
        coerceFiniteNumber(item?.luminance ?? item?.brightness ?? item?.luma ?? item?.lum) ?? undefined
      const temperature =
        coerceFiniteNumber(item?.temperature ?? item?.temp ?? item?.colorTemp ?? item?.colortemp) ?? undefined
      const rgb = coerceRgb(item?.rgb) ?? undefined

      out.push({
        channel,
        onoff,
        ...(luminance !== undefined ? { luminance } : {}),
        ...(temperature !== undefined ? { temperature } : {}),
        ...(rgb !== undefined ? { rgb } : {}),
      })
    }

    if (out.length) return out.sort((a, b) => a.channel - b.channel)
  }

  return null
}

export type LanScheduleDigestEntry = { channel: number; id: string; count: number }

const extractLanScheduleDigest = (resp: any, kind: 'timerx' | 'triggerx'): LanScheduleDigestEntry[] => {
  const candidates = [
    resp?.payload?.all?.digest?.[kind],
    // Some firmwares nest digest keys one level down.
    resp?.payload?.all?.digest?.[kind]?.[kind],
  ]

  for (const c of candidates) {
    if (!c) continue

    const arr: any[] = Array.isArray(c) ? c : [c]
    const out: LanScheduleDigestEntry[] = []

    for (const item of arr) {
      const channel = Number(item?.channel)
      const id = String(item?.id ?? '').trim()
      const countRaw = coerceFiniteNumber(item?.count)

      if (!Number.isInteger(channel) || channel < 0) continue
      if (!id) continue
      const count = countRaw === null ? 0 : Math.max(0, Math.round(countRaw))

      out.push({ channel, id, count })
    }

    return out.sort((a, b) => a.channel - b.channel || a.id.localeCompare(b.id))
  }

  return []
}

export const extractLanTimerXDigest = (resp: any): LanScheduleDigestEntry[] => extractLanScheduleDigest(resp, 'timerx')

export const extractLanTriggerXDigest = (resp: any): LanScheduleDigestEntry[] =>
  extractLanScheduleDigest(resp, 'triggerx')
