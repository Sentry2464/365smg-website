#!/usr/bin/env node
// Live FDOT video for 365 SMG clients through Cloudflare Stream (VM 151).
//
// Cloudflare doesn't allow video through our Tunnel's public hostnames, so viewers never get
// video from this VM. When a client asks for a camera, this service pulls the camera's live
// stream from FDOT (one pull per camera, however many viewers) and pushes it to a Cloudflare
// Stream live input. The viewer plays it from Cloudflare with a signed link that expires when
// the session ends.
//
// FDOT's terms: one live camera per client at a time, at most 5 minutes per session.
//
// Cost limits: sessions are charged in full when they start (the most a viewer can watch on
// that link), per client per month and in total per month; at the limit, live video stops
// until the next month (stills and the FL511 link still work).
//
// Called only by the login gate on this VM (gate.mjs), which adds the signed-in client's id:
//   POST /live/<camera>/start   x-smg-cid: <client>   start or continue watching
//   GET  /live/<camera>/status  x-smg-cid: <client>   is the stream reaching Cloudflare yet?
//   POST /live/<camera>/stop    x-smg-cid: <client>   the viewer closed or hid the player
//   GET  /live/usage                                   minutes used this month
//   GET  /healthz                                      "ok"
//
// Node built-ins only, plus ffmpeg.

import { spawn } from 'node:child_process'
import { createPrivateKey, sign } from 'node:crypto'
import http from 'node:http'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const env = (k, d) => process.env[k] ?? d
const num = (k, d) => {
  const n = Number(env(k, String(d)))
  return Number.isFinite(n) ? n : d
}
const LISTEN_HOST = env('LIVE_LISTEN', '127.0.0.1')
const LISTEN_PORT = num('LIVE_PORT', 4186)
const STATE_DIR = env('LIVE_STATE_DIR', '/var/lib/fdot-live')
const SIDECAR = env('FDOT_SIDECAR', 'http://127.0.0.1:4185').replace(/\/$/, '')
const USER_AGENT = env('FDOT_USER_AGENT', '365SMG-IntelMap (globe.365securitymg.com; admin@365securitymg.com)')
// Extra request headers for FDOT's video servers, if FDOT gives us a way to authenticate
// ("Name: value" lines separated by \n). Kept in /etc/fdot-live.env.
const FDOT_VIDEO_HEADERS = env('FDOT_VIDEO_HEADERS', '').replace(/\\n/g, '\n').trim()
const FFMPEG = env('FFMPEG_BIN', 'ffmpeg')

const CF_API = env('CF_API_BASE', 'https://api.cloudflare.com/client/v4').replace(/\/$/, '')
const CF_ACCOUNT = env('CF_ACCOUNT_ID', '')
const CF_TOKEN = env('CF_API_TOKEN', '') // Stream:Edit only; typed into /etc/fdot-live.env on this VM
const STREAM_DOMAIN = env('STREAM_CUSTOMER_DOMAIN', '') // customer-<code>.cloudflarestream.com
const ALLOWED_ORIGINS = env('STREAM_ALLOWED_ORIGINS', 'globe.365securitymg.com')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
// Stream may only play live inputs that record; recordings are deleted after each session.
const RECORDING_MODE = env('STREAM_RECORDING_MODE', 'automatic')
const DELETE_RECORDINGS = env('STREAM_DELETE_RECORDINGS', '1') === '1'

// FDOT allows at most 5 minutes per session; a setting can shorten that, never lengthen it.
const FDOT_MAX_SESSION_MIN = 5
const SESSION_MIN = Math.min(FDOT_MAX_SESSION_MIN, Math.max(1, num('LIVE_SESSION_MIN', FDOT_MAX_SESSION_MIN)))
const CLIENT_MONTHLY_MIN = num('LIVE_CLIENT_MONTHLY_MIN', 120)
const MONTHLY_MIN = num('LIVE_MONTHLY_MIN', 5000)
const MAX_CAMERAS = num('LIVE_MAX_CAMERAS', 5) // pulls at once: ~1.5 Mbps of office upload each
const IDLE_STOP_MS = num('LIVE_IDLE_STOP_S', 30) * 1000
// "*" for every signed-in client, or a comma-separated list of client ids.
const CLIENTS = env('LIVE_CLIENTS', '*')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
const TIME_ZONE = 'America/New_York'

const log = (msg) => console.log(`[live] ${msg}`)

// ---------- state on disk (mode 600: it holds the signing key and stream keys) ----------

async function readJson(name, fallback) {
  try {
    return JSON.parse(await readFile(join(STATE_DIR, name), 'utf8'))
  } catch {
    return fallback
  }
}

