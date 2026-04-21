import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/db', () => ({ db: { query: vi.fn() } }))

import { db } from '../lib/db'
import { enableCompatShim, disableCompatShim, getCompatShimStatus } from './compat-shim'

describe('enableCompatShim', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sets compat_shim_enabled = true and returns enabled: true', async () => {
    vi.mocked(db.query).mockResolvedValue({ rows: [{ compat_shim_enabled: true }] } as never)
    const result = await enableCompatShim('app-123')
    expect(result).toEqual({ enabled: true })
    expect(vi.mocked(db.query).mock.calls[0][0]).toContain('compat_shim_enabled = true')
  })

  it('throws when app not found', async () => {
    vi.mocked(db.query).mockResolvedValue({ rows: [] } as never)
    await expect(enableCompatShim('nonexistent')).rejects.toThrow('App not found')
  })
})

describe('disableCompatShim', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sets compat_shim_enabled = false and returns enabled: false', async () => {
    vi.mocked(db.query).mockResolvedValue({ rows: [{ compat_shim_enabled: false }] } as never)
    const result = await disableCompatShim('app-123')
    expect(result).toEqual({ enabled: false })
    expect(vi.mocked(db.query).mock.calls[0][0]).toContain('compat_shim_enabled = false')
  })

  it('throws when app not found', async () => {
    vi.mocked(db.query).mockResolvedValue({ rows: [] } as never)
    await expect(disableCompatShim('nonexistent')).rejects.toThrow('App not found')
  })
})

describe('getCompatShimStatus', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns true when enabled', async () => {
    vi.mocked(db.query).mockResolvedValue({ rows: [{ compat_shim_enabled: true }] } as never)
    expect(await getCompatShimStatus('app-123')).toBe(true)
  })

  it('returns false when disabled', async () => {
    vi.mocked(db.query).mockResolvedValue({ rows: [{ compat_shim_enabled: false }] } as never)
    expect(await getCompatShimStatus('app-123')).toBe(false)
  })
})
