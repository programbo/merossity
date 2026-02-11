import { apiOk, configPath, readConfig } from './shared'

export const createGetStatusHandler = () => ({
  /**
   * Function: Report environment/config readiness for cloud + LAN workflows.
   * Input: GET request with no body.
   * Output: `{ ok: true, data: { env, config } }` with booleans and update timestamps.
   */
  async GET() {
    const cfg = await readConfig()
    return apiOk({
      env: {
        hasEmail: Boolean(process.env.MEROSS_EMAIL),
        hasPassword: Boolean(process.env.MEROSS_PASSWORD),
        hasKey: Boolean(process.env.MEROSS_KEY),
      },
      config: {
        path: configPath(),
        hasCloudCreds: Boolean(cfg.cloud?.token && cfg.cloud?.key),
        hasDevices: Boolean(cfg.devices?.list?.length),
        hasHosts: Boolean(cfg.hosts && Object.keys(cfg.hosts).length > 0),
        updatedAt: {
          cloud: cfg.cloud?.updatedAt,
          devices: cfg.devices?.updatedAt,
        },
      },
    })
  },
})
