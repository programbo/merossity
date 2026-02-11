import { MerossCloudError, merossCloudListDevices } from '../meross'
import { apiErr, apiOk, nowIso, parseJsonBody, readConfig, writeConfig } from './shared'

export const createRefreshCloudDevicesHandler = () => ({
  /**
   * Function: Fetch the latest cloud device list and update local config cache.
   * Input: POST JSON `{ timeoutMs? }`.
   * Output: `{ ok: true, data: { count: number, list: MerossCloudDevice[] } }`, or `{ ok: false, error }`.
   */
  async POST(req: Request) {
    const body = (await parseJsonBody(req)) ?? {}
    const timeoutMs = body.timeoutMs !== undefined ? Number(body.timeoutMs) : undefined
    const cfg = await readConfig()
    if (!cfg.cloud) return apiErr('Not logged in. Run /api/cloud/login first.', 'not_logged_in')

    try {
      const list = await merossCloudListDevices(cfg.cloud, {
        timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : undefined,
      })
      await writeConfig({
        ...cfg,
        devices: { updatedAt: nowIso(), list },
      })
      return apiOk({ count: list.length, list })
    } catch (e) {
      if (e instanceof MerossCloudError) {
        return apiErr(e.message, 'cloud_error', { apiStatus: e.apiStatus, info: e.info })
      }
      return (apiErr(e instanceof Error ? e.message : String(e), 'unknown'), { status: 500 } as Response)
    }
  },
})
