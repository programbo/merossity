import { describe, expect, it } from 'bun:test'
import { failureBackoffMs, hasMaterialStateChange, withJitterMs, type DeviceStateDto } from '../../src/api/state-poller'

const makeState = (overrides: Partial<DeviceStateDto> = {}): DeviceStateDto => ({
  uuid: 'u1',
  host: '192.168.1.10',
  channel: 0,
  onoff: 1,
  channels: [{ channel: 0, onoff: 1 }],
  updatedAt: 1,
  source: 'poller',
  stale: false,
  ...overrides,
})

describe('api/state-poller helpers', () => {
  it('uses bounded failure backoff steps', () => {
    expect(failureBackoffMs(0)).toBe(0)
    expect(failureBackoffMs(1)).toBe(30_000)
    expect(failureBackoffMs(2)).toBe(60_000)
    expect(failureBackoffMs(3)).toBe(120_000)
    expect(failureBackoffMs(4)).toBe(300_000)
    expect(failureBackoffMs(8)).toBe(300_000)
  })

  it('applies deterministic jitter within the expected range', () => {
    expect(withJitterMs(10_000, 0.15, 0)).toBe(8_500)
    expect(withJitterMs(10_000, 0.15, 0.5)).toBe(10_000)
    expect(withJitterMs(10_000, 0.15, 1)).toBe(11_500)
  })

  it('detects only material device-state changes', () => {
    const prev = makeState()
    expect(hasMaterialStateChange(prev, makeState({ updatedAt: 999 }))).toBe(false)
    expect(hasMaterialStateChange(prev, makeState({ onoff: 0 }))).toBe(true)
    expect(hasMaterialStateChange(prev, makeState({ stale: true }))).toBe(true)
    expect(hasMaterialStateChange(prev, makeState({ channels: [{ channel: 0, onoff: 0 }] }))).toBe(true)
  })
})

