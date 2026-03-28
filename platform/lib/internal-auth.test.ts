import { describe, it, expect, vi } from 'vitest'

vi.stubEnv('INTERNAL_SERVICE_TOKEN', 'test-secret-token-abc123')

const { validateServiceToken, getCreatorIdFromRequest, unauthorizedResponse } = await import('./internal-auth')

describe('validateServiceToken', () => {
  it('returns true when X-Service-Token matches env var', () => {
    const req = new Request('http://localhost', {
      headers: { 'X-Service-Token': 'test-secret-token-abc123' }
    })
    expect(validateServiceToken(req)).toBe(true)
  })

  it('returns false when token is missing', () => {
    const req = new Request('http://localhost')
    expect(validateServiceToken(req)).toBe(false)
  })

  it('returns false when token is wrong', () => {
    const req = new Request('http://localhost', {
      headers: { 'X-Service-Token': 'wrong-token' }
    })
    expect(validateServiceToken(req)).toBe(false)
  })
})

describe('getCreatorIdFromRequest', () => {
  it('returns X-Creator-Id header value', () => {
    const req = new Request('http://localhost', {
      headers: { 'X-Creator-Id': 'user-abc' }
    })
    expect(getCreatorIdFromRequest(req)).toBe('user-abc')
  })

  it('returns null when header is absent', () => {
    const req = new Request('http://localhost')
    expect(getCreatorIdFromRequest(req)).toBeNull()
  })
})

describe('unauthorizedResponse', () => {
  it('returns a 401 response with JSON error body', async () => {
    const res = unauthorizedResponse()
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('Unauthorized')
  })
})
