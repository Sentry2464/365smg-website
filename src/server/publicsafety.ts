import type { Database } from 'better-sqlite3'
import type { Severity } from '@/components/portal/data'
import { type FeedAlert, setStatus, syncSiteAlerts } from './alerts'

// National public-safety feeds:
// - DHS National Terrorism Advisory System (NTAS): an active advisory is shown to every
//   client as an alert (national, so it applies to all sites).
// - FBI Wanted (api.fbi.gov): the field office's current wanted list, shown as a list
//   card. It has no locations, so it never goes on the map.

const UA = () =>
  `365SMG-ClientPortal (portal.365smg.com, ${process.env.SMG_API_CONTACT || 'admin@365securitymg.com'})`

// ---------- DHS NTAS ----------

export const NTAS_FEED = 'https://www.dhs.gov/ntas/1.1/feed.xml'

const text = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()

/** Active advisories in the NTAS feed: <alerts><alert start end type link><summary>…</summary></alert></alerts>. */
export function parseNtas(xml: string): FeedAlert[] {
  const body = xml.replace(/^﻿/, '')
  if (!/<alerts[\s>/]/.test(body)) throw new Error('NTAS feed has no alerts element')
  const out: FeedAlert[] = []
  // Tolerant of self-closing alerts, single or double quotes, and extra child elements.
  for (const m of body.matchAll(/<alert\b([^>]*?)(?:\/>|>([\s\S]*?)<\/alert>)/g)) {
    const attr = (name: string) => {
      const a = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(m[1])
      return a ? (a[1] ?? a[2]).trim() || null : null
    }
    const type = attr('type') ?? 'Bulletin'
    const summary = text(/<summary[^>]*>([\s\S]*?)<\/summary>/.exec(m[2] ?? '')?.[1] ?? '')
    const start = attr('start')
    const end = attr('end')
    const severity: Severity = /imminent/i.test(type) ? 'HIGH' : 'MED'
    const date = (s: string | null) => (s && !Number.isNaN(Date.parse(s)) ? new Date(s).toISOString() : null)
    out.push({
      id: `ntas:${start ?? ''}:${type}`,
      event: `NTAS ${type}`,
      severity,
      headline: `National Terrorism Advisory: ${type}${summary ? ` · ${summary}` : ''}`.slice(0, 300),
      url: attr('link') ?? attr('href') ?? 'https://www.dhs.gov/national-terrorism-advisory-system',
      area: 'United States',
      startsAt: date(start),
      endsAt: date(end),
    })
  }
  return out
}

/** Links active NTAS advisories to every client site (and unlinks expired ones). */
export async function pollNtas(db: Database, fetchImpl: typeof fetch = fetch) {
  try {
    const res = await fetchImpl(NTAS_FEED, { headers: { 'User-Agent': UA() }, signal: AbortSignal.timeout(15_000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const items = parseNtas(await res.text())
    const sites = db.prepare(`SELECT id, client_id FROM sites`).all() as { id: string; client_id: string }[]
    for (const s of sites) syncSiteAlerts(db, 'ntas', s, items)
    setStatus(db, 'ntas', null)
    return { advisories: items.length }
  } catch (err) {
    setStatus(db, 'ntas', err instanceof Error ? err.message : String(err))
    throw err
  }
}

// ---------- FBI Wanted ----------

export interface WantedItem {
  uid: string
  title: string
  url: string
  subject: string | null
  reward: string | null
  image: string | null
  modified: string | null
}

const FBI = 'https://api.fbi.gov/wanted/v1/list'

/** Field offices whose wanted lists the portal shows (api.fbi.gov slugs, e.g. "tampa"). */
export function fieldOffices() {
  return (process.env.SMG_FBI_FIELD_OFFICES || 'tampa')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^[a-z]+$/.test(s))
}

interface FbiItem {
  uid?: string
  title?: string
  url?: string
  subjects?: string[] | null
  reward_text?: string | null
  images?: { thumb?: string; large?: string }[] | null
  modified?: string | null
  poster_classification?: string | null
}

export function parseWanted(json: unknown): WantedItem[] {
  const items = (json as { items?: FbiItem[] })?.items
  if (!Array.isArray(items)) throw new Error('FBI response has no items')
  return items
    .filter((i) => i.uid && i.title && i.url?.startsWith('https://www.fbi.gov/'))
    .map((i) => ({
      uid: i.uid!,
      title: i.title!.trim(),
      url: i.url!,
      subject: i.subjects?.[0] ?? null,
      reward: i.reward_text?.trim() || null,
      image: i.images?.[0]?.thumb?.startsWith('https://www.fbi.gov/') ? i.images[0].thumb : null,
      modified: i.modified ?? null,
    }))
    .sort((a, b) => (b.modified ?? '').localeCompare(a.modified ?? ''))
}

/** Refreshes each field office's list. A withdrawn notice disappears with the next fetch. */
export async function pollWanted(db: Database, fetchImpl: typeof fetch = fetch) {
  const save = db.prepare(
    `INSERT INTO feed_cache (key, json) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET json = excluded.json, fetched_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
  )
  const errors: string[] = []
  for (const office of fieldOffices()) {
    try {
      const res = await fetchImpl(`${FBI}?field_offices=${office}&pageSize=50`, {
        headers: { 'User-Agent': UA(), Accept: 'application/json' },
        signal: AbortSignal.timeout(20_000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      save.run(`fbi-wanted:${office}`, JSON.stringify(parseWanted(await res.json())))
    } catch (err) {
      errors.push(`${office}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  setStatus(db, 'fbi-wanted', errors.length ? errors.join('; ') : null)
}

/** The cached list for the portal's field offices; empty when nothing has been fetched yet. */
export function wantedList(db: Database, limit = 8): WantedList[] {
  return fieldOffices().flatMap((office) => {
    const row = db.prepare(`SELECT json, fetched_at FROM feed_cache WHERE key = ?`).get(`fbi-wanted:${office}`) as
      | { json: string; fetched_at: string }
      | undefined
    if (!row) return []
    const items = JSON.parse(row.json) as WantedItem[]
    return [{ office, total: items.length, items: items.slice(0, limit), fetchedAt: row.fetched_at }]
  })
}

export interface WantedList {
  office: string
  total: number
  items: WantedItem[]
  fetchedAt: string
}
