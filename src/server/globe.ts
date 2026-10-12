import { createHmac, randomBytes } from 'node:crypto'

// Sign-in tickets for the God's Eye View gate (deploy/globe/gate.mjs). The portal puts a
// short-lived, single-use ticket in the globe's iframe URL; the gate checks it with the
// shared secret (SMG_GLOBE_SECRET here, GATE_SECRET there), swaps it for its own cookie,
// and only then shows the globe. Format: v1.<base64url JSON {cid, exp, jti}>.<base64url HMAC-SHA256>

export const TICKET_SECONDS = 60
const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url')

export function globeTicket(secret: string, clientId: string, now = Date.now()) {
  const payload = b64(
    JSON.stringify({ cid: clientId, exp: Math.floor(now / 1000) + TICKET_SECONDS, jti: randomBytes(16).toString('base64url') }),
  )
  return `v1.${payload}.${b64(createHmac('sha256', secret).update(`v1.${payload}`).digest())}`
}

const isLocal = (u: URL) => u.hostname === 'localhost' || u.hostname === '127.0.0.1'

/**
 * The globe's iframe URL for a client, with a fresh ticket; undefined (the static map
 * instead) when SMG_GLOBE_URL is unset or invalid, or when a non-local globe has no secret:
 * a public globe is never framed without its gate.
 */
export function globeUrlFor(clientId: string) {
  const raw = process.env.SMG_GLOBE_URL
  if (!raw) return undefined
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return undefined
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return undefined
  const secret = process.env.SMG_GLOBE_SECRET ?? ''
  if (secret.length < 32) {
    if (isLocal(u)) return u.toString()
    console.warn('[globe] SMG_GLOBE_SECRET (32+ characters) is required for a non-local SMG_GLOBE_URL; showing the static map')
    return undefined
  }
  u.searchParams.set('t', globeTicket(secret, clientId))
  return u.toString()
}
