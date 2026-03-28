import { describe, it, expect } from 'vitest'
import { loadFonts } from './og'

describe('loadFonts', () => {
  it('returns non-empty ArrayBuffers for regular and bold', async () => {
    const fonts = await loadFonts()
    expect(fonts.regular.byteLength).toBeGreaterThan(0)
    expect(fonts.bold.byteLength).toBeGreaterThan(0)
  })
})
