import { describe, it, expect, vi } from 'vitest'
import { kmodelVote, kmodelJudge } from './kmodel'
const mockCallLLM = vi.fn()
describe('kmodelVote', () => {
  it('returns majority response when 2/3 agree', async () => {
    mockCallLLM
      .mockResolvedValueOnce('Paris')
      .mockResolvedValueOnce('Paris')
      .mockResolvedValueOnce('Lyon')
    const result = await kmodelVote(
      [
        { provider: 'openrouter', model: 'haiku' },
        { provider: 'openrouter', model: 'haiku' },
        { provider: 'openrouter', model: 'haiku' },
      ],
      [{ role: 'user', content: 'Capital of France?' }],
      mockCallLLM
    )
    expect(result.response).toBe('Paris')
    expect(result.votes).toEqual({ Paris: 2, Lyon: 1 })
  })
})
describe('kmodelJudge', () => {
  it('calls judge with all candidates', async () => {
    mockCallLLM
      .mockResolvedValueOnce('Response A')
      .mockResolvedValueOnce('Response B')
      .mockResolvedValueOnce('Response B')
    const result = await kmodelJudge(
      [{ provider: 'openrouter', model: 'haiku' }, { provider: 'openrouter', model: 'sonnet' }],
      { provider: 'openrouter', model: 'claude-3-5-sonnet' },
      [{ role: 'user', content: 'Write a poem' }],
      mockCallLLM
    )
    expect(result.response).toBe('Response B')
  })
})
