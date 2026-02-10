const MAC_RE = /^([0-9a-f]{2}[:\-]){5}([0-9a-f]{2})$/i
const HEX12_RE = /^[0-9a-f]{12}$/i

export const normalizeMac = (mac: string): string => {
  const normalized = mac.trim().toLowerCase().replaceAll('-', ':')
  if (MAC_RE.test(normalized)) return normalized

  // Some sources return MACs without separators (e.g. "c4e7ae1ac474").
  const compact = normalized.replaceAll(':', '')
  if (HEX12_RE.test(compact)) {
    return compact.match(/.{2}/g)!.join(':')
  }

  throw new Error(`Invalid MAC address: ${mac}`)
}
