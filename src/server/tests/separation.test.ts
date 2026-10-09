import type { Database } from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import { openDatabase } from '../core.mjs'
import { clientScope, createClient, createSite, createUser, ValidationError } from '../store'

let db: Database
const admin = { id: 'system' }

async function setup() {
  const a = createClient(db, admin, { name: 'Acme HOA', industry: 'HOA', industryPlural: '', managerEmail: '' })
  const b = createClient(db, admin, { name: 'Bayside Offices', industry: 'Office', industryPlural: '', managerEmail: '' })
  const siteA = createSite(db, admin, a.id, { name: 'Acme North', city: 'Orlando, FL', timeZone: '', lat: '28.5', lng: '-81.4' })
  const siteB = createSite(db, admin, b.id, { name: 'Bayside Tower', city: 'Tampa, FL', timeZone: '', lat: '', lng: '' })
  const userA = (await createUser(db, null, { email: 'a@acme.test', name: 'A', role: 'client', clientId: a.id })).user
  const userB = (await createUser(db, null, { email: 'b@bay.test', name: 'B', role: 'client', clientId: b.id })).user
  return { a, b, siteA, siteB, userA, userB }
}

beforeEach(() => {
  db = openDatabase(':memory:')
})

describe('client data separation', () => {
  it('only returns the client’s own sites, feedback and investigations', async () => {
    const { a, b, siteA, siteB, userA } = await setup()
    clientScope(db, a.id).addFeedback(userA.id, { topic: 'Suggestion', siteId: siteA.id, message: 'More patrols', callBack: false }, 2)
    clientScope(db, a.id).addInvestigation(userA.id, { type: 'Surveillance', timeline: 'standard', location: '', description: 'x', contactMethod: 'phone' })

    const scopeB = clientScope(db, b.id)
    expect(scopeB.sites().map((s) => s.id)).toEqual([siteB.id])
    expect(scopeB.site(siteA.id)).toBeUndefined()
    expect(scopeB.feedback()).toEqual([])
    expect(scopeB.investigations()).toEqual([])
    expect(clientScope(db, a.id).feedback()).toHaveLength(1)
  })

  it('won’t file feedback against another client’s site', async () => {
    const { a, siteB, userA } = await setup()
    expect(() =>
      clientScope(db, a.id).addFeedback(userA.id, { topic: 'Suggestion', siteId: siteB.id, message: 'hi', callBack: false }, 2),
    ).toThrow(ValidationError)
  })

  it('is enforced by the database even if the app check is bypassed', async () => {
    const { a, siteB, userA } = await setup()
    expect(() =>
      db
        .prepare(`INSERT INTO feedback (id, client_id, site_id, user_id, topic, message, reply_by) VALUES ('x', ?, ?, ?, 'Suggestion', 'hi', '2026-01-01')`)
        .run(a.id, siteB.id, userA.id),
    ).toThrow(/FOREIGN KEY/)
    expect(() =>
      db.prepare(`INSERT INTO users (id, email, name, role, password_hash) VALUES ('y', 'y@x.test', 'Y', 'client', 'h')`).run(),
    ).toThrow(/CHECK/)
  })

  it('keeps the audit log append-only', async () => {
    await setup()
    expect(() => db.prepare('DELETE FROM audit_log').run()).toThrow(/append-only/)
    expect(() => db.prepare("UPDATE audit_log SET action = 'x'").run()).toThrow(/append-only/)
  })

  it('numbers investigation case references per year', async () => {
    const { a, userA } = await setup()
    const scope = clientScope(db, a.id)
    const input = { type: 'Other', timeline: 'urgent', location: '', description: 'x', contactMethod: 'email' }
    const first = scope.addInvestigation(userA.id, input)
    const second = scope.addInvestigation(userA.id, input)
    expect(first.case_ref).toMatch(/^INV-\d{4}-0001$/)
    expect(second.case_ref).toMatch(/-0002$/)
  })
})
