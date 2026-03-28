import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { ShareButton } from './share-button'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('ShareButton', () => {
  it('exports ShareButton as a function', () => {
    expect(typeof ShareButton).toBe('function')
  })

  it('copies link via execCommand fallback when clipboard API is unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      configurable: true,
    })
    document.execCommand = vi.fn().mockReturnValue(true)

    render(<ShareButton url="http://example.com/test" title="Test" type="channel" />)
    fireEvent.click(screen.getByText('Share'))
    fireEvent.click(screen.getByText('📋 Copy link'))

    await new Promise(r => setTimeout(r, 10))
    expect(document.execCommand).toHaveBeenCalledWith('copy')
  })

  it('shows Copied! feedback after successful copy', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    })

    render(<ShareButton url="http://example.com" title="Test" type="app" />)
    fireEvent.click(screen.getByText('Share'))
    fireEvent.click(screen.getByText('📋 Copy link'))

    await screen.findByText('✓ Copied!')
  })
})
