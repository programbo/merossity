import { apiErr, apiOk, parseJsonBody } from './shared'
import { getLatestTelemetrySample } from './telemetry-db'

export const createGetTelemetryPowerCurrentHandler = () => ({
  /**
   * Function: Return latest recorded power telemetry sample from SQLite.
   * Input: POST JSON `{ uuid, channel? }` (`channel` defaults to `0`).
   * Output: `{ ok: true, data: { sample } }` where `sample` may be null.
   */
  async POST(req: Request) {
    const body = (await parseJsonBody(req)) ?? {}
    const uuid = String(body.uuid ?? '').trim()
    const channel = body.channel === undefined ? 0 : Number(body.channel)
    if (!uuid) return apiErr('Missing uuid', 'missing_uuid')
    if (!Number.isInteger(channel) || channel < 0) return apiErr('Invalid channel', 'invalid_channel')

    const sample = getLatestTelemetrySample(uuid, channel)
    return apiOk({ sample })
  },
})

