import { apiErr, apiOk, nowIso, parseJsonBody, readConfig, writeConfig } from './shared'

export const createNetworkCidrHandler = () => ({
  /**
   * Function: Read or persist preferred CIDR used for background LAN resolve operations.
   */
  async GET() {
    const cfg = await readConfig()
    const cidr = String(cfg.network?.cidr ?? '').trim() || null
    return apiOk({ cidr })
  },

  async POST(req: Request) {
    const body = (await parseJsonBody(req)) ?? {}
    const cidrRaw = String(body.cidr ?? '').trim()
    if (!cidrRaw) return apiErr('Missing cidr', 'missing_cidr')

    const cfg = await readConfig()
    await writeConfig({
      ...cfg,
      network: {
        ...cfg.network,
        cidr: cidrRaw,
        updatedAt: nowIso(),
      },
    })
    return apiOk({ cidr: cidrRaw })
  },
})

