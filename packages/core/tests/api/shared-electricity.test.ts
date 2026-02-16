import { describe, expect, test } from 'bun:test'
import { extractLanElectricity } from '../../src/api/shared'

describe('api/shared extractLanElectricity', () => {
  test('extracts and scales electricity from direct payload.electricity', () => {
    const resp = {
      payload: {
        electricity: {
          channel: 0,
          voltage: 2256,
          current: 1534,
          power: 11186,
          config: { voltageRatio: 188, electricityRatio: 100 },
        },
      },
    }

    const out = extractLanElectricity(resp)
    expect(out).not.toBeNull()
    expect(out!.channel).toBe(0)
    expect(out!.voltageDv).toBe(2256)
    expect(out!.currentMa).toBe(1534)
    expect(out!.powerMw).toBe(11186)
    expect(out!.voltageV).toBeCloseTo(225.6)
    expect(out!.currentA).toBeCloseTo(1.534)
    expect(out!.powerW).toBeCloseTo(11.186)
  })

  test('extracts electricity from payload.all.digest.electricity', () => {
    const resp = {
      payload: {
        all: {
          digest: {
            electricity: { channel: 0, voltage: 1205, current: 81, power: 1650 },
          },
        },
      },
    }

    const out = extractLanElectricity(resp)
    expect(out).not.toBeNull()
    expect(out!.voltageV).toBeCloseTo(120.5)
    expect(out!.currentA).toBeCloseTo(0.081)
    expect(out!.powerW).toBeCloseTo(1.65)
  })
})

