import { NextRequest, NextResponse } from 'next/server'
import { getSessionCookie } from 'better-auth/cookies'
const PROTECTED = ['/viewer', '/api/embed-token']
const AUTH_ROUTES = ['/api/auth/sign-in', '/api/auth/sign-up']
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
  const { pathname } = request.nextUrl

  // Legacy URL redirects
  if (pathname.startsWith('/auth/')) {
    return NextResponse.redirect(new URL(pathname.replace('/auth/', '/'), request.url), 301)
  }
  if (pathname.startsWith('/channels/')) {
    return NextResponse.redirect(new URL(pathname.replace('/channels/', '/c/'), request.url), 301)
  }

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
    // Pass IP via header for server-side rate limiting in the auth handler
    const res = NextResponse.next()
    res.headers.set('x-client-ip', ip)
    return addSecurityHeaders(res)
  }
  const res = NextResponse.next()
  return addSecurityHeaders(res)
}
export const config = {
  matcher: [
    '/auth/:path*',
    '/channels/:path*',
    '/viewer/:path*',
    '/api/embed-token',
    '/api/auth/:path*',
    '/api/upload',
    '/api/subscriptions',
  ],
}
