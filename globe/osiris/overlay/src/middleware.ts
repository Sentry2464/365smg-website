import { NextResponse } from 'next/server';

/*
 * 365 SMG client edition. Replaces OSIRIS's middleware, which reported every request
 * (visitor IP included) to an analytics server. This one only sets the security headers,
 * read at run time so the framing site can change without a rebuild:
 *   OSIRIS_FRAME_ANCESTORS  who may frame the map (default https://portal.365securitymg.com)
 */
const FRAME_ANCESTORS = process.env.OSIRIS_FRAME_ANCESTORS || 'https://portal.365securitymg.com';

export function middleware() {
  const res = NextResponse.next();
  res.headers.set(
    'Content-Security-Policy',
    `default-src 'self' 'unsafe-inline' 'unsafe-eval' https: wss: data: blob:; frame-ancestors ${FRAME_ANCESTORS}`,
  );
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  return res;
}

export const config = { matcher: ['/((?!_next/static|_next/image|vendor/).*)'] };
