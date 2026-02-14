import { apiErr, apiOk, parseJsonBody } from './shared'
import type { StatePollerService } from './state-poller'

export const createGetDeviceStatesHandler = (poller: StatePollerService) => ({
  /**
   * Function: Poll one or many LAN-resolved devices and return current state payloads.
   * Input: POST JSON `{ uuids?: string[], reason?: "manual" | "poller", timeoutMs?: number }`.
   * Output: `{ ok: true, data: { polledAt, states, errors } }`, or `{ ok: false, error }`.
   */
  async POST(req: Request) {
    const body = (await parseJsonBody(req)) ?? {}
    const uuidsRaw = body.uuids
    const uuids = Array.isArray(uuidsRaw) ? uuidsRaw.map((v) => String(v ?? '')).filter(Boolean) : undefined
    const reason = body.reason === 'poller' ? 'poller' : 'manual'
    const timeoutMs = body.timeoutMs !== undefined ? Number(body.timeoutMs) : undefined

    if (uuids && uuids.some((u) => !u.trim())) return apiErr('Invalid uuids', 'invalid_uuids')
    if (timeoutMs !== undefined && (!Number.isFinite(timeoutMs) || timeoutMs <= 0)) {
      return apiErr('Invalid timeoutMs', 'invalid_timeout')
    }

    const result = await poller.pollNow({
      uuids: uuids?.map((u) => u.trim()).filter(Boolean),
      reason,
      timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : undefined,
    })
    return apiOk(result)
  },
})

