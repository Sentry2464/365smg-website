import type { Database } from 'better-sqlite3'
import { audit, hashPassword, newId, registryDefault, requestRegistryRun, setRegistryFor, temporaryPassword } from './core.mjs'
import { addBusinessDays, todayEt } from './dates'

export type Role = 'admin' | 'investigator' | 'client'

export interface UserRow {
  id: string
  email: string
  name: string
  role: Role
  client_id: string | null
  password_hash: string
  must_change_password: number
  totp_secret: string | null
  totp_enabled_at: string | null
  totp_last_step: number | null
  failed_logins: number
  locked_until: string | null
  last_login_at: string | null
  created_at: string
  disabled_at: string | null
}

export interface ClientRow {
  id: string
  name: string
  industry: string
  industry_plural: string
  manager_email: string | null
  created_at: string
  disabled_at: string | null
  registry_enabled: number
}

export interface SiteRow {
  id: string
  client_id: string
  slug: string
  name: string
  city: string
  time_zone: string
  lat: number | null
  lng: number | null
}

export interface FeedbackRow {
  id: string
  client_id: string
  site_id: string | null
  user_id: string
  topic: string
  message: string
  call_back: number
  reply_by: string
  status: string
  created_at: string
}

export interface InvestigationRow {
  id: string
  case_ref: string
  client_id: string
  user_id: string
  type: string
  timeline: 'standard' | 'urgent'
  location: string
  description: string
  contact_method: 'phone' | 'email'
  status: string
  created_at: string
}

export const FEEDBACK_TOPICS = ['Concern about service', 'Service request', 'Suggestion', 'Compliment']
export const INVESTIGATION_TYPES = [
  'Background investigation',
  'Internal theft / loss',
  'Employee or vendor misconduct',
  'Surveillance',
  'Insurance / fraud',
  'Due diligence',
  'Other',
]

export class ValidationError extends Error {}

const clip = (s: unknown, max: number) => String(s ?? '').trim().slice(0, max)

export function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'site'
}

// ---------------------------------------------------------------------------
// Users (shared by login and admin)

export const findUserByEmail = (db: Database, email: string) =>
  db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim()) as UserRow | undefined

export const getUser = (db: Database, id: string) =>
  db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined

// ---------------------------------------------------------------------------
// Client scope: everything a client user can read or write. Every statement
// is bound to the client id taken from the user's session, never from input.

export function clientScope(db: Database, clientId: string) {
  return {
    client: () => db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId) as ClientRow | undefined,

    sites: () => db.prepare('SELECT * FROM sites WHERE client_id = ? ORDER BY name').all(clientId) as SiteRow[],

    site: (siteId: string) =>
      db.prepare('SELECT * FROM sites WHERE client_id = ? AND id = ?').get(clientId, siteId) as SiteRow | undefined,

    feedback: () =>
      db
        .prepare('SELECT * FROM feedback WHERE client_id = ? ORDER BY created_at DESC')
        .all(clientId) as FeedbackRow[],

    investigations: () =>
      db
        .prepare('SELECT * FROM investigations WHERE client_id = ? ORDER BY created_at DESC')
        .all(clientId) as InvestigationRow[],

    addFeedback(
      userId: string,
      input: { topic: unknown; siteId: unknown; message: unknown; callBack: unknown },
      replyBusinessDays: number,
      ip?: string | null,
    ) {
      const topic = clip(input.topic, 60)
      const message = clip(input.message, 5000)
      const siteId = clip(input.siteId, 64) || null
      if (!FEEDBACK_TOPICS.includes(topic)) throw new ValidationError('Choose a topic.')
      if (!message) throw new ValidationError('Write a short message so your account team knows how to help.')
      if (siteId && !this.site(siteId)) throw new ValidationError('Choose one of your sites.')
      const replyBy = addBusinessDays(todayEt(), replyBusinessDays)
      const row = {
        id: newId(),
        client_id: clientId,
        site_id: siteId,
        user_id: userId,
        topic,
        message,
        call_back: input.callBack ? 1 : 0,
        reply_by: replyBy,
      }
      db.prepare(
        `INSERT INTO feedback (id, client_id, site_id, user_id, topic, message, call_back, reply_by)
         VALUES (@id, @client_id, @site_id, @user_id, @topic, @message, @call_back, @reply_by)`,
      ).run(row)
      audit(db, { actorId: userId, clientId, action: 'feedback.create', target: row.id, ip })
      return row
    },

    addInvestigation(
      userId: string,
      input: { type: unknown; timeline: unknown; location: unknown; description: unknown; contactMethod: unknown },
      ip?: string | null,
    ) {
      const type = clip(input.type, 60)
      const description = clip(input.description, 5000)
      if (!INVESTIGATION_TYPES.includes(type)) throw new ValidationError('Choose a type of investigation.')
      if (!description) throw new ValidationError('Add a short description so an investigator knows where to start.')
      const row = {
        id: newId(),
        case_ref: nextCaseRef(db),
        client_id: clientId,
        user_id: userId,
        type,
        timeline: input.timeline === 'urgent' ? 'urgent' : 'standard',
        location: clip(input.location, 300),
        description,
        contact_method: input.contactMethod === 'email' ? 'email' : 'phone',
      }
      db.prepare(
        `INSERT INTO investigations (id, case_ref, client_id, user_id, type, timeline, location, description, contact_method)
         VALUES (@id, @case_ref, @client_id, @user_id, @type, @timeline, @location, @description, @contact_method)`,
      ).run(row)
      // Only the case reference goes in the log, never the description.
      audit(db, { actorId: userId, clientId, action: 'investigation.create', target: row.case_ref, ip })
      return row
    },
  }
}

