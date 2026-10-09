// Sample data from the v2 design handoff. Every name, headline, phone number
// and time here is placeholder content; later phases replace this module with
// calls to the portal API (see the handoff README "State Management / Data").

export type Severity = 'HIGH' | 'MED' | 'LOW'
export type ThreatLevel = 'LOW' | 'ELEVATED' | 'HIGH'
export type SiteId = string
export const ALL_SITES = 'all'

export interface Site {
  id: SiteId
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

export const me = {
  firstName: 'Janet',
  initials: 'JM',
  clientName: 'Royal Cypress Preserve HOA',
  industry: 'Residential community',
  industryPlural: 'residential communities',
  updatedAt: '2:41 PM',
}

export const sites: Site[] = [
  {
    id: 'royal-cypress',
    name: 'Royal Cypress Preserve',
    shortName: 'Royal Cypress',
    city: 'Orlando, FL',
    timeZone: 'America/New_York',
    map: { x: 32, y: 48 },
  },
  {
    id: 'lake-nona',
    name: 'Lake Nona Commons',
    shortName: 'Lake Nona Commons',
    city: 'Orlando, FL',
    timeZone: 'America/New_York',
    map: { x: 70, y: 66 },
  },
]

export const alerts: Alert[] = [
  {
    id: 'a1',
    severity: 'HIGH',
    title: 'Vehicle break-ins reported along Apopka-Vineland Rd',
    siteId: 'royal-cypress',
    distanceMi: 0.8,
    time: '1:58 PM',
    source: 'OCSO',
    url: 'https://www.ocso.com/',
  },
  {
    id: 'a2',
    severity: 'MED',
    title: 'Severe thunderstorm warning until 6:00 PM',
    siteId: null,
    time: '2:15 PM',
    source: 'NWS',
    url: 'https://www.weather.gov/mlb/',
  },
  {
    id: 'a3',
    severity: 'LOW',
    title: 'Lane closures on Narcoossee Rd through Friday',
    siteId: 'lake-nona',
    time: '9:40 AM',
    source: 'FDOT',
    url: 'https://www.fdot.gov/',
  },
]

/** Impact circles on the intel map (OSIRIS incidents layer). */
export const mapIncidents: { id: string; severity: 'HIGH' | 'MED'; x: number; y: number; label: string }[] = [
  { id: 'i1', severity: 'HIGH', x: 32, y: 48, label: 'Vehicle break-ins · OCSO · 1:58 PM' },
  { id: 'i2', severity: 'MED', x: 70, y: 66, label: 'Suspicious person reports · OPD · 11:20 AM' },
]

// Threat level and the banner alert are decided server-side per site
// (rules still to be confirmed with ops).
export const summaries: Record<SiteId, SiteSummary> = {
  [ALL_SITES]: { threatLevel: 'ELEVATED', activeAlertId: 'a1' },
  'royal-cypress': { threatLevel: 'ELEVATED', activeAlertId: 'a1' },
  'lake-nona': { threatLevel: 'ELEVATED', activeAlertId: null },
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

export function siteLabel(id: SiteId) {
  if (id === ALL_SITES) return `All sites (${sites.length})`
  const s = sites.find((x) => x.id === id)
  return s ? `${s.name} — ${s.city}` : ''
}

export function alertsForSite(id: SiteId) {
  if (id === ALL_SITES) return alerts
  return alerts.filter((a) => a.siteId === null || a.siteId === id)
}

export function alertMeta(a: Alert) {
  const site = a.siteId ? sites.find((s) => s.id === a.siteId)?.shortName : 'All sites'
  return [site, a.distanceMi != null ? `${a.distanceMi} mi` : null, a.time, a.source]
    .filter(Boolean)
    .join(' · ')
}
