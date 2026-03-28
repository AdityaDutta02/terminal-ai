import { describe, it, expect } from 'vitest'
import { slugify } from './slugify'

describe('slugify', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    expect(slugify('Hello World')).toBe('hello-world')
  })

  it('trims leading/trailing whitespace', () => {
    expect(slugify('  my channel  ')).toBe('my-channel')
  })

  it('collapses multiple special chars to single hyphen', () => {
    expect(slugify('Hello  --  World')).toBe('hello-world')
  })

  it('removes leading and trailing hyphens', () => {
    expect(slugify('--hello--')).toBe('hello')
  })

  it('truncates to 60 characters', () => {
    const long = 'a'.repeat(80)
    expect(slugify(long)).toHaveLength(60)
  })

  it('handles already-slugified input', () => {
    expect(slugify('already-slug')).toBe('already-slug')
  })
})
