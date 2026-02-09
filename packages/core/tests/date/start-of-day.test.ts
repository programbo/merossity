import { describe, expect, it } from 'bun:test'
import { startOfDay } from '../../src/date/start-of-day'

describe('startOfDay', () => {
  it('resets time to midnight', () => {
    const base = new Date('2024-01-10T12:34:56.789Z')
    const result = startOfDay(base)
    expect(result.toISOString().startsWith('2024-01-10T00:00:00.000Z')).toBe(true)
  })
})
