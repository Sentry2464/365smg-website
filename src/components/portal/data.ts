// Portal view types, plus the design handoff's sample content (weather, ticker,
// news, tips, podcast). Clients, sites and users come from the database; the
// sample content is replaced with live feeds in Phase 4.

export type Severity = 'HIGH' | 'MED' | 'LOW'
export type ThreatLevel = 'LOW' | 'ELEVATED' | 'HIGH'
export type SiteId = string
export const ALL_SITES = 'all'

export interface Site {
  id: SiteId
  slug: string
  name: string
  shortName: string
  city: string
  timeZone: string
  /** Position on the placeholder map, in percent of its width/height. */
  map: { x: number; y: number }
}

export interface Alert {
  id: string
  severity: Severity
  title: string
  /** null = applies to every site (e.g. an NWS warning for the county). */
  siteId: SiteId | null
  distanceMi?: number
  time: string
  source: string
  url: string
}

export interface SiteSummary {
  threatLevel: ThreatLevel
  activeAlertId: string | null
}

export interface TickerItem {
  source: string
  color: string
  title: string
  url: string
  age: string
}

export interface NewsItem {
  title: string
  outlet: string
  age: string
  url: string
}

export interface Weather {
  city: string
  tempF: number
  conditions: string
  windDir: string
  windMph: number
  forecast: { day: string; hi: number; lo: number }[]
}

export const contact = {
  phone: '(407) 555-0365',
  email: 'ops@365smg.com',
  replyBusinessDays: 2,
  piLicense: '[A#######]',
}

export interface PortalUser {
  name: string
  firstName: string
  initials: string
  email: string
}

export interface PortalClient {
  name: string
  industry: string
  industryPlural: string
}

export interface MapIncident {
  id: string
  severity: 'HIGH' | 'MED'
  siteId: SiteId
  label: string
}

export interface Feed {
  alerts: Alert[]
  summaries: Record<SiteId, SiteSummary>
  incidents: MapIncident[]
  /** Demo data: also shows the sample weather warning on the map. */
  demo: boolean
}

// Sample feed from the design, shown only for the demo client's sites (matched
// by slug). Phase 4 replaces this with live NWS, incident and news data.
const sampleAlerts: (Omit<Alert, 'siteId'> & { siteSlug: string | null })[] = [
  {
    id: 'a1',
    severity: 'HIGH',
    title: 'Vehicle break-ins reported along Apopka-Vineland Rd',
    siteSlug: 'royal-cypress-preserve',
    distanceMi: 0.8,
    time: '1:58 PM',
    source: 'OCSO',
    url: 'https://www.ocso.com/',
  },
  {
    id: 'a2',
    severity: 'MED',
    title: 'Severe thunderstorm warning until 6:00 PM',
    siteSlug: null,
    time: '2:15 PM',
    source: 'NWS',
    url: 'https://www.weather.gov/mlb/',
  },
  {
    id: 'a3',
    severity: 'LOW',
    title: 'Lane closures on Narcoossee Rd through Friday',
    siteSlug: 'lake-nona-commons',
    time: '9:40 AM',
    source: 'FDOT',
    url: 'https://www.fdot.gov/',
  },
]

const sampleIncidents = [
  { id: 'i1', severity: 'HIGH' as const, siteSlug: 'royal-cypress-preserve', label: 'Vehicle break-ins · OCSO · 1:58 PM' },
  { id: 'i2', severity: 'MED' as const, siteSlug: 'lake-nona-commons', label: 'Suspicious person reports · OPD · 11:20 AM' },
]

const sampleThreat: Record<string, ThreatLevel> = {
  'royal-cypress-preserve': 'ELEVATED',
  'lake-nona-commons': 'ELEVATED',
}

/**
 * Site-specific sample alerts, incidents and threat levels, for demo data only. `demo`
 * must be set explicitly (development or SMG_DEMO=1): a real client's site that happens
 * to share a demo slug must never show invented incidents as if they were real.
 */
export function sampleFeed(sites: (Site & { slug: string })[], { demo }: { demo: boolean }): Feed {
  if (!demo) {
    const summaries: Record<SiteId, SiteSummary> = { [ALL_SITES]: { threatLevel: 'LOW', activeAlertId: null } }
    for (const s of sites) summaries[s.id] = { threatLevel: 'LOW', activeAlertId: null }
    return { alerts: [], summaries, incidents: [], demo: false }
  }
  const bySlug = new Map(sites.map((s) => [s.slug, s.id]))
  const isDemo = sites.some((s) => s.slug in sampleThreat)
  const alerts: Alert[] = isDemo
    ? sampleAlerts
        .filter((a) => a.siteSlug === null || bySlug.has(a.siteSlug))
        .map(({ siteSlug, ...a }) => ({ ...a, siteId: siteSlug ? bySlug.get(siteSlug)! : null }))
    : []
  const summaries: Record<SiteId, SiteSummary> = {}
  for (const s of sites) {
    const banner = alerts.find((a) => a.siteId === s.id && a.severity === 'HIGH')
    summaries[s.id] = { threatLevel: sampleThreat[s.slug] ?? 'LOW', activeAlertId: banner?.id ?? null }
  }
  const anyBanner = alerts.find((a) => a.severity === 'HIGH' && a.siteId)
  summaries[ALL_SITES] = {
    threatLevel: sites.some((s) => sampleThreat[s.slug] === 'ELEVATED') ? 'ELEVATED' : 'LOW',
    activeAlertId: anyBanner?.id ?? null,
  }
  const incidents = sampleIncidents
    .filter((i) => bySlug.has(i.siteSlug))
    .map(({ siteSlug, ...i }) => ({ ...i, siteId: bySlug.get(siteSlug)! }))
  return { alerts, summaries, incidents, demo: true }
}

