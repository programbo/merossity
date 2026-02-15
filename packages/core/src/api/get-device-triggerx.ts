import { getSystemAll, getTriggerX } from '../meross'
import {
  apiErr,
  apiOk,
  extractLanTriggerXDigest,
  parseJsonBody,
  requireLanHost,
  requireLanKey,
  type LanScheduleDigestEntry,
} from './shared'

export const createGetDeviceTriggerXHandler = () => ({
  /**
   * Function: Fetch TriggerX digest and per-id raw TriggerX configs over LAN.
   * Input: POST JSON `{ uuid }`.
   * Output: `{ ok: true, data: { host, digest, rawById } }`, or `{ ok: false, error }`.
   */
  async POST(req: Request) {
    const body = (await parseJsonBody(req)) ?? {}
    const uuid = String(body.uuid ?? '')
    if (!uuid) return apiErr('Missing uuid', 'missing_uuid')

    try {
      const host = await requireLanHost(uuid)
      const key = await requireLanKey()

      const systemAll = await getSystemAll<any>({ host, key })
      const digest: LanScheduleDigestEntry[] = extractLanTriggerXDigest(systemAll)

      const ids = [...new Set(digest.map((d) => d.id).filter(Boolean))]
      const rawById: Record<string, unknown> = {}
      for (const id of ids) {
        rawById[id] = await getTriggerX<any>({ host, key, id })
      }

      return apiOk({ host, digest, rawById })
    } catch (e) {
      return apiErr(e instanceof Error ? e.message : String(e), 'lan_error')
    }
  },
})

