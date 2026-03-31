import { describe, it, expect } from 'vitest'
import { preflightCheck } from './deploy-queue.js'

describe('preflightCheck', () => {
  it('throws PREFLIGHT_FAILED when gatewayUrl is the string "undefined"', async () => {
    await expect(preflightCheck('undefined', '123e4567-e89b-12d3-a456-426614174000')).rejects.toThrow(
      'TERMINAL_AI_GATEWAY_URL is not set or is "undefined"',
    )
  })

  it('throws PREFLIGHT_FAILED when gatewayUrl is empty string', async () => {
    await expect(preflightCheck('', '123e4567-e89b-12d3-a456-426614174000')).rejects.toThrow(
      'TERMINAL_AI_GATEWAY_URL is not set or is "undefined"',
    )
  })

  it('throws PREFLIGHT_FAILED for invalid UUID appId', async () => {
    await expect(preflightCheck('http://localhost:3001', 'not-a-uuid')).rejects.toThrow(
      'Invalid TERMINAL_AI_APP_ID format',
    )
  })

  it('throws GATEWAY_UNREACHABLE when gateway is unreachable', async () => {
    await expect(
      preflightCheck('http://localhost:19999', '123e4567-e89b-12d3-a456-426614174000'),
    ).rejects.toThrow('Gateway unreachable')
  })
})
