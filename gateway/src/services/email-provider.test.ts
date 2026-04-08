import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ResendEmailProvider } from './email-provider'

// Mock the Resend module
const sendMock = vi.fn()
vi.mock('resend', () => {
  return {
    Resend: class MockResend {
      emails = { send: sendMock }
    },
  }
})

describe('ResendEmailProvider', () => {
  let provider: ResendEmailProvider

  beforeEach(() => {
    vi.clearAllMocks()
    provider = new ResendEmailProvider('test-api-key')
  })

  it('sends email and returns messageId', async () => {
    ;(sendMock as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: 'msg-123' },
      error: null,
    })

    const result = await provider.send({
      from: 'Terminal AI <noreply@test.com>',
      to: 'user@example.com',
      subject: 'Test',
      html: '<p>Hello</p>',
    })

    expect(result.messageId).toBe('msg-123')
    expect(sendMock).toHaveBeenCalledWith({
      from: 'Terminal AI <noreply@test.com>',
      to: 'user@example.com',
      subject: 'Test',
      html: '<p>Hello</p>',
    })
  })

  it('throws on Resend API error', async () => {
    ;(sendMock as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: null,
      error: { message: 'Invalid API key' },
    })

    await expect(
      provider.send({
        from: 'test@test.com',
        to: 'user@test.com',
        subject: 'Test',
        html: '<p>Hi</p>',
      }),
    ).rejects.toThrow('Email delivery failed: Invalid API key')
  })
})
