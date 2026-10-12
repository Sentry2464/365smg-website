import type { Database } from 'better-sqlite3'
import { errorText, fetchRetry, setStatus, userAgent } from './alerts'

// Active tropical cyclones from the National Hurricane Center (Atlantic, East and Central
// Pacific), for the intel map's Hurricanes pill and the storm list under it. NWS watches
// and warnings for the sites already come through the NWS alerts; this is the wider view.

export const NHC_STORMS = 'https://www.nhc.noaa.gov/CurrentStorms.json'
const NHC = 'https://www.nhc.noaa.gov/'

export interface Storm {
  id: string
  name: string
  /** NHC code: HU, TS, TD, STS, SD, PTC, PT… */
  classification: string
  /** AL (Atlantic), EP (East Pacific) or CP (Central Pacific). */
  basin: string
  lat: number
  lng: number
  windKt: number | null
  /** "Category 3 hurricane", "Tropical storm"… */
  label: string
  advisoryUrl: string
  updated: string | null
}

const KIND: Record<string, string> = {
  HU: 'Hurricane',
  TY: 'Typhoon',
  TS: 'Tropical storm',
  TD: 'Tropical depression',
  STS: 'Subtropical storm',
  SS: 'Subtropical storm',
  SD: 'Subtropical depression',
  PTC: 'Potential tropical cyclone',
  PT: 'Post-tropical cyclone',
}

/** Saffir-Simpson category from sustained wind in knots; null below hurricane strength. */
export function hurricaneCategory(windKt: number | null) {
  if (windKt == null || windKt < 64) return null
  return windKt >= 137 ? 5 : windKt >= 113 ? 4 : windKt >= 96 ? 3 : windKt >= 83 ? 2 : 1
}

export function stormLabel(classification: string, windKt: number | null) {
  const cat = hurricaneCategory(windKt)
  if (classification === 'HU' && cat) return `Category ${cat} hurricane`
  return KIND[classification] ?? (cat ? `Category ${cat} hurricane` : 'Tropical cyclone')
}

/** "28.1N" / "72.3W" (or a number) to signed degrees. */
function coord(numeric: unknown, text: unknown) {
  if (typeof numeric === 'number' && Number.isFinite(numeric)) return numeric
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*([NSEW])?\s*$/i.exec(String(text ?? ''))
  if (!m) return null
  const v = Number(m[1])
  return /[SW]/i.test(m[2] ?? '') ? -v : v
}

const nhcLink = (u: unknown) => (typeof u === 'string' && u.startsWith(NHC) ? u : null)

interface NhcStorm {
  id?: string
  name?: string
  classification?: string
  intensity?: string | number
  latitude?: string
  longitude?: string
  latitudeNumeric?: number
  longitudeNumeric?: number
  lastUpdate?: string
  publicAdvisory?: { url?: string } | null
  forecastGraphics?: { url?: string } | null
}

export function parseStorms(json: unknown): Storm[] {
  const list = (json as { activeStorms?: NhcStorm[] })?.activeStorms
  if (!Array.isArray(list)) throw new Error('NHC response has no activeStorms')
  return list.flatMap((s) => {
    const lat = coord(s.latitudeNumeric, s.latitude)
    const lng = coord(s.longitudeNumeric, s.longitude)
    if (!s.id || !s.name || lat == null || lng == null) return []
    const wind = Number(s.intensity)
    const windKt = Number.isFinite(wind) && wind > 0 ? wind : null
    const classification = String(s.classification ?? '').toUpperCase()
    return [
      {
        id: s.id,
        name: s.name,
        classification,
        basin: s.id.slice(0, 2).toUpperCase(),
        lat,
        lng,
        windKt,
        label: stormLabel(classification, windKt),
        advisoryUrl: nhcLink(s.publicAdvisory?.url) ?? nhcLink(s.forecastGraphics?.url) ?? NHC,
        updated: s.lastUpdate ?? null,
      },
    ]
  })
}

/** Replaces the cached storm list; on failure the last good list stays (until it's stale). */
export async function pollStorms(db: Database, fetchImpl: typeof fetch = fetch, retry = {}) {
  try {
    const res = await fetchRetry(
      fetchImpl,
      NHC_STORMS,
      { headers: { 'User-Agent': userAgent(), Accept: 'application/json' } },
      retry,
    )
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    db.prepare(
      `INSERT INTO feed_cache (key, json) VALUES ('nhc-storms', ?)
       ON CONFLICT(key) DO UPDATE SET json = excluded.json, fetched_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
    ).run(JSON.stringify(parseStorms(await res.json())))
    setStatus(db, 'nhc', null)
  } catch (err) {
    setStatus(db, 'nhc', errorText(err))
  }
}

const STALE_MS = 12 * 3600_000

/** Active storms, or null when there's no recent list (never fetched, or failing for 12 h). */
export function stormList(db: Database, now = new Date()): Storm[] | null {
  const row = db.prepare(`SELECT json, fetched_at FROM feed_cache WHERE key = 'nhc-storms'`).get() as
    | { json: string; fetched_at: string }
    | undefined
  if (!row || now.getTime() - Date.parse(row.fetched_at) > STALE_MS) return null
  return JSON.parse(row.json) as Storm[]
}
