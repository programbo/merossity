import { describe, expect, it } from 'bun:test'
import { extractLanTimerXDigest, extractLanTriggerXDigest } from '../../src/api/shared'

describe('api/shared schedule digest extractors', () => {
  it('extracts timerx digest entries from Appliance.System.All digest.timerx', () => {
    const resp = {
      payload: {
        all: {
          digest: {
            timerx: [
              { channel: 0, id: '1111111111111111', count: 2 },
              { channel: 1, id: '222', count: '1' },
            ],
          },
        },
      },
    }
    expect(extractLanTimerXDigest(resp)).toEqual([
      { channel: 0, id: '1111111111111111', count: 2 },
      { channel: 1, id: '222', count: 1 },
    ])
  })

  it('supports singleton object and defaults count to 0', () => {
    const resp = {
      payload: {
        all: {
          digest: {
            triggerx: { channel: 0, id: 'aaa' },
          },
        },
      },
    }
    expect(extractLanTriggerXDigest(resp)).toEqual([{ channel: 0, id: 'aaa', count: 0 }])
  })

  it('filters invalid entries and returns a stable sort', () => {
    const resp = {
      payload: {
        all: {
          digest: {
            timerx: [
              { channel: 2, id: 'b', count: -3 },
              { channel: -1, id: 'skip', count: 1 },
              { channel: 1, id: '', count: 1 },
              { channel: 0, id: 'c', count: 5 },
              { channel: 2, id: 'a', count: 2 },
            ],
          },
        },
      },
    }
    expect(extractLanTimerXDigest(resp)).toEqual([
      { channel: 0, id: 'c', count: 5 },
      { channel: 2, id: 'a', count: 2 },
      { channel: 2, id: 'b', count: 0 },
    ])
  })
})

