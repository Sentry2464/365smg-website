import { type ChildProcess, spawn } from 'node:child_process'
import http from 'node:http'
import net, { type AddressInfo } from 'node:net'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { globeTicket, globeUrlFor } from '../globe'

// The portal's tickets against the real gate (deploy/globe/gate.mjs) in front of a fake God's Eye.

const SECRET = 'x'.repeat(40)
let upstream: http.Server
let gate: ChildProcess
let base = ''
const seen: http.IncomingHttpHeaders[] = []

const freePort = () =>
  new Promise<number>((resolve) => {
    const s = net.createServer().listen(0, '127.0.0.1', () => {
      const { port } = s.address() as AddressInfo
      s.close(() => resolve(port))
    })
  })

/** Starts the real gate on a free port in front of the fake God's Eye; resolves to its base URL. */
async function startGate(extra: Record<string, string>) {
  const port = await freePort()
  const child = spawn(process.execPath, [path.resolve(__dirname, '../../../deploy/globe/gate.mjs')], {
    env: {
      ...process.env,
      GATE_SECRET: SECRET,
      GATE_PORT: String(port),
      GATE_UPSTREAM: `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`,
      GATE_TICKETS_PER_MINUTE: '8',
      ...extra,
    },
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  await new Promise<void>((resolve) => child.stdout!.on('data', (d) => String(d).includes('listening') && resolve()))
  return { child, base: `http://127.0.0.1:${port}` }
}

beforeAll(async () => {
  upstream = http.createServer((req, res) => {
    seen.push(req.headers)
    res.writeHead(200, { 'Content-Type': 'text/plain', 'Set-Cookie': 'gev_pref=1; Path=/' })
    res.end(`globe ${req.url}`)
  })
  upstream.on('upgrade', (req, socket) => {
    seen.push(req.headers)
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n')
    socket.pipe(socket) // echo
  })
  await new Promise<void>((r) => upstream.listen(0, '127.0.0.1', r))
  // Live video on here, to test the per-client limit; off by default (see the last cases).
  ;({ child: gate, base } = await startGate({ GATE_LIVE_VIDEO: '1', GATE_STREAM_IDLE_MS: '400', GATE_STREAM_TAKEOVER_MS: '250' }))
})

afterAll(() => {
  gate?.kill()
  upstream?.close()
})

const get = (p: string, headers: Record<string, string> = {}) => fetch(base + p, { redirect: 'manual', headers })
const cookieOf = (res: Response) => res.headers.getSetCookie()[0]?.split(';')[0]

describe('globe gate', () => {
  it('answers health checks and refuses visitors without a ticket or cookie', async () => {
    expect(await (await get('/healthz')).text()).toBe('ok')
    const res = await get('/?embed=1')
    expect(res.status).toBe(403)
    expect(res.headers.get('content-security-policy')).toContain('frame-ancestors https://portal.365securitymg.com')
    expect(seen).toHaveLength(0)
  })

  it('swaps a ticket for a cookie once, then proxies with clean headers', async () => {
    const ticket = globeTicket(SECRET, 'client-1')
    const first = await get(`/?embed=1&t=${ticket}`)
    expect(first.status).toBe(302)
    expect(first.headers.get('location')).toBe('/?embed=1')
    const setCookie = first.headers.getSetCookie()[0]
    expect(setCookie).toMatch(/^__Host-gev_session=.+; Path=\/; Max-Age=43200; HttpOnly; SameSite=Lax; Secure$/)

    // The same ticket again, without the cookie: refused.
    expect((await get(`/?embed=1&t=${ticket}`)).status).toBe(403)

    const cookie = cookieOf(first)
    const page = await get('/?embed=1', {
      cookie: `other=keep; ${cookie}`,
      'cf-connecting-ip': '203.0.113.9',
      'cf-ray': 'abc',
      'x-forwarded-for': '203.0.113.9',
      forwarded: 'for=203.0.113.9',
      via: '1.1 cloudflare',
    })
    expect(page.status).toBe(200)
    expect(await page.text()).toBe('globe /?embed=1')
    expect(page.headers.getSetCookie()).toEqual(['gev_pref=1; Path=/'])
    const h = seen.at(-1)!
    expect(h.host).toMatch(/^localhost:\d+$/)
    expect(h.cookie).toBe('other=keep')
    for (const k of ['cf-connecting-ip', 'cf-ray', 'x-forwarded-for', 'forwarded', 'via']) expect(h[k]).toBeUndefined()

    // A reload with a spent ticket but a valid cookie just drops the ticket.
    const reload = await get(`/?embed=1&t=${ticket}`, { cookie })
    expect(reload.status).toBe(302)
    expect(reload.headers.getSetCookie()).toEqual([])
  })

  it('refuses expired, tampered and foreign tickets and forged cookies', async () => {
    const old = globeTicket(SECRET, 'c', Date.now() - 120_000)
    expect((await get(`/?t=${old}`)).status).toBe(403)
    const [v, payload, sig] = globeTicket(SECRET, 'c').split('.')
    const forged = Buffer.from(JSON.stringify({ cid: 'other', exp: Math.floor(Date.now() / 1000) + 60, jti: 'x' })).toString('base64url')
    expect((await get(`/?t=${v}.${forged}.${sig}`)).status).toBe(403)
    expect((await get(`/?t=${globeTicket('y'.repeat(40), 'c')}`)).status).toBe(403)
    expect(payload).toBeTruthy()
    expect((await get('/', { cookie: '__Host-gev_session=e30.AAAA' })).status).toBe(403)
  })

  it('passes WebSocket upgrades only with the cookie', async () => {
    const cookie = cookieOf(await get(`/?t=${globeTicket(SECRET, 'ws')}`))
    const talk = (withCookie: boolean) =>
      new Promise<string>((resolve) => {
        const s = net.connect(Number(new URL(base).port), '127.0.0.1', () => {
          s.write(
            `GET /ws HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n${withCookie ? `Cookie: ${cookie}\r\n` : ''}\r\n`,
          )
        })
        let got = ''
        s.on('data', (d) => {
          got += d
          if (got.includes('\r\n\r\n') && !got.includes('ping') && got.startsWith('HTTP/1.1 101')) s.write('ping')
          if (got.endsWith('ping') || got.startsWith('HTTP/1.1 403')) {
            s.destroy()
            resolve(got)
          }
        })
        s.on('close', () => resolve(got))
      })
    expect(await talk(false)).toMatch(/^HTTP\/1.1 403/)
    const ok = await talk(true)
    expect(ok).toMatch(/^HTTP\/1.1 101/)
    expect(ok.endsWith('ping')).toBe(true)
  })

  it('lets each client stream one live camera at a time', async () => {
    const a = cookieOf(await get(`/?t=${globeTicket(SECRET, 'client-a')}`))
    const b = cookieOf(await get(`/?t=${globeTicket(SECRET, 'client-b')}`))
    expect((await get('/api/cctv/stream/fdot-1', { cookie: a })).status).toBe(200)
    expect((await get('/api/cctv/media/fdot-1/seg-3.ts', { cookie: a })).status).toBe(200) // same camera
    const second = await get('/api/cctv/stream/fdot-2', { cookie: a })
    expect(second.status).toBe(429)
    expect(await second.json()).toEqual({ error: 'stream_limit', message: 'Close your other live camera first.', streaming: 'fdot-1' })
    expect((await get('/api/cctv/stream/fdot-2', { cookie: b })).status).toBe(200) // another client
    expect((await get('/api/cctv/frame/fdot-9', { cookie: a })).status).toBe(200) // stills don't count
    await new Promise((r) => setTimeout(r, 500)) // the first stream goes idle
    expect((await get('/api/cctv/stream/fdot-2', { cookie: a })).status).toBe(200)
  })

  it('frees the slot as soon as God’s Eye closes the stream, or when it goes quiet', async () => {
    // Its own client IP, so the earlier cases' sign-ins don't hit the ticket rate limit.
    const c = cookieOf(await get(`/?t=${globeTicket(SECRET, 'client-c')}`, { 'cf-connecting-ip': '192.0.2.10' }))
    const del = (p: string) => fetch(base + p, { method: 'DELETE', redirect: 'manual', headers: { cookie: c } })
    expect((await get('/api/cctv/media/fdot-1?session=s1&lease=l1', { cookie: c })).status).toBe(200)
    expect((await get('/api/cctv/media/fdot-2?session=s2', { cookie: c })).status).toBe(429)
    expect((await del('/api/cctv/media/fdot-1?lease=l1')).status).toBe(200) // proxied, and frees the slot
    expect((await get('/api/cctv/media/fdot-2?session=s2', { cookie: c })).status).toBe(200) // straight away
    // fdot-2 is left open with no DELETE; once quiet, a new camera takes the slot over.
    await new Promise((r) => setTimeout(r, 300))
    expect((await get('/api/cctv/stream/fdot-3', { cookie: c })).status).toBe(200)
    expect((await get('/api/cctv/stream/fdot-2', { cookie: c })).status).toBe(429)
  })

  it('rate-limits ticket checks per client IP', async () => {
    const statuses = []
    for (let i = 0; i < 10; i++) statuses.push((await get('/?t=v1.bad.bad', { 'cf-connecting-ip': '198.51.100.7' })).status)
    expect(statuses.slice(0, 8).every((s) => s === 403)).toBe(true)
    expect(statuses.slice(8)).toEqual([429, 429])
  })
})

describe('globe gate behind Cloudflare (default)', () => {
  it('refuses live video, and still serves the map and camera stills', async () => {
    const { child, base: off } = await startGate({})
    try {
      const at = (p: string, cookie = '') => fetch(off + p, { redirect: 'manual', headers: cookie ? { cookie } : {} })
      const cookie = cookieOf(await at(`/?t=${globeTicket(SECRET, 'client-d')}`))!
      const before = seen.length
      for (const p of ['/api/cctv/stream/fdot-1', '/api/cctv/media/fdot-1/seg-3.ts?session=s', '/api/cctv/media/fdot-1']) {
        const res = await at(p, cookie)
        expect(res.status).toBe(403)
        expect((await res.json()).error).toBe('live_video_off')
      }
      expect(seen.length).toBe(before) // never reached God's Eye
      expect((await at('/api/cctv/frame/fdot-1', cookie)).status).toBe(200)
      expect((await at('/?embed=1', cookie)).status).toBe(200)
    } finally {
      child.kill()
    }
  })
})

describe('portal globe URL', () => {
  it('adds a ticket, and never frames a public globe without a secret', () => {
    const saved = { ...process.env }
    try {
      process.env.SMG_GLOBE_URL = 'https://globe.365securitymg.com/'
      delete process.env.SMG_GLOBE_SECRET
      expect(globeUrlFor('c1')).toBeUndefined()
      process.env.SMG_GLOBE_SECRET = SECRET
      const u = new URL(globeUrlFor('c1')!)
      expect(u.origin).toBe('https://globe.365securitymg.com')
      expect(u.searchParams.get('t')).toMatch(/^v1\.[\w-]+\.[\w-]+$/)
      process.env.SMG_GLOBE_URL = 'http://localhost:4173/'
      delete process.env.SMG_GLOBE_SECRET
      expect(globeUrlFor('c1')).toBe('http://localhost:4173/')
    } finally {
      process.env = saved
    }
  })
})
