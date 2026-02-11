import { describe, expect, it } from 'bun:test'
import { extractLanMac, extractLanUuid } from '../../../src/meross/lan/discovery'

describe('LAN discovery helpers', () => {
  it('extractLanUuid reads from common hardware uuid fields', () => {
    const resp = { payload: { all: { system: { hardware: { uuid: 'abcd' } } } } }
    expect(extractLanUuid(resp)).toBe('abcd')
  })

  it('extractLanMac normalizes MACs', () => {
    const resp = { payload: { all: { system: { hardware: { macAddress: 'C4E7AE1AC474' } } } } }
    expect(extractLanMac(resp)).toBe('c4:e7:ae:1a:c4:74')
  })
})
