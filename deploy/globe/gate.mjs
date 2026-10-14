#!/usr/bin/env node
// Login gate for God's Eye View (VM 151). Only people signed in to the 365 SMG Client
// Portal get to the globe:
//
//   1. The portal frames https://globe.365securitymg.com/?embed=1&t=<ticket>. The ticket is
//      HMAC-SHA256 signed with the shared secret, lasts 60 seconds and works once.
//   2. The gate checks it, sets its own cookie (host-only, Secure, HttpOnly, SameSite=Lax,
//      12 hours) and redirects to the same URL without the ticket.
//   3. Every other request needs that cookie and is passed to God's Eye (vite preview on
//      127.0.0.1:4173), streamed, WebSockets included. Without it: 403.
//
// GET /healthz answers "ok" without a cookie (no details).
// Node built-ins only. Settings come from the environment (see gev-gate.env.example).

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import http from 'node:http'
import net from 'node:net'

const env = (k, d) => process.env[k] ?? d
const SECRET = env('GATE_SECRET', '')
if (SECRET.length < 32) {
  console.error('GATE_SECRET must be set to the same 32+ character value as SMG_GLOBE_SECRET on the portal.')
  process.exit(1)
}
const LISTEN_HOST = env('GATE_LISTEN', '127.0.0.1')
const LISTEN_PORT = Number(env('GATE_PORT', '4180'))
const UPSTREAM = new URL(env('GATE_UPSTREAM', 'http://127.0.0.1:4173'))
// Host header sent to God's Eye; vite preview accepts localhost without GEV_ALLOWED_HOSTS.
const UPSTREAM_HOST = env('GATE_UPSTREAM_HOST', `localhost:${UPSTREAM.port || 80}`)
const COOKIE_HOURS = Number(env('GATE_COOKIE_HOURS', '12'))
// Only for testing over plain http on a non-localhost name: drops Secure and the __Host- prefix.
const INSECURE = env('GATE_INSECURE_COOKIE', '') === '1'
const COOKIE = INSECURE ? 'gev_session' : '__Host-gev_session'
const FRAME_ANCESTORS = env('GATE_FRAME_ANCESTORS', 'https://portal.365securitymg.com')
const MAX_TICKET_SECONDS = 300 // refuse tickets claiming a longer life than this
const TICKETS_PER_MINUTE = Number(env('GATE_TICKETS_PER_MINUTE', '30')) // per client IP
const TICKETS_PER_MINUTE_ALL = Number(env('GATE_TICKETS_PER_MINUTE_ALL', '600'))
// Live camera video: how many cameras one client may stream at once (0 = no limit), which
// requests count as streaming (path regex; the first group is the camera id), and how long
// a stream counts as open after its last request (God's Eye drops idle streams after 15 s).
const STREAMS_PER_CLIENT = Number(env('GATE_STREAMS_PER_CLIENT', '1'))
const STREAM_PATH = new RegExp(env('GATE_STREAM_PATH', '^/api/cctv/(?:stream|media)/([^/?]+)'))
const STREAM_IDLE_MS = Number(env('GATE_STREAM_IDLE_MS', '20000'))

// Separate keys for tickets and cookies, both from the one shared secret.
const key = (label) => createHmac('sha256', SECRET).update(`gev-gate/${label}`).digest()
const TICKET_KEY = Buffer.from(SECRET) // the portal signs tickets with the secret itself
const COOKIE_KEY = key('cookie')

const log = (msg) => console.log(`[gate] ${msg}`)
const nowS = () => Math.floor(Date.now() / 1000)

function sign(k, data) {
  return createHmac('sha256', k).update(data).digest()
}

function verify(k, data, sigB64) {
  let sig
  try {
    sig = Buffer.from(sigB64, 'base64url')
  } catch {
    return false
  }
  const want = sign(k, data)
  return sig.length === want.length && timingSafeEqual(sig, want)
}

// ---------- tickets (from the portal) ----------

const usedTickets = new Map() // jti -> exp (seconds); entries drop once expired
setInterval(() => {
  const t = nowS()
  for (const [jti, exp] of usedTickets) if (exp < t) usedTickets.delete(jti)
}, 60_000).unref()

/** {cid} for a valid, unexpired, unused ticket; otherwise a reason string. */
function checkTicket(ticket) {
  const parts = String(ticket).split('.')
  if (parts.length !== 3 || parts[0] !== 'v1') return 'malformed'
  if (!verify(TICKET_KEY, `${parts[0]}.${parts[1]}`, parts[2])) return 'bad signature'
  let p
  try {
    p = JSON.parse(Buffer.from(parts[1], 'base64url').toString())
  } catch {
    return 'malformed'
  }
  const t = nowS()
  if (typeof p.exp !== 'number' || typeof p.jti !== 'string' || typeof p.cid !== 'string') return 'malformed'
  if (p.exp < t) return 'expired'
  if (p.exp > t + MAX_TICKET_SECONDS) return 'lifetime too long'
  if (usedTickets.has(p.jti)) return 'already used'
  if (usedTickets.size > 100_000) return 'busy' // replay cache full: refuse rather than forget
  usedTickets.set(p.jti, p.exp)
  return { cid: p.cid.slice(0, 64) }
}

