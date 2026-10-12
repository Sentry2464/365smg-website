import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deliver, mailProvider, resetMail } from '../mail.mjs'

const ENV = { ...process.env }
beforeEach(() => {
  resetMail()
  Object.assign(process.env, {
    SMG_MAIL_PROVIDER: 'graph',
    MS_TENANT_ID: 'tenant-1',
    MS_CLIENT_ID: 'client-1',
    MS_CLIENT_SECRET: 'not-a-real-secret',
    MAIL_FROM: 'admin@sentryglobal.net',
  })
})
afterEach(() => {
  process.env = { ...ENV }
  vi.useRealTimers()
})

function graph(responses: Response[]) {
  const calls: { url: string; init: RequestInit }[] = []
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    if (url.includes('login.microsoftonline.com')) return Response.json({ access_token: 'tok', expires_in: 3600 })
    return responses.shift() ?? new Response(null, { status: 202 })
  }) as unknown as typeof fetch
  return { impl, calls }
}

describe('mail via Microsoft Graph', () => {
  it('gets an app token once and sends as MAIL_FROM', async () => {
    expect(mailProvider()).toBe('graph')
    const g = graph([new Response(null, { status: 202 }), new Response(null, { status: 202 })])
    await deliver('jaliaga@365securitymg.com', 'Case INV-1', 'New request', g.impl)
    await deliver('laura.g@365securitymg.com', 'Feedback', 'Text', g.impl)

    const tokenCalls = g.calls.filter((c) => c.url.includes('login.microsoftonline.com'))
    expect(tokenCalls).toHaveLength(1) // cached
    expect(tokenCalls[0].url).toBe('https://login.microsoftonline.com/tenant-1/oauth2/v2.0/token')
    expect(String(tokenCalls[0].init.body)).toContain('scope=https%3A%2F%2Fgraph.microsoft.com%2F.default')

    const send = g.calls.find((c) => c.url.includes('sendMail'))!
    expect(send.url).toBe('https://graph.microsoft.com/v1.0/users/admin%40sentryglobal.net/sendMail')
    expect((send.init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
    const body = JSON.parse(String(send.init.body))
    expect(body.message.toRecipients).toEqual([{ emailAddress: { address: 'jaliaga@365securitymg.com' } }])
    expect(body.message.body).toEqual({ contentType: 'Text', content: 'New request' })
    expect(body.saveToSentItems).toBe(false)
  })

  it('retries throttling, honouring Retry-After, and reports a refusal', async () => {
    vi.useFakeTimers()
    const g = graph([new Response(null, { status: 429, headers: { 'retry-after': '1' } }), new Response(null, { status: 202 })])
    const sent = deliver('a@b.test', 's', 't', g.impl)
    await vi.runAllTimersAsync()
    await expect(sent).resolves.toBe('graph')
    vi.useRealTimers()

    const denied = graph([Response.json({ error: { code: 'ErrorAccessDenied', message: 'Access is denied.' } }, { status: 403 })])
    await expect(deliver('a@b.test', 's', 't', denied.impl)).rejects.toThrow('HTTP 403 ErrorAccessDenied')
  })

  it('falls back to the log when nothing is configured', async () => {
    process.env.SMG_MAIL_PROVIDER = ''
    delete process.env.SMTP_HOST
    expect(mailProvider()).toBe('log')
  })
})
