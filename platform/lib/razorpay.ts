import { createHmac } from 'crypto'

const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET ?? ''
const KEY_ID = process.env.RAZORPAY_KEY_ID ?? ''
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET ?? ''

export function verifyWebhookSignature(body: string, signature: string): boolean {
  if (!WEBHOOK_SECRET) return false
  const expected = createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex')
  return expected === signature
}

export interface RazorpayOrderParams {
  amount: number   // in paise (INR × 100)
  currency: string
  notes: Record<string, string>
}

export async function createOrder(params: RazorpayOrderParams): Promise<{ id: string }> {
  const auth = Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString('base64')
  const reqBody = JSON.stringify({ amount: params.amount, currency: params.currency, notes: params.notes })
  const reqOpts = {
    method: 'POST' as const,
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: reqBody,
  }
  const res = await fetch('https://api.razorpay.com/v1/orders', reqOpts)
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Razorpay order creation failed: ${err}`)
  }
  return res.json() as Promise<{ id: string }>
}
