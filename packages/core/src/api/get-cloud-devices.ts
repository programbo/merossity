import type { MerossCloudDevice } from '../meross'
import { apiOk, readConfig } from './shared'

export const createGetCloudDevicesHandler = () => ({
  /**
   * Function: Return cached Meross cloud device list from config.
   * Input: GET request with no body.
   * Output: `{ ok: true, data: { updatedAt: string | null, list: MerossCloudDevice[] } }`.
   */
  async GET() {
    const cfg = await readConfig()
    const list = (cfg.devices?.list ?? []) as MerossCloudDevice[]
    return apiOk({ updatedAt: cfg.devices?.updatedAt ?? null, list })
  },
})
