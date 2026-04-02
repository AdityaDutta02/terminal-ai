import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // /auth/* → strip /auth prefix (pages live under /(auth)/ route group)
  if (pathname.startsWith('/auth/')) {
    const target = pathname.replace('/auth/', '/')
    return NextResponse.redirect(new URL(target, request.url), 301)
  }

  // /channels/slug/app → /c/slug/app
  if (pathname.startsWith('/channels/')) {
    const target = pathname.replace('/channels/', '/c/')
    return NextResponse.redirect(new URL(target, request.url), 301)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/auth/:path*', '/channels/:path*'],
}
