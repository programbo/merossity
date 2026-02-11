import os from 'node:os'

import { getSystemAll } from './system-all'
import { listHostsInCidr } from './ping-sweep'
import { normalizeMac } from './mac'

const ipToInt = (ip: string): number => {
  const parts = ip.split('.').map((p) => Number.parseInt(p, 10))
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) {
    throw new Error(`Invalid IPv4: ${ip}`)
  }
  const [a, b, c, d] = parts as [number, number, number, number]
  return ((a << 24) | (b << 16) | (c << 8) | d) >>> 0
}

const intToIp = (n: number): string =>
  `${(n >>> 24) & 255}.${(n >>> 16) & 255}.${(n >>> 8) & 255}.${n & 255}`

const netmaskToPrefix = (mask: string): number => {
  const n = ipToInt(mask)
  let seenZero = false
  let bits = 0
  for (let i = 31; i >= 0; i--) {
    const bit = (n >>> i) & 1
    if (bit === 1) {
      if (seenZero) throw new Error(`Non-contiguous netmask: ${mask}`)
      bits++
    } else {
      seenZero = true
    }
  }
  return bits
}

const isPrivateIpv4 = (ip: string): boolean => {
  try {
    const n = ipToInt(ip)
    const a = (n >>> 24) & 255
    const b = (n >>> 16) & 255
    if (a === 10) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    return false
  } catch {
    return false
  }
}

export const suggestCidrs = (): Array<{ iface: string; address: string; netmask: string; cidr: string }> => {
  const ifs = os.networkInterfaces()
  const out: Array<{ iface: string; address: string; netmask: string; cidr: string }> = []

  for (const [iface, addrs] of Object.entries(ifs)) {
    for (const a of addrs ?? []) {
      if (!a) continue
      if (a.family !== 'IPv4') continue
      if (a.internal) continue
      if (!a.address || !a.netmask) continue

      try {
        const prefix = netmaskToPrefix(a.netmask)
        const ip = ipToInt(a.address)
        const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0
        const network = ip & mask
        const cidr = `${intToIp(network)}/${prefix}`
        out.push({ iface, address: a.address, netmask: a.netmask, cidr })
      } catch {
        // ignore
      }
    }
  }

  // Heuristic: prefer physical LAN interfaces and RFC1918 ranges.
  out.sort((a, b) => {
    const aPriv = isPrivateIpv4(a.address) ? 0 : 1
    const bPriv = isPrivateIpv4(b.address) ? 0 : 1
    if (aPriv !== bPriv) return aPriv - bPriv

    const aEn = a.iface === 'en0' ? 0 : 1
    const bEn = b.iface === 'en0' ? 0 : 1
    if (aEn !== bEn) return aEn - bEn

    return a.iface.localeCompare(b.iface)
  })

  return out
}

export const defaultSuggestedCidr = (): string | null => {
  const s = suggestCidrs()
  return s.length ? s[0]!.cidr : null
}

export const extractLanUuid = (resp: unknown): string | null => {
  const r: any = resp as any
  const uuid =
    r?.payload?.all?.system?.hardware?.uuid ??
    r?.payload?.all?.system?.hardware?.UUID ??
    r?.payload?.all?.system?.hardware?.deviceUuid ??
    r?.payload?.all?.system?.hardware?.deviceUUID

  if (typeof uuid === 'string' && uuid.trim()) return uuid.trim()
  return null
}

export const extractLanMac = (resp: unknown): string | null => {
  const r: any = resp as any
  const raw =
    r?.payload?.all?.system?.hardware?.macAddress ??
    r?.payload?.all?.system?.hardware?.mac ??
    r?.payload?.all?.system?.hardware?.macaddr ??
    r?.payload?.all?.system?.hardware?.MAC ??
    r?.payload?.all?.system?.network?.macAddress ??
    r?.payload?.all?.system?.network?.mac ??
    r?.payload?.all?.system?.wifi?.macAddress ??
    r?.payload?.all?.system?.wifi?.mac

  if (typeof raw !== 'string' || !raw.trim()) return null
  try {
    return normalizeMac(raw)
  } catch {
    return null
  }
}

export const resolveHostByUuidScan = async (
  uuid: string,
  cidr: string,
  key: string,
  options: { perHostTimeoutMs?: number; concurrency?: number; targetMac?: string } = {},
): Promise<{ host: string; mac?: string } | null> => {
  let ips: string[]
  try {
    ips = listHostsInCidr(cidr)
  } catch {
    return null
  }
  if (ips.length === 0) return null

  // Keep timeouts short to avoid a minutes-long scan on large CIDRs.
  const perHostTimeoutMs = Number.isFinite(options.perHostTimeoutMs) ? Math.max(200, options.perHostTimeoutMs!) : 900
  const concurrency = Number.isFinite(options.concurrency) ? Math.max(1, Math.floor(options.concurrency!)) : 24

  let found: { host: string; mac?: string } | null = null
  let i = 0

  const workers = Array.from({ length: concurrency }, () =>
    (async () => {
      for (;;) {
        if (found) return
        const idx = i++
        if (idx >= ips.length) return
        const ip = ips[idx]!

        try {
          const resp = await getSystemAll<any>({ host: ip, key, timeoutMs: perHostTimeoutMs })
          const got = extractLanUuid(resp)
          const mac = extractLanMac(resp) ?? undefined
          const macMatch = options.targetMac && mac ? mac === options.targetMac : false
          if ((got && got === uuid) || macMatch) {
            found = mac ? { host: ip, mac } : { host: ip }
            return
          }
        } catch {
          // ignore: not a Meross device / not reachable / timeout
        }
      }
    })(),
  )

  await Promise.all(workers)
  return found
}

