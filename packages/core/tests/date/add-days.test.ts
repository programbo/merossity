import { describe, expect, it } from 'bun:test'
import { addDays } from '../../src/date/add-days'

describe('addDays', () => {
  it('adds positive and negative day offsets', () => {
    const base = new Date('2024-01-10T12:00:00Z')
    expect(addDays(base, 2).toISOString()).toBe('2024-01-12T12:00:00.000Z')
    expect(addDays(base, -3).toISOString()).toBe('2024-01-07T12:00:00.000Z')
  })
})
