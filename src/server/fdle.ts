import type { Database } from 'better-sqlite3'
import { errorText, setStatus, userAgent } from './alerts'

// FDLE Missing Endangered Persons Information Clearinghouse: current AMBER, Missing
// Child, Spectrum, Purple and Silver alerts. FDLE publishes these as an HTML page only,
// so it's read lightly every 30 minutes. We keep the alert type, name, date, category
// and "missing from" city, and link to FDLE's own flyer. No photos, dates of birth or
// descriptions are copied, and an alert disappears as soon as FDLE takes it down.

const BASE = 'https://www.fdle.state.fl.us/mcicsearch/'
export const FDLE_ALERTS = `${BASE}AllCurrentAlerts.asp`
export const FDLE_SIGNUP = 'https://member.everbridge.net/892807736727806/new'

export interface MissingAlert {
  id: string
  type: string // "AMBER Alert", "Missing Child Alert", ...
  name: string
  since: string // as FDLE shows it, M/D/YYYY
  category: string
  from: string // "Orlando, FL"
  url: string
}

const clean = (html: string) =>
  html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()

/** "Current AMBER Alerts" → "AMBER Alert". */
const typeName = (title: string) => title.replace(/^Current\s+/i, '').replace(/Alerts$/i, 'Alert').trim()

export function parseFdleAlerts(html: string): MissingAlert[] {
  const body = html.replace(/<!--[\s\S]*?-->/g, '')
  const heads = [...body.matchAll(/<b>\s*(Current [^<]*Alerts)\s*<\/b>/gi)]
  if (heads.length === 0) throw new Error('FDLE alerts page has no alert sections')
  const out: MissingAlert[] = []
  heads.forEach((h, i) => {
    const section = body.slice(h.index! + h[0].length, heads[i + 1]?.index ?? body.length)
    for (const row of section.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = [...row[1].matchAll(/<td\b[^>]*class="TableDataCell"[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => c[1])
      if (cells.length < 8) continue
      const id = /Flyer\.asp\?ID=(\d+)/i.exec(row[1])?.[1]
      if (!id) continue
      out.push({
        id,
        type: typeName(h[1]),
        name: clean(cells[2]),
        since: clean(cells[1]),
        category: clean(cells[6]),
        from: clean(cells[7]).replace(/\s*,\s*/g, ', '),
        url: `${BASE}Flyer.asp?ID=${id}`,
      })
    }
  })
  return out
}

// Central Florida and nearby cities shown by default (FDLE gives only "missing from").
// AMBER Alerts are statewide by design, so they're always shown. Override with
// SMG_FDLE_CITIES="Orlando,Kissimmee,...".
const DEFAULT_CITIES = [
  'Orlando', 'Kissimmee', 'St. Cloud', 'Sanford', 'Winter Park', 'Winter Garden', 'Windermere', 'Ocoee', 'Apopka',
  'Maitland', 'Altamonte Springs', 'Casselberry', 'Longwood', 'Lake Mary', 'Oviedo', 'Winter Springs', 'Clermont',
  'Leesburg', 'Mount Dora', 'Eustis', 'Tavares', 'Deltona', 'DeLand', 'Daytona Beach', 'Ocala', 'Melbourne',
  'Palm Bay', 'Titusville', 'Cocoa', 'Rockledge', 'Lakeland', 'Haines City', 'Davenport', 'Celebration', 'Tampa',
]

export function areaCities() {
  const raw = process.env.SMG_FDLE_CITIES
  return (raw ? raw.split(',') : DEFAULT_CITIES).map((c) => c.trim().toLowerCase().replace(/\s+/g, '')).filter(Boolean)
}

/** Alerts relevant to Central Florida clients: every AMBER Alert, others by city. */
export function inArea(alerts: MissingAlert[], cities = areaCities()) {
  return alerts.filter((a) => {
    if (/amber/i.test(a.type)) return true
    const city = a.from.split(',')[0].toLowerCase().replace(/\s+/g, '')
    return cities.includes(city)
  })
}

export async function pollFdle(db: Database, fetchImpl: typeof fetch = fetch) {
  try {
    const res = await fetchImpl(FDLE_ALERTS, { headers: { 'User-Agent': userAgent() }, signal: AbortSignal.timeout(20_000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const alerts = parseFdleAlerts(await res.text())
    db.prepare(
      `INSERT INTO feed_cache (key, json) VALUES ('fdle-alerts', ?)
       ON CONFLICT(key) DO UPDATE SET json = excluded.json, fetched_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
    ).run(JSON.stringify(alerts))
    setStatus(db, 'fdle-alerts', null)
    return { alerts: alerts.length }
  } catch (err) {
    setStatus(db, 'fdle-alerts', errorText(err))
    throw err
  }
}

export interface MissingList {
  alerts: MissingAlert[]
  fetchedAt: string
}

/** Alerts for the dashboard, newest first; null when the page hasn't been read yet. */
export function missingList(db: Database): MissingList | null {
  const row = db.prepare(`SELECT json, fetched_at FROM feed_cache WHERE key = 'fdle-alerts'`).get() as
    | { json: string; fetched_at: string }
    | undefined
  if (!row) return null
  const time = (d: string) => {
    const [m, day, y] = d.split('/').map(Number)
    return y ? Date.UTC(y, m - 1, day) : 0
  }
  const alerts = inArea(JSON.parse(row.json) as MissingAlert[]).sort((a, b) => time(b.since) - time(a.since))
  return { alerts, fetchedAt: row.fetched_at }
}
