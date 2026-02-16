import { getConsumptionX } from '../meross'
import { apiErr, apiOk, parseJsonBody, requireLanHost, requireLanKey } from './shared'
import { upsertConsumptionDay } from './telemetry-db'

type ConsumptionXEntry = { date: string; time: number; value: number }

const extractConsumptionX = (resp: any): ConsumptionXEntry[] => {
  const candidates = [
    resp?.payload?.consumptionx,
    resp?.payload?.consumptionx?.consumptionx,
    resp?.payload?.ConsumptionX,
  ]
  for (const c of candidates) {
    if (!c) continue
    const arr: any[] = Array.isArray(c) ? c : []
    const out: ConsumptionXEntry[] = []
    for (const item of arr) {
      const date = String(item?.date ?? '').trim()
      const time = Number(item?.time)
      const value = Number(item?.value)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
      if (!Number.isFinite(time) || time <= 0) continue
      if (!Number.isFinite(value) || value < 0) continue
      out.push({ date, time: Math.floor(time), value: Math.floor(value) })
    }
    if (out.length) return out.sort((a, b) => a.date.localeCompare(b.date))
    return []
  }
  return []
}

export const createGetDeviceConsumptionXHandler = () => ({
  /**
   * Function: Fetch ConsumptionX daily totals (Wh) from a LAN device and upsert into SQLite.
   * Input: POST JSON `{ uuid, channel? }` (`channel` defaults to `0`).
   * Output: `{ ok: true, data: { host, list } }`.
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
      const resp = await getConsumptionX<any>({ host, key, channel, timeoutMs: 5000 })
      const list = extractConsumptionX(resp)

      for (const e of list) {
        try {
          upsertConsumptionDay({ uuid, channel, date: e.date, atS: e.time, wh: e.value })
        } catch {
          // best-effort
        }
      }

      return apiOk({ host, list })
    } catch (e) {
      return apiErr(e instanceof Error ? e.message : String(e), 'lan_error')
    }
  },
})

