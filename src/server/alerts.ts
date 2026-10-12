import type { Database } from 'better-sqlite3'
import {
  ALL_SITES,
  type Alert,
  type Feed,
  type MapIncident,
  type Severity,
  type Site,
  type SiteSummary,
  type ThreatLevel,
} from '@/components/portal/data'

// Live alerts for client sites. A poller asks each public feed which alerts are active
// at every site's coordinates and keeps site_alerts in step; the portal reads them per
// client. First feed: National Weather Service watches, warnings and advisories.

export interface FeedAlert {
  id: string
  event: string
  severity: Severity
  headline: string
  url: string
  area: string | null
  startsAt: string | null
  endsAt: string | null
  /** Where it happened, for point feeds (police calls). */
  lat?: number | null
  lng?: number | null
  /** Distance from the site it's being linked to. */
  distanceMi?: number | null
  /** Outer rings of the alert's area as [lon, lat] points, when the feed gives one (NWS). */
  polygons?: number[][][]
}

export interface AlertRow {
  alert_id: string
  site_id: string
  source: string
  event: string
  severity: Severity
  headline: string
  url: string
  starts_at: string | null
  ends_at: string | null
  first_seen_at: string
  distance_mi: number | null
  lat: number | null
  lng: number | null
}

/** User-Agent for every outbound feed request: who we are and how to reach us, as the services ask. */
export function userAgent() {
  return `365SMG-ClientPortal (portal.365securitymg.com, ${process.env.SMG_API_CONTACT || 'admin@365securitymg.com'})`
}

/**
 * fetch with a few retries on rate limits, bot challenges (403) and server errors, with a
 * jittered pause between tries. Some feeds sit behind Cloudflare and refuse requests at random.
 */
export async function fetchRetry(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
  { tries = 3, minDelayMs = 3_000, maxDelayMs = 10_000 } = {},
) {
  const { timeoutMs = 20_000, ...rest } = init
  let res: Response | undefined
  for (let attempt = 1; ; attempt++) {
    res = await fetchImpl(url, { ...rest, signal: AbortSignal.timeout(timeoutMs) })
    const retryable = res.status === 403 || res.status === 429 || res.status >= 500
    if (!retryable || attempt >= tries) return res
    await new Promise((r) => setTimeout(r, minDelayMs + Math.random() * (maxDelayMs - minDelayMs)))
  }
}

/** A readable reason for a failed request (fetch errors often hide it in `cause`). */
export function errorText(err: unknown) {
  if (!(err instanceof Error)) return String(err)
  const cause = (err as { cause?: { code?: string; message?: string } }).cause
  return [err.message || err.name, cause?.code ?? cause?.message].filter(Boolean).join(': ') || 'unknown error'
}

// ---------- NWS (api.weather.gov, public domain) ----------

const NWS = 'https://api.weather.gov'

/** NWS severity to the portal's three levels; warnings for life-threatening events stay HIGH. */
export function nwsSeverity(severity: string | undefined, event: string): Severity {
  if (severity === 'Extreme' || severity === 'Severe') return 'HIGH'
  if (/warning/i.test(event)) return 'HIGH'
  if (severity === 'Moderate' || /watch/i.test(event)) return 'MED'
  return 'LOW'
}

interface NwsFeature {
  id?: string
  geometry?: { type?: string; coordinates?: unknown } | null
  properties?: {
    id?: string
    '@id'?: string
    event?: string
    severity?: string
    headline?: string | null
    areaDesc?: string
    status?: string
    messageType?: string
    onset?: string | null
    effective?: string | null
    ends?: string | null
    expires?: string | null
  }
}

