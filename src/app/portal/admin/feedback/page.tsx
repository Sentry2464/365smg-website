import type { Metadata } from 'next'
import { db } from '@/server/db'
import { requireUser } from '@/server/session'
import { listAllFeedback } from '@/server/store'
import { AdminShell, fmtDate } from '../AdminShell'

export const metadata: Metadata = { title: 'Feedback | 365 SMG Client Portal' }

export default async function FeedbackInbox() {
  const { user } = await requireUser(['admin'])
  const rows = listAllFeedback(db())
  return (
    <AdminShell role={user.role} name={user.name} current="/portal/admin/feedback" title="Feedback from clients">
      <section className="cp-card">
        <div className="cp-admin__table">
          <table>
            <thead>
              <tr>
                <th>Received</th>
                <th>Client · site</th>
                <th>From</th>
                <th>Topic</th>
                <th>Message</th>
                <th>Reply by</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((f) => (
                <tr key={f.id}>
                  <td>{fmtDate(f.created_at)}</td>
                  <td>
                    {f.client_name}
                    {f.site_name && ` · ${f.site_name}`}
                  </td>
                  <td>
                    {f.user_name}
                    <br />
                    <span className="cp-meta">{f.user_email}</span>
                  </td>
                  <td>
                    {f.topic}
                    {f.call_back ? <span className="cp-admin__tag">Call back</span> : null}
                  </td>
                  <td className="cp-admin__message">{f.message}</td>
                  <td>{f.reply_by}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6}>No feedback yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </AdminShell>
  )
}
