import { defaultSuggestedCidr, normalizeMac, pingSweep, resolveHostByUuidScan, resolveIpv4FromMac } from '../meross'
import { apiErr, apiOk, nowIso, parseJsonBody, readConfig, requireLanKey, writeConfig } from './shared'

export const createResolveHostHandler = () => ({
  /**
   * Function: Resolve a device uuid to LAN IP (via MAC ARP lookup and/or CIDR uuid scan) and persist mapping.
   * Input: POST JSON `{ uuid, mac?, macAddress?, cidr?, perHostTimeoutMs? }`.
   * Output: `{ ok: true, data: { uuid, host, mac? } }`, or `{ ok: false, error }` for validation/lookup failures.
   */
  async POST(req: Request) {
    const body = (await parseJsonBody(req)) ?? {}
    const uuid = String(body.uuid ?? '')
    const mac = String(body.mac ?? body.macAddress ?? '')
    const cidr = body.cidr ? String(body.cidr) : ''
    const perHostTimeoutMs = body.perHostTimeoutMs !== undefined ? Number(body.perHostTimeoutMs) : undefined
    if (!uuid) return apiErr('Missing uuid', 'missing_uuid')

    let ip: string | null = null
    let normalizedMac: string | null = null
    let cidrTried: string | null = null

    // Only trust explicit MAC provided by the client. Do not infer MAC from UUID (it is not reliable).
    if (mac) {
      if (cidr) {
        // Populate ARP table best-effort, then resolve by MAC.
        await pingSweep(cidr, { timeoutMs: 200, concurrency: 64 }).catch(() => {})
      }
      ip = await resolveIpv4FromMac(mac)
      try {
        normalizedMac = normalizeMac(mac)
      } catch {
        // ignore
      }

      // If ARP-based MAC resolution fails, fall back to uuid scan (cloud lists often omit mac).
      if (!ip) {
        const effectiveCidr = cidr || defaultSuggestedCidr() || ''
        if (effectiveCidr) {
          cidrTried = effectiveCidr
          const key = await requireLanKey()
          try {
            await pingSweep(effectiveCidr, { timeoutMs: 200, concurrency: 64 }).catch(() => {})
          } catch {
            return apiErr(`Invalid CIDR: ${effectiveCidr}`, 'invalid_cidr')
          }

          const resolved = await resolveHostByUuidScan(uuid, effectiveCidr, key, {
            perHostTimeoutMs,
            targetMac: normalizedMac ?? undefined,
          })
          if (resolved) {
            ip = resolved.host
            if (resolved.mac) normalizedMac = resolved.mac
          }
        }
      }
    } else {
      const effectiveCidr = cidr || defaultSuggestedCidr() || ''
      if (!effectiveCidr) {
        return apiErr(
          'No MAC address available. Provide a CIDR (e.g. 192.168.68.0/22) so we can scan the LAN by uuid.',
          'missing_mac',
        )
      }
      cidrTried = effectiveCidr

      // Fallback: scan the CIDR and identify devices by uuid using Appliance.System.All.
      const key = await requireLanKey()
      try {
        await pingSweep(effectiveCidr, { timeoutMs: 200, concurrency: 64 }).catch(() => {})
      } catch {
        return apiErr(`Invalid CIDR: ${effectiveCidr}`, 'invalid_cidr')
      }

      const resolved = await resolveHostByUuidScan(uuid, effectiveCidr, key, { perHostTimeoutMs })
      ip = resolved?.host ?? null
      if (resolved?.mac) normalizedMac = resolved.mac
    }

    if (!ip) {
      return apiErr(
        mac
          ? cidrTried
            ? 'Could not resolve IP from MAC (and LAN scan by uuid did not find it). Ensure the device is online and CIDR is correct.'
            : 'Could not resolve IP from MAC. Provide a CIDR (e.g. 192.168.1.0/24) so we can scan the LAN by uuid, and ensure the device is online.'
          : [
              'Could not find device on LAN by uuid.',
              cidrTried ? `CIDR tried: ${cidrTried}.` : '',
              (() => {
                const suggested = defaultSuggestedCidr()
                return suggested && suggested !== cidrTried ? `Suggested: ${suggested}.` : ''
              })(),
              'Confirm the device is awake on that network.',
            ]
              .filter(Boolean)
              .join(' '),
        'host_not_found',
      )
    }

    const cfg = await readConfig()
    const nextHosts = { ...cfg.hosts }
    const prev = nextHosts[uuid]
    nextHosts[uuid] = {
      host: ip,
      updatedAt: nowIso(),
      ...(prev?.mac ? { mac: prev.mac } : {}),
      ...(normalizedMac ? { mac: normalizedMac } : {}),
    }
    await writeConfig({ ...cfg, hosts: nextHosts })
    return apiOk({ uuid, host: ip, ...(normalizedMac ? { mac: normalizedMac } : {}) })
  },
})
