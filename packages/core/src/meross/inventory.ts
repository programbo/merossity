import type { MerossCloudDevice } from './cloud/types'
import type { MerossDeviceHostMap } from './config'

export type InventoryDevice = {
  uuid: string
  name: string
  type: string
  online: string
  host: string | null
  mac: string | null
  hostUpdatedAt: string | null
}

const norm = (s: string) => s.trim().toLowerCase()

const deviceSortKey = (d: InventoryDevice) => {
  // Empty names should sort last.
  const name = norm(d.name)
  const nameKey = name ? `0:${name}` : `1:`
  const typeKey = norm(d.type)
  const uuidKey = norm(d.uuid)
  return `${nameKey}\n${typeKey}\n${uuidKey}`
}

export const groupDevicesForControl = (
  devices: MerossCloudDevice[],
  hosts: MerossDeviceHostMap,
): { ready: InventoryDevice[]; inaccessible: InventoryDevice[] } => {
  const ready: InventoryDevice[] = []
  const inaccessible: InventoryDevice[] = []

  for (const d of devices ?? []) {
    const uuid = String(d.uuid ?? '')
    if (!uuid) continue

    const hostEntry = hosts?.[uuid]
    const host = hostEntry?.host ? String(hostEntry.host) : null
    const hostUpdatedAt = hostEntry?.updatedAt ? String(hostEntry.updatedAt) : null
    const mac = hostEntry?.mac ? String(hostEntry.mac) : null

    const inv: InventoryDevice = {
      uuid,
      name: String(d.devName ?? ''),
      type: [d.deviceType, d.subType].filter(Boolean).join(' / '),
      online: String(d.onlineStatus ?? ''),
      host,
      mac,
      hostUpdatedAt,
    }

    if (host) ready.push(inv)
    else inaccessible.push(inv)
  }

  ready.sort((a, b) => deviceSortKey(a).localeCompare(deviceSortKey(b)))
  inaccessible.sort((a, b) => deviceSortKey(a).localeCompare(deviceSortKey(b)))

  return { ready, inaccessible }
}

