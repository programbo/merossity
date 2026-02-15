import { setLight, setToggleX } from '../meross'
import { apiErr, apiOk, parseJsonBody, readConfig, requireLanHost, requireLanKey } from './shared'
import type { StatePollerService } from './state-poller'

export const createToggleDeviceHandler = (poller?: StatePollerService) => ({
  /**
   * Function: Set a device's primary on/off state over LAN.
   * Notes:
   * - For smart bulbs (e.g. MSL*), this uses `Appliance.Control.Light`.
   * - Otherwise, it uses `Appliance.Control.ToggleX`.
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
      const cfg = await readConfig()
      const cloudDevice = (cfg.devices?.list ?? []).find((d) => String((d as any)?.uuid ?? '') === uuid) as any
      const model = String(cloudDevice?.deviceType ?? '').trim().toUpperCase()
      const preferLight = model.startsWith('MSL') || model.includes('LIGHT')

      let resp: any
      if (preferLight) {
        try {
          resp = await setLight<any>({ host, key, channel, onoff })
        } catch {
          resp = await setToggleX<any>({ host, key, channel, onoff })
        }
      } else {
        try {
          resp = await setToggleX<any>({ host, key, channel, onoff })
        } catch {
          resp = await setLight<any>({ host, key, channel, onoff })
        }
      }
      if (poller) {
        poller.boostDevice(uuid)
        void poller.pollNow({ uuids: [uuid], reason: 'manual' }).catch(() => {})
      }
      return apiOk({ host, channel, onoff, resp })
    } catch (e) {
      return apiErr(e instanceof Error ? e.message : String(e), 'lan_error')
    }
  },
})
