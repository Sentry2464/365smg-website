import nodemailer from 'nodemailer'

// Email goes out through SMTP_* settings in /etc/smg-portal.env. Without them
// (development), messages are written to the server log instead.
let transport: nodemailer.Transporter | null | undefined

function mailer() {
  if (transport !== undefined) return transport
  const host = process.env.SMTP_HOST
  transport = host
    ? nodemailer.createTransport({
        host,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_PORT === '465',
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      })
    : null
  return transport
}

export async function sendMail(to: string | null | undefined, subject: string, text: string) {
  const recipient = to || process.env.NOTIFY_DEFAULT_TO
  if (!recipient) return
  const t = mailer()
  if (!t) {
    console.info(`[mail] to=${recipient} subject=${JSON.stringify(subject)}\n${text}`)
    return
  }
  try {
    await t.sendMail({ from: process.env.SMTP_FROM || 'Client Portal <portal@365smg.com>', to: recipient, subject, text })
  } catch (err) {
    // The submission is already saved; a mail failure must not lose it or reach the client.
    console.error('[mail] send failed', err)
  }
}
