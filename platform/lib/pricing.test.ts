import { describe, it, expect } from 'vitest'
import { MODEL_TIER_CREDITS, PLANS, CREDIT_PACKS, WELCOME_CREDITS, ANON_FREE_USES } from './pricing'

describe('pricing constants', () => {
  it('standard tier costs 1 credit', () => {
    expect(MODEL_TIER_CREDITS['standard']).toBe(1)
  })
  it('all model tiers defined', () => {
    expect(MODEL_TIER_CREDITS['advanced']).toBe(4)
    expect(MODEL_TIER_CREDITS['premium']).toBe(6)
    expect(MODEL_TIER_CREDITS['image-fast']).toBe(3)
    expect(MODEL_TIER_CREDITS['image-pro']).toBe(93)
  })
  it('plans have correct prices', () => {
    expect(PLANS.starter.priceInr).toBe(149)
    expect(PLANS.creator.priceInr).toBe(299)
    expect(PLANS.pro.priceInr).toBe(599)
  })
  it('welcome credits is 20', () => {
    expect(WELCOME_CREDITS).toBe(20)
  })
  it('anon free uses is 1', () => {
    expect(ANON_FREE_USES).toBe(1)
  })
})
