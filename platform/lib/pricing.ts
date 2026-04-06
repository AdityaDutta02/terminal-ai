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
  monthly: {
    priceInr: 299,
    introInr: 99,
    name: 'Monthly',
    razorpayPlanId: process.env.RAZORPAY_PLAN_ID_MONTHLY ?? '',
    // Separate offers per payment method — both discount ₹200 off cycle 1 (net ₹99)
    razorpayOfferIdCard: process.env.RAZORPAY_OFFER_ID_MONTHLY_CARD ?? '',
    razorpayOfferIdUpi:  process.env.RAZORPAY_OFFER_ID_MONTHLY_UPI  ?? '',
  },
  annual: {
    priceInr: 2490,
    name: 'Annual',
    razorpayPlanId: process.env.RAZORPAY_PLAN_ID_ANNUAL ?? '',
  },
} as const

export type PlanId = keyof typeof PLANS

export const CREDIT_PACKS = {
  pack_100:  { credits: 100,  priceInr: 89   },
  pack_500:  { credits: 500,  priceInr: 399  },
  pack_2000: { credits: 2000, priceInr: 1499 },
} as const

export type CreditPackId = keyof typeof CREDIT_PACKS

export const WELCOME_CREDITS = 10
export const ANON_FREE_USES = 1
export const CREATOR_REVENUE_SHARE = 0.5  // 50% to creator