/** Active, real alerts from an api.weather.gov alerts response (GeoJSON). */
export function parseNws(json: unknown): FeedAlert[] {
  const features = (json as { features?: NwsFeature[] })?.features
  if (!Array.isArray(features)) throw new Error('NWS response has no features')
  const out: FeedAlert[] = []
  for (const f of features) {
    const p = f.properties ?? {}
    const nativeId = p.id ?? f.id
    if (!nativeId || !p.event) continue
    if (p.status !== 'Actual' || p.messageType === 'Cancel') continue
    out.push({
      id: `nws:${nativeId}`,
      event: p.event,
      severity: nwsSeverity(p.severity, p.event),
      headline: (p.headline || p.event).slice(0, 300),
      url: p['@id'] ?? (f.id?.startsWith('http') ? f.id : `${NWS}/alerts/${nativeId}`),
      area: p.areaDesc ?? null,
      startsAt: p.onset ?? p.effective ?? null,
      endsAt: p.ends ?? p.expires ?? null,
      polygons: outerRings(f.geometry),
    })
  }
  return out
}

function outerRings(g: NwsFeature['geometry']): number[][][] | undefined {
  if (g?.type === 'Polygon') return [(g.coordinates as number[][][])[0]]
  if (g?.type === 'MultiPolygon') return (g.coordinates as number[][][][]).map((p) => p[0])
  return undefined
}

/** Miles from a point to a polygon area (0 inside), on a local flat projection. */
export function milesToArea(site: { lat: number; lng: number }, rings: number[][][]) {
  const kx = 69.17 * Math.cos((site.lat * Math.PI) / 180)
  const ky = 69.0
  let best = Infinity
  for (const ring of rings) {
    const pts = ring.map(([lon, lat]) => [(lon - site.lng) * kx, (lat - site.lat) * ky])
    let inside = false
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i]
      const [xj, yj] = pts[j]
      if (yi > 0 !== yj > 0 && 0 < ((xj - xi) * (0 - yi)) / (yj - yi) + xi) inside = !inside
      // distance from the origin (the site) to segment i–j
      const dx = xj - xi
      const dy = yj - yi
      const t = dx || dy ? Math.max(0, Math.min(1, -(xi * dx + yi * dy) / (dx * dx + dy * dy))) : 0
      best = Math.min(best, Math.hypot(xi + t * dx, yi + t * dy))
    }
    if (inside) return 0
  }
  return best
}

/** A rough centre for an area, for a map pin. */
function centreOf(rings: number[][][]) {
  const pts = rings.flat()
  return { lng: pts.reduce((s, p) => s + p[0], 0) / pts.length, lat: pts.reduce((s, p) => s + p[1], 0) / pts.length }
}

// ---------- storage ----------

/**
 * Makes `items` the complete set of `source` alerts for one site. With `keepMissing`,
 * alerts that dropped off the feed stay linked until their end time (rolling feeds such
 * as police calls only list the last hour or so).
 */
