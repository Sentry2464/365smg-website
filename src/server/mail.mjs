// Outgoing email for staff notifications (feedback, investigation case references).
// Plain JavaScript so the smg-admin command can use it too.
//
// SMG_MAIL_PROVIDER=graph  Microsoft 365 via Microsoft Graph (app-only, client credentials):
//                          MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET, MAIL_FROM (the mailbox
//                          the app may send as), MAIL_FROM_NAME. Uses HTTPS only.
// SMG_MAIL_PROVIDER=smtp   (or SMTP_HOST set) SMTP_HOST/PORT/USER/PASS/FROM via nodemailer.
// Neither configured:      messages are written to the server log instead.

const UA = () =>
  `365SMG-ClientPortal (portal.365smg.com, ${process.env.SMG_API_CONTACT || 'admin@365securitymg.com'})`

export function mailProvider() {
  const p = (process.env.SMG_MAIL_PROVIDER || '').toLowerCase()
  if (p === 'graph') return 'graph'
  if (p === 'smtp' || (!p && process.env.SMTP_HOST)) return 'smtp'
  return 'log'
}

// ---------- Microsoft Graph ----------

let token = null // { value, expiresAt }

async function graphToken(fetchImpl) {
  if (token && Date.now() < token.expiresAt) return token.value
  const { MS_TENANT_ID: tenant, MS_CLIENT_ID: id, MS_CLIENT_SECRET: secret } = process.env
  if (!tenant || !id || !secret) throw new Error('MS_TENANT_ID, MS_CLIENT_ID and MS_CLIENT_SECRET must be set')
  const res = await fetchImpl(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA() },
    body: new URLSearchParams({
      client_id: id,
      client_secret: secret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
    signal: AbortSignal.timeout(20_000),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json.access_token) {
    // Never log the secret; Microsoft's error code and description are safe to show.
    throw new Error(`token request failed: HTTP ${res.status} ${json.error ?? ''} ${(json.error_description ?? '').split('\n')[0]}`.trim())
  }
  // Refresh 5 minutes before it expires.
  token = { value: json.access_token, expiresAt: Date.now() + Math.max(60, (json.expires_in ?? 3600) - 300) * 1000 }
  return token.value
}

async function sendGraph(to, subject, text, fetchImpl) {
  const from = process.env.MAIL_FROM
  if (!from) throw new Error('MAIL_FROM must be set')
  const body = JSON.stringify({
    message: {
      subject,
      body: { contentType: 'Text', content: text },
      from: { emailAddress: { address: from, name: process.env.MAIL_FROM_NAME || '365 SMG Client Portal' } },
      toRecipients: to.split(',').map((a) => ({ emailAddress: { address: a.trim() } })),
    },
    saveToSentItems: false,
  })
  for (let attempt = 1; ; attempt++) {
    const res = await fetchImpl(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(from)}/sendMail`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await graphToken(fetchImpl)}`,
        'Content-Type': 'application/json',
        'User-Agent': UA(),
      },
      body,
      signal: AbortSignal.timeout(30_000),
    })
    if (res.status === 202) return
    if (res.status === 401) token = null // expired or revoked: fetch a new token on the next try
    const retry = res.status === 429 || res.status >= 500 || res.status === 401
    if (!retry || attempt >= 3) {
      const err = await res.json().catch(() => ({}))
      throw new Error(`sendMail failed: HTTP ${res.status} ${err.error?.code ?? ''} ${err.error?.message ?? ''}`.trim())
    }
    const after = Number(res.headers.get('retry-after'))
    await new Promise((r) => setTimeout(r, (Number.isFinite(after) && after > 0 ? Math.min(after, 60) : 2 * attempt) * 1000))
  }
}

// ---------- SMTP ----------

let transport = null

async function sendSmtp(to, subject, text) {
  if (!transport) {
    const nodemailer = (await import('nodemailer')).default
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_PORT === '465',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    })
  }
  await transport.sendMail({ from: process.env.SMTP_FROM || 'Client Portal <portal@365smg.com>', to, subject, text })
}

/**
 * Sends a plain-text email. Throws on failure; callers that must never fail (form
 * submissions) use notify() instead.
 */
export async function deliver(to, subject, text, fetchImpl = fetch) {
  const provider = mailProvider()
  if (provider === 'graph') await sendGraph(to, subject, text, fetchImpl)
  else if (provider === 'smtp') await sendSmtp(to, subject, text)
  else {
    console.info(`[mail] to=${to} subject=${JSON.stringify(subject)}\n${text}`)
    return provider
  }
  // Recipient and subject only (subjects never carry confidential details), for tracing deliveries.
  console.info(`[mail] sent via ${provider} to=${to} subject=${JSON.stringify(subject)}`)
  return provider
}

/** Test hook: forget the cached Graph token and SMTP transport. */
export function resetMail() {
  token = null
  transport = null
}