function nextCaseRef(db: Database) {
  const year = new Date().getFullYear()
  const prefix = `INV-${year}-`
  const last = db
    .prepare("SELECT case_ref FROM investigations WHERE case_ref LIKE ? ORDER BY case_ref DESC LIMIT 1")
    .get(`${prefix}%`) as { case_ref: string } | undefined
  const n = last ? Number(last.case_ref.slice(prefix.length)) + 1 : 1
  return prefix + String(n).padStart(4, '0')
}

// ---------------------------------------------------------------------------
// 365 SMG staff

export interface Actor {
  id: string
  ip?: string | null
}

export const listClients = (db: Database) =>
  db
    .prepare(
      `SELECT c.*,
         (SELECT COUNT(*) FROM sites s WHERE s.client_id = c.id) AS site_count,
         (SELECT COUNT(*) FROM users u WHERE u.client_id = c.id AND u.disabled_at IS NULL) AS user_count
       FROM clients c ORDER BY c.name`,
    )
    .all() as (ClientRow & { site_count: number; user_count: number })[]

export const getClient = (db: Database, id: string) =>
  db.prepare('SELECT * FROM clients WHERE id = ?').get(id) as ClientRow | undefined

export function createClient(
  db: Database,
  actor: Actor,
  input: { name: unknown; industry: unknown; industryPlural: unknown; managerEmail: unknown },
) {
  const name = clip(input.name, 120)
  const industry = clip(input.industry, 80)
  if (!name || !industry) throw new ValidationError('Enter the client name and industry.')
  const row = {
    id: newId(),
    name,
    industry,
    industry_plural: clip(input.industryPlural, 80) || industry.toLowerCase(),
    manager_email: clip(input.managerEmail, 200) || null,
  }
  db.prepare(
    `INSERT INTO clients (id, name, industry, industry_plural, manager_email)
     VALUES (@id, @name, @industry, @industry_plural, @manager_email)`,
  ).run(row)
  audit(db, { actorId: actor.id, clientId: row.id, action: 'client.create', target: row.id, ip: actor.ip })
  if (registryDefault()) setRegistryFor(db, actor, [row.id], true, 'default')
  return row
}

export function createSite(
  db: Database,
  actor: Actor,
  clientId: string,
  input: { name: unknown; city: unknown; timeZone: unknown; lat: unknown; lng: unknown },
) {
  if (!getClient(db, clientId)) throw new ValidationError('Client not found.')
  const name = clip(input.name, 120)
  const city = clip(input.city, 80)
  if (!name || !city) throw new ValidationError('Enter the site name and city.')
  const num = (v: unknown, min: number, max: number) => {
    const s = clip(v, 20)
    if (!s) return null
    const n = Number(s)
    if (!Number.isFinite(n) || n < min || n > max) throw new ValidationError('Latitude or longitude is out of range.')
    return n
  }
  let slug = slugify(name)
  const taken = db.prepare('SELECT 1 FROM sites WHERE client_id = ? AND slug = ?')
  for (let i = 2; taken.get(clientId, slug); i++) slug = `${slugify(name)}-${i}`
  const row = {
    id: newId(),
    client_id: clientId,
    slug,
    name,
    city,
    time_zone: clip(input.timeZone, 60) || 'America/New_York',
    lat: num(input.lat, -90, 90),
    lng: num(input.lng, -180, 180),
  }
  db.prepare(
    `INSERT INTO sites (id, client_id, slug, name, city, time_zone, lat, lng)
     VALUES (@id, @client_id, @slug, @name, @city, @time_zone, @lat, @lng)`,
  ).run(row)
  audit(db, { actorId: actor.id, clientId, action: 'site.create', target: row.id, ip: actor.ip })
  // A new site may be in a county not downloaded yet.
  if (row.lat != null && getClient(db, clientId)?.registry_enabled) requestRegistryRun(db)
  return row
}

export const listUsers = (db: Database) =>
  db
    .prepare(
      `SELECT u.id, u.email, u.name, u.role, u.client_id, u.totp_enabled_at, u.last_login_at, u.disabled_at,
              u.locked_until, c.name AS client_name
       FROM users u LEFT JOIN clients c ON c.id = u.client_id
       ORDER BY u.role, c.name, u.name`,
    )
    .all() as (Pick<
    UserRow,
    'id' | 'email' | 'name' | 'role' | 'client_id' | 'totp_enabled_at' | 'last_login_at' | 'disabled_at' | 'locked_until'
  > & { client_name: string | null })[]

