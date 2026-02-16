import { getElectricity } from '../meross'
import { apiErr, apiOk, extractLanElectricity, parseJsonBody, requireLanHost, requireLanKey } from './shared'

export const createGetDeviceElectricityHandler = () => ({
  /**
   * Function: Fetch live electricity telemetry from a LAN device.
   * Input: POST JSON `{ uuid, channel? }` (`channel` defaults to `0`).
   * Output: `{ ok: true, data: { host, reading } }`.
   */
  async POST(req: Request) {
    const body = (await parseJsonBody(req)) ?? {}
    const uuid = String(body.uuid ?? '').trim()
    const channel = body.channel === undefined ? 0 : Number(body.channel)
    if (!uuid) return apiErr('Missing uuid', 'missing_uuid')
    if (!Number.isInteger(channel) || channel < 0) return apiErr('Invalid channel', 'invalid_channel')

    try {
      const host = await requireLanHost(uuid)
      const key = await requireLanKey()
      const resp = await getElectricity<any>({ host, key, channel, timeoutMs: 3000 })
      const reading = extractLanElectricity(resp)
      if (!reading) return apiErr('Electricity data unavailable', 'telemetry_unavailable', { uuid, host })
      return apiOk({ host, reading })
    } catch (e) {
      return apiErr(e instanceof Error ? e.message : String(e), 'lan_error')
    }
  },
})

