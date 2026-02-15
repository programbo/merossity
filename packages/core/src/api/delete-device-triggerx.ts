import { getTriggerX, setTriggerX } from '../meross'
import { apiErr, apiOk, parseJsonBody, requireLanHost, requireLanKey } from './shared'
import type { StatePollerService } from './state-poller'

const isRecord = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === 'object' && !Array.isArray(v))

const asTriggerRuleRecord = (v: unknown): Record<string, unknown> | null => {
  if (!v) return null
  if (Array.isArray(v)) {
    for (const item of v) {
      const rec = asTriggerRuleRecord(item)
      if (rec) return rec
    }
    return null
  }
  if (!isRecord(v)) return null
  if (typeof v.id === 'string' && v.id.trim()) return v
  if ('triggerx' in v) return asTriggerRuleRecord((v as any).triggerx)
  return null
}

const lanErrorCode = (resp: any): number | null => {
  const code = resp?.payload?.error?.code
  const n = typeof code === 'string' && code.trim() ? Number(code) : typeof code === 'number' ? code : NaN
  return Number.isFinite(n) ? Math.round(n) : null
}

export const createDeleteDeviceTriggerXHandler = (poller?: StatePollerService) => ({
  /**
   * Function: Delete a TriggerX rule over LAN (best-effort).
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

      let rule: Record<string, unknown> | null = null
      const currentResp = await getTriggerX<any>({ host, key, id }).catch(() => null)
      rule = currentResp ? asTriggerRuleRecord(currentResp?.payload?.triggerx) : null

      // If we couldn't parse, fall back to a minimal payload.
      const base = rule ?? { id }

      let deleted = false
      let disabled = false
      let resp: any = null

      ;(base as any).enable = -1
      resp = await setTriggerX<any>({ host, key, trigger: base })
      const code = lanErrorCode(resp)
      if (code === null || code === 0) {
        deleted = true
      } else {
        ;(base as any).enable = 0
        resp = await setTriggerX<any>({ host, key, trigger: base })
        const code2 = lanErrorCode(resp)
        if (code2 !== null && code2 !== 0) {
          return apiErr(`TriggerX delete failed (error code ${code2})`, 'triggerx_delete_failed', resp)
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

