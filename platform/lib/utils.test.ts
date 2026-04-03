import { describe, it, expect } from 'vitest'
import { safeRedirectPath } from './utils'

describe('safeRedirectPath', () => {
  it('returns / for null', () => {
    expect(safeRedirectPath(null)).toBe('/')
  })

  it('returns / for undefined', () => {
    expect(safeRedirectPath(undefined)).toBe('/')
  })

  it('returns / for empty string', () => {
    expect(safeRedirectPath('')).toBe('/')
  })

  it('allows relative paths', () => {
    expect(safeRedirectPath('/dashboard')).toBe('/dashboard')
    expect(safeRedirectPath('/c/invest-os')).toBe('/c/invest-os')
    expect(safeRedirectPath('/pricing?reason=insufficient_credits')).toBe('/pricing?reason=insufficient_credits')
  })

  it('blocks absolute URLs', () => {
    expect(safeRedirectPath('https://evil.com')).toBe('/')
    expect(safeRedirectPath('http://evil.com')).toBe('/')
  })

  it('blocks protocol-relative URLs', () => {
    expect(safeRedirectPath('//evil.com')).toBe('/')
    expect(safeRedirectPath('//evil.com/phish')).toBe('/')
  })

  it('blocks paths with colon (protocol schemes)', () => {
    expect(safeRedirectPath('javascript:alert(1)')).toBe('/')
    expect(safeRedirectPath('data:text/html,<script>')).toBe('/')
  })
})