// ---------- the gate's own cookie ----------

function makeCookie(cid) {
  const exp = nowS() + COOKIE_HOURS * 3600
  const body = Buffer.from(JSON.stringify({ cid, exp, sid: randomBytes(9).toString('base64url') })).toString('base64url')
  const value = `${body}.${sign(COOKIE_KEY, body).toString('base64url')}`
  return `${COOKIE}=${value}; Path=/; Max-Age=${COOKIE_HOURS * 3600}; HttpOnly; SameSite=Lax${INSECURE ? '' : '; Secure'}`
}

function readCookie(header) {
  for (const part of String(header ?? '').split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name !== COOKIE) continue
    const [body, sig] = rest.join('=').split('.')
    if (!body || !sig || !verify(COOKIE_KEY, body, sig)) return null
    try {
      const p = JSON.parse(Buffer.from(body, 'base64url').toString())
      return typeof p.exp === 'number' && p.exp > nowS() ? p : null
    } catch {
      return null
    }
  }
  return null
}

/** The Cookie header without the gate's cookie (God's Eye has no use for it). */
function cookiesForUpstream(header) {
  if (!header) return undefined
  const kept = String(header)
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith(`${COOKIE}=`))
  return kept.length ? kept.join('; ') : undefined
}

// ---------- rate limit for ticket checks ----------

const buckets = new Map() // ip -> { n, reset }
let all = { n: 0, reset: 0 }
setInterval(() => {
  const t = Date.now()
  for (const [ip, b] of buckets) if (b.reset < t) buckets.delete(ip)
}, 60_000).unref()

function allowTicketCheck(ip) {
  const t = Date.now()
  if (all.reset < t) all = { n: 0, reset: t + 60_000 }
  const b = buckets.get(ip) ?? { n: 0, reset: t + 60_000 }
  if (b.reset < t) Object.assign(b, { n: 0, reset: t + 60_000 })
  buckets.set(ip, b)
  return ++b.n <= TICKETS_PER_MINUTE && ++all.n <= TICKETS_PER_MINUTE_ALL
}

// The gate only listens on localhost behind cloudflared, so CF-Connecting-IP is Cloudflare's.
const clientIp = (req) => String(req.headers['cf-connecting-ip'] ?? req.socket.remoteAddress ?? '?').slice(0, 64)

// ---------- one live camera stream per client ----------

// cid -> Map(cameraId -> last request time). Bandwidth is the limit: the office uplink is
// shared, and each video stream is ~1.5 Mbps, so a client gets one camera at a time.
const streams = new Map()
setInterval(() => {
  const cutoff = Date.now() - STREAM_IDLE_MS
  for (const [cid, cams] of streams) {
    for (const [cam, at] of cams) if (at < cutoff) cams.delete(cam)
    if (cams.size === 0) streams.delete(cid)
  }
}, 5_000).unref()

/** Null to go ahead, or the camera already streaming for this client. */
function streamConflict(cid, path) {
  if (STREAMS_PER_CLIENT <= 0) return null
  const m = STREAM_PATH.exec(path)
  if (!m) return null
  const cam = decodeURIComponent(m[1])
  const now = Date.now()
  const cams = streams.get(cid) ?? new Map()
  for (const [c, at] of cams) if (now - at >= STREAM_IDLE_MS) cams.delete(c)
  if (!cams.has(cam) && cams.size >= STREAMS_PER_CLIENT) return [...cams.keys()][0]
  cams.set(cam, now)
  streams.set(cid, cams)
  return null
}

// ---------- responses from the gate itself ----------

const SECURITY_HEADERS = {
  'Content-Security-Policy': `default-src 'none'; style-src 'unsafe-inline'; frame-ancestors ${FRAME_ANCESTORS}`,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
}

function deny(res, status, text) {
  res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': 'text/html; charset=utf-8' })
  res.end(`<!doctype html><meta charset="utf-8"><title>Map unavailable</title>
<body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#12122B;color:#D0D4DC;font:14px system-ui,sans-serif;text-align:center">
<p>${text}</p></body>`)
}

// ---------- proxy ----------

const HOP = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'proxy-connection',
  'te', 'trailer', 'transfer-encoding', 'upgrade', 'host', 'cookie',
])

/** Request headers for God's Eye: no hop-by-hop, Cloudflare or forwarding headers. */
function upstreamHeaders(req) {
  const listed = new Set(String(req.headers.connection ?? '').toLowerCase().split(',').map((s) => s.trim()))
  const out = {}
  for (const [k, v] of Object.entries(req.headers)) {
    const name = k.toLowerCase()
    if (HOP.has(name) || listed.has(name)) continue
    if (name.startsWith('cf-') || name.startsWith('x-forwarded-') || name === 'forwarded' || name === 'via') continue
    if (name === 'cdn-loop' || name === 'true-client-ip' || name === 'x-real-ip') continue
    out[k] = v
  }
  out.host = UPSTREAM_HOST
  const cookie = cookiesForUpstream(req.headers.cookie)
  if (cookie) out.cookie = cookie
  return out
}

