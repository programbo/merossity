import { getSystemAll, getTimerX } from '../meross'
import {
  apiErr,
  apiOk,
  extractLanTimerXDigest,
  parseJsonBody,
  requireLanHost,
  requireLanKey,
  type LanScheduleDigestEntry,
} from './shared'

export type TimerXRule = {
  id: string
  enable?: 0 | 1
  channel?: number
  alias?: string
  type?: number
  week?: number
  time?: number
  sunOffset?: number
  duration?: number
  extend?: unknown
}

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

  // Common nesting: { timerx: { ... } } or { timerx: [ ... ] }
  if ('timerx' in v) return asTimerRuleRecord((v as any).timerx)
  return null
}

const coerce01 = (v: unknown): 0 | 1 | undefined => (v === undefined ? undefined : Number(v) === 1 ? 1 : 0)

const coerceInt = (v: unknown): number | undefined => {
  const n = typeof v === 'string' && v.trim() ? Number(v) : typeof v === 'number' ? v : NaN
  if (!Number.isFinite(n)) return undefined
  return Math.round(n)
}

const parseTimerXRule = (raw: Record<string, unknown>): TimerXRule => ({
  id: String(raw.id ?? '').trim(),
  ...(raw.enable !== undefined ? { enable: coerce01(raw.enable) } : {}),
  ...(raw.channel !== undefined ? { channel: coerceInt(raw.channel) } : {}),
  ...(raw.alias !== undefined ? { alias: String(raw.alias ?? '') } : {}),
  ...(raw.type !== undefined ? { type: coerceInt(raw.type) } : {}),
  ...(raw.week !== undefined ? { week: coerceInt(raw.week) } : {}),
  ...(raw.time !== undefined ? { time: coerceInt(raw.time) } : {}),
  ...(raw.sunOffset !== undefined ? { sunOffset: coerceInt(raw.sunOffset) } : {}),
  ...(raw.duration !== undefined ? { duration: coerceInt(raw.duration) } : {}),
  ...(raw.extend !== undefined ? { extend: raw.extend } : {}),
})

export const createGetDeviceTimerXHandler = () => ({
  /**
   * Function: Fetch TimerX digest and best-effort per-id TimerX rules over LAN.
   * Input: POST JSON `{ uuid }`.
   * Output: `{ ok: true, data: { host, digest, timers, rawById } }`, or `{ ok: false, error }`.
   */
  async POST(req: Request) {
    const body = (await parseJsonBody(req)) ?? {}
    const uuid = String(body.uuid ?? '')
    if (!uuid) return apiErr('Missing uuid', 'missing_uuid')

    try {
      const host = await requireLanHost(uuid)
      const key = await requireLanKey()

      const systemAll = await getSystemAll<any>({ host, key })
      const digest: LanScheduleDigestEntry[] = extractLanTimerXDigest(systemAll)

      const ids = [...new Set(digest.map((d) => d.id).filter(Boolean))]
      const rawById: Record<string, unknown> = {}
      const timers: TimerXRule[] = []

      for (const id of ids) {
        const resp = await getTimerX<any>({ host, key, id })
        rawById[id] = resp

        const ruleRec = asTimerRuleRecord(resp?.payload?.timerx) ?? asTimerRuleRecord(resp?.payload?.timerx?.timerx)
        if (ruleRec) {
          const parsed = parseTimerXRule(ruleRec)
          if (parsed.id) timers.push(parsed)
        }
      }

      // Stable ordering by digest appearance first, then by id.
      const digestIndexById = new Map<string, number>()
      for (let i = 0; i < digest.length; i++) {
        const entry = digest[i]!
        const prev = digestIndexById.get(entry.id)
        if (prev === undefined || i < prev) digestIndexById.set(entry.id, i)
      }
      timers.sort((a, b) => {
        const ai = digestIndexById.get(a.id) ?? null
        const bi = digestIndexById.get(b.id) ?? null
        if (ai !== null && bi !== null) return ai - bi
        if (ai !== null) return -1
        if (bi !== null) return 1
        return a.id.localeCompare(b.id)
      })

      return apiOk({ host, digest, timers, rawById })
    } catch (e) {
      return apiErr(e instanceof Error ? e.message : String(e), 'lan_error')
    }
  },
})
