import { describe, it, expect } from 'vitest'
import { validateCronSchedule, getNextRunAt } from './cron-utils'

describe('validateCronSchedule', () => {
  it('accepts valid hourly-or-longer cron expressions', () => {
    expect(validateCronSchedule('0 8 * * *')).toEqual({ valid: true })   // daily 8am
    expect(validateCronSchedule('0 */2 * * *')).toEqual({ valid: true }) // every 2h
    expect(validateCronSchedule('0 0 * * 1')).toEqual({ valid: true })   // weekly Monday midnight
  })

  it('rejects sub-hour cron expressions', () => {
    const result = validateCronSchedule('*/5 * * * *') // every 5 min
    expect(result.valid).toBe(false)
    expect(result.error).toContain('1 hour')
  })

  it('rejects every-minute cron', () => {
    const result = validateCronSchedule('* * * * *')
    expect(result.valid).toBe(false)
  })

  it('rejects invalid cron syntax', () => {
    const result = validateCronSchedule('not a cron')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Invalid')
  })

  it('rejects cron with seconds (6 fields)', () => {
    const result = validateCronSchedule('0 0 8 * * *')
    expect(result.valid).toBe(false)
  })
})

describe('getNextRunAt', () => {
  it('returns next run as ISO string for UTC', () => {
    const next = getNextRunAt('0 8 * * *', 'UTC')
    const date = new Date(next)
    expect(date.getUTCHours()).toBe(8)
    expect(date.getUTCMinutes()).toBe(0)
    expect(date > new Date()).toBe(true)
  })

  it('respects timezone', () => {
    const next = getNextRunAt('0 8 * * *', 'Asia/Kolkata')
    const date = new Date(next)
    // 8:00 IST = 2:30 UTC
    expect(date.getUTCHours()).toBe(2)
    expect(date.getUTCMinutes()).toBe(30)
  })
})
