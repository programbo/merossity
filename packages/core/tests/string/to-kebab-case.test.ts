import { describe, expect, it } from 'bun:test'
import { toKebabCase } from '../../src/string/to-kebab-case'

describe('toKebabCase', () => {
  it('normalizes words into kebab-case', () => {
    expect(toKebabCase('Hello World')).toBe('hello-world')
    expect(toKebabCase('hello_world')).toBe('hello-world')
  })

  it('splits camelCase and removes punctuation', () => {
    expect(toKebabCase('mySuperValue!!')).toBe('my-super-value')
  })
})
