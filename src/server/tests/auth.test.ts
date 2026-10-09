import type { Database } from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import { confirmMfaSetup, changePassword, nextStep, passwordLogin, pendingMfaSecret, sessionFromToken, verifyMfa } from '../auth'
import { openDatabase } from '../core.mjs'
import { createClient, createUser, getUser, resetMfa, setUserDisabled } from '../store'
import { currentStep, totpAt } from '../totp'

let db: Database
const admin = { id: 'system' }

async function newClientUser() {
  const client = createClient(db, admin, { name: 'Acme HOA', industry: 'Residential community', industryPlural: '', managerEmail: '' })
  return createUser(db, null, { email: 'pat@acme.test', name: 'Pat Lee', role: 'client', clientId: client.id })
}

/** Walks a new user through password change and authenticator setup. */
async function enrol(email: string, temp: string) {
  const login = await passwordLogin(db, email, temp)
  if (!login.ok) throw new Error(login.error)
  let c = sessionFromToken(db, login.token)!
  expect(nextStep(c)).toBe('password')
  expect(await changePassword(db, c, 'correct horse battery', 'correct horse battery')).toBeNull()
  c = sessionFromToken(db, login.token)!
  expect(nextStep(c)).toBe('mfa-setup')
  const secret = pendingMfaSecret(db, c)
  c = sessionFromToken(db, login.token)!
  const done = confirmMfaSetup(db, c, totpAt(secret, currentStep()))
  if (!done.ok) throw new Error(done.error)
  return { secret, token: done.token }
}

beforeEach(() => {
  db = openDatabase(':memory:')
})

describe('login', () => {
  it('walks a new user through password, authenticator and code', async () => {
    const { temporaryPassword } = await newClientUser()
    const { secret, token } = await enrol('pat@acme.test', temporaryPassword)
    expect(nextStep(sessionFromToken(db, token)!)).toBe('done')

    // A later sign-in needs the password and then a fresh code.
    const again = await passwordLogin(db, 'PAT@acme.test', 'correct horse battery')
    expect(again.ok).toBe(true)
    const c = sessionFromToken(db, (again as { token: string }).token)!
    expect(nextStep(c)).toBe('mfa')
    // The code used during setup can't be replayed.
    expect(verifyMfa(db, c, totpAt(secret, currentStep())).ok).toBe(false)
    const fresh = verifyMfa(db, sessionFromToken(db, (again as { token: string }).token)!, totpAt(secret, currentStep() + 1))
    expect(fresh.ok).toBe(true)
  })

  it('stores the authenticator secret encrypted', async () => {
    const { temporaryPassword } = await newClientUser()
    const { secret } = await enrol('pat@acme.test', temporaryPassword)
    const stored = getUser(db, (db.prepare('SELECT id FROM users').get() as { id: string }).id)!.totp_secret!
    expect(stored.startsWith('v1.')).toBe(true)
    expect(stored).not.toContain(secret)
  })

  it('rejects wrong passwords with one message and locks after five', async () => {
    const { temporaryPassword } = await newClientUser()
    const unknown = await passwordLogin(db, 'nobody@acme.test', 'x')
    const wrong = await passwordLogin(db, 'pat@acme.test', 'x')
    expect(unknown).toEqual(wrong)
    for (let i = 0; i < 4; i++) await passwordLogin(db, 'pat@acme.test', 'x')
    const locked = await passwordLogin(db, 'pat@acme.test', temporaryPassword)
    expect(locked.ok).toBe(false)
    expect((locked as { error: string }).error).toMatch(/Too many attempts/)
  })

  it('ends sessions when a user is disabled or their authenticator is reset', async () => {
    const { temporaryPassword, user } = await newClientUser()
    const { token } = await enrol('pat@acme.test', temporaryPassword)
    resetMfa(db, admin, user.id)
    expect(sessionFromToken(db, token)).toBeNull()
    const login = await passwordLogin(db, 'pat@acme.test', 'correct horse battery')
    expect(nextStep(sessionFromToken(db, (login as { token: string }).token)!)).toBe('mfa-setup')
    setUserDisabled(db, admin, user.id, true)
    expect(sessionFromToken(db, (login as { token: string }).token)).toBeNull()
    expect((await passwordLogin(db, 'pat@acme.test', 'correct horse battery')).ok).toBe(false)
  })

  it('refuses weak or unchanged passwords', async () => {
    const { temporaryPassword } = await newClientUser()
    const login = await passwordLogin(db, 'pat@acme.test', temporaryPassword)
    const c = sessionFromToken(db, (login as { token: string }).token)!
    expect(await changePassword(db, c, 'short', 'short')).toMatch(/at least/)
    expect(await changePassword(db, c, 'pat-is-great-1234', 'pat-is-great-1234')).toMatch(/email name/)
    expect(await changePassword(db, c, temporaryPassword, temporaryPassword)).toMatch(/different/)
    expect(await changePassword(db, c, 'correct horse battery', 'nope')).toMatch(/match/)
  })
})