export function syncSiteAlerts(
  db: Database,
  source: string,
  site: { id: string; client_id: string },
  items: FeedAlert[],
  { keepMissing = false } = {},
) {
  const upsert = db.prepare(
    `INSERT INTO alerts (id, source, event, severity, headline, url, area, starts_at, ends_at, lat, lng)
     VALUES (@id, @source, @event, @severity, @headline, @url, @area, @startsAt, @endsAt, @lat, @lng)
     ON CONFLICT(id) DO UPDATE SET event = excluded.event, severity = excluded.severity,
       headline = excluded.headline, url = excluded.url, area = excluded.area,
       starts_at = excluded.starts_at, ends_at = excluded.ends_at,
       lat = COALESCE(excluded.lat, alerts.lat), lng = COALESCE(excluded.lng, alerts.lng),
       last_seen_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
  )
  const link = db.prepare(
    `INSERT INTO site_alerts (alert_id, client_id, site_id, distance_mi) VALUES (?, ?, ?, ?)
     ON CONFLICT(alert_id, site_id) DO UPDATE SET distance_mi = excluded.distance_mi`,
  )
  db.transaction(() => {
    if (!keepMissing) unlinkMissing()
    for (const a of items) {
      upsert.run({ lat: null, lng: null, ...a, source })
      link.run(a.id, site.client_id, site.id, a.distanceMi ?? null)
    }
  })()

  function unlinkMissing() {
    const keep = new Set(items.map((a) => a.id))
    const current = db
      .prepare(
        `SELECT sa.alert_id FROM site_alerts sa JOIN alerts a ON a.id = sa.alert_id
         WHERE sa.site_id = ? AND a.source = ?`,
      )
      .all(site.id, source) as { alert_id: string }[]
    const unlink = db.prepare(`DELETE FROM site_alerts WHERE alert_id = ? AND site_id = ?`)
    for (const { alert_id } of current) if (!keep.has(alert_id)) unlink.run(alert_id, site.id)
  }
}

export function setStatus(db: Database, source: string, error: string | null) {
  if (error) {
    db.prepare(
      `INSERT INTO feed_status (source, error_at, error) VALUES (?, strftime('%Y-%m-%dT%H:%M:%fZ','now'), ?)
       ON CONFLICT(source) DO UPDATE SET error_at = excluded.error_at, error = excluded.error`,
    ).run(source, error.slice(0, 500))
  } else {
    db.prepare(
      `INSERT INTO feed_status (source, ok_at) VALUES (?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
       ON CONFLICT(source) DO UPDATE SET ok_at = excluded.ok_at, error = NULL`,
    ).run(source)
  }
}

/** Asks NWS for the alerts active at each located site. Sites at the same point share a request. */
export async function pollNws(db: Database, fetchImpl: typeof fetch = fetch) {
  const sites = db
    .prepare(`SELECT id, client_id, lat, lng FROM sites WHERE lat IS NOT NULL AND lng IS NOT NULL`)
    .all() as { id: string; client_id: string; lat: number; lng: number }[]
  const byPoint = new Map<string, typeof sites>()
  for (const s of sites) {
    // NWS accepts at most 4 decimal places.
    const key = `${s.lat.toFixed(4)},${s.lng.toFixed(4)}`
    byPoint.set(key, [...(byPoint.get(key) ?? []), s])
  }
  let failures = 0
  let lastError = ''
  const headers = { 'User-Agent': userAgent(), Accept: 'application/geo+json' }

  // Statewide alerts, for "nearby" weather when nothing covers a site itself.
  let regional: FeedAlert[] = []
  if (sites.length) {
    try {
      const area = process.env.SMG_NWS_AREA || 'FL'
      const res = await fetchImpl(`${NWS}/alerts/active?area=${area}`, { headers, signal: AbortSignal.timeout(20_000) })
      if (!res.ok) throw new Error(`HTTP ${res.status} for area ${area}`)
      regional = parseNws(await res.json()).filter((a) => a.polygons?.length)
    } catch (err) {
      failures++
      lastError = errorText(err)
    }
  }
  const nearMi = Number(process.env.SMG_WEATHER_NEARBY_MI) || 50

  for (const [point, group] of byPoint) {
    try {
      const res = await fetchImpl(`${NWS}/alerts/active?point=${point}`, { headers, signal: AbortSignal.timeout(15_000) })
      if (!res.ok) throw new Error(`HTTP ${res.status} for point ${point}`)
      const items = parseNws(await res.json())
      const here = new Set(items.map((a) => a.id))
      for (const s of group) {
        const nearby = regional.flatMap((a) => {
          if (here.has(a.id)) return []
          const d = milesToArea(s, a.polygons!)
          return d > 0 && d <= nearMi ? [{ ...a, distanceMi: d, ...centreOf(a.polygons!) }] : []
        })
        syncSiteAlerts(db, 'nws', s, [...items, ...nearby])
      }
    } catch (err) {
      // Keep the last known alerts for these sites rather than clearing them on a failed request.
      failures++
      lastError = errorText(err)
    }
  }
  setStatus(db, 'nws', failures ? `${failures} of ${byPoint.size} requests failed: ${lastError}` : null)
  return { points: byPoint.size, failures }
}

interface Poller {
  enabled: () => boolean
  /** Run on every n-th 5-minute tick (1 = every 5 minutes). */
  every: number
  run: (db: Database) => Promise<unknown>
}

/** Feeds and how often they're polled. Orlando PD is opt-in (SMG_FEED_OPD=1) until the City OKs reuse. */
const POLLERS: [string, Poller][] = [
  ['NWS', { enabled: () => process.env.SMG_FEED_NWS !== '0', every: 1, run: (db) => pollNws(db) }],
  [
    'Orlando PD',
    {
      enabled: () => process.env.SMG_FEED_OPD === '1',
      every: 1,
      run: async (db) => (await import('./opd')).pollOpd(db),
    },
  ],
  [
    'DHS NTAS',
    {
      enabled: () => process.env.SMG_FEED_NTAS !== '0',
      every: 6, // 30 minutes
      run: async (db) => (await import('./publicsafety')).pollNtas(db),
    },
  ],
  [
    'FDLE missing persons',
    {
      enabled: () => process.env.SMG_FEED_FDLE !== '0',
      every: 6, // 30 minutes
      run: async (db) => (await import('./fdle')).pollFdle(db),
    },
  ],
  [
    'FDLE registry',
    {
      // Only downloads counties of clients an admin has opted in.
      enabled: () => process.env.SMG_FEED_REGISTRY !== '0',
      every: 72, // 6 hours; FDLE regenerates the file every 4
      run: async (db) => (await import('./registry')).pollRegistry(db),
    },
  ],
  [
    'FBI Wanted',
    {
      enabled: () => process.env.SMG_FEED_FBI !== '0',
      every: 36, // 3 hours
      run: async (db) => (await import('./publicsafety')).pollWanted(db),
    },
  ],
  [
    'NHC storms',
    {
      enabled: () => process.env.SMG_FEED_NHC !== '0',
      every: 3, // 15 minutes; NHC advisories come every 3-6 hours, specials in between
      run: async (db) => (await import('./storms')).pollStorms(db),
    },
  ],
]

/** Starts polling every 5 minutes in this server process (once, however often it's called). */
export function startAlertPolling(open: () => Database) {
  const g = globalThis as unknown as { smgAlertPoller?: ReturnType<typeof setInterval> }
  if (g.smgAlertPoller) return
  let tick = 0
  const run = async () => {
    const db = open()
    const n = tick++
    for (const [name, poll] of POLLERS) {
      if (!poll.enabled() || n % poll.every !== 0) continue
      await poll.run(db).catch((err) => console.error(`[alerts] ${name} poll failed:`, errorText(err)))
    }
  }
  void run()
  g.smgAlertPoller = setInterval(run, 5 * 60_000)
  g.smgAlertPoller.unref?.()
}

// ---------- reading, per client ----------

/** A client's active alerts (not yet ended), one row per affected site. */
export function clientAlerts(db: Database, clientId: string, now = new Date()) {
  return db
    .prepare(
      `SELECT sa.alert_id, sa.site_id, sa.distance_mi, a.source, a.event, a.severity, a.headline, a.url,
              a.starts_at, a.ends_at, a.first_seen_at, a.lat, a.lng
       FROM site_alerts sa JOIN alerts a ON a.id = sa.alert_id
       WHERE sa.client_id = ? AND (a.ends_at IS NULL OR a.ends_at > ?)`,
    )
    .all(clientId, now.toISOString()) as AlertRow[]
}

const RANK: Record<Severity, number> = { HIGH: 3, MED: 2, LOW: 1 }
const THREAT: Record<Severity, ThreatLevel> = { HIGH: 'HIGH', MED: 'ELEVATED', LOW: 'LOW' }
const SOURCE_LABEL: Record<string, string> = { nws: 'NWS', opd: 'Orlando PD', ntas: 'DHS' }

function age(iso: string | null, now: Date) {
  if (!iso) return ''
  const mins = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60_000))
  if (mins < 60) return `${mins}m ago`
  if (mins < 48 * 60) return `${Math.floor(mins / 60)}h ago`
  return `${Math.floor(mins / 1440)}d ago`
}

/** Police calls within this distance count as at the site; further ones (up to the max) as nearby. */
export const crimeRadius = () => Number(process.env.SMG_CRIME_RADIUS_MI) || 1
export const maxCrimeRadius = () => Math.max(crimeRadius(), Number(process.env.SMG_CRIME_MAX_RADIUS_MI) || 10)
const NEARBY_COUNT = () => Number(process.env.SMG_NEARBY_COUNT) || 5

/** Whether an alert row is at the site itself (vs. nearby context). */
function atSite(r: AlertRow) {
  if (r.distance_mi == null) return true // area alerts that cover the site, national advisories
  if (r.source === 'opd') return r.distance_mi <= crimeRadius()
  return r.distance_mi === 0
}

/**
 * Builds the dashboard feed from a client's live alert rows. Each site shows what's at the
 * site; a site with nothing there shows the nearest few alerts further out, marked nearby.
 * Threat levels, the banner and map rings only count what's at the site.
 */
export function liveFeed(sites: Site[], rows: AlertRow[], now = new Date()): Feed {
  const shown: (AlertRow & { nearby: boolean })[] = []
  for (const s of sites) {
    const mine = rows.filter((r) => r.site_id === s.id)
    const here = mine.filter(atSite)
    if (here.length) shown.push(...here.map((r) => ({ ...r, nearby: false })))
    else
      shown.push(
        ...mine
          .sort((x, y) => (x.distance_mi ?? 0) - (y.distance_mi ?? 0))
          .slice(0, NEARBY_COUNT())
          .map((r) => ({ ...r, nearby: true })),
      )
  }

  const byAlert = new Map<string, typeof shown>()
  for (const r of shown) byAlert.set(r.alert_id, [...(byAlert.get(r.alert_id) ?? []), r])

  const alerts: Alert[] = []
  for (const [alertId, hits] of byAlert) {
    const r = hits[0]
    const base = {
      severity: r.severity,
      title: r.headline,
      time: age(r.starts_at ?? r.first_seen_at, now),
      source: SOURCE_LABEL[r.source] ?? r.source.toUpperCase(),
      url: r.url,
      lat: r.lat,
      lng: r.lng,
    }
    // One entry when it's at every site; otherwise one per site.
    if (sites.length > 1 && hits.length === sites.length && hits.every((h) => !h.nearby))
      alerts.push({ ...base, id: alertId, siteId: null })
    else
      for (const h of hits)
        alerts.push({
          ...base,
          id: `${alertId}@${h.site_id}`,
          siteId: h.site_id,
          nearby: h.nearby || undefined,
          distanceMi: h.distance_mi != null ? Math.round(h.distance_mi * 10) / 10 : undefined,
        })
  }
  // At-site alerts first (worst first), then nearby ones, closest first.
  alerts.sort(
    (a, b) =>
      Number(!!a.nearby) - Number(!!b.nearby) ||
      (a.nearby ? (a.distanceMi ?? 0) - (b.distanceMi ?? 0) : RANK[b.severity] - RANK[a.severity]) ||
      a.title.localeCompare(b.title),
  )

  const summaries: Record<string, SiteSummary> = {}
  const summarize = (list: Alert[]): SiteSummary => {
    const counted = list.filter((a) => !a.nearby)
    const worst = counted.reduce<Severity>((w, a) => (RANK[a.severity] > RANK[w] ? a.severity : w), 'LOW')
    return {
      threatLevel: counted.length ? THREAT[worst] : 'LOW',
      activeAlertId: counted.find((a) => a.severity === 'HIGH')?.id ?? null,
    }
  }
  for (const s of sites) summaries[s.id] = summarize(alerts.filter((a) => a.siteId === null || a.siteId === s.id))
  summaries[ALL_SITES] = summarize(alerts)

  const incidents: MapIncident[] = []
  for (const s of sites) {
    const hits = shown.filter((h) => h.site_id === s.id && !h.nearby)
    if (!hits.length) continue
    const worst = hits.reduce((w, h) => (RANK[h.severity] > RANK[w.severity] ? h : w))
    if (worst.severity !== 'LOW') {
      incidents.push({ id: `${worst.alert_id}@${s.id}`, severity: worst.severity, siteId: s.id, label: worst.event })
    }
  }

  return { alerts, summaries, incidents, demo: false }
}
