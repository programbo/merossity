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

export const parseCidr = (cidr: string): { network: number; broadcast: number; prefix: number } => {
  const [ip, prefixStr] = cidr.split('/')
  const prefix = Number.parseInt(prefixStr ?? '', 10)
  if (!ip || Number.isNaN(prefix) || prefix < 0 || prefix > 32) {
    throw new Error(`Invalid CIDR: ${cidr}`)
  }

  const base = ipToInt(ip)
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0
  const network = base & mask
  const broadcast = network | (~mask >>> 0)
  return { network, broadcast, prefix }
}

const listHosts = (cidr: string): string[] => {
  const { network, broadcast, prefix } = parseCidr(cidr)
  if (prefix >= 31) return []

  const out: string[] = []
  for (let n = network + 1; n < broadcast; n++) out.push(intToIp(n >>> 0))
  return out
}

const pingOne = async (ip: string, timeoutMs: number): Promise<void> => {
  const isLinux = process.platform.startsWith('linux')
  const wArg = isLinux ? String(Math.max(1, Math.round(timeoutMs / 1000))) : String(timeoutMs)

  const proc = Bun.spawn(['ping', '-c', '1', '-W', wArg, ip], {
    stdin: 'ignore',
    stdout: 'ignore',
    stderr: 'ignore',
  })
  await proc.exited
}

export type PingSweepOptions = {
  timeoutMs?: number
  concurrency?: number
}

export const pingSweep = async (cidr: string, options: PingSweepOptions = {}): Promise<void> => {
  const timeoutMs = options.timeoutMs ?? 200
  const concurrency = Math.max(1, options.concurrency ?? 64)
  const ips = listHosts(cidr)
  if (ips.length === 0) return

  let i = 0
  const workers: Promise<void>[] = []
  for (let w = 0; w < concurrency; w++) {
    workers.push(
      (async () => {
        // Best-effort: ignore ping failures.
        for (;;) {
          const idx = i++
          if (idx >= ips.length) return
          try {
            await pingOne(ips[idx]!, timeoutMs)
          } catch {
            // ignore
          }
        }
      })(),
    )
  }

  await Promise.all(workers)
}
