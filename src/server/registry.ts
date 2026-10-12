import type { Database } from 'better-sqlite3'
import { errorText, setStatus, userAgent } from './alerts'
import { distanceMi } from '@/lib/geo'

// FDLE Sexual Offender and Predator registry, from FDLE's public data file (per county,
// automated extraction allowed by FDLE's public data file memo of 15 Aug 2025). Shown only
// to clients an admin has opted in, only for registrants near their sites, with FDLE's
// warnings verbatim. Records are stored and shown exactly as published; each import
// replaces the county's previous rows, so anyone no longer listed disappears.

const FDLE = 'https://offender.fdle.state.fl.us/offender/publicDataFile.jsf'
const CENSUS = 'https://geocoding.geo.census.gov/geocoder'

/** Statuses never shown as "near your site" (not living in the community). */
const EXCLUDED_STATUS = /^(confinement|deceased)/i

// ---------- CSV ----------

/** RFC 4180 CSV (quoted fields, doubled quotes, CRLF), returning objects keyed by header. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const s = text.replace(/^﻿/, '')
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') {
        field += '"'
        i++
      } else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += c
  }
  if (field !== '' || row.length) {
    row.push(field)
    rows.push(row)
  }
  const [header, ...data] = rows.filter((r) => r.some((v) => v !== ''))
  if (!header?.includes('PERSON_NBR')) throw new Error('Registry file has no PERSON_NBR column')
  return data.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])))
}

/** The address FDLE lists for a registrant: permanent, else temporary, else transient. */
export function publishedAddress(r: Record<string, string>) {
  for (const [prefix, type] of [
    ['PERM', 'Permanent'],
    ['TEMP', 'Temporary'],
    ['TRANS', 'Transient'],
  ] as const) {
    const line1 = r[`${prefix}_ADDRESS_LINE_1`]?.trim()
    if (!line1) continue
    const line2 = r[`${prefix}_ADDRESS_LINE_2`]?.trim()
    const city = r[`${prefix}_CITY`]?.trim()
    const state = r[`${prefix}_STATE`]?.trim()
    const zip = r[`${prefix}_ZIP5`]?.trim()
    return {
      type,
      display: [line1, line2, city, [state, zip].filter(Boolean).join(' ')].filter(Boolean).join(', '),
      geocode: { street: line1, city: city ?? '', state: state ?? 'FL', zip: zip ?? '' },
    }
  }
  return null
}

// ---------- counties of opted-in clients' sites ----------

// FDLE's county names where they differ from the Census Bureau's.
const FDLE_COUNTY: Record<string, string> = { 'St. Johns': 'Saint Johns', 'St. Lucie': 'Saint Lucie', DeSoto: 'De Soto' }

async function countyOf(db: Database, lat: number, lng: number, fetchImpl: typeof fetch) {
  const key = `county:${lat.toFixed(4)},${lng.toFixed(4)}`
  const hit = db.prepare(`SELECT json, fetched_at FROM feed_cache WHERE key = ?`).get(key) as
    | { json: string; fetched_at: string }
    | undefined
  const county = hit ? (JSON.parse(hit.json) as string | null) : undefined
  // "No Florida county" is rechecked daily, in case it came from a bad Census answer.
  if (county || (county === null && Date.now() - Date.parse(hit!.fetched_at) < 86_400_000)) return county
  const url = `${CENSUS}/geographies/coordinates?x=${lng}&y=${lat}&benchmark=Public_AR_Current&vintage=Current_Current&layers=Counties&format=json`
  const res = await fetchImpl(url, { headers: { 'User-Agent': userAgent() }, signal: AbortSignal.timeout(15_000) })
  if (!res.ok) throw new Error(`Census county lookup HTTP ${res.status}`)
  const json = (await res.json()) as { result?: { geographies?: { Counties?: { BASENAME?: string; STATE?: string }[] } } }
  const c = json.result?.geographies?.Counties?.[0]
  const name = c && c.STATE === '12' && c.BASENAME ? (FDLE_COUNTY[c.BASENAME] ?? c.BASENAME) : null // 12 = Florida
  db.prepare(`INSERT OR REPLACE INTO feed_cache (key, json) VALUES (?, ?)`).run(key, JSON.stringify(name))
  return name
}

/** Counties of opted-in clients' sites. `complete` is false if a lookup failed. */

