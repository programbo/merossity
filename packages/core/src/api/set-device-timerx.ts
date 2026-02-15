import { setTimerX } from '../meross'
import { apiErr, apiOk, parseJsonBody, requireLanHost, requireLanKey } from './shared'
import type { StatePollerService } from './state-poller'

const isRecord = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === 'object' && !Array.isArray(v))

export const createSetDeviceTimerXHandler = (poller?: StatePollerService) => ({
  /**
   * Function: Create/update a TimerX rule over LAN by sending a full timer object.
   * Input: POST JSON `{ uuid, timer }` where `timer.id` is required.
   * Output: `{ ok: true, data: { host, id, resp } }`, or `{ ok: false, error }`.
   */
  async POST(req: Request) {
    const body = (await parseJsonBody(req)) ?? {}
    const uuid = String(body.uuid ?? '')
    const timer = isRecord(body.timer) ? body.timer : null
    const id = String(timer?.id ?? '').trim()

    if (!uuid) return apiErr('Missing uuid', 'missing_uuid')
    if (!timer) return apiErr('Missing timer', 'missing_timer')
    if (!id) return apiErr('Missing timer.id', 'missing_id')

    try {
      const host = await requireLanHost(uuid)
      const key = await requireLanKey()
      const resp = await setTimerX<any>({ host, key, timer })
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

