import { NextResponse, type NextRequest } from 'next/server'

// The Proxmox VM serves only the client portal. On the portal hostname (or with
// PORTAL_ONLY=1), send "/" to /portal and hide the marketing pages.
const PORTAL_HOSTS = ['portal.365smg.com']
const PORTAL_PATHS = /^\/(portal|api\/portal)(\/|$)/

export function proxy(request: NextRequest) {
  const host = (request.headers.get('host') ?? '').split(':')[0]
  if (process.env.PORTAL_ONLY !== '1' && !PORTAL_HOSTS.includes(host)) return NextResponse.next()

  const { pathname } = request.nextUrl
  if (pathname === '/') {
    // Next needs an absolute Location. Behind the tunnel, request.url carries the internal
    // address, so use the public hostname when it's ours (never an arbitrary Host header).
    const target = PORTAL_HOSTS.includes(host) ? `https://${host}/portal` : new URL('/portal', request.url)
    return NextResponse.redirect(target, 307)
  }
  if (PORTAL_PATHS.test(pathname)) return NextResponse.next()
  return new NextResponse('Not found', { status: 404 })
}

export const config = {
  // Static assets (scripts, styles, images) always pass through.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|portal/).*)'],
}