async function neededCounties(db: Database, fetchImpl: typeof fetch) {
  const sites = db
    .prepare(
      `SELECT s.lat, s.lng FROM sites s JOIN clients c ON c.id = s.client_id
       WHERE c.registry_enabled = 1 AND c.disabled_at IS NULL AND s.lat IS NOT NULL AND s.lng IS NOT NULL`,
    )
    .all() as { lat: number; lng: number }[]
  const counties = new Set<string>()
  const errors: string[] = []
  for (const s of sites) {
    try {
      const c = await countyOf(db, s.lat, s.lng, fetchImpl)
      if (c) counties.add(c)
    } catch (err) {
      errors.push(errorText(err))
    }
  }
  return { counties, errors }
}

// ---------- geocoding (Census batch geocoder, cached) ----------

async function batchGeocode(
  db: Database,
  items: { id: string; street: string; city: string; state: string; zip: string }[],
  fetchImpl: typeof fetch,
) {
  const result = new Map<string, { lat: number; lng: number } | null>()
  const cached = db.prepare(`SELECT lat, lng FROM geocode_cache WHERE query = ?`)
  const save = db.prepare(`INSERT OR REPLACE INTO geocode_cache (query, lat, lng) VALUES (?, ?, ?)`)
  const queryOf = (i: (typeof items)[number]) => `${i.street}, ${i.city}, ${i.state} ${i.zip}`.toUpperCase()
  const todo: typeof items = []
  for (const i of items) {
    const hit = cached.get(queryOf(i)) as { lat: number | null; lng: number | null } | undefined
    if (hit) result.set(i.id, hit.lat != null && hit.lng != null ? { lat: hit.lat, lng: hit.lng } : null)
    else todo.push(i)
  }
  const csvCell = (v: string) => `"${v.replace(/"/g, '""')}"`
  for (let start = 0; start < todo.length; start += 9_000) {
    const chunk = todo.slice(start, start + 9_000)
    const form = new FormData()
    form.set('benchmark', 'Public_AR_Current')
    form.set(
      'addressFile',
      new Blob([chunk.map((i) => [i.id, i.street, i.city, i.state, i.zip].map(csvCell).join(',')).join('\n')], {
        type: 'text/csv',
      }),
      'addresses.csv',
    )
    const res = await fetchImpl(`${CENSUS}/locations/addressbatch`, {
      method: 'POST',
      body: form,
      headers: { 'User-Agent': userAgent() },
      signal: AbortSignal.timeout(600_000),
    })
    if (!res.ok) throw new Error(`Census batch geocoder HTTP ${res.status}`)
    const lines = (await res.text()).split(/\r?\n/).filter(Boolean)
    const byId = new Map(chunk.map((i) => [i.id, i]))
    for (const line of lines) {
      const cells = [...line.matchAll(/"((?:[^"]|"")*)"/g)].map((m) => m[1])
      const item = byId.get(cells[0])
      if (!item) continue
      const [lng, lat] = cells[2] === 'Match' ? (cells[5] ?? '').split(',').map(Number) : []
      const point = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null
      save.run(queryOf(item), point?.lat ?? null, point?.lng ?? null)
      result.set(item.id, point)
    }
  }
  return result
}

// ---------- import ----------

