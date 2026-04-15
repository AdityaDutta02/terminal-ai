import { NextRequest, NextResponse } from 'next/server'
import { getSessionCookie } from 'better-auth/cookies'

const PROTECTED = ['/viewer']
const AUTH_ROUTES = ['/api/auth/sign-in', '/api/auth/sign-up']

const BETA_KEY = process.env.BETA_ACCESS_KEY ?? 'beta'
const BETA_COOKIE = 'beta_access'

// Paths exempt from the waitlist gate
const WAITLIST_BYPASS = [
  '/waitlist',
  '/api/waitlist',
  '/api/auth',
  '/api/internal',
  '/_next',
  '/favicon',
]

// Module-level TTL cache for the waitlist_mode flag (30s)
let waitlistCache: { active: boolean; expiresAt: number } | null = null

async function getWaitlistMode(request: NextRequest): Promise<boolean> {
  const now = Date.now()
  if (waitlistCache && now < waitlistCache.expiresAt) return waitlistCache.active
  try {
    const res = await fetch(`${request.nextUrl.origin}/api/waitlist/mode`, {
      headers: { 'x-internal': '1' },
      cache: 'no-store',
    })
    const data = (await res.json()) as { active: boolean }
    waitlistCache = { active: data.active, expiresAt: now + 30_000 }
    return data.active
  } catch {
    return true // safe default: keep waitlist on
  }
}

function getIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  )
}

function addSecurityHeaders(res: NextResponse): NextResponse {
  res.headers.set('X-Content-Type-Options', 'nosniff')
  res.headers.set('X-Frame-Options', 'SAMEORIGIN')
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  return res
}

export async function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl

  // Legacy URL redirects
  if (pathname.startsWith('/auth/')) {
    return NextResponse.redirect(new URL(pathname.replace('/auth/', '/'), request.url), 301)
  }
  if (pathname.startsWith('/channels/')) {
    return NextResponse.redirect(new URL(pathname.replace('/channels/', '/c/'), request.url), 301)
  }

  // ── Waitlist gate ──────────────────────────────────────────────
  const isBypass = WAITLIST_BYPASS.some((p) => pathname.startsWith(p))
  if (!isBypass) {
    if (request.cookies.get(BETA_COOKIE)?.value !== '1') {
      // ?access=<key> sets 7-day cookie and redirects to clean URL
      if (searchParams.get('access') === BETA_KEY) {
        const url = request.nextUrl.clone()
        url.searchParams.delete('access')
        const response = NextResponse.redirect(url)
        response.cookies.set(BETA_COOKIE, '1', {
          httpOnly: true,
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
          maxAge: 60 * 60 * 24 * 7,
          path: '/',
        })
        return response
      }

      const waitlistActive = await getWaitlistMode(request)
      if (waitlistActive) {
        const url = request.nextUrl.clone()
        url.pathname = '/waitlist'
        url.search = ''
        return NextResponse.redirect(url)
      }
    }
  }
  // ── End waitlist gate ──────────────────────────────────────────

  const isProtected = PROTECTED.some((p) => pathname.startsWith(p))
  if (isProtected) {
    const session = getSessionCookie(request)
    if (!session) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      url.searchParams.set('next', pathname)
      return NextResponse.redirect(url)
    }
  }

  // Block obvious auth brute-force via IP header inspection
  // (Redis rate limiting runs server-side in the route handler itself)
  const isAuthRoute = AUTH_ROUTES.some((r) => pathname.startsWith(r))
  if (isAuthRoute) {
    const ip = getIp(request)
    const res = NextResponse.next()
    res.headers.set('x-client-ip', ip)
    return addSecurityHeaders(res)
  }

  const res = NextResponse.next()
  return addSecurityHeaders(res)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.png).*)'],
}
