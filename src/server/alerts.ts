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
  return `365SMG-ClientPortal (portal.365smg.com, ${process.env.SMG_API_CONTACT || 'admin@365securitymg.com'})`
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
    })
  }
  return out
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
       starts_at = excluded.starts_at, ends_at = excluded.ends_at, lat = excluded.lat, lng = excluded.lng,
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
  for (const [point, group] of byPoint) {
    try {
      const res = await fetchImpl(`${NWS}/alerts/active?point=${point}`, {
        headers: { 'User-Agent': userAgent(), Accept: 'application/geo+json' },
        signal: AbortSignal.timeout(15_000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status} for point ${point}`)
      const items = parseNws(await res.json())
      for (const s of group) syncSiteAlerts(db, 'nws', s, items)
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
    'FBI Wanted',
    {
      enabled: () => process.env.SMG_FEED_FBI !== '0',
      every: 36, // 3 hours
      run: async (db) => (await import('./publicsafety')).pollWanted(db),
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

/** Builds the dashboard feed from a client's live alert rows. */
export function liveFeed(sites: Site[], rows: AlertRow[], now = new Date()): Feed {
  const bySite = new Map<string, AlertRow[]>()
  const byAlert = new Map<string, AlertRow[]>()
  for (const r of rows) {
    bySite.set(r.site_id, [...(bySite.get(r.site_id) ?? []), r])
    byAlert.set(r.alert_id, [...(byAlert.get(r.alert_id) ?? []), r])
  }

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
    // One entry when it covers every site; otherwise one per affected site.
    if (sites.length > 1 && hits.length === sites.length) alerts.push({ ...base, id: alertId, siteId: null })
    else
      for (const h of hits)
        alerts.push({ ...base, id: `${alertId}@${h.site_id}`, siteId: h.site_id, distanceMi: h.distance_mi != null ? Math.round(h.distance_mi * 10) / 10 : undefined })
  }
  alerts.sort((a, b) => RANK[b.severity] - RANK[a.severity] || a.title.localeCompare(b.title))

  const summaries: Record<string, SiteSummary> = {}
  const summarize = (list: Alert[]): SiteSummary => {
    const worst = list.reduce<Severity>((w, a) => (RANK[a.severity] > RANK[w] ? a.severity : w), 'LOW')
    return {
      threatLevel: list.length ? THREAT[worst] : 'LOW',
      activeAlertId: list.find((a) => a.severity === 'HIGH')?.id ?? null,
    }
  }
  for (const s of sites) summaries[s.id] = summarize(alerts.filter((a) => a.siteId === null || a.siteId === s.id))
  summaries[ALL_SITES] = summarize(alerts)

  const incidents: MapIncident[] = []
  for (const [siteId, hits] of bySite) {
    const worst = hits.reduce((w, h) => (RANK[h.severity] > RANK[w.severity] ? h : w))
    if (worst.severity !== 'LOW') {
      incidents.push({ id: `${worst.alert_id}@${siteId}`, severity: worst.severity, siteId, label: worst.event })
    }
  }

  return { alerts, summaries, incidents, demo: false }
}
