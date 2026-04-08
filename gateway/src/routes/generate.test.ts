import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { EmbedTokenPayload } from '../middleware/auth.js'

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

const validEmbedToken: EmbedTokenPayload = {
  userId: 'user-1',
  appId: 'app-1',
  sessionId: 'sess-1',
  creditsPerCall: 4,
  isFree: false,
  isAnon: false,
}

describe('handleGenerate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when no embedToken is present', async () => {
    const ctx = {
      req: { json: () => Promise.resolve({ category: 'chat', tier: 'good', messages: [{ role: 'user', content: 'hi' }] }) },
      json: vi.fn(),
      get: vi.fn().mockReturnValue(undefined),
    }
    await handleGenerate(ctx as unknown as Parameters<typeof handleGenerate>[0])
    expect(ctx.json).toHaveBeenCalledWith({ error: 'Unauthorized' }, 401)
  })

  it('returns 403 when userId is null (anonymous user)', async () => {
    const anonToken: EmbedTokenPayload = { ...validEmbedToken, userId: null, isAnon: true }
    const ctx = {
      req: { json: () => Promise.resolve({ category: 'chat', tier: 'good', messages: [{ role: 'user', content: 'hi' }] }) },
      json: vi.fn(),
      get: vi.fn().mockReturnValue(anonToken),
    }
    await handleGenerate(ctx as unknown as Parameters<typeof handleGenerate>[0])
    expect(ctx.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('anonymous') }),
      403
    )
  })

  it('returns 400 for missing category', async () => {
    const ctx = {
      req: { json: () => Promise.resolve({ tier: 'good', messages: [] }) },
      json: vi.fn(),
      get: vi.fn().mockReturnValue(validEmbedToken),
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
      get: vi.fn().mockReturnValue(validEmbedToken),
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