/** Replaces one county's registrants with the rows of a freshly downloaded file. */
export async function importCounty(
  db: Database,
  county: string,
  rows: Record<string, string>[],
  fetchImpl: typeof fetch,
  asOf = new Date().toISOString(),
) {
  const prepared = rows
    .filter((r) => r.PERSON_NBR)
    .map((r) => ({ r, addr: publishedAddress(r) }))
  const points = await batchGeocode(
    db,
    prepared.filter((p) => p.addr).map((p) => ({ id: p.r.PERSON_NBR, ...p.addr!.geocode })),
    fetchImpl,
  )
  const insert = db.prepare(
    `INSERT OR REPLACE INTO registrants (county, person_nbr, json, address, address_type, lat, lng)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
  db.transaction(() => {
    db.prepare(`DELETE FROM registrants WHERE county = ?`).run(county)
    for (const { r, addr } of prepared) {
      const p = points.get(r.PERSON_NBR) ?? null
      insert.run(county, r.PERSON_NBR, JSON.stringify(r), addr?.display ?? null, addr?.type ?? null, p?.lat ?? null, p?.lng ?? null)
    }
    db.prepare(
      `INSERT INTO registry_imports (county, as_of, rows) VALUES (?, ?, ?)
       ON CONFLICT(county) DO UPDATE SET as_of = excluded.as_of, rows = excluded.rows`,
    ).run(county, asOf, prepared.length)
  })()
}

/** Downloads the county files needed by opted-in clients; drops counties no longer needed. */
export async function pollRegistry(db: Database, fetchImpl: typeof fetch = fetch) {
  const email = process.env.SMG_API_CONTACT || 'admin@365securitymg.com'
  const { counties, errors } = await neededCounties(db, fetchImpl)
  // Drop counties no longer needed, but only when every site's county is known: a failed
  // lookup mustn't remove a county still in use.
  if (errors.length === 0) {
    for (const { county } of db.prepare(`SELECT county FROM registry_imports`).all() as { county: string }[]) {
      if (!counties.has(county)) {
        db.prepare(`DELETE FROM registrants WHERE county = ?`).run(county)
        db.prepare(`DELETE FROM registry_imports WHERE county = ?`).run(county)
      }
    }
  }
  // One county failing doesn't stop the others; its previous import stays.
  for (const county of counties) {
    try {
      const url = `${FDLE}?email=${encodeURIComponent(email)}&county=${encodeURIComponent(county)}&mode=auto`
      const res = await fetchImpl(url, { headers: { 'User-Agent': userAgent() }, signal: AbortSignal.timeout(120_000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await importCounty(db, county, parseCsv(await res.text()), fetchImpl)
    } catch (err) {
      errors.push(`FDLE ${county}: ${errorText(err)}`)
    }
  }
  setStatus(db, 'fdle-registry', errors.length ? errors.join('; ') : null)
  return { counties: [...counties], errors }
}

// ---------- reading, per client ----------

export interface NearbyRegistrant {
  id: string
  name: string
  subjectType: string
  status: string
  address: string
  addressType: string
  siteName: string
  distanceMi: number
}

export interface RegistryView {
  asOf: string | null
  radiusMi: number
  /** True when nobody is within radiusMi and the nearest people out to maxRadiusMi are shown. */
  expanded: boolean
  maxRadiusMi: number
  people: NearbyRegistrant[]
}

/** Registrants within the radius of an opted-in client's sites; null if the client isn't opted in. */
export function registryNear(db: Database, clientId: string): RegistryView | null {
  const client = db.prepare(`SELECT registry_enabled FROM clients WHERE id = ?`).get(clientId) as
    | { registry_enabled: number }
    | undefined
  if (!client?.registry_enabled) return null
  const radiusMi = Number(process.env.SMG_REGISTRY_RADIUS_MI) || 1
  const maxRadiusMi = Math.max(radiusMi, Number(process.env.SMG_REGISTRY_MAX_RADIUS_MI) || 5)
  const sites = db
    .prepare(`SELECT name, lat, lng FROM sites WHERE client_id = ? AND lat IS NOT NULL AND lng IS NOT NULL`)
    .all(clientId) as { name: string; lat: number; lng: number }[]
  const near = new Map<string, NearbyRegistrant>()
  const box = maxRadiusMi / 69 + 0.01
  const candidates = db.prepare(
    `SELECT person_nbr, json, address, address_type, lat, lng FROM registrants
     WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?`,
  )
  for (const s of sites) {
    const lngBox = box / Math.cos((s.lat * Math.PI) / 180)
    const rows = candidates.all(s.lat - box, s.lat + box, s.lng - lngBox, s.lng + lngBox) as {
      person_nbr: string
      json: string
      address: string
      address_type: string
      lat: number
      lng: number
    }[]
    for (const row of rows) {
      const d = distanceMi(s, row)
      if (d > maxRadiusMi) continue
      const r = JSON.parse(row.json) as Record<string, string>
      if (EXCLUDED_STATUS.test(r.STATUS ?? '')) continue
      const prev = near.get(row.person_nbr)
      if (prev && prev.distanceMi <= d) continue
      near.set(row.person_nbr, {
        id: row.person_nbr,
        name: [r.FIRST_NAME, r.MIDDLE_NAME, r.LAST_NAME, r.SUFFIX_NAME].filter(Boolean).join(' '),
        subjectType: r.SUBJECT_TYPE,
        status: r.STATUS,
        address: row.address,
        addressType: row.address_type,
        siteName: s.name,
        distanceMi: Math.round(d * 10) / 10,
      })
    }
  }
  const asOf = (db.prepare(`SELECT MIN(as_of) AS a FROM registry_imports`).get() as { a: string | null }).a
  const all = [...near.values()].sort((a, b) => a.distanceMi - b.distanceMi)
  const close = all.filter((p) => p.distanceMi <= radiusMi)
  const nearestCount = Number(process.env.SMG_NEARBY_COUNT) || 5
  return close.length || all.length === 0
    ? { asOf, radiusMi, maxRadiusMi, expanded: false, people: close }
    : { asOf, radiusMi, maxRadiusMi, expanded: true, people: all.slice(0, nearestCount) }
}
