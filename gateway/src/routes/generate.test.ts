import { describe, it, expect, vi } from 'vitest'

vi.mock('../lib/model-routing', () => ({
  resolveModel: vi.fn().mockResolvedValue('anthropic/claude-haiku-4-5'),
  getCreditCost: vi.fn().mockReturnValue(4),
  VALID_CATEGORIES: new Set(['chat', 'coding']),
  VALID_TIERS: new Set(['fast', 'good', 'quality']),
}))
vi.mock('../db', () => ({
  db: { query: vi.fn().mockResolvedValue({ rows: [] }) }
}))
vi.mock('../lib/openrouter', () => ({
  callOpenRouter: vi.fn().mockResolvedValue({
    content: 'Hello world',
    usage: { prompt_tokens: 10, completion_tokens: 20 },
  })
}))

// Import after mocks
const { handleGenerate } = await import('./generate')

describe('handleGenerate', () => {
  it('returns 400 for missing category', async () => {
    const ctx = {
      req: { json: () => Promise.resolve({ tier: 'good', messages: [] }) },
      json: vi.fn(),
      get: vi.fn().mockReturnValue({ userId: 'user-1', appId: 'app-1', creditsCharged: 4 }),
    }
    await handleGenerate(ctx as unknown as Parameters<typeof handleGenerate>[0])
    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('category') }),
      400
    )
  })

  it('returns generate response with model_used', async () => {
    const ctx = {
      req: { json: () => Promise.resolve({ category: 'chat', tier: 'good', messages: [{ role: 'user', content: 'hi' }] }) },
      json: vi.fn(),
      get: vi.fn().mockReturnValue({ userId: 'user-1', appId: 'app-1', creditsCharged: 4 }),
    }
    await handleGenerate(ctx as unknown as Parameters<typeof handleGenerate>[0])
    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'chat',
        tier: 'good',
        model_used: 'anthropic/claude-haiku-4-5',
      })
    )
  })
})
