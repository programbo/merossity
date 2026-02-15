import { describe, expect, it } from 'bun:test'
import { extractLanLight } from '../../src/api/shared'

describe('api/shared extractLanLight', () => {
  it('extracts light state from Appliance.System.All digest.light', () => {
    const resp = {
      payload: {
        all: {
          digest: {
            light: [{ channel: 0, onoff: 1, luminance: 42, temperature: 18, rgb: 16711680 }],
          },
        },
      },
    }
    expect(extractLanLight(resp)).toEqual([{ channel: 0, onoff: 1, luminance: 42, temperature: 18, rgb: 16711680 }])
  })

  it('supports nested digest.light.light and rgb arrays', () => {
    const resp = {
      payload: {
        all: {
          digest: {
            light: {
              light: { channel: 0, onoff: 1, luminance: '7', rgb: [0, 128, 255] },
            },
          },
        },
      },
    }
    expect(extractLanLight(resp)).toEqual([{ channel: 0, onoff: 1, luminance: 7, rgb: 0x0080ff }])
  })
})

