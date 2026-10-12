import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { daysBetween, formatDay, isDay, todayEt } from '@/server/dates'
import { db } from '@/server/db'
import { requireUser } from '@/server/session'
import { listClients, listUsers } from '@/server/store'
import { addClient, addUser } from './actions'
import { AdminForm } from './AdminForm'
import { AdminShell, fmtDate } from './AdminShell'
import { UserActions } from './UserActions'

export const metadata: Metadata = { title: 'Admin | 365 SMG Client Portal' }

const roleLabel = { admin: 'Admin', investigator: 'Investigator', client: 'Client' }

/** Warns 30 days before the Microsoft 365 mail secret (MS_CLIENT_SECRET_EXPIRES) runs out. */
function mailSecretWarning() {
  // A date (YYYY-MM-DD) as Entra shows it; the secret works through that day.
  const raw = process.env.MS_CLIENT_SECRET_EXPIRES?.trim().slice(0, 10)
  if (!raw || !isDay(raw) || process.env.SMG_MAIL_PROVIDER !== 'graph') return null
  const days = daysBetween(todayEt(), raw)
  if (days > 30) return null
  const when = formatDay(raw, { dateStyle: 'long' })
  return days < 0
    ? `The Microsoft 365 mail secret expired on ${when}. Portal emails are not being sent until a new secret is set on the server.`
    : `The Microsoft 365 mail secret expires on ${when} (${days === 0 ? 'today' : `in ${days} day${days === 1 ? '' : 's'}`}). Create a new one in Entra and update MS_CLIENT_SECRET and MS_CLIENT_SECRET_EXPIRES on the server.`
}

export default async function AdminHome() {
  const { user } = await requireUser(['admin', 'investigator'])
  if (user.role === 'investigator') redirect('/portal/admin/investigations')
  const clients = listClients(db())
  const users = listUsers(db())

  return (
    <AdminShell role={user.role} name={user.name} current="/portal/admin" title="Clients and users">
      {mailSecretWarning() && (
        <p className="cp-notice" role="alert">
          <b>Email.</b> {mailSecretWarning()}
        </p>
      )}
      <section className="cp-card">
        <div className="cp-card__head">
          <h2 className="cp-card__title">Clients</h2>
        </div>
        <div className="cp-admin__table">
          <table>
            <thead>
              <tr>
                <th>Client</th>
                <th>Industry</th>
                <th>Sites</th>
                <th>Active users</th>
                <th>Account manager</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/portal/admin/clients/${c.id}`}>{c.name}</Link>
                  </td>
                  <td>{c.industry}</td>
                  <td>{c.site_count}</td>
                  <td>{c.user_count}</td>
                  <td>{c.manager_email ?? '—'}</td>
                </tr>
              ))}
              {clients.length === 0 && (
                <tr>
                  <td colSpan={5}>No clients yet. Add the first one below.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <h3 className="cp-admin__sub">Add a client</h3>
        <AdminForm action={addClient} submitLabel="Add client" className="cp-form cp-admin__grid">
          <div className="cp-field">
            <label htmlFor="ac-name">Client name</label>
            <input id="ac-name" name="name" className="cp-input" required placeholder="e.g. Royal Cypress Preserve HOA" />
          </div>
          <div className="cp-field">
            <label htmlFor="ac-industry">Industry</label>
            <input id="ac-industry" name="industry" className="cp-input" required placeholder="e.g. Residential community" />
          </div>
          <div className="cp-field">
            <label htmlFor="ac-plural">Industry, for news titles</label>
            <input id="ac-plural" name="industryPlural" className="cp-input" placeholder="e.g. residential communities" />
          </div>
          <div className="cp-field">
            <label htmlFor="ac-manager">Account manager email</label>
            <input id="ac-manager" name="managerEmail" type="email" className="cp-input" placeholder="Receives this client's feedback" />
          </div>
        </AdminForm>
      </section>

      <section className="cp-card">
        <div className="cp-card__head">
          <h2 className="cp-card__title">Users</h2>
          <span className="cp-card__sub">
            Everyone signs in with a password and an authenticator app. New users get a temporary password to change.
          </span>
        </div>
        <div className="cp-admin__table">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Client</th>
                <th>Two-step</th>
                <th>Last sign-in</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className={u.disabled_at ? 'cp-admin__disabled' : undefined}>
                  <td>
                    {u.name}
                    {u.disabled_at && <span className="cp-admin__tag">Disabled</span>}
                  </td>
                  <td>{u.email}</td>
                  <td>{roleLabel[u.role]}</td>
                  <td>{u.client_name ?? '365 SMG'}</td>
                  <td>{u.totp_enabled_at ? 'On' : 'Not set up'}</td>
                  <td>{fmtDate(u.last_login_at)}</td>
                  <td>
                    <UserActions userId={u.id} disabled={!!u.disabled_at} self={u.id === user.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h3 className="cp-admin__sub">Add a user</h3>
        <AdminForm action={addUser} submitLabel="Create user" className="cp-form cp-admin__grid" resetOnSuccess>
          <div className="cp-field">
            <label htmlFor="au-name">Full name</label>
            <input id="au-name" name="name" className="cp-input" required />
          </div>
          <div className="cp-field">
            <label htmlFor="au-email">Email</label>
            <input id="au-email" name="email" type="email" className="cp-input" required />
          </div>
          <div className="cp-field">
            <label htmlFor="au-role">Role</label>
            <select id="au-role" name="role" className="cp-input" defaultValue="client">
              <option value="client">Client user</option>
              <option value="admin">365 SMG admin</option>
              <option value="investigator">365 SMG investigator</option>
            </select>
          </div>
          <div className="cp-field">
            <label htmlFor="au-client">Client (client users only)</label>
            <select id="au-client" name="clientId" className="cp-input" defaultValue="">
              <option value="">—</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </AdminForm>
      </section>
    </AdminShell>
  )
}
