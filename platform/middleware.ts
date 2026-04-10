export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { isWaitlistMode } from '@/lib/waitlist-config'

const BETA_KEY = process.env.BETA_ACCESS_KEY ?? 'beta'
const COOKIE_NAME = 'beta_access'

// Paths that always pass through regardless of waitlist mode
const BYPASS_PREFIXES = [
  '/waitlist',
  '/api/waitlist',
  '/_next',
  '/favicon',
]

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname, searchParams } = request.nextUrl

  // 1. Always-pass-through paths
  if (BYPASS_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next()
  }

  // 2. Auth routes always pass through
  if (pathname.startsWith('/api/auth') || pathname.startsWith('/(auth)')) {
    return NextResponse.next()
  }

  // 3. Beta cookie present — pass through
  if (request.cookies.get(COOKIE_NAME)?.value === '1') {
    return NextResponse.next()
  }

  // 4. Secret access param — set cookie and redirect to clean URL
  if (searchParams.get('access') === BETA_KEY) {
    const url = request.nextUrl.clone()
    url.searchParams.delete('access')
    const response = NextResponse.redirect(url)
    response.cookies.set(COOKIE_NAME, '1', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    })
    return response
  }

  // 5. Check DB flag — if waitlist mode active, redirect to /waitlist
  const waitlistActive = await isWaitlistMode()
  if (!waitlistActive) {
    return NextResponse.next()
  }

  const url = request.nextUrl.clone()
  url.pathname = '/waitlist'
  url.search = ''
  return NextResponse.redirect(url)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.png).*)'],
}
