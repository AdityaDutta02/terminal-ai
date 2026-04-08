import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../db', () => ({
  db: {
    query: vi.fn().mockResolvedValue({
      rows: [{ model_string: 'anthropic/claude-haiku-4-5' }]
    })
  }
}))

import { resolveModel, CREDIT_COSTS_V2 } from './model-routing'

describe('resolveModel', () => {
  it('returns model string for valid category/tier', async () => {
    const model = await resolveModel('chat', 'good')
    expect(model).toBe('anthropic/claude-haiku-4-5')
  })

  it('throws for unknown category', async () => {
    const { db } = await import('../db')
    vi.mocked(db.query).mockResolvedValueOnce({ rows: [] } as never)
    await expect(resolveModel('invalid', 'fast')).rejects.toThrow('No model route found')
  })
})

describe('CREDIT_COSTS_V2', () => {
  it('has costs for all category/tier combinations', () => {
    expect(CREDIT_COSTS_V2['chat']['fast']).toBe(1)
    expect(CREDIT_COSTS_V2['chat']['good']).toBe(4)
    expect(CREDIT_COSTS_V2['chat']['quality']).toBe(6)
    expect(CREDIT_COSTS_V2['image']['quality']).toBe(93)
  })
})
