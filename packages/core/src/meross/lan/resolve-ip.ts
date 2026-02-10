import { normalizeMac } from './mac'

const runCmd = async (cmd: string[], timeoutMs = 2000): Promise<string> => {
  try {
    const proc = Bun.spawn(cmd, {
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'ignore',
    })

    const timer = setTimeout(() => proc.kill(), timeoutMs)
    try {
      const code = await proc.exited
      if (code !== 0) return ''
      return proc.stdout ? await new Response(proc.stdout).text() : ''
    } finally {
      clearTimeout(timer)
    }
  } catch {
    return ''
  }
}

export const resolveIpv4FromMac = async (mac: string): Promise<string | null> => {
  const target = normalizeMac(mac)

  // macOS: "? (192.168.1.50) at c4:e7:ae:1a:c4:74 on en0 ifscope [ethernet]"
  const arpOut = await runCmd(['arp', '-a'])
  if (arpOut) {
    for (const line of arpOut.split('\n')) {
      if (!line.toLowerCase().includes(target)) continue
      const m = line.match(/\((\d+\.\d+\.\d+\.\d+)\)/)
      if (m?.[1]) return m[1]
    }
  }

  // Linux: "192.168.1.50 dev wlan0 lladdr c4:e7:ae:1a:c4:74 REACHABLE"
  const neighOut = await runCmd(['ip', 'neigh'])
  if (neighOut) {
    for (const line of neighOut.split('\n')) {
      const lower = line.toLowerCase()
      const m = lower.match(/\blladdr\s+([0-9a-f:]{17})\b/)
      if (!m) continue
      if (m[1] !== target) continue
      const ip = lower.match(/^(\d+\.\d+\.\d+\.\d+)\s/)
      if (ip?.[1]) return ip[1]
    }
  }

  return null
}
