import {
  defaultSuggestedCidr,
  extractLanMac,
  extractLanUuid,
  getSystemAll,
  listHostsInCidr,
  pingSweep,
} from '../meross'
import { apiErr, apiOk, nowIso, parseJsonBody, requireLanKey, readConfig, writeConfig } from './shared'

export const createDiscoverHostsHandler = () => ({
  /**
   * Function: Scan a CIDR range, identify Meross devices by uuid, and merge discovered hosts into config.
   * Input: POST JSON `{ cidr?, perHostTimeoutMs?, concurrency? }` (falls back to suggested CIDR).
   * Output: `{ ok: true, data: { cidr, count, hosts } }` where `hosts` is keyed by uuid.
   */
  async POST(req: Request) {
    const body = (await parseJsonBody(req)) ?? {}
    const cidr = body.cidr ? String(body.cidr) : ''
    const effectiveCidr = cidr || defaultSuggestedCidr() || ''
    const perHostTimeoutMs = body.perHostTimeoutMs !== undefined ? Math.max(200, Number(body.perHostTimeoutMs)) : 900
    const concurrency = body.concurrency !== undefined ? Math.max(1, Math.floor(Number(body.concurrency))) : 24
    if (!effectiveCidr) return apiErr('Missing cidr', 'missing_cidr')

    const key = await requireLanKey()
    try {
      await pingSweep(effectiveCidr, { timeoutMs: 200, concurrency: 64 }).catch(() => {})
    } catch {
      return apiErr(`Invalid CIDR: ${effectiveCidr}`, 'invalid_cidr')
    }

    let ips: string[]
    try {
      ips = listHostsInCidr(effectiveCidr)
    } catch {
      return apiErr(`Invalid CIDR: ${effectiveCidr}`, 'invalid_cidr')
    }

    let i = 0
    const found: Record<string, { host: string; updatedAt: string; mac?: string }> = {}

    await Promise.all(
      Array.from({ length: concurrency }, () =>
        (async () => {
          for (;;) {
            const idx = i++
            if (idx >= ips.length) return
            const ip = ips[idx]!

            try {
              const resp = await getSystemAll<any>({ host: ip, key, timeoutMs: perHostTimeoutMs })
              const uuid = extractLanUuid(resp)
              if (!uuid) continue
              const mac = extractLanMac(resp)
              found[uuid] = { host: ip, updatedAt: nowIso(), ...(mac ? { mac } : {}) }
            } catch {
              // ignore
            }
          }
        })(),
      ),
    )

    const cfg = await readConfig()
    await writeConfig({ ...cfg, hosts: { ...cfg.hosts, ...found } })

    return apiOk({ cidr: effectiveCidr, count: Object.keys(found).length, hosts: found })
  },
})
