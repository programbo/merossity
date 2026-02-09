import { describe, expect, it } from 'bun:test'
import { formatIsoDate } from '../../src/date/format-iso-date'

describe('formatIsoDate', () => {
  it('formats a Date as YYYY-MM-DD', () => {
    const date = new Date('2024-02-05T15:20:00Z')
    expect(formatIsoDate(date)).toBe('2024-02-05')
  })
})
