import { describe, expect, it } from 'bun:test'
import { capitalize } from '../../src/string/capitalize'

describe('capitalize', () => {
  it('capitalizes the first character', () => {
    expect(capitalize('hello')).toBe('Hello')
  })

  it('handles empty strings', () => {
    expect(capitalize('')).toBe('')
  })
})
