// platform/lib/pricing.ts

export type ModelTier = 'standard' | 'advanced' | 'premium' | 'image-fast' | 'image-pro'
export const MODEL_TIER_CREDITS: Record<ModelTier, number> = {
  standard: 1,
  advanced: 4,
  premium: 6,
  'image-fast': 3,
  'image-pro': 93,
}

// Price in rupees (display/checkout use). Note: DB subscriptions.plans.price_inr stores paise.
export const PLANS = {
  starter: { priceInr: 149, credits: 250, name: 'Starter', razorpayPlanId: process.env.RAZORPAY_PLAN_ID_STARTER ?? '' },
  creator: { priceInr: 299, credits: 650, name: 'Creator', razorpayPlanId: process.env.RAZORPAY_PLAN_ID_CREATOR ?? '' },
  pro:     { priceInr: 599, credits: 1400, name: 'Pro',     razorpayPlanId: process.env.RAZORPAY_PLAN_ID_PRO ?? '' },
} as const

export type PlanId = keyof typeof PLANS

export const CREDIT_PACKS = {
  pack_100:  { credits: 100,  priceInr: 89   },
  pack_500:  { credits: 500,  priceInr: 399  },
  pack_2000: { credits: 2000, priceInr: 1499 },
} as const

export type CreditPackId = keyof typeof CREDIT_PACKS

export const WELCOME_CREDITS = 20
export const ANON_FREE_USES = 1
export const CREATOR_REVENUE_SHARE = 0.5  // 50% to creator
