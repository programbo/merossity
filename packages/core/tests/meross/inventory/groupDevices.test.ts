import { describe, expect, it } from 'bun:test'
import { groupDevicesForControl } from '../../../src/meross/inventory'

describe('groupDevicesForControl', () => {
  it('groups by known host and sorts by name/type/uuid (empty names last)', () => {
    const devices: any[] = [
      { uuid: 'u3', devName: '', deviceType: 'mss', subType: 'a', onlineStatus: '1' },
      { uuid: 'u2', devName: 'beta', deviceType: 'mss', subType: 'b', onlineStatus: '0' },
      { uuid: 'u1', devName: 'Alpha', deviceType: 'mss', subType: 'a', onlineStatus: '1' },
      { uuid: 'u4', devName: 'alpha', deviceType: 'zzz', subType: 'a', onlineStatus: '1' },
    ]

    const hosts: any = {
      u2: { host: '192.168.1.20', updatedAt: 't2' },
      u1: { host: '192.168.1.10', updatedAt: 't1', mac: 'aa:bb:cc:dd:ee:ff' },
    }

    const { ready, inaccessible } = groupDevicesForControl(devices as any, hosts as any)

    expect(ready.map((d) => d.uuid)).toEqual(['u1', 'u2'])
    expect(ready[0]?.mac).toBe('aa:bb:cc:dd:ee:ff')
    expect(ready[1]?.mac).toBeNull()

    // inaccessible sorted by name (alpha before empty), then type, then uuid
    expect(inaccessible.map((d) => d.uuid)).toEqual(['u4', 'u3'])
  })
})
