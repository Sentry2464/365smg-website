import type { Metadata } from 'next'
import { db } from '@/server/db'
import { requireUser } from '@/server/session'
import { recentAudit } from '@/server/store'
import { AdminShell, fmtDate } from '../AdminShell'

export const metadata: Metadata = { title: 'Audit log | 365 SMG Client Portal' }

export default async function AuditPage() {
  const { user } = await requireUser(['admin'])
  const rows = recentAudit(db(), 200)
  return (
    <AdminShell role={user.role} name={user.name} current="/portal/admin/audit" title="Audit log">
      <p className="cp-help">The latest 200 events. Entries can&apos;t be edited or deleted.</p>
      <section className="cp-card">
        <div className="cp-admin__table">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Who</th>
                <th>Action</th>
                <th>Target</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{fmtDate(r.at)}</td>
                  <td>{r.actor_email ?? '—'}</td>
                  <td className="cp-mono">{r.action}</td>
                  <td className="cp-mono">{r.target ?? '—'}</td>
                  <td className="cp-mono">{r.ip ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AdminShell>
  )
}