async function writeJson(name, value) {
  await mkdir(STATE_DIR, { recursive: true, mode: 0o700 })
  const file = join(STATE_DIR, name)
  await writeFile(`${file}.tmp`, JSON.stringify(value, null, 1), { mode: 0o600 })
  await rename(`${file}.tmp`, file)
}

// ---------- Cloudflare Stream API ----------

async function cf(method, path, body) {
  const res = await fetch(`${CF_API}/accounts/${CF_ACCOUNT}/stream${path}`, {
    method,
    headers: { Authorization: `Bearer ${CF_TOKEN}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.success === false) {
    const why = data.errors?.map((e) => e.message).join('; ') || `HTTP ${res.status}`
    throw new Error(`Cloudflare ${method} ${path}: ${why}`)
  }
  return data.result
}

// The key that signs playback links; created once through the API and kept on this VM.
let signing = null // { id, key }
async function signingKey() {
  if (signing) return signing
  let saved = await readJson('signing-key.json', null)
  if (!saved?.id || !saved?.pem) {
    const made = await cf('POST', '/keys')
    saved = { id: made.id, pem: made.pem, created: new Date().toISOString() }
    await writeJson('signing-key.json', saved)
    log(`created Stream signing key ${saved.id}`)
  }
  signing = { id: saved.id, key: createPrivateKey(Buffer.from(saved.pem, 'base64').toString('utf8')) }
  return signing
}

const b64url = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url')

/** A signed playback token for one live input, valid until `exp` (seconds since 1970). */
export function playbackToken(uid, exp, { id, key }) {
  const head = `${b64url({ alg: 'RS256', kid: id })}.${b64url({ sub: uid, kid: id, exp, nbf: exp - 3600 })}`
  return `${head}.${sign('sha256', Buffer.from(head), key).toString('base64url')}`
}

// One Stream live input per camera, reused across sessions.
let inputs = null // camera -> { uid, rtmps, key }
const creating = new Map() // camera -> Promise, so two first viewers don't make two inputs
function inputFor(camera) {
  if (inputs?.[camera]) return Promise.resolve(inputs[camera])
  if (!creating.has(camera)) creating.set(camera, makeInput(camera).finally(() => creating.delete(camera)))
  return creating.get(camera)
}
async function makeInput(camera) {
  inputs ??= await readJson('inputs.json', {})
  if (inputs[camera]) return inputs[camera]
  const recording = { mode: RECORDING_MODE, requireSignedURLs: true, allowedOrigins: ALLOWED_ORIGINS, timeoutSeconds: 10 }
  const existing = ((await cf('GET', '/live_inputs')) ?? []).find((i) => i.meta?.name === `smg-${camera}`)
  const uid = existing?.uid ?? (await cf('POST', '/live_inputs', { meta: { name: `smg-${camera}` }, recording })).uid
  // Settings are (re)applied every time, so an input made elsewhere can't skip signed links.
  const full = await cf('PUT', `/live_inputs/${uid}`, { meta: { name: `smg-${camera}` }, recording })
  inputs[camera] = { uid, rtmps: full.rtmps?.url, key: full.rtmps?.streamKey }
  if (!inputs[camera].rtmps || !inputs[camera].key) throw new Error(`live input ${uid} has no RTMPS address`)
  await writeJson('inputs.json', inputs)
  log(`live input for ${camera}: ${uid}${existing ? ' (existing)' : ''}`)
  return inputs[camera]
}

async function deleteRecordings(camera) {
  const input = inputs?.[camera]
  if (!DELETE_RECORDINGS || !input) return
  try {
    const videos = (await cf('GET', `/live_inputs/${input.uid}/videos`)) ?? []
    for (const v of videos) if (v.status?.state !== 'live-inprogress') await cf('DELETE', `/${v.uid}`)
    if (videos.length) log(`deleted ${videos.length} recording(s) of ${camera}`)
  } catch (err) {
    log(`could not delete recordings of ${camera}: ${err.message}`)
  }
}

// ---------- usage (minutes charged this month) ----------

const monthNow = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit' }).format(new Date())
let usage = null // { month, total, clients: { cid: minutes } }
async function currentUsage() {
  usage ??= await readJson('usage.json', { month: monthNow(), total: 0, clients: {} })
  if (usage.month !== monthNow()) usage = { month: monthNow(), total: 0, clients: {} }
  return usage
}

// ---------- pulls from FDOT (ffmpeg) ----------

const pulls = new Map() // camera -> { child, startedAt, stopping, restarts }
const leases = new Map() // cid -> { camera, until }

const watchers = (camera) => [...leases.values()].filter((l) => l.camera === camera && l.until > Date.now()).length

function startPull(camera, video, input) {
  const args = ['-hide_banner', '-loglevel', 'error', '-user_agent', USER_AGENT]
  if (FDOT_VIDEO_HEADERS) args.push('-headers', `${FDOT_VIDEO_HEADERS}\r\n`)
  args.push('-rw_timeout', '15000000', '-i', video.videoUrl, '-c:v', 'copy', '-an', '-f', 'flv', `${input.rtmps}${input.key}`)
  const child = spawn(FFMPEG, args, { stdio: ['ignore', 'ignore', 'pipe'] })
  const pull = { child, startedAt: Date.now(), stopping: false, restarts: pulls.get(camera)?.restarts ?? 0 }
  pulls.set(camera, pull)
  child.stderr.on('data', (d) => log(`${camera} ffmpeg: ${String(d).replaceAll(input.key, '<key>').trim().slice(0, 300)}`))
  child.on('error', (err) => log(`${camera}: could not run ffmpeg: ${err.message}`))
  child.on('exit', (code) => {
    if (pulls.get(camera) !== pull) return
    pulls.delete(camera)
    if (pull.stopping) return void deleteRecordings(camera)
    log(`${camera}: pull ended (${code ?? 'signal'})`)
    // Viewers still waiting: try again a few times, then give up until the next start.
    if (watchers(camera) > 0 && pull.restarts < 3) {
      setTimeout(() => {
        if (!pulls.has(camera) && watchers(camera) > 0) {
          startPull(camera, video, input)
          pulls.get(camera).restarts = pull.restarts + 1
        }
      }, 3_000)
    } else void deleteRecordings(camera)
  })
  log(`${camera}: pulling from FDOT`)
}

function stopPull(camera) {
  const pull = pulls.get(camera)
  if (!pull) return
  pull.stopping = true
  pull.child.kill('SIGTERM')
  setTimeout(() => pull.child.kill('SIGKILL'), 5_000).unref()
  log(`${camera}: stopped (no viewers)`)
}

// Leases end when their link expires; a camera with no viewers for IDLE_STOP_MS stops.
const idleSince = new Map()
setInterval(() => {
  const now = Date.now()
  for (const [cid, l] of leases) if (l.until <= now) leases.delete(cid)
  for (const camera of pulls.keys()) {
    if (watchers(camera) > 0) idleSince.delete(camera)
    else if (!idleSince.has(camera)) idleSince.set(camera, now)
    else if (now - idleSince.get(camera) >= IDLE_STOP_MS) {
      idleSince.delete(camera)
      stopPull(camera)
    }
  }
}, 1_000).unref()

// ---------- requests ----------

async function cameraVideo(camera) {
  const res = await fetch(`${SIDECAR}/fdot/video/${camera}`, { signal: AbortSignal.timeout(5_000) })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`camera service HTTP ${res.status}`)
  return res.json()
}

const allowed = (cid) => CLIENTS.includes('*') || CLIENTS.includes(cid)

class Refusal extends Error {
  constructor(status, code, message, extra = {}) {
    super(message)
    Object.assign(this, { status, code, extra })
  }
}

/** Starts (or continues) a session: limits, then the input, the pull and a signed link. */
async function start(cid, camera) {
  if (!allowed(cid)) throw new Refusal(403, 'not_enabled', 'Live video isn’t enabled for your account.')
  const video = await cameraVideo(camera)
  if (!video) throw new Refusal(404, 'unknown_camera', 'That camera isn’t available.')
  if (!video.videoUrl) throw new Refusal(404, 'no_video', 'This camera has no live video. Its still image updates every minute.')
  const u = await currentUsage()
  if (u.total + SESSION_MIN > MONTHLY_MIN)
    throw new Refusal(429, 'monthly_limit', 'Live video has reached this month’s limit. It comes back on the 1st.')
  if ((u.clients[cid] ?? 0) + SESSION_MIN > CLIENT_MONTHLY_MIN)
    throw new Refusal(429, 'client_limit', 'You’ve used this month’s live video minutes. They reset on the 1st.')
  if (!pulls.has(camera) && pulls.size >= MAX_CAMERAS)
    throw new Refusal(429, 'busy', 'Live video is busy right now. Try again in a few minutes.')

  // FDOT: one live camera per client at a time. Closing the player frees it at once (stop);
  // otherwise it's free when the session ends.
  const current = leases.get(cid)
  if (current && current.camera !== camera && current.until > Date.now())
    throw new Refusal(409, 'one_camera', 'Your account is already watching another live camera. Close it first.', {
      watching: current.camera,
      freeAt: new Date(current.until).toISOString(),
    })

  const input = await inputFor(camera)
  const { id, key } = await signingKey()
  const now = Date.now()
  const until = now + SESSION_MIN * 60_000
  leases.set(cid, { camera, until })
  if (!pulls.has(camera)) startPull(camera, video, input)
  u.clients[cid] = (u.clients[cid] ?? 0) + SESSION_MIN
  u.total += SESSION_MIN
  await writeJson('usage.json', u)
  log(`${cid} watching ${camera} for up to ${SESSION_MIN} min (month: client ${u.clients[cid]}, all ${u.total})`)

  // The link stops working 30 s after the session ends (a little slack for clock drift).
  const token = playbackToken(input.uid, Math.floor(until / 1000) + 30, { id, key })
  return {
    camera,
    name: video.name,
    city: video.city,
    iframeUrl: `https://${STREAM_DOMAIN}/${token}/iframe?autoplay=true&muted=true&controls=true&letterboxColor=transparent`,
    sessionSeconds: SESSION_MIN * 60,
    minutesLeft: Math.max(0, Math.min(CLIENT_MONTHLY_MIN - u.clients[cid], MONTHLY_MIN - u.total)),
  }
}

// Whether Cloudflare is receiving the camera yet (cached briefly; the player page polls it).
const statusCache = new Map()
async function status(camera) {
  if (!pulls.has(camera)) return { live: false, running: false }
  const held = statusCache.get(camera)
  if (held && Date.now() - held.at < 2_000) return held.value
  let live = false
  try {
    const input = inputs?.[camera]
    const r = input ? await cf('GET', `/live_inputs/${input.uid}`) : null
    live = r?.status?.current?.state === 'connected'
  } catch (err) {
    log(`status of ${camera}: ${err.message}`)
  }
  const value = { live, running: true }
  statusCache.set(camera, { at: Date.now(), value })
  return value
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(body))
}

const server = http.createServer(async (req, res) => {
  const path = new URL(req.url ?? '/', 'http://local').pathname
  if (path === '/healthz') return res.end('ok')
  if (path === '/live/usage' && req.method === 'GET') {
    const u = await currentUsage()
    return send(res, 200, { ...u, limits: { session: SESSION_MIN, client: CLIENT_MONTHLY_MIN, month: MONTHLY_MIN }, running: [...pulls.keys()] })
  }
  const m = /^\/live\/(fdot-\d{1,12})\/(start|status|stop)$/.exec(path)
  const cid = String(req.headers['x-smg-cid'] ?? '').slice(0, 200)
  if (!m || !cid) return send(res, 404, { error: 'not_found' })
  const [, camera, action] = m
  try {
    if (action === 'start' && req.method === 'POST') return send(res, 200, await start(cid, camera))
    if (action === 'status' && req.method === 'GET') return send(res, 200, await status(camera))
    if (action === 'stop' && req.method === 'POST') {
      if (leases.get(cid)?.camera === camera) leases.delete(cid)
      return send(res, 200, { ok: true })
    }
    return send(res, 405, { error: 'method_not_allowed' })
  } catch (err) {
    if (err instanceof Refusal) return send(res, err.status, { error: err.code, message: err.message, ...err.extra })
    log(`${action} ${camera} for ${cid} failed: ${err.message}`)
    return send(res, 502, { error: 'unavailable', message: 'Live video couldn’t start. Try again shortly.' })
  }
})

const missing = ['CF_ACCOUNT_ID', 'CF_API_TOKEN', 'STREAM_CUSTOMER_DOMAIN'].filter((k) => !env(k, ''))
if (missing.length) {
  console.error(`[live] missing ${missing.join(', ')} (see /etc/fdot-live.env)`)
  process.exit(1)
}
if (!/^[a-z0-9-]+\.cloudflarestream\.com$/.test(STREAM_DOMAIN)) {
  console.error('[live] STREAM_CUSTOMER_DOMAIN should look like customer-<code>.cloudflarestream.com')
  process.exit(1)
}

// Recordings left over from a crash or restart, and any Cloudflare was still finishing when a
// camera stopped: cleared at start-up and every 15 minutes for cameras not being pulled.
const sweep = () => {
  for (const camera of Object.keys(inputs ?? {})) if (!pulls.has(camera)) void deleteRecordings(camera)
}
inputs ??= await readJson('inputs.json', {})
sweep()
setInterval(sweep, 15 * 60_000).unref()

server.listen(LISTEN_PORT, LISTEN_HOST, () =>
  log(`listening on ${LISTEN_HOST}:${LISTEN_PORT}; sessions ${SESSION_MIN} min; limits ${CLIENT_MONTHLY_MIN}/client, ${MONTHLY_MIN} total per month`),
)
const shutdown = () => {
  for (const camera of [...pulls.keys()]) stopPull(camera)
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 6_000).unref()
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
