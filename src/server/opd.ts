import type { Database } from 'better-sqlite3'
import type { Severity } from '@/components/portal/data'
import { distanceMi } from '@/lib/geo'
import { errorText, type FeedAlert, maxCrimeRadius, setStatus, syncSiteAlerts, userAgent } from './alerts'

// Orlando Police Department dispatched calls (active-calls XML, roughly the last hour).
// Calls carry a block address or intersection but no coordinates, so block addresses are
// geocoded with the US Census geocoder (public domain) and cached. Only crime-related
// calls are kept, and each is linked to client sites within SMG_CRIME_MAX_RADIUS_MI (the
// dashboard treats those within SMG_CRIME_RADIUS_MI as at the site, the rest as nearby).

export const OPD_FEED = 'https://www1.cityoforlando.net/opd/activecalls/activecadpolice.xml'
const CENSUS = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress'
const KEEP_HOURS = 12 // calls stay on the dashboard this long after dispatch
const GEOCODES_PER_RUN = 40

export interface OpdCall {
  incident: string
  date: string // ISO
  desc: string
  location: string
  district: string
}

const decode = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim()

/** "10/12/2026 10:41" in Orlando's time zone to an ISO timestamp. */
export function easternToIso(local: string) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2})$/.exec(local.trim())
  if (!m) return null
  const [, mo, d, y, h, mi] = m.map(Number)
  const asUtc = Date.UTC(y, mo - 1, d, h, mi)
  // Offset of America/New_York at that moment (EDT -4 or EST -5).
  const name = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'shortOffset' })
    .formatToParts(new Date(asUtc))
    .find((p) => p.type === 'timeZoneName')?.value
  const offset = Number(/GMT([+-]\d+)/.exec(name ?? '')?.[1] ?? -5)
  return new Date(asUtc - offset * 3_600_000).toISOString()
}

/** Parses the active-calls XML (flat CALLS/CALL records). */
export function parseOpd(xml: string): OpdCall[] {
  const body = xml.replace(/^﻿/, '')
  if (!/<CALLS[\s>]/.test(body)) throw new Error('Orlando PD feed has no CALLS element')
  const calls: OpdCall[] = []
  for (const m of body.matchAll(/<CALL\s+incident="([^"]+)"\s*>([\s\S]*?)<\/CALL>/g)) {
    const field = (tag: string) => decode(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(m[2])?.[1] ?? '')
    const date = easternToIso(field('DATE'))
    if (!date) continue
    calls.push({ incident: m[1], date, desc: field('DESC'), location: field('LOCATION'), district: field('DISTRICT') })
  }
  return calls
}

// Call types worth telling a client about, and how serious they are. Anything not
// listed (traffic signals, accidents, assistance calls, alarms...) is left out.
const CATEGORIES: [RegExp, Severity][] = [
  [/shoot|shots|stab|homicide|murder|armed|weapon|gun|robbery|carjack|kidnap|abduct|sexual|rape|hostage|bomb/i, 'HIGH'],
  [/aggravated|home invasion|burglary.*(progress|occupied)/i, 'HIGH'],
  [/burglar|theft|stolen|larceny|shoplift|vandal|criminal mischief|trespass|prowler|assault|battery|fight|disturbance|threat|fraud|narcotic|drug|arson|suspicious/i, 'MED'],
]

export function classify(desc: string): Severity | null {
  for (const [re, sev] of CATEGORIES) if (re.test(desc)) return sev
  return null
}

/** "1200 BLOCK W SOUTH ST" to "1200 W SOUTH ST, Orlando, FL"; intersections aren't geocodable. */
export function geocodeQuery(location: string) {
  const m = /^(\d+)\s+BLOCK\s+(.+)$/i.exec(location.trim())
  return m ? `${m[1]} ${m[2]}, Orlando, FL` : null
}

const titleCase = (s: string) => s.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase())

/** Great-circle distance in miles. */
async function geocode(db: Database, query: string, fetchImpl: typeof fetch, budget: { left: number }) {
  const hit = db.prepare(`SELECT lat, lng FROM geocode_cache WHERE query = ?`).get(query) as
    | { lat: number | null; lng: number | null }
    | undefined
  if (hit) return hit.lat != null && hit.lng != null ? { lat: hit.lat, lng: hit.lng } : null
  if (budget.left <= 0) return null
  budget.left--
  const url = `${CENSUS}?address=${encodeURIComponent(query)}&benchmark=Public_AR_Current&format=json`
  const res = await fetchImpl(url, { headers: { 'User-Agent': userAgent() }, signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error(`Census geocoder HTTP ${res.status}`)
  const json = (await res.json()) as { result?: { addressMatches?: { coordinates?: { x: number; y: number } }[] } }
  const c = json.result?.addressMatches?.[0]?.coordinates
  const point = c ? { lat: c.y, lng: c.x } : null
  db.prepare(`INSERT OR REPLACE INTO geocode_cache (query, lat, lng) VALUES (?, ?, ?)`).run(
    query,
    point?.lat ?? null,
    point?.lng ?? null,
  )
  return point
}

/** Fetches the active calls and links crime-related ones to nearby client sites. */
export async function pollOpd(db: Database, fetchImpl: typeof fetch = fetch) {
  const radius = maxCrimeRadius()
  try {
    const res = await fetchImpl(OPD_FEED, {
      headers: { 'User-Agent': userAgent() },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const calls = parseOpd(await res.text())

    const sites = db
      .prepare(`SELECT id, client_id, lat, lng FROM sites WHERE lat IS NOT NULL AND lng IS NOT NULL`)
      .all() as { id: string; client_id: string; lat: number; lng: number }[]
    const perSite = new Map<string, FeedAlert[]>(sites.map((s) => [s.id, []]))
    const budget = { left: GEOCODES_PER_RUN }

    for (const call of calls) {
      const severity = classify(call.desc)
      const query = severity && geocodeQuery(call.location)
      if (!severity || !query) continue
      const point = await geocode(db, query, fetchImpl, budget)
      if (!point) continue
      const ends = new Date(new Date(call.date).getTime() + KEEP_HOURS * 3_600_000).toISOString()
      for (const s of sites) {
        const d = distanceMi(s, point)
        if (d > radius) continue
        perSite.get(s.id)!.push({
          id: `opd:${call.incident}`,
          event: call.desc,
          severity,
          headline: `${call.desc} · ${titleCase(call.location)}`,
          url: OPD_FEED,
          area: call.district ? `OPD district ${call.district}` : null,
          startsAt: call.date,
          endsAt: ends,
          lat: point.lat,
          lng: point.lng,
          distanceMi: d,
        })
      }
    }
    for (const s of sites) syncSiteAlerts(db, 'opd', s, perSite.get(s.id)!, { keepMissing: true })
    setStatus(db, 'opd', null)
    return { calls: calls.length, geocoded: GEOCODES_PER_RUN - budget.left }
  } catch (err) {
    setStatus(db, 'opd', errorText(err))
    throw err
  }
}
