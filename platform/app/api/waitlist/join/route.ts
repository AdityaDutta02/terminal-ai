import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { sendWaitlistConfirmationEmail } from '@/lib/email'

const JoinSchema = z.object({
  email: z.string().email(),
  name: z.string().max(100).optional(),
})

// Simple in-memory rate limiter: 5 requests per IP per hour
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)
  if (!entry || now >= entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60 * 60 * 1000 })
    return true
  }
  if (entry.count >= 5) return false
  entry.count++
  return true
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'

  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = JoinSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
  }

  const { email, name } = parsed.data

  try {
    const result = await db.query<{ id: string }>(
      `INSERT INTO platform.waitlist (email, name)
       VALUES ($1, $2)
       ON CONFLICT (email) DO NOTHING
       RETURNING id`,
      [email, name ?? null],
    )

    const alreadyJoined = result.rows.length === 0

    // Only send confirmation if this is a new signup
    if (!alreadyJoined) {
      sendWaitlistConfirmationEmail(email).catch((err: unknown) =>
        logger.error({ msg: 'waitlist_confirmation_email_failed', email, err: String(err) }),
      )
    }

    return NextResponse.json({ joined: true, alreadyJoined })
  } catch (err) {
    logger.error({ msg: 'waitlist_join_failed', email, err: String(err) })
    return NextResponse.json({ error: 'Failed to join waitlist' }, { status: 500 })
  }
}
