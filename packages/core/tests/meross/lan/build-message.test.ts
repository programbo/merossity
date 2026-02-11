import { describe, expect, it } from 'bun:test'
import { buildLanMessage, md5Hex } from '../../../src/meross/lan/message'

describe('meross/lan buildLanMessage', () => {
  it('computes sign as md5(messageId + key + timestamp)', () => {
    const messageId = '0123456789abcdef0123456789abcdef'
    const key = 'test-key'
    const timestamp = 1700000000

    const msg = buildLanMessage({
      namespace: 'Appliance.Control.ToggleX',
      method: 'SET',
      payload: { togglex: { channel: 0, onoff: 1 } },
      key,
      messageId,
      timestamp,
    })

    expect(msg.header.messageId).toBe(messageId)
    expect(msg.header.timestamp).toBe(timestamp)
    expect(msg.header.sign).toBe(md5Hex(`${messageId}${key}${timestamp}`))
  })
})