function responseHeaders(headers) {
  const listed = new Set(String(headers.connection ?? '').toLowerCase().split(',').map((s) => s.trim()))
  const out = {}
  for (const [k, v] of Object.entries(headers)) {
    const name = k.toLowerCase()
    if ((HOP.has(name) && name !== 'cookie') || listed.has(name)) continue
    out[k] = v
  }
  return out
}

function proxy(req, res) {
  const up = http.request(
    {
      host: UPSTREAM.hostname,
      port: UPSTREAM.port || 80,
      method: req.method,
      path: req.url,
      headers: upstreamHeaders(req),
    },
    (upRes) => {
      res.writeHead(upRes.statusCode ?? 502, upRes.statusMessage, responseHeaders(upRes.headers))
      upRes.pipe(res) // streamed: large tiles and HLS segments are never buffered
    },
  )
  up.on('error', (err) => {
    log(`upstream error: ${err.code ?? err.message}`)
    if (!res.headersSent) deny(res, 502, 'The map is unavailable right now.')
    else res.destroy()
  })
  req.on('aborted', () => up.destroy())
  res.on('close', () => up.destroy())
  req.pipe(up)
}

// ---------- server ----------

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://gate.invalid')
  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' })
    return res.end('ok')
  }

  const ticket = url.searchParams.get('t')
  if (ticket !== null) {
    url.searchParams.delete('t')
    const clean = `${url.pathname}${url.search}`
    // Already signed in (e.g. the frame reloaded with a spent ticket): just drop the ticket.
    if (readCookie(req.headers.cookie)) {
      res.writeHead(302, { ...SECURITY_HEADERS, Location: clean })
      return res.end()
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return deny(res, 405, 'Open the map from the 365 SMG Client Portal.')
    const ip = clientIp(req)
    if (!allowTicketCheck(ip)) {
      log(`rate limited ticket check from ${ip}`)
      return deny(res, 429, 'Too many attempts. Reload the portal in a minute.')
    }
    const result = checkTicket(ticket)
    if (typeof result === 'string') {
      log(`rejected ticket from ${ip}: ${result}`)
      return deny(res, 403, 'This map link has expired. Reload the 365 SMG Client Portal to open the map again.')
    }
    log(`signed in client ${result.cid} from ${ip}`)
    res.writeHead(302, { ...SECURITY_HEADERS, Location: clean, 'Set-Cookie': makeCookie(result.cid) })
    return res.end()
  }

  const session = readCookie(req.headers.cookie)
  if (!session) return deny(res, 403, 'Open the map from the 365 SMG Client Portal.')
  const busy = streamConflict(session.cid, url.pathname)
  if (busy) {
    res.writeHead(429, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Retry-After': String(Math.ceil(STREAM_IDLE_MS / 1000)) })
    return res.end(JSON.stringify({ error: 'stream_limit', message: 'Close your other live camera first.', streaming: busy }))
  }
  proxy(req, res)
})

// WebSockets (and any other upgrade): same cookie rule, then a raw two-way pipe.
server.on('upgrade', (req, socket, head) => {
  if (!readCookie(req.headers.cookie)) {
    socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n')
    return
  }
  const up = net.connect(Number(UPSTREAM.port || 80), UPSTREAM.hostname, () => {
    const headers = upstreamHeaders(req)
    headers.connection = 'Upgrade'
    headers.upgrade = req.headers.upgrade
    const lines = [`${req.method} ${req.url} HTTP/1.1`]
    for (const [k, v] of Object.entries(headers)) for (const one of [].concat(v)) lines.push(`${k}: ${one}`)
    up.write(`${lines.join('\r\n')}\r\n\r\n`)
    if (head?.length) up.write(head)
    up.pipe(socket)
    socket.pipe(up)
  })
  const close = () => {
    up.destroy()
    socket.destroy()
  }
  up.on('error', close)
  socket.on('error', close)
})

server.headersTimeout = 20_000
server.requestTimeout = 0 // streams (HLS) can be long; idle sockets still time out
server.keepAliveTimeout = 65_000
server.listen(LISTEN_PORT, LISTEN_HOST, () =>
  log(`listening on ${LISTEN_HOST}:${LISTEN_PORT}, proxying to ${UPSTREAM.origin} as ${UPSTREAM_HOST}`),
)

const stop = () => {
  server.close(() => process.exit(0))
  server.closeIdleConnections()
  setTimeout(() => process.exit(0), 5_000).unref() // don't wait on long streams
}
process.on('SIGTERM', stop)
process.on('SIGINT', stop)
