#!/usr/bin/env node
// FDOT traffic cameras for God's Eye View (VM 151), on the terms agreed with FDOT:
//
//   - one server: browsers never contact fl511.com; God's Eye fetches stills from here;
//   - each camera's still is fetched from FDOT at most once a minute, shared by everyone;
//   - every request to FDOT identifies 365 SMG (FDOT_USER_AGENT);
//   - nothing is kept beyond the current still (in memory only);
//   - only cameras in FDOT's own list are fetched, so this is not an open proxy.
//
//   GET /fdot/cameras.json   the camera pack God's Eye loads (see README.md)
//   GET /fdot/snap/<id>      the camera's current still (JPEG)
//   GET /healthz             "ok"
//
// Node built-ins only. The FL511 list query and WKT parsing follow OSIRIS
// (github.com/simplifaisoul/osiris, MIT licence, src/app/api/cctv/ibi511.ts).

import http from 'node:http'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

const env = (k, d) => process.env[k] ?? d
const LISTEN_HOST = env('FDOT_LISTEN', '127.0.0.1')
const LISTEN_PORT = Number(env('FDOT_PORT', '4185'))
// How God's Eye reaches this service (the pack's url/snapshotUrl point here).
const PUBLIC_BASE = env('FDOT_PUBLIC_BASE', `http://127.0.0.1:${LISTEN_PORT}`).replace(/\/$/, '')
const FDOT_BASE = env('FDOT_BASE', 'https://fl511.com').replace(/\/$/, '')
const USER_AGENT = env('FDOT_USER_AGENT', '365SMG-IntelMap (globe.365securitymg.com; admin@365securitymg.com)')
const LICENSE = env('FDOT_LICENSE', 'Florida Department of Transportation / FL511 (approved for 365 SMG clients)')
const LIST_REFRESH_MS = Number(env('FDOT_LIST_REFRESH_MIN', '30')) * 60_000
const STATE_FILE = env('FDOT_STATE_FILE', '') // e.g. /var/lib/fdot-cameras/cameras.json
// Optional filters, to keep the pack to the area that matters:
//   FDOT_COUNTIES="Orange,Seminole,Osceola"   FDOT_BOUNDS="27.9,-82.0,29.1,-80.6" (minLat,minLng,maxLat,maxLng)
const COUNTIES = env('FDOT_COUNTIES', '')
  .split(',')
  .map((s) => s.trim().toLowerCase().replace(/\s+county$/, ''))
  .filter(Boolean)
const BOUNDS = (() => {
  const b = env('FDOT_BOUNDS', '').split(',').map(Number)
  return b.length === 4 && b.every(Number.isFinite) ? { minLat: b[0], minLng: b[1], maxLat: b[2], maxLng: b[3] } : null
})()
const FLORIDA = { minLat: 24.4, maxLat: 31.1, minLng: -87.7, maxLng: -79.9 }

const SNAP_INTERVAL_MS = 60_000 // at most one FDOT fetch per camera per minute
const SNAP_STALE_OK_MS = 5 * 60_000 // FDOT briefly down: keep showing a still this old
const SNAP_MAX_BYTES = 2 * 1024 * 1024
const PAGE_SIZE = 100
const MAX_PAGES = 60
const LIST_CONCURRENCY = 4

const log = (msg) => console.log(`[fdot] ${msg}`)

// ---------- FDOT's camera list ----------

function listQuery(start) {
  return encodeURIComponent(
    JSON.stringify({
      columns: [{ data: null, name: '' }, { name: 'sortOrder', s: true }, { name: 'roadway', s: true }, { data: 3, name: '' }],
      order: [{ column: 1, dir: 'asc' }],
      start,
      length: PAGE_SIZE,
      search: { value: '' },
    }),
  )
}

export function parseWkt(wkt) {
  const m = /POINT\s*\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)/i.exec(String(wkt ?? ''))
  if (!m) return null
  const lng = Number(m[1])
  const lat = Number(m[2])
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null
}

const HEADINGS = { north: 0, northbound: 0, east: 90, eastbound: 90, south: 180, southbound: 180, west: 270, westbound: 270 }

/** The direction a camera faces, from FDOT's text ("Northbound", "I-4 EB"…); null when unknown. */
export function headingFrom(...texts) {
  for (const t of texts) {
    const s = String(t ?? '').toLowerCase()
    for (const [word, deg] of Object.entries(HEADINGS)) if (new RegExp(`\\b${word}\\b`).test(s)) return deg
    const abbr = /\b([nesw])b\b/.exec(s)
    if (abbr) return { n: 0, e: 90, s: 180, w: 270 }[abbr[1]]
  }
  return null
}

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'florida'
const clean = (s) => {
  const t = String(s ?? '').trim()
  return t && t !== 'N/A' ? t : ''
}

