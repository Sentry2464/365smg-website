import { createHash, randomBytes } from 'node:crypto'
import type { Database } from 'better-sqlite3'
import { audit, hashPassword, verifyPassword } from './core.mjs'
import { decryptSecret, encryptSecret } from './secrets'
import { findUserByEmail, getUser, type UserRow } from './store'
import { newTotpSecret, verifyTotp } from './totp'

// Login is three steps: password, then (first time) a new password and an
// authenticator app, then a 6-digit code every time. A session only counts as
// signed in once mfa_passed = 1.

const MAX_FAILURES = 5
const LOCK_MINUTES = 15
const PENDING_MINUTES = 15 // a session that has only passed the password step
const SESSION_HOURS = 12 // absolute lifetime after the code step
const IDLE_HOURS = 2
export const MIN_PASSWORD_LENGTH = 12

export interface SessionRow {
  token_hash: string
  user_id: string
  mfa_passed: number
  created_at: string
  last_seen_at: string
  expires_at: string
}

export interface Current {
  session: SessionRow
  user: UserRow
}

export type Step = 'password' | 'mfa-setup' | 'mfa' | 'done'

const iso = (d: Date) => d.toISOString()
const minutesFromNow = (m: number) => iso(new Date(Date.now() + m * 60_000))
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

// A real hash to compare against when the email is unknown, so timing doesn't reveal which emails exist.
let dummyHash: Promise<string> | null = null

export function nextStep(c: Current): Step {
  if (c.user.must_change_password) return 'password'
  if (!c.user.totp_enabled_at) return 'mfa-setup'
  if (!c.session.mfa_passed) return 'mfa'
  return 'done'
}