/** Creates a user with a one-time password, which is returned once and never stored. */
export async function createUser(
  db: Database,
  actor: Actor | null,
  input: { email: unknown; name: unknown; role: unknown; clientId: unknown },
) {
  const email = clip(input.email, 200).toLowerCase()
  const name = clip(input.name, 120)
  const role = clip(input.role, 20) as Role
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ValidationError('Enter a valid email address.')
  if (!name) throw new ValidationError('Enter the person’s name.')
  if (!['admin', 'investigator', 'client'].includes(role)) throw new ValidationError('Choose a role.')
  const clientId = role === 'client' ? clip(input.clientId, 64) : null
  if (role === 'client' && (!clientId || !getClient(db, clientId))) throw new ValidationError('Choose the client.')
  if (findUserByEmail(db, email)) throw new ValidationError('A user with that email already exists.')
  const password = temporaryPassword()
  const row = { id: newId(), email, name, role, client_id: clientId, password_hash: await hashPassword(password) }
  db.prepare(
    `INSERT INTO users (id, email, name, role, client_id, password_hash, must_change_password)
     VALUES (@id, @email, @name, @role, @client_id, @password_hash, 1)`,
  ).run(row)
  audit(db, { actorId: actor?.id, clientId, action: 'user.create', target: row.id, ip: actor?.ip, detail: { role } })
  return { user: row, temporaryPassword: password }
}

export async function resetPassword(db: Database, actor: Actor, userId: string) {
  const user = getUser(db, userId)
  if (!user) throw new ValidationError('User not found.')
  const password = temporaryPassword()
  db.prepare(
    `UPDATE users SET password_hash = ?, must_change_password = 1, failed_logins = 0, locked_until = NULL WHERE id = ?`,
  ).run(await hashPassword(password), userId)
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId)
  audit(db, { actorId: actor.id, clientId: user.client_id, action: 'user.reset_password', target: userId, ip: actor.ip })
  return password
}

export function resetMfa(db: Database, actor: Actor, userId: string) {
  const user = getUser(db, userId)
  if (!user) throw new ValidationError('User not found.')
  db.prepare(
    'UPDATE users SET totp_secret = NULL, totp_enabled_at = NULL, totp_last_step = NULL WHERE id = ?',
  ).run(userId)
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId)
  audit(db, { actorId: actor.id, clientId: user.client_id, action: 'user.reset_mfa', target: userId, ip: actor.ip })
}

/** Opts a client in or out of seeing the FDLE registry near their sites. */
export function setRegistryEnabled(db: Database, actor: Actor, clientId: string, enabled: boolean) {
  if (!getClient(db, clientId)) throw new ValidationError('Client not found.')
  setRegistryFor(db, actor, [clientId], enabled)
}

export function setUserDisabled(db: Database, actor: Actor, userId: string, disabled: boolean) {
  const user = getUser(db, userId)
  if (!user) throw new ValidationError('User not found.')
  if (userId === actor.id) throw new ValidationError('You can’t disable your own account.')
  db.prepare('UPDATE users SET disabled_at = ? WHERE id = ?').run(disabled ? new Date().toISOString() : null, userId)
  if (disabled) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId)
  audit(db, {
    actorId: actor.id,
    clientId: user.client_id,
    action: disabled ? 'user.disable' : 'user.enable',
    target: userId,
    ip: actor.ip,
  })
}

export const listAllFeedback = (db: Database) =>
  db
    .prepare(
      `SELECT f.*, c.name AS client_name, s.name AS site_name, u.name AS user_name, u.email AS user_email
       FROM feedback f
       JOIN clients c ON c.id = f.client_id
       JOIN users u ON u.id = f.user_id
       LEFT JOIN sites s ON s.id = f.site_id
       ORDER BY f.created_at DESC LIMIT 200`,
    )
    .all() as (FeedbackRow & { client_name: string; site_name: string | null; user_name: string; user_email: string })[]

/** Investigations are confidential: only investigator accounts may read them, and every read is logged. */
export function listAllInvestigations(db: Database, actor: Actor) {
  audit(db, { actorId: actor.id, action: 'investigation.list', ip: actor.ip })
  return db
    .prepare(
      `SELECT i.*, c.name AS client_name, u.name AS user_name, u.email AS user_email
       FROM investigations i
       JOIN clients c ON c.id = i.client_id
       JOIN users u ON u.id = i.user_id
       ORDER BY i.created_at DESC LIMIT 200`,
    )
    .all() as (InvestigationRow & { client_name: string; user_name: string; user_email: string })[]
}

export const recentAudit = (db: Database, limit = 100) =>
  db
    .prepare(
      `SELECT a.*, u.email AS actor_email FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
       ORDER BY a.id DESC LIMIT ?`,
    )
    .all(limit) as {
    id: number
    at: string
    actor_email: string | null
    client_id: string | null
    action: string
    target: string | null
    ip: string | null
  }[]
