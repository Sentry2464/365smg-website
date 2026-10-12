import { deliver } from './mail.mjs'

// Staff notifications. How mail is sent (Microsoft 365 Graph, SMTP, or the server log
// in development) is set in /etc/smg-portal.env; see src/server/mail.mjs.
/** Public address of the portal, for links in emails. */
export const portalUrl = (path = '') =>
  `${(process.env.SMG_PUBLIC_URL || 'https://portal.365smg.com').replace(/\/$/, '')}${path}`

const SIGNATURE = [
  '',
  '--',
  '365 Security Management Group · Client Portal',
  `24/7 operations line: ${process.env.SMG_OPS_PHONE || '(321) 430-0193'}`,
  'This is an automated message from the 365 SMG Client Portal.',
].join('\n')

export async function sendMail(to: string | null | undefined, subject: string, text: string) {
  const recipient = to || process.env.NOTIFY_DEFAULT_TO
  if (!recipient) {
    console.warn(`[mail] not sent, no recipient configured: subject=${JSON.stringify(subject)}`)
    return
  }
  try {
    await deliver(recipient, subject, `${text}\n${SIGNATURE}`)
  } catch (err) {
    // The submission is already saved; a mail failure must not lose it or reach the client.
    console.error('[mail] send failed:', err instanceof Error ? err.message : err)
  }
}
