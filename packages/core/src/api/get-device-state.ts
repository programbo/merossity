import { getSystemAll } from '../meross'
import { apiErr, apiOk, extractLanToggleX, parseJsonBody, requireLanHost, requireLanKey } from './shared'

export const createGetDeviceStateHandler = () => ({
  /**
   * Function: Read current ToggleX on/off state for a device channel from LAN system digest.
   * Input: POST JSON `{ uuid, channel? }` (`channel` defaults to `0`).
   * Output: `{ ok: true, data: { host, channel, onoff, channels } }`, or `{ ok: false, error }`.
   */
  async POST(req: Request) {
    const body = (await parseJsonBody(req)) ?? {}
    const uuid = String(body.uuid ?? '')
    const channel = body.channel === undefined ? 0 : Number(body.channel)
    if (!uuid) return apiErr('Missing uuid', 'missing_uuid')
    if (!Number.isInteger(channel) || channel < 0) return apiErr('Invalid channel', 'invalid_channel')

    try {
      const host = await requireLanHost(uuid)
      const key = await requireLanKey()
      // Keep this a bit snappier than a full system dump fetch.
      const data = await getSystemAll<any>({ host, key, timeoutMs: 3000 })
      const togglex = extractLanToggleX(data)
      const match = togglex?.find((t) => t.channel === channel) ?? null
      if (!match) {
        return apiErr('ToggleX state not found in Appliance.System.All digest', 'state_unavailable')
      }
      return apiOk({ host, channel: match.channel, onoff: match.onoff, channels: togglex })
    } catch (e) {
      return apiErr(e instanceof Error ? e.message : String(e), 'lan_error')
    }
  },
})
