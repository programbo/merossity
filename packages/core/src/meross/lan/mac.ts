const MAC_RE = /^([0-9a-f]{2}[:\-]){5}([0-9a-f]{2})$/i

export const normalizeMac = (mac: string): string => {
  const normalized = mac.trim().toLowerCase().replaceAll('-', ':')
  if (!MAC_RE.test(normalized)) {
    throw new Error(`Invalid MAC address: ${mac}`)
  }
  return normalized
}

