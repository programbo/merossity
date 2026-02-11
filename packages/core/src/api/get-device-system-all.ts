import { getSystemAll } from '../meross'
import { apiErr, apiOk, parseJsonBody, requireLanHost, requireLanKey } from './shared'

export const createGetDeviceSystemAllHandler = () => ({
  /**
   * Function: Fetch `Appliance.System.All` payload from a known LAN device host.
   * Input: POST JSON `{ uuid }`.
   * Output: `{ ok: true, data: { host, data } }`, or `{ ok: false, error }`.
   */
  async POST(req: Request) {
    const body = (await parseJsonBody(req)) ?? {}
    const uuid = String(body.uuid ?? '')
    if (!uuid) return apiErr('Missing uuid', 'missing_uuid')

    try {
      const host = await requireLanHost(uuid)
      const key = await requireLanKey()
      const data = await getSystemAll<any>({ host, key })
      return apiOk({ host, data })
    } catch (e) {
      return apiErr(e instanceof Error ? e.message : String(e), 'lan_error')
    }
  },
})
