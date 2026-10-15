import { cache } from 'react'
import { cookies, headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { nextStep, sessionFromToken, type Current, type Step } from './auth'
import { db } from './db'
import type { Role } from './store'

const COOKIE = 'smg_session'

export const stepPath: Record<Exclude<Step, 'done'>, string> = {
  password: '/portal/login/password',
  'mfa-setup': '/portal/login/mfa-setup',
  mfa: '/portal/login/mfa',
}

export const homePath = (role: Role) => (role === 'client' ? '/portal' : '/portal/admin')

export async function requestMeta() {
  const h = await headers()
  return {
    // Cloudflare sets cf-connecting-ip; the tunnel is the only way in on the VM.
    ip: h.get('cf-connecting-ip') ?? h.get('x-forwarded-for')?.split(',')[0].trim() ?? null,
    ua: h.get('user-agent'),
  }
}

export async function readToken() {
  return (await cookies()).get(COOKIE)?.value
}

export async function setSessionCookie(token: string) {
  ;(await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/portal',
    maxAge: 12 * 3600,
  })
}

export async function clearSessionCookie() {
  ;(await cookies()).delete({ name: COOKIE, path: '/portal' })
}

/** The signed-in session for this request, at whatever login step it has reached. */
export const currentSession = cache(async (): Promise<Current | null> => sessionFromToken(db(), await readToken()))

/** For pages and actions behind login. Sends people to the right login step, or 404s on the wrong role. */
export async function requireUser(roles?: Role[]): Promise<Current> {
  const c = await currentSession()
  if (!c) redirect('/portal/login')
  const step = nextStep(c)
  if (step !== 'done') redirect(stepPath[step])
  if (roles && !roles.includes(c.user.role)) notFound()
  return c
}

/** For the login step pages: needs a session that has reached exactly this step. */
export async function requireStep(step: Exclude<Step, 'done'>): Promise<Current> {
  const c = await currentSession()
  if (!c) redirect('/portal/login')
  const actual = nextStep(c)
  if (actual === 'done') redirect(homePath(c.user.role))
  if (actual !== step) redirect(stepPath[actual])
  return c
}
