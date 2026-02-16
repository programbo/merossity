import { apiErr, apiOk, parseJsonBody } from './shared'
import { getTelemetryHistoryBuckets } from './telemetry-db'

export const createGetTelemetryPowerHistoryHandler = () => ({
  /**
   * Function: Return historic power telemetry as time buckets from SQLite.
   * Input: POST JSON `{ uuid, channel?, fromMs?, toMs?, bucketMs? }`.
   * Defaults: last 6h, bucket 60s.
   */
  async POST(req: Request) {
    const body = (await parseJsonBody(req)) ?? {}
    const uuid = String(body.uuid ?? '').trim()
    const channel = body.channel === undefined ? 0 : Number(body.channel)
    if (!uuid) return apiErr('Missing uuid', 'missing_uuid')
    if (!Number.isInteger(channel) || channel < 0) return apiErr('Invalid channel', 'invalid_channel')

    const now = Date.now()
    const toMsRaw = body.toMs === undefined ? now : Number(body.toMs)
    const fromMsRaw = body.fromMs === undefined ? now - 6 * 60 * 60 * 1000 : Number(body.fromMs)
    const bucketMsRaw = body.bucketMs === undefined ? 60_000 : Number(body.bucketMs)

    const toMs = Number.isFinite(toMsRaw) ? Math.max(0, Math.floor(toMsRaw)) : now
    const fromMs = Number.isFinite(fromMsRaw) ? Math.max(0, Math.floor(fromMsRaw)) : now - 6 * 60 * 60 * 1000
    const bucketMs = Number.isFinite(bucketMsRaw) ? Math.max(1000, Math.floor(bucketMsRaw)) : 60_000

    if (fromMs > toMs) return apiErr('fromMs must be <= toMs', 'invalid_range')
    if (toMs - fromMs > 30 * 24 * 60 * 60 * 1000) return apiErr('Range too large (max 30 days)', 'invalid_range')

    const points = getTelemetryHistoryBuckets({ uuid, channel, fromMs, toMs, bucketMs })
    return apiOk({ fromMs, toMs, bucketMs, points })
  },
})

