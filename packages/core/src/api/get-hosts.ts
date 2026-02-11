import { apiOk, readConfig } from './shared'

export const createGetHostsHandler = () => ({
  /**
   * Function: Return cached LAN host mappings by device uuid.
   * Input: GET request with no body.
   * Output: `{ ok: true, data: { hosts: Record<uuid, { host, updatedAt, mac? }> } }`.
   */
  async GET() {
    const cfg = await readConfig()
    return apiOk({ hosts: cfg.hosts ?? {} })
  },
})
