import { describe, it, expect } from 'vitest'
import { createTrace } from './langfuse'
describe('createTrace', () => {
  it('returns a trace object with flush method', () => {
    const trace = createTrace({
      name: 'test-trace',
      userId: 'user-hash-abc',
      sessionId: 'session-hash-xyz',
      appId: 'app-id',
    })
    expect(trace).toHaveProperty('id')
    expect(typeof trace.flush).toBe('function')
  })
})
