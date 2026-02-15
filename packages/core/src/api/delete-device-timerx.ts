import { getTimerX, setTimerX } from '../meross'
import { apiErr, apiOk, parseJsonBody, requireLanHost, requireLanKey } from './shared'
import type { StatePollerService } from './state-poller'

const isRecord = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === 'object' && !Array.isArray(v))

const asTimerRuleRecord = (v: unknown): Record<string, unknown> | null => {
  if (!v) return null
  if (Array.isArray(v)) {
    for (const item of v) {
      const rec = asTimerRuleRecord(item)
      if (rec) return rec
    }
    return null
  }
  if (!isRecord(v)) return null
  if (typeof v.id === 'string' && v.id.trim()) return v
  if ('timerx' in v) return asTimerRuleRecord((v as any).timerx)
  return null
}

const lanErrorCode = (resp: any): number | null => {
  const code = resp?.payload?.error?.code
  const n = typeof code === 'string' && code.trim() ? Number(code) : typeof code === 'number' ? code : NaN
  return Number.isFinite(n) ? Math.round(n) : null
}

export const createDeleteDeviceTimerXHandler = (poller?: StatePollerService) => ({
  /**
   * Function: Delete a TimerX rule over LAN (best-effort).
   * Input: POST JSON `{ uuid, id }`.
   * Output: `{ ok: true, data: { host, id, deleted, disabled, resp } }`, or `{ ok: false, error }`.
   */
  async POST(req: Request) {
    const body = (await parseJsonBody(req)) ?? {}
    const uuid = String(body.uuid ?? '')
    const id = String(body.id ?? '').trim()
    if (!uuid) return apiErr('Missing uuid', 'missing_uuid')
    if (!id) return apiErr('Missing id', 'missing_id')

    try {
      const host = await requireLanHost(uuid)
      const key = await requireLanKey()

      // Prefer deleting by mutating the existing rule (preserves required fields).
      const currentResp = await getTimerX<any>({ host, key, id })
      const currentRule = asTimerRuleRecord(currentResp?.payload?.timerx)
      if (!currentRule) return apiErr('TimerX rule not found in response', 'timerx_not_found')

      let deleted = false
      let disabled = false
      let resp: any = null

      // Attempt hard delete: `enable = -1` (observed convention in Meross payloads).
      ;(currentRule as any).enable = -1
      resp = await setTimerX<any>({ host, key, timer: currentRule })
      const code = lanErrorCode(resp)
      if (code === null || code === 0) {
        deleted = true
      } else {
        // Fallback to soft delete: disable.
        ;(currentRule as any).enable = 0
        resp = await setTimerX<any>({ host, key, timer: currentRule })
        const code2 = lanErrorCode(resp)
        if (code2 !== null && code2 !== 0) {
          return apiErr(`TimerX delete failed (error code ${code2})`, 'timerx_delete_failed', resp)
        }
        disabled = true
      }

      if (poller) {
        poller.boostDevice(uuid)
        void poller.pollNow({ uuids: [uuid], reason: 'manual' }).catch(() => {})
      }

      return apiOk({ host, id, deleted, disabled, resp })
    } catch (e) {
      return apiErr(e instanceof Error ? e.message : String(e), 'lan_error')
    }
  },
})

