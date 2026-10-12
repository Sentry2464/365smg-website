import { deliver } from './mail.mjs'

// Staff notifications. How mail is sent (Microsoft 365 Graph, SMTP, or the server log
// in development) is set in /etc/smg-portal.env; see src/server/mail.mjs.
export async function sendMail(to: string | null | undefined, subject: string, text: string) {
  const recipient = to || process.env.NOTIFY_DEFAULT_TO
  if (!recipient) return
  try {
    await deliver(recipient, subject, text)
  } catch (err) {
    // The submission is already saved; a mail failure must not lose it or reach the client.
    console.error('[mail] send failed:', err instanceof Error ? err.message : err)
  }
}
