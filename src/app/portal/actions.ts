'use server'

import { redirect } from 'next/navigation'
import { after } from 'next/server'
import { endSession } from '@/server/auth'
import { formatDay } from '@/server/dates'
import { db } from '@/server/db'
import { portalUrl, sendMail } from '@/server/notify'
import { clearSessionCookie, readToken, requestMeta, requireUser } from '@/server/session'
import { clientScope, ValidationError } from '@/server/store'

export type FormResult = { ok: true; replyBy?: string; caseRef?: string } | { ok: false; error: string; field?: string }

const REPLY_BUSINESS_DAYS = 2

export async function submitFeedback(input: {
  topic: string
  siteId: string
  message: string
  callBack: boolean
}): Promise<FormResult> {
  const { user } = await requireUser(['client'])
  const { ip } = await requestMeta()
  const scope = clientScope(db(), user.client_id!)
  try {
    const row = scope.addFeedback(user.id, input, REPLY_BUSINESS_DAYS, ip)
    const client = scope.client()!
    const site = row.site_id ? scope.site(row.site_id) : undefined
    // Sent after the response: a slow mail server must not hold up (or fail) the form.
    after(() =>
      sendMail(
        client.manager_email,
        `Client Portal feedback: ${row.topic} (${client.name})`,
        [
          `${user.name} <${user.email}> at ${client.name}${site ? `, ${site.name}` : ''} wrote:`,
          '',
          row.message,
          '',
          row.call_back ? 'They asked for a call back.' : 'No call back requested.',
          `Reply by: ${row.reply_by}`,
          '',
          `All feedback: ${portalUrl('/portal/admin/feedback')}`,
        ].join('\n'),
        { cc: process.env.NOTIFY_FEEDBACK_CC },
      ),
    )
    return { ok: true, replyBy: formatDay(row.reply_by) }
  } catch (err) {
    if (err instanceof ValidationError) return { ok: false, error: err.message }
    throw err
  }
}

export async function submitInvestigation(input: {
  type: string
  timeline: string
  location: string
  description: string
  contactMethod: string
}): Promise<FormResult> {
  const { user } = await requireUser(['client'])
  const { ip } = await requestMeta()
  const scope = clientScope(db(), user.client_id!)
  try {
    const row = scope.addInvestigation(user.id, input, ip)
    // Confidential: the email carries the case reference only, never the details.
    after(() =>
      sendMail(
        process.env.NOTIFY_INVESTIGATIONS_TO,
        `Investigation request ${row.case_ref}${row.timeline === 'urgent' ? ' [urgent]' : ''}`,
        [
          `A client has submitted investigation request ${row.case_ref}${row.timeline === 'urgent' ? ', marked urgent' : ''}.`,
          '',
          'For confidentiality, the details are only in the portal. Sign in to read and assign it:',
          portalUrl('/portal/admin/investigations'),
        ].join('\n'),
        { cc: process.env.NOTIFY_INVESTIGATIONS_CC },
      ),
    )
    return { ok: true, caseRef: row.case_ref }
  } catch (err) {
    if (err instanceof ValidationError) return { ok: false, error: err.message }
    throw err
  }
}

export async function signOut() {
  endSession(db(), await readToken())
  await clearSessionCookie()
  redirect('/portal/login')
}
