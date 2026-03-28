import { describe, it, expect, vi } from 'vitest'
import { collectSignal } from './signals'
describe('collectSignal', () => {
  it('writes signal row to DB', async () => {
    const mockDb = { query: vi.fn().mockResolvedValue({ rows: [] }) }
    await collectSignal({
      db: mockDb as never,
      userId: 'user-1',
      appId: 'app-1',
      sessionId: 'session-1',
      apiCallId: 'call-1',
      responseTimeMs: 450,
      inputTokens: 100,
      outputTokens: 200,
      model: 'claude-3-5-haiku',
      provider: 'openrouter',
    })
    expect(mockDb.query).toHaveBeenCalledOnce()
    const sql = mockDb.query.mock.calls[0][0] as string
    expect(sql).toContain('optimizer.behavioral_signals')
  })
})
