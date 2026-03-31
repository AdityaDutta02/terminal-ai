import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock all external dependencies before importing auth
vi.mock('./db', () => ({
  db: { query: vi.fn() },
  withTransaction: vi.fn(),
}))

vi.mock('./credits', () => ({
  grantCredits: vi.fn(),
}))

vi.mock('./logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

vi.mock('better-auth', () => ({
  betterAuth: vi.fn(() => ({
    handler: vi.fn(),
    api: {},
    $Infer: { Session: {} },
  })),
}))

vi.mock('pg', () => ({
  Pool: vi.fn(function Pool() { return {} }),
}))

vi.stubEnv('DATABASE_URL', 'postgresql://localhost/test')

describe('auth configuration', () => {
  it('loads without errors', async () => {
    const { auth } = await import('./auth')
    expect(auth).toBeDefined()
  })
})

// Tests for the afterEmailVerification hook logic.
// The hook is tested by extracting its behavior through mocks.
describe('afterEmailVerification hook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('grants welcome credits when none exist yet', async () => {
    const { db } = await import('./db')
    const { grantCredits } = await import('./credits')
    const mockQuery = vi.mocked(db.query)
    const mockGrant = vi.mocked(grantCredits)

    // Simulate no existing welcome_bonus ledger entry
    mockQuery.mockResolvedValueOnce({ rows: [] } as never)
    mockGrant.mockResolvedValueOnce(undefined as never)

    // Re-import betterAuth to capture the callback passed to it
    const { betterAuth } = await import('better-auth')
    const mockBetterAuth = vi.mocked(betterAuth)

    await import('./auth')

    expect(mockBetterAuth).toHaveBeenCalled()
    const config = mockBetterAuth.mock.calls[0][0] as {
      emailVerification: { afterEmailVerification: (user: { id: string }) => Promise<void> }
    }
    const hook = config.emailVerification.afterEmailVerification

    await hook({ id: 'user-123' })

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('welcome_bonus'),
      ['user-123'],
    )
    expect(mockGrant).toHaveBeenCalledWith('user-123', expect.any(Number), 'welcome_bonus')
  })

  it('skips grant if welcome credits already exist (idempotency)', async () => {
    const { db } = await import('./db')
    const { grantCredits } = await import('./credits')
    const mockQuery = vi.mocked(db.query)
    const mockGrant = vi.mocked(grantCredits)

    // Simulate an existing welcome_bonus ledger entry
    mockQuery.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] } as never)

    const { betterAuth } = await import('better-auth')
    const mockBetterAuth = vi.mocked(betterAuth)

    await import('./auth')

    const config = mockBetterAuth.mock.calls[0][0] as {
      emailVerification: { afterEmailVerification: (user: { id: string }) => Promise<void> }
    }
    const hook = config.emailVerification.afterEmailVerification

    await hook({ id: 'user-456' })

    expect(mockQuery).toHaveBeenCalledOnce()
    expect(mockGrant).not.toHaveBeenCalled()
  })

  it('returns early without querying if user.id is falsy (null guard)', async () => {
    const { db } = await import('./db')
    const { grantCredits } = await import('./credits')
    const mockQuery = vi.mocked(db.query)
    const mockGrant = vi.mocked(grantCredits)

    const { betterAuth } = await import('better-auth')
    const mockBetterAuth = vi.mocked(betterAuth)

    await import('./auth')

    const config = mockBetterAuth.mock.calls[0][0] as {
      emailVerification: { afterEmailVerification: (user: { id: string }) => Promise<void> }
    }
    const hook = config.emailVerification.afterEmailVerification

    await hook({ id: '' })

    expect(mockQuery).not.toHaveBeenCalled()
    expect(mockGrant).not.toHaveBeenCalled()
  })

  it('logs error and does not throw if db.query fails', async () => {
    const { db } = await import('./db')
    const { logger } = await import('./logger')
    const mockQuery = vi.mocked(db.query)
    const mockLogger = vi.mocked(logger.error)

    mockQuery.mockRejectedValueOnce(new Error('db connection failed') as never)

    const { betterAuth } = await import('better-auth')
    const mockBetterAuth = vi.mocked(betterAuth)

    await import('./auth')

    const config = mockBetterAuth.mock.calls[0][0] as {
      emailVerification: { afterEmailVerification: (user: { id: string }) => Promise<void> }
    }
    const hook = config.emailVerification.afterEmailVerification

    // Should not throw
    await expect(hook({ id: 'user-789' })).resolves.toBeUndefined()

    expect(mockLogger).toHaveBeenCalledWith(
      expect.objectContaining({ msg: 'welcome_credits_grant_failed', userId: 'user-789' }),
    )
  })
})
