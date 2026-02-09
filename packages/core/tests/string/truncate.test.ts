import { describe, expect, it } from 'bun:test'
import { truncate } from '../../src/string/truncate'

describe('truncate', () => {
  it('returns the original string when within bounds', () => {
    expect(truncate('hello', 10)).toBe('hello')
  })

  it('truncates and appends the suffix', () => {
    expect(truncate('hello world', 8)).toBe('hello...')
  })

  it('handles tiny max lengths', () => {
    expect(truncate('hello', 2)).toBe('..')
  })
})