function createSession(db: Database, userId: string, mfaPassed: boolean, meta: { ip?: string | null; ua?: string | null }) {
  const token = randomBytes(32).toString('base64url')
  const now = new Date()
  db.prepare(
    `INSERT INTO sessions (token_hash, user_id, mfa_passed, created_at, last_seen_at, expires_at, ip, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    hashToken(token),
    userId,
    mfaPassed ? 1 : 0,
    iso(now),
    iso(now),
    mfaPassed ? minutesFromNow(SESSION_HOURS * 60) : minutesFromNow(PENDING_MINUTES),
    meta.ip ?? null,
    meta.ua?.slice(0, 300) ?? null,
  )
  return token
}

function recordFailure(db: Database, user: UserRow, action: string, ip?: string | null) {
  // Count in the database, not from the row read before the (async) password check, so
  // parallel guesses each count.
  const { failed_logins } = db
    .prepare('UPDATE users SET failed_logins = failed_logins + 1 WHERE id = ? RETURNING failed_logins')
    .get(user.id) as { failed_logins: number }
  if (failed_logins >= MAX_FAILURES) {
    db.prepare('UPDATE users SET failed_logins = 0, locked_until = ? WHERE id = ?').run(minutesFromNow(LOCK_MINUTES), user.id)
    audit(db, { actorId: user.id, clientId: user.client_id, action: 'login.locked', ip })
  }
  audit(db, { actorId: user.id, clientId: user.client_id, action, ip })
}

const isLocked = (user: UserRow) => !!user.locked_until && user.locked_until > iso(new Date())

export const LOCKED_MESSAGE = `Too many attempts. Try again in ${LOCK_MINUTES} minutes or call the 24/7 operations line.`

export async function passwordLogin(
  db: Database,
  email: string,
  password: string,
  meta: { ip?: string | null; ua?: string | null } = {},
): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const generic = { ok: false as const, error: 'That email and password don’t match. Check them and try again.' }
  const user = findUserByEmail(db, email)
  if (!user || user.disabled_at) {
    dummyHash ??= hashPassword('not-a-real-password')
    await verifyPassword(password, await dummyHash)
    audit(db, { action: 'login.unknown_email', ip: meta.ip, detail: { email: email.slice(0, 200) } })
    return generic
  }
  const passwordOk = await verifyPassword(password, user.password_hash)
  // Re-read after the slow hash: a parallel attempt may have locked the account meanwhile.
  // Only someone who knows the password learns that it's locked, so the message doesn't
  // reveal which emails have accounts.
  if (isLocked(getUser(db, user.id) ?? user)) {
    audit(db, { actorId: user.id, clientId: user.client_id, action: 'login.while_locked', ip: meta.ip })
    return passwordOk ? { ok: false, error: LOCKED_MESSAGE } : generic
  }
  if (!passwordOk) {
    recordFailure(db, user, 'login.bad_password', meta.ip)
    return generic
  }
  db.prepare('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?').run(user.id)
  audit(db, { actorId: user.id, clientId: user.client_id, action: 'login.password_ok', ip: meta.ip })
  return { ok: true, token: createSession(db, user.id, false, meta) }
}

export function sessionFromToken(db: Database, token: string | undefined | null): Current | null {
  if (!token) return null
  const session = db.prepare('SELECT * FROM sessions WHERE token_hash = ?').get(hashToken(token)) as SessionRow | undefined
  if (!session) return null
  const now = new Date()
  const idleLimit = iso(new Date(now.getTime() - IDLE_HOURS * 3_600_000))
  if (session.expires_at <= iso(now) || session.last_seen_at <= idleLimit) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(session.token_hash)
    return null
  }
  const user = getUser(db, session.user_id)
  if (!user || user.disabled_at) return null
  if (now.getTime() - Date.parse(session.last_seen_at) > 60_000) {
    db.prepare('UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?').run(iso(now), session.token_hash)
  }
  return { session, user }
}

export function endSession(db: Database, token: string | undefined | null) {
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token))
}

export function passwordProblem(password: string, c: Current) {
  if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`
  if (password.toLowerCase().includes(c.user.email.split('@')[0].toLowerCase())) return 'Don’t include your email name in the password.'
  return null
}

export async function changePassword(db: Database, c: Current, password: string, confirm: string, ip?: string | null) {
  if (password !== confirm) return 'The two passwords don’t match.'
  const problem = passwordProblem(password, c)
  if (problem) return problem
  if (await verifyPassword(password, c.user.password_hash)) return 'Choose a password different from the temporary one.'
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?').run(await hashPassword(password), c.user.id)
  // Sign out other devices.
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(c.user.id, c.session.token_hash)
  audit(db, { actorId: c.user.id, clientId: c.user.client_id, action: 'user.change_password', ip })
  return null
}

/** Returns the pending authenticator secret, creating one if needed. */
export function pendingMfaSecret(db: Database, c: Current) {
  if (c.user.totp_enabled_at) throw new Error('two-step login is already set up')
  if (c.user.totp_secret) return decryptSecret(c.user.totp_secret)
  const secret = newTotpSecret()
  db.prepare('UPDATE users SET totp_secret = ? WHERE id = ?').run(encryptSecret(secret), c.user.id)
  return secret
}

function passMfa(db: Database, c: Current, step: number, meta: { ip?: string | null; ua?: string | null }) {
  const now = iso(new Date())
  db.prepare('UPDATE users SET totp_last_step = ?, failed_logins = 0, last_login_at = ? WHERE id = ?').run(step, now, c.user.id)
  // New token after the second factor, so a token seen before sign-in is worthless.
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(c.session.token_hash)
  audit(db, { actorId: c.user.id, clientId: c.user.client_id, action: 'login.success', ip: meta.ip })
  return createSession(db, c.user.id, true, meta)
}

export function confirmMfaSetup(
  db: Database,
  c: Current,
  code: string,
  meta: { ip?: string | null; ua?: string | null } = {},
): { ok: true; token: string } | { ok: false; error: string } {
  if (c.user.totp_enabled_at || !c.user.totp_secret) return { ok: false, error: 'Start the setup again.' }
  const step = verifyTotp(decryptSecret(c.user.totp_secret), code, null)
  if (step == null) return { ok: false, error: 'That code didn’t work. Check the time on your phone and enter the newest code.' }
  db.prepare('UPDATE users SET totp_enabled_at = ? WHERE id = ?').run(iso(new Date()), c.user.id)
  audit(db, { actorId: c.user.id, clientId: c.user.client_id, action: 'user.enable_mfa', ip: meta.ip })
  return { ok: true, token: passMfa(db, c, step, meta) }
}

export function verifyMfa(
  db: Database,
  c: Current,
  code: string,
  meta: { ip?: string | null; ua?: string | null } = {},
): { ok: true; token: string } | { ok: false; error: string } {
  if (isLocked(c.user)) return { ok: false, error: LOCKED_MESSAGE }
  if (!c.user.totp_enabled_at || !c.user.totp_secret) return { ok: false, error: 'Two-step login isn’t set up.' }
  const step = verifyTotp(decryptSecret(c.user.totp_secret), code, c.user.totp_last_step)
  if (step == null) {
    recordFailure(db, c.user, 'login.bad_code', meta.ip)
    return { ok: false, error: 'That code didn’t work. Enter the newest 6-digit code from your authenticator app.' }
  }
  return { ok: true, token: passMfa(db, c, step, meta) }
}
