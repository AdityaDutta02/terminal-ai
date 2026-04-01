import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./db', () => ({
  db: {
    query: vi.fn().mockResolvedValue({ rows: [] }),
  },
}))

vi.mock('./logger', () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

import { db } from './db'
import { emitEvent, ERROR_MESSAGES } from './deployment-events'

const mockQuery = db.query as ReturnType<typeof vi.fn>

beforeEach(() => {
  mockQuery.mockClear()
  mockQuery.mockResolvedValue({ rows: [] })
})

describe('ERROR_MESSAGES', () => {
  const requiredCodes = [
    'PREFLIGHT_FAILED',
    'BUILD_FAILED',
    'HEALTH_CHECK_FAILED',
    'GATEWAY_UNREACHABLE',
    'COOLIFY_ERROR',
    'TIMEOUT',
    'SECRETS_DETECTED',
  ]

  it('has entries for all 7 required error codes', () => {
    for (const code of requiredCodes) {
      expect(ERROR_MESSAGES).toHaveProperty(code)
      expect(typeof ERROR_MESSAGES[code]).toBe('string')
      expect(ERROR_MESSAGES[code].length).toBeGreaterThan(0)
    }
  })

  it('covers exactly the 7 specified error codes', () => {
    expect(Object.keys(ERROR_MESSAGES)).toEqual(expect.arrayContaining(requiredCodes))
    expect(Object.keys(ERROR_MESSAGES)).toHaveLength(requiredCodes.length)
  })
})

describe('emitEvent', () => {
  it('calls db.query twice — INSERT then UPDATE', async () => {
    await emitEvent('deploy-123', 'BUILD_FAILED', 'Build step failed')

    expect(mockQuery).toHaveBeenCalledTimes(2)

    const [firstCall, secondCall] = mockQuery.mock.calls
    expect(firstCall[0]).toMatch(/INSERT INTO deployments\.deployment_events/i)
    expect(secondCall[0]).toMatch(/UPDATE deployments\.deployments/i)
  })

  it('passes deploymentId, eventType, and message to the INSERT', async () => {
    await emitEvent('deploy-abc', 'TIMEOUT', 'Timed out after 10 minutes')

    const insertCall = mockQuery.mock.calls[0]
    expect(insertCall[1]).toEqual([
      'deploy-abc',
      'TIMEOUT',
      'Timed out after 10 minutes',
      null,
    ])
  })

  it('passes metadata as JSON string in the INSERT when provided', async () => {
    const metadata = { attemptNumber: 2, coolifyJobId: 'job-999' }
    await emitEvent('deploy-xyz', 'COOLIFY_ERROR', 'Coolify rejected the job', metadata)

    const insertCall = mockQuery.mock.calls[0]
    const metadataArg = insertCall[1][3]
    expect(metadataArg).toBe(JSON.stringify(metadata))

    const parsed: unknown = JSON.parse(metadataArg as string)
    expect(parsed).toEqual(metadata)
  })

  it('includes metadata in the UPDATE log_lines entry', async () => {
    const metadata = { region: 'eu-west-1' }
    await emitEvent('deploy-log', 'HEALTH_CHECK_FAILED', 'No 200 after 30s', metadata)

    const updateCall = mockQuery.mock.calls[1]
    const logEntry: unknown = JSON.parse(updateCall[1][0] as string)
    expect(logEntry).toMatchObject({
      event_type: 'HEALTH_CHECK_FAILED',
      message: 'No 200 after 30s',
      metadata,
    })
  })

  it('does not throw when db.query rejects — logs a warning instead', async () => {
    mockQuery.mockRejectedValueOnce(new Error('Connection refused'))

    await expect(
      emitEvent('deploy-fail', 'GATEWAY_UNREACHABLE', 'Cannot reach gateway'),
    ).resolves.toBeUndefined()

    const { logger } = await import('./logger')
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ msg: expect.stringContaining('non-fatal') }),
    )
  })
})
