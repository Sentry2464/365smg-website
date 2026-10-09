import type { Metadata } from 'next'
import { db } from '@/server/db'
import { requestMeta, requireUser } from '@/server/session'
import { listAllInvestigations } from '@/server/store'
import { AdminShell, fmtDate } from '../AdminShell'

export const metadata: Metadata = { title: 'Investigations | 365 SMG Client Portal' }

export default async function InvestigationsInbox() {
  const { user } = await requireUser(['investigator'])
  const rows = listAllInvestigations(db(), { id: user.id, ip: (await requestMeta()).ip })
  return (
    <AdminShell role={user.role} name={user.name} current="/portal/admin/investigations" title="Confidential requests">
      <p className="cp-help">Only investigator accounts can see this page. Each visit is recorded in the audit log.</p>
      <section className="cp-card">
        <div className="cp-admin__table">
          <table>
            <thead>
              <tr>
                <th>Case</th>
                <th>Received</th>
                <th>Client · requester</th>
                <th>Type</th>
                <th>Location</th>
                <th>Description</th>
                <th>Contact by</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="cp-mono">
                    {r.case_ref}
                    {r.timeline === 'urgent' && <span className="cp-admin__tag cp-admin__tag--urgent">72 h</span>}
                  </td>
                  <td>{fmtDate(r.created_at)}</td>
                  <td>
                    {r.client_name}
                    <br />
                    <span className="cp-meta">
                      {r.user_name} · {r.user_email}
                    </span>
                  </td>
                  <td>{r.type}</td>
                  <td>{r.location || '—'}</td>
                  <td className="cp-admin__message">{r.description}</td>
                  <td>{r.contact_method === 'email' ? 'Email' : 'Phone'}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7}>No requests yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </AdminShell>
  )
}
