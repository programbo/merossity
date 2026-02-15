import { setTriggerX } from '../meross'
import { apiErr, apiOk, parseJsonBody, requireLanHost, requireLanKey } from './shared'
import type { StatePollerService } from './state-poller'

const isRecord = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === 'object' && !Array.isArray(v))

export const createSetDeviceTriggerXHandler = (poller?: StatePollerService) => ({
  /**
   * Function: Create/update a TriggerX rule over LAN by sending a full trigger object.
   * Input: POST JSON `{ uuid, trigger }` where `trigger.id` is required.
   * Output: `{ ok: true, data: { host, id, resp } }`, or `{ ok: false, error }`.
   */
  async POST(req: Request) {
    const body = (await parseJsonBody(req)) ?? {}
    const uuid = String(body.uuid ?? '')
    const trigger = isRecord(body.trigger) ? body.trigger : null
    const id = String(trigger?.id ?? '').trim()

    if (!uuid) return apiErr('Missing uuid', 'missing_uuid')
    if (!trigger) return apiErr('Missing trigger', 'missing_trigger')
    if (!id) return apiErr('Missing trigger.id', 'missing_id')

    try {
      const host = await requireLanHost(uuid)
      const key = await requireLanKey()
      const resp = await setTriggerX<any>({ host, key, trigger })
      if (poller) {
        poller.boostDevice(uuid)
        void poller.pollNow({ uuids: [uuid], reason: 'manual' }).catch(() => {})
      }
      return apiOk({ host, id, resp })
    } catch (e) {
      return apiErr(e instanceof Error ? e.message : String(e), 'lan_error')
    }
  },
})

