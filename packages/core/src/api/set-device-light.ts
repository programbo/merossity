import { setLight } from '../meross'
import { apiErr, apiOk, parseJsonBody, requireLanHost, requireLanKey } from './shared'
import type { StatePollerService } from './state-poller'

const clampInt = (v: unknown, min: number, max: number): number | null => {
  const n = typeof v === 'string' && v.trim() ? Number(v) : typeof v === 'number' ? v : NaN
  if (!Number.isFinite(n)) return null
  const rounded = Math.round(n)
  return Math.max(min, Math.min(max, rounded))
}

export const createSetDeviceLightHandler = (poller?: StatePollerService) => ({
  /**
   * Function: Set smart-bulb light state over LAN.
   * Input: POST JSON `{ uuid, channel?, onoff?, luminance?, temperature?, rgb? }`.
   * Output: `{ ok: true, data: { host, channel, resp } }`, or `{ ok: false, error }`.
   */
  async POST(req: Request) {
    const body = (await parseJsonBody(req)) ?? {}
    const uuid = String(body.uuid ?? '')
    const channel = body.channel === undefined ? 0 : Number(body.channel)
    if (!uuid) return apiErr('Missing uuid', 'missing_uuid')
    if (!Number.isInteger(channel) || channel < 0) return apiErr('Invalid channel', 'invalid_channel')

    const onoffRaw = body.onoff
    const onoff = onoffRaw === undefined ? undefined : Number(onoffRaw) === 1 ? 1 : 0

    let luminance: number | undefined
    if (body.luminance !== undefined) {
      const n = clampInt(body.luminance, 0, 100)
      if (n === null) return apiErr('Invalid luminance', 'invalid_luminance')
      luminance = n
    }

    let temperature: number | undefined
    if (body.temperature !== undefined) {
      const n = clampInt(body.temperature, 0, 100)
      if (n === null) return apiErr('Invalid temperature', 'invalid_temperature')
      temperature = n
    }

    let rgb: number | undefined
    if (body.rgb !== undefined) {
      const n = clampInt(body.rgb, 0, 0xffffff)
      if (n === null) return apiErr('Invalid rgb', 'invalid_rgb')
      rgb = n
    }
    if (onoff === undefined && luminance === undefined && temperature === undefined && rgb === undefined) {
      return apiErr('No light fields provided', 'missing_fields')
    }

    try {
      const host = await requireLanHost(uuid)
      const key = await requireLanKey()
      const resp = await setLight<any>({
        host,
        key,
        channel,
        ...(onoff !== undefined ? { onoff } : {}),
        ...(luminance !== undefined ? { luminance } : {}),
        ...(temperature !== undefined ? { temperature } : {}),
        ...(rgb !== undefined ? { rgb } : {}),
      })
      if (poller) {
        poller.boostDevice(uuid)
        void poller.pollNow({ uuids: [uuid], reason: 'manual' }).catch(() => {})
      }
      return apiOk({ host, channel, resp })
    } catch (e) {
      return apiErr(e instanceof Error ? e.message : String(e), 'lan_error')
    }
  },
})