/** One FL511 row to a camera, or null (no still, no position, outside Florida or the filters). */
export function toCamera(rec) {
  if (!rec || typeof rec.id !== 'number') return null
  const img = rec.images?.[0]
  if (!img || img.blocked || img.disabled || !img.imageUrl) return null
  const pos = parseWkt(rec.latLng?.geography?.wellKnownText)
  if (!pos) return null
  const inBox = (b) => pos.lat >= b.minLat && pos.lat <= b.maxLat && pos.lng >= b.minLng && pos.lng <= b.maxLng
  if (!inBox(FLORIDA) || (BOUNDS && !inBox(BOUNDS))) return null
  const county = clean(rec.county)
  if (COUNTIES.length && !COUNTIES.includes(county.toLowerCase().replace(/\s+county$/, ''))) return null
  const location = clean(rec.location).replace(/^[A-Z]{2,8}-?\d*\s*:\s*/, '')
  const road = clean(rec.roadway)
  const direction = clean(rec.direction)
  const name = (/ /.test(location) && location) || [road, direction].filter(Boolean).join(' ') || `FDOT camera ${rec.id}`
  const city = clean(rec.city) || (county ? `${county} County` : 'Florida')
  let imageUrl
  try {
    imageUrl = new URL(img.imageUrl, `${FDOT_BASE}/`).toString()
  } catch {
    return null
  }
  // Only ever fetch from FDOT's own host.
  if (new URL(imageUrl).origin !== new URL(FDOT_BASE).origin) return null
  return { id: `fdot-${rec.id}`, name, city, lat: pos.lat, lng: pos.lng, heading: headingFrom(direction, location, img.description), imageUrl }
}

async function fetchPage(start) {
  const res = await fetch(`${FDOT_BASE}/List/GetData/Cameras?query=${listQuery(start)}&lang=en`, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`camera list HTTP ${res.status}`)
  const data = await res.json()
  return { rows: Array.isArray(data?.data) ? data.data : [], total: Number(data?.recordsTotal) || 0 }
}

/** The whole list, a few pages at a time (FDOT's server answers 100 rows per request). */
export async function fetchCameraList() {
  const first = await fetchPage(0)
  const pages = Math.min(MAX_PAGES, Math.ceil(first.total / PAGE_SIZE))
  const rows = [...first.rows]
  const starts = Array.from({ length: Math.max(0, pages - 1) }, (_, i) => (i + 1) * PAGE_SIZE)
  for (let i = 0; i < starts.length; i += LIST_CONCURRENCY) {
    const batch = await Promise.all(starts.slice(i, i + LIST_CONCURRENCY).map(fetchPage))
    for (const p of batch) rows.push(...p.rows)
  }
  const seen = new Set()
  return rows.map(toCamera).filter((c) => c && !seen.has(c.id) && seen.add(c.id))
}

let cameras = new Map() // id -> camera
let listAt = 0
let listing = null

async function loadSavedList() {
  if (!STATE_FILE) return
  try {
    const saved = JSON.parse(await readFile(STATE_FILE, 'utf8'))
    if (Array.isArray(saved.cameras)) {
      cameras = new Map(saved.cameras.map((c) => [c.id, c]))
      listAt = Number(saved.at) || 0
      log(`restored ${cameras.size} cameras from ${STATE_FILE}`)
    }
  } catch {
    // none saved yet
  }
}

async function saveList() {
  if (!STATE_FILE) return
  try {
    await mkdir(dirname(STATE_FILE), { recursive: true })
    await writeFile(`${STATE_FILE}.tmp`, JSON.stringify({ at: listAt, cameras: [...cameras.values()] }))
    await rename(`${STATE_FILE}.tmp`, STATE_FILE)
  } catch (err) {
    log(`could not save the camera list: ${err.message}`)
  }
}

/** Refreshes the list when it's older than FDOT_LIST_REFRESH_MIN; keeps the old one on failure. */
function refreshList() {
  if (Date.now() - listAt < LIST_REFRESH_MS) return Promise.resolve()
  listing ??= fetchCameraList()
    .then(async (list) => {
      if (list.length === 0) throw new Error('camera list came back empty')
      cameras = new Map(list.map((c) => [c.id, c]))
      listAt = Date.now()
      log(`camera list: ${cameras.size} cameras`)
      await saveList()
    })
    .catch((err) => log(`camera list refresh failed (keeping ${cameras.size}): ${err.message}`))
    .finally(() => {
      listing = null
    })
  return listing
}

