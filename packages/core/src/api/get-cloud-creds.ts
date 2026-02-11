import { apiOk, readConfig, summarizeCloud } from './shared'

export const createGetCloudCredsHandler = () => ({
  /**
   * Function: Read stored cloud credentials summary from config.
   * Input: GET request with no body.
   * Output: `{ ok: true, data: { cloud: null | { domain, mqttDomain, userId, userEmail, key, tokenRedacted } } }`.
   */
  async GET() {
    const cfg = await readConfig()
    if (!cfg.cloud) return apiOk({ cloud: null })
    return apiOk({ cloud: summarizeCloud(cfg.cloud) })
  },
})
