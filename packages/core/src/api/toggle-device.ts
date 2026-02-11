import { setToggleX } from '../meross'
import { apiErr, apiOk, parseJsonBody, requireLanHost, requireLanKey } from './shared'

export const createToggleDeviceHandler = () => ({
  /**
   * Function: Set ToggleX on/off state for a device channel over LAN.
   * Input: POST JSON `{ uuid, channel?, onoff }` (`channel` defaults to `0`, `onoff` coerced to `0 | 1`).
   * Output: `{ ok: true, data: { host, channel, onoff, resp } }`, or `{ ok: false, error }`.
   */
  async POST(req: Request) {
    const body = (await parseJsonBody(req)) ?? {}
    const uuid = String(body.uuid ?? '')
    const channel = body.channel === undefined ? 0 : Number(body.channel)
    const onoff = Number(body.onoff) === 1 ? 1 : 0
    if (!uuid) return apiErr('Missing uuid', 'missing_uuid')
    if (!Number.isInteger(channel) || channel < 0) return apiErr('Invalid channel', 'invalid_channel')

    try {
      const host = await requireLanHost(uuid)
      const key = await requireLanKey()
      const resp = await setToggleX<any>({ host, key, channel, onoff })
      return apiOk({ host, channel, onoff, resp })
    } catch (e) {
      return apiErr(e instanceof Error ? e.message : String(e), 'lan_error')
    }
  },
})