/**
 * Places sites on the placeholder map from their coordinates: west-east across
 * 30–70% of the width, north-south across 45–67% of the height.
 */
export function placeSites<T extends { lat: number | null; lng: number | null }>(rows: T[]) {
  const located = rows.filter((r) => r.lat != null && r.lng != null)
  const lats = located.map((r) => r.lat!)
  const lngs = located.map((r) => r.lng!)
  const [minLat, maxLat, minLng, maxLng] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)]
  return rows.map((r, i) => {
    if (r.lat == null || r.lng == null || located.length < 2) {
      return { x: rows.length === 1 ? 50 : 30 + (40 * i) / Math.max(1, rows.length - 1), y: 55 }
    }
    const x = maxLng === minLng ? 50 : 30 + (40 * (r.lng - minLng)) / (maxLng - minLng)
    const y = maxLat === minLat ? 55 : 45 + (22 * (maxLat - r.lat)) / (maxLat - minLat)
    return { x, y }
  })
}

export const weather: Weather = {
  city: 'Orlando, FL',
  tempF: 87,
  conditions: 'Partly cloudy',
  windDir: 'SE',
  windMph: 9,
  forecast: [
    { day: 'Sat', hi: 88, lo: 73 },
    { day: 'Sun', hi: 86, lo: 72 },
    { day: 'Mon', hi: 84, lo: 70 },
    { day: 'Tue', hi: 85, lo: 71 },
  ],
}

export const ticker: TickerItem[] = [
  { source: 'CISA', color: '#4a90d9', title: 'Emergency directive issued for widely used VPN appliances', url: 'https://www.cisa.gov/news-events/directives', age: '1h' },
  { source: 'WESH 2', color: '#C8A84B', title: 'Orlando police warn of fake utility workers going door to door', url: 'https://www.wesh.com/local-news', age: '2h' },
  { source: 'SANS ISC', color: '#27AE60', title: 'Surge in scans targeting home security camera DVRs', url: 'https://isc.sans.edu/', age: '3h' },
  { source: 'AP', color: '#D0D4DC', title: 'Retail theft rings target suburban shopping centers, FBI says', url: 'https://apnews.com/', age: '4h' },
  { source: 'THE HACKER NEWS', color: '#e67e22', title: 'Smart lock vendor patches remote unlock flaw', url: 'https://thehackernews.com/', age: '6h' },
  { source: 'NWS', color: '#b48fd6', title: 'Tropical moisture brings afternoon storms to Central Florida', url: 'https://www.weather.gov/mlb/', age: '7h' },
]

export const news: NewsItem[] = [
  { title: 'Orange County expands license plate reader program to more neighborhoods', outlet: 'Orlando Sentinel', age: '2h', url: 'https://www.orlandosentinel.com/' },
  { title: 'Package theft from community mailrooms rises ahead of the holidays', outlet: 'WESH 2', age: '5h', url: 'https://www.wesh.com/' },
  { title: 'What Florida HOAs need to know about storing gate camera footage', outlet: 'Florida Politics', age: '1d', url: 'https://floridapolitics.com/' },
]

export const tips = {
  tipOfWeek: {
    title: 'Audit your gate access codes monthly',
    body: 'Retire codes for move-outs and former vendors. Shared codes older than 90 days are the most common way unknown vehicles get through.',
    short: 'Retire codes for move-outs and former vendors.',
  },
  advisories: [
    { title: 'CISA: Securing IP cameras and NVRs on shared networks', date: 'Oct 6', url: 'https://www.cisa.gov/news-events/cybersecurity-advisories' },
    { title: 'CISA: Text scams impersonating toll and delivery services', date: 'Oct 2', url: 'https://www.cisa.gov/news-events/news' },
  ],
}

export const briefing = {
  month: 'October 2026',
  area: 'Orlando Southwest',
  url: '#',
}

export const podcast = {
  title: 'Ep. 24 — Holiday season prep for gated communities',
  durationSec: 38 * 60 + 40,
  startSec: 12 * 60 + 8,
  url: '#',
}

export const feedbackTopics = ['Concern about service', 'Service request', 'Suggestion', 'Compliment']

export const investigationTypes = [
  'Background investigation',
  'Internal theft / loss',
  'Employee or vendor misconduct',
  'Surveillance',
  'Insurance / fraud',
  'Due diligence',
  'Other',
]

export const investigationTags = [
  'Background checks',
  'Internal theft',
  'Employee misconduct',
  'Surveillance',
  'Insurance & fraud',
  'Due diligence',
]

export function siteLabel(id: SiteId, sites: Site[]) {
  if (id === ALL_SITES) return `All sites (${sites.length})`
  const s = sites.find((x) => x.id === id)
  return s ? `${s.name} — ${s.city}` : ''
}

export function alertsForSite(alerts: Alert[], id: SiteId) {
  if (id === ALL_SITES) return alerts
  return alerts.filter((a) => a.siteId === null || a.siteId === id)
}

export function alertMeta(a: Alert, sites: Site[]) {
  const site = a.siteId ? sites.find((s) => s.id === a.siteId)?.shortName : 'All sites'
  return [site, a.distanceMi != null ? `${a.distanceMi} mi` : null, a.time, a.source].filter(Boolean).join(' · ')
}
