import { getTimerX, setTimerX } from '../meross'
import { apiErr, apiOk, parseJsonBody, requireLanHost, requireLanKey } from './shared'
import type { StatePollerService } from './state-poller'
import type { TimerXRule } from './get-device-timerx'

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

const coerce01 = (v: unknown): 0 | 1 => (Number(v) === 1 ? 1 : 0)

const parseTimerXRule = (raw: Record<string, unknown>): TimerXRule => ({
  id: String(raw.id ?? '').trim(),
  ...(raw.enable !== undefined ? { enable: coerce01(raw.enable) } : {}),
  ...(raw.channel !== undefined ? { channel: Number(raw.channel) } : {}),
  ...(raw.alias !== undefined ? { alias: String(raw.alias ?? '') } : {}),
  ...(raw.type !== undefined ? { type: Number(raw.type) } : {}),
  ...(raw.week !== undefined ? { week: Number(raw.week) } : {}),
  ...(raw.time !== undefined ? { time: Number(raw.time) } : {}),
  ...(raw.sunOffset !== undefined ? { sunOffset: Number(raw.sunOffset) } : {}),
  ...(raw.duration !== undefined ? { duration: Number(raw.duration) } : {}),
  ...(raw.extend !== undefined ? { extend: raw.extend } : {}),
})

export const createPatchDeviceTimerXHandler = (poller?: StatePollerService) => ({
  /**
   * Function: Patch TimerX fields over LAN by mutating the existing rule and SET-ing it back.
   * Input: POST JSON `{ uuid, id, patch: { enable?, toggleOnoff?, alias?, channel?, type?, week?, time?, sunOffset?, duration? } }`.
   * Output: `{ ok: true, data: { host, id, updated, resp } }`, or `{ ok: false, error }`.
   */
  async POST(req: Request) {
    const body = (await parseJsonBody(req)) ?? {}
    const uuid = String(body.uuid ?? '')
    const id = String(body.id ?? '').trim()
    const patch = isRecord(body.patch) ? body.patch : {}

    if (!uuid) return apiErr('Missing uuid', 'missing_uuid')
    if (!id) return apiErr('Missing id', 'missing_id')

    const enableRaw = patch.enable
    const toggleOnoffRaw = patch.toggleOnoff
    const aliasRaw = patch.alias
    const channelRaw = patch.channel
    const typeRaw = patch.type
    const weekRaw = patch.week
    const timeRaw = patch.time
    const sunOffsetRaw = patch.sunOffset
    const durationRaw = patch.duration

    const wantsEnable = enableRaw !== undefined
    const wantsToggleOnoff = toggleOnoffRaw !== undefined
    const wantsAlias = aliasRaw !== undefined
    const wantsChannel = channelRaw !== undefined
    const wantsType = typeRaw !== undefined
    const wantsWeek = weekRaw !== undefined
    const wantsTime = timeRaw !== undefined
    const wantsSunOffset = sunOffsetRaw !== undefined
    const wantsDuration = durationRaw !== undefined
    if (
      !wantsEnable &&
      !wantsToggleOnoff &&
      !wantsAlias &&
      !wantsChannel &&
      !wantsType &&
      !wantsWeek &&
      !wantsTime &&
      !wantsSunOffset &&
      !wantsDuration
    ) {
      return apiErr('No patch fields provided', 'missing_fields')
    }

    const enable: 0 | 1 | undefined = wantsEnable ? (Number(enableRaw) === 1 ? 1 : 0) : undefined
    const toggleOnoff: 0 | 1 | undefined = wantsToggleOnoff ? (Number(toggleOnoffRaw) === 1 ? 1 : 0) : undefined

    const asFiniteInt = (v: unknown): number | null => {
      const n = typeof v === 'string' && v.trim() ? Number(v) : typeof v === 'number' ? v : NaN
      if (!Number.isFinite(n)) return null
      return Math.round(n)
    }

    try {
      const host = await requireLanHost(uuid)
      const key = await requireLanKey()

      const currentResp = await getTimerX<any>({ host, key, id })
      const currentRule = asTimerRuleRecord(currentResp?.payload?.timerx)
      if (!currentRule) return apiErr('TimerX rule not found in response', 'timerx_not_found')

      if (enable !== undefined) currentRule.enable = enable
      if (wantsAlias) currentRule.alias = String(aliasRaw ?? '')
      if (wantsChannel) {
        const n = asFiniteInt(channelRaw)
        if (n === null || n < 0) return apiErr('Invalid channel', 'invalid_channel')
        currentRule.channel = n
      }
      if (wantsType) {
        const n = asFiniteInt(typeRaw)
        if (n === null) return apiErr('Invalid type', 'invalid_type')
        currentRule.type = n
      }
      if (wantsWeek) {
        const n = asFiniteInt(weekRaw)
        if (n === null) return apiErr('Invalid week', 'invalid_week')
        currentRule.week = n
      }
      if (wantsTime) {
        const n = asFiniteInt(timeRaw)
        if (n === null) return apiErr('Invalid time', 'invalid_time')
        currentRule.time = n
      }
      if (wantsSunOffset) {
        const n = asFiniteInt(sunOffsetRaw)
        if (n === null) return apiErr('Invalid sunOffset', 'invalid_sunoffset')
        currentRule.sunOffset = n
      }
      if (wantsDuration) {
        const n = asFiniteInt(durationRaw)
        if (n === null) return apiErr('Invalid duration', 'invalid_duration')
        currentRule.duration = n
      }

      if (toggleOnoff !== undefined) {
        const extend = isRecord(currentRule.extend) ? currentRule.extend : null
        const toggle = extend && isRecord((extend as any).toggle) ? ((extend as any).toggle as Record<string, unknown>) : null
        if (!toggle || toggle.onoff === undefined) {
          return apiErr('TimerX rule does not support extend.toggle.onoff', 'unsupported_action')
        }
        toggle.onoff = toggleOnoff
      }

      const resp = await setTimerX<any>({ host, key, timer: currentRule })
      if (poller) {
        poller.boostDevice(uuid)
        void poller.pollNow({ uuids: [uuid], reason: 'manual' }).catch(() => {})
      }

      const updated = parseTimerXRule(currentRule)
      return apiOk({ host, id, updated, resp })
    } catch (e) {
      return apiErr(e instanceof Error ? e.message : String(e), 'lan_error')
    }
  },
})