// ---------- the camera pack for God's Eye ----------

/** One camera in God's Eye's CCTV source format (see config/cctv_sources.*.json there). */
export function packEntry(c) {
  const snap = `${PUBLIC_BASE}/fdot/snap/${encodeURIComponent(c.id)}`
  return {
    id: c.id,
    name: c.name,
    city: c.city,
    cityId: slug(c.city),
    provider: 'FDOT',
    lat: c.lat,
    lon: c.lng,
    headingDeg: c.heading ?? 0,
    headingConfidence: c.heading == null ? 'none' : 'low',
    pitchDeg: -15,
    fovDeg: 60,
    rangeM: 250,
    mountHeightM: 12,
    groundElevationM: 0,
    feedType: 'image',
    url: snap,
    snapshotUrl: snap,
    sourceKind: env('FDOT_SOURCE_KIND', 'fdot'),
    license: LICENSE,
    poseSource: 'fdot',
  }
}

// ---------- stills ----------

const stills = new Map() // id -> { at, type, body }
const fetching = new Map() // id -> Promise

async function fetchStill(cam) {
  const res = await fetch(cam.imageUrl, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'image/*' },
    signal: AbortSignal.timeout(10_000),
  })
  const type = res.headers.get('content-type') ?? ''
  if (!res.ok || !/^image\//i.test(type)) throw new Error(`still HTTP ${res.status} ${type}`)
  const body = Buffer.from(await res.arrayBuffer())
  if (body.length > SNAP_MAX_BYTES) throw new Error('still too large')
  return { at: Date.now(), type, body }
}

/** The current still: from memory when under a minute old, otherwise one shared FDOT fetch. */
export async function currentStill(cam) {
  const held = stills.get(cam.id)
  if (held && Date.now() - held.at < SNAP_INTERVAL_MS) return held
  let pending = fetching.get(cam.id)
  if (!pending) {
    pending = fetchStill(cam)
      .then((still) => {
        stills.set(cam.id, still)
        return still
      })
      .finally(() => fetching.delete(cam.id))
    fetching.set(cam.id, pending)
  }
  try {
    return await pending
  } catch (err) {
    if (held && Date.now() - held.at < SNAP_STALE_OK_MS) return held
    throw err
  }
}

// Stills past the stale limit are dropped, so memory holds only what is being viewed.
setInterval(() => {
  const cutoff = Date.now() - SNAP_STALE_OK_MS
  for (const [id, s] of stills) if (s.at < cutoff) stills.delete(id)
}, 60_000).unref()

// ---------- server ----------

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers })
  res.end(body)
}

const server = http.createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'method not allowed')
  const path = new URL(req.url ?? '/', 'http://local').pathname
  if (path === '/healthz') return send(res, 200, 'ok', { 'Content-Type': 'text/plain' })

  if (path === '/fdot/cameras.json') {
    if (cameras.size === 0) await refreshList()
    else void refreshList()
    const pack = [...cameras.values()].map(packEntry)
    return send(res, cameras.size ? 200 : 503, JSON.stringify(pack), {
      'Content-Type': 'application/json',
      'Cache-Control': 'max-age=300',
    })
  }

  const m = /^\/fdot\/snap\/(fdot-\d+)$/.exec(path)
  if (m) {
    const cam = cameras.get(m[1])
    if (!cam) return send(res, 404, 'not an FDOT camera')
    try {
      const still = await currentStill(cam)
      const age = Math.floor((Date.now() - still.at) / 1000)
      return send(res, 200, still.body, {
        'Content-Type': still.type,
        'Cache-Control': `max-age=${Math.max(0, 60 - age)}`,
      })
    } catch {
      return send(res, 502, 'camera still unavailable')
    }
  }
  return send(res, 404, 'not found')
})

await loadSavedList()
void refreshList()
setInterval(() => void refreshList(), 5 * 60_000).unref()
server.listen(LISTEN_PORT, LISTEN_HOST, () =>
  log(`listening on ${LISTEN_HOST}:${LISTEN_PORT}; FDOT ${FDOT_BASE}; as "${USER_AGENT}"`),
)
const stop = () => {
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 3_000).unref()
}
process.on('SIGTERM', stop)
process.on('SIGINT', stop)
