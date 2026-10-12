import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { db } from '@/server/db'
import { requireUser } from '@/server/session'
import { clientScope, getClient, listUsers } from '@/server/store'
import { addSite, addUser, toggleRegistry } from '../../actions'
import { AdminForm } from '../../AdminForm'
import { AdminShell, fmtDate } from '../../AdminShell'
import { UserActions } from '../../UserActions'

export const metadata: Metadata = { title: 'Client | 365 SMG Client Portal' }

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireUser(['admin'])
  const { id } = await params
  const client = getClient(db(), id)
  if (!client) notFound()
  const sites = clientScope(db(), id).sites()
  const users = listUsers(db()).filter((u) => u.client_id === id)

  return (
    <AdminShell role={user.role} name={user.name} current="/portal/admin" title={client.name}>
      <section className="cp-card">
        <div className="cp-card__head">
          <h2 className="cp-card__title">Sites</h2>
          <span className="cp-card__sub">
            {client.industry} · account manager {client.manager_email ?? 'not set'}. Coordinates place the site on the
            map and, from Phase 4, drive its weather and alerts.
          </span>
        </div>
        <div className="cp-admin__table">
          <table>
            <thead>
              <tr>
                <th>Site</th>
                <th>City</th>
                <th>Time zone</th>
                <th>Latitude, longitude</th>
              </tr>
            </thead>
            <tbody>
              {sites.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{s.city}</td>
                  <td>{s.time_zone}</td>
                  <td className="cp-mono">{s.lat != null ? `${s.lat}, ${s.lng}` : '—'}</td>
                </tr>
              ))}
              {sites.length === 0 && (
                <tr>
                  <td colSpan={4}>No sites yet. Clients need at least one site to use the portal.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <h3 className="cp-admin__sub">Add a site</h3>
        <AdminForm action={addSite} submitLabel="Add site" className="cp-form cp-admin__grid">
          <input type="hidden" name="clientId" value={client.id} />
          <div className="cp-field">
            <label htmlFor="as-name">Site name</label>
            <input id="as-name" name="name" className="cp-input" required />
          </div>
          <div className="cp-field">
            <label htmlFor="as-city">City</label>
            <input id="as-city" name="city" className="cp-input" required placeholder="e.g. Orlando, FL" />
          </div>
          <div className="cp-field">
            <label htmlFor="as-lat">Latitude</label>
            <input id="as-lat" name="lat" className="cp-input" inputMode="decimal" placeholder="e.g. 28.4735" />
          </div>
          <div className="cp-field">
            <label htmlFor="as-lng">Longitude</label>
            <input id="as-lng" name="lng" className="cp-input" inputMode="decimal" placeholder="e.g. -81.5043" />
          </div>
          <div className="cp-field">
            <label htmlFor="as-tz">Time zone</label>
            <select id="as-tz" name="timeZone" className="cp-input" defaultValue="America/New_York">
              <option value="America/New_York">Eastern</option>
              <option value="America/Chicago">Central</option>
              <option value="America/Denver">Mountain</option>
              <option value="America/Los_Angeles">Pacific</option>
            </select>
          </div>
        </AdminForm>
      </section>

      <section className="cp-card">
        <div className="cp-card__head">
          <h2 className="cp-card__title">Sex offender registry</h2>
          <span className="cp-card__sub">
            {client.registry_enabled
              ? 'On: this client’s dashboard lists FDLE registrants near their sites, with FDLE’s warnings. Every view is recorded in the audit log.'
              : 'Off: turn on only if this client has asked for it. Their dashboard will list FDLE registrants near their sites, with FDLE’s warnings, and every view is recorded in the audit log.'}
          </span>
        </div>
        <AdminForm
          action={toggleRegistry}
          submitLabel={client.registry_enabled ? 'Turn off' : 'Turn on for this client'}
          variant={client.registry_enabled ? 'ghost' : 'gold'}
        >
          <input type="hidden" name="clientId" value={client.id} />
          <input type="hidden" name="enable" value={client.registry_enabled ? '0' : '1'} />
        </AdminForm>
      </section>

      <section className="cp-card">
        <div className="cp-card__head">
          <h2 className="cp-card__title">Users</h2>
          <span className="cp-card__sub">
            People at {client.name} who can sign in. Each gets a temporary password and sets up an authenticator app on
            first sign-in.
          </span>
        </div>
        <div className="cp-admin__table">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
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
                  <td>{u.totp_enabled_at ? 'On' : 'Not set up'}</td>
                  <td>{fmtDate(u.last_login_at)}</td>
                  <td>
                    <UserActions userId={u.id} disabled={!!u.disabled_at} self={false} />
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5}>No users yet. Add the first one below.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <h3 className="cp-admin__sub">Add a user</h3>
        <AdminForm action={addUser} submitLabel="Create user" className="cp-form cp-admin__grid">
          <input type="hidden" name="role" value="client" />
          <input type="hidden" name="clientId" value={client.id} />
          <div className="cp-field">
            <label htmlFor="cu-name">Full name</label>
            <input id="cu-name" name="name" className="cp-input" required />
          </div>
          <div className="cp-field">
            <label htmlFor="cu-email">Email</label>
            <input id="cu-email" name="email" type="email" className="cp-input" required />
          </div>
        </AdminForm>
      </section>
    </AdminShell>
  )
}
