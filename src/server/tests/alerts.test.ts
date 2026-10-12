import type { Database } from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import { ALL_SITES, type Site } from '@/components/portal/data'
import { clientAlerts, liveFeed, nwsSeverity, parseNws, pollNws, syncSiteAlerts } from '../alerts'
import { openDatabase } from '../core.mjs'
import { createClient, createSite } from '../store'

const admin = { id: 'system' }

// Shape of an api.weather.gov /alerts/active response (trimmed).
function nwsResponse(...alerts: { id: string; event: string; severity: string; status?: string; ends?: string }[]) {
  return {
    type: 'FeatureCollection',
    features: alerts.map((a) => ({
      id: `https://api.weather.gov/alerts/${a.id}`,
      type: 'Feature',
      geometry: null,
      properties: {
        '@id': `https://api.weather.gov/alerts/${a.id}`,
        id: a.id,
        areaDesc: 'Marion, FL',
        onset: '2026-10-12T14:00:00-04:00',
        ends: a.ends ?? '2099-01-01T00:00:00Z',
        status: a.status ?? 'Actual',
        messageType: 'Alert',
        severity: a.severity,
        event: a.event,
        headline: `${a.event} issued by NWS Jacksonville FL`,
      },
    })),
  }
}

const toSite = (r: { id: string; slug: string; name: string }): Site => ({
  id: r.id,
  slug: r.slug,
  name: r.name,
  shortName: r.name,
  city: '',
  timeZone: 'America/New_York',
  map: { x: 50, y: 50 },
})

let db: Database
beforeEach(() => {
  db = openDatabase(':memory:')
})

describe('NWS parsing', () => {
  it('maps severities and keeps only real, active alerts', () => {
    expect(nwsSeverity('Severe', 'Flood Warning')).toBe('HIGH')
    expect(nwsSeverity('Moderate', 'Flood Warning')).toBe('HIGH')
    expect(nwsSeverity('Moderate', 'Tropical Storm Watch')).toBe('MED')
    expect(nwsSeverity('Minor', 'Small Craft Advisory')).toBe('LOW')

    const items = parseNws(
      nwsResponse(
        { id: 'urn:1', event: 'Flood Warning', severity: 'Moderate' },
        { id: 'urn:2', event: 'Test Message', severity: 'Unknown', status: 'Test' },
      ),
    )
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ id: 'nws:urn:1', severity: 'HIGH', area: 'Marion, FL' })
    expect(items[0].url).toBe('https://api.weather.gov/alerts/urn:1')
    expect(() => parseNws({})).toThrow()
  })
})

describe('site alerts', () => {
  function setup() {
    const a = createClient(db, admin, { name: 'Acme HOA', industry: 'HOA', industryPlural: '', managerEmail: '' })
    const b = createClient(db, admin, { name: 'Bayside', industry: 'Office', industryPlural: '', managerEmail: '' })
    const a1 = createSite(db, admin, a.id, { name: 'Acme North', city: 'Ocala, FL', timeZone: '', lat: '29.19', lng: '-82.14' })
    const a2 = createSite(db, admin, a.id, { name: 'Acme South', city: 'Orlando, FL', timeZone: '', lat: '28.5', lng: '-81.4' })
    const b1 = createSite(db, admin, b.id, { name: 'Bayside Tower', city: 'Ocala, FL', timeZone: '', lat: '29.19', lng: '-82.14' })
    return { a, b, a1, a2, b1 }
  }

  it('replaces a site’s alerts on each sync and keeps clients apart', () => {
    const { a, b, a1, b1 } = setup()
    const flood = parseNws(nwsResponse({ id: 'urn:1', event: 'Flood Warning', severity: 'Severe' }))
    syncSiteAlerts(db, 'nws', a1, flood)
    expect(clientAlerts(db, a.id).map((r) => r.site_id)).toEqual([a1.id])
    expect(clientAlerts(db, b.id)).toEqual([])

    syncSiteAlerts(db, 'nws', b1, flood)
    expect(clientAlerts(db, b.id).map((r) => r.site_id)).toEqual([b1.id])

    // The warning ends for a1: gone for Acme, still there for Bayside.
    syncSiteAlerts(db, 'nws', a1, [])
    expect(clientAlerts(db, a.id)).toEqual([])
    expect(clientAlerts(db, b.id)).toHaveLength(1)
  })

  it('hides alerts past their end time', () => {
    const { a, a1 } = setup()
    syncSiteAlerts(
      db,
      'nws',
      a1,
      parseNws(nwsResponse({ id: 'urn:old', event: 'Heat Advisory', severity: 'Minor', ends: '2020-01-01T00:00:00Z' })),
    )
    expect(clientAlerts(db, a.id)).toEqual([])
  })

  it('polls each distinct point once and keeps old alerts when a request fails', async () => {
    const { a, a1 } = setup()
    const asked: string[] = []
    const ok = (async (url: string) => {
      asked.push(url)
      return new Response(JSON.stringify(nwsResponse({ id: 'urn:1', event: 'Flood Warning', severity: 'Severe' })))
    }) as unknown as typeof fetch
    expect(await pollNws(db, ok)).toEqual({ points: 2, failures: 0 })
    expect(asked.sort()).toEqual([
      'https://api.weather.gov/alerts/active?point=28.5000,-81.4000',
      'https://api.weather.gov/alerts/active?point=29.1900,-82.1400',
    ])
    expect(clientAlerts(db, a.id)).toHaveLength(2)

    const down = (async () => new Response('busy', { status: 503 })) as unknown as typeof fetch
    expect(await pollNws(db, down)).toEqual({ points: 2, failures: 2 })
    expect(clientAlerts(db, a.id).map((r) => r.site_id)).toContain(a1.id)
  })

  it('builds the dashboard feed: threat levels, banner and one entry for all-site alerts', () => {
    const { a, a1, a2 } = setup()
    syncSiteAlerts(db, 'nws', a1, parseNws(nwsResponse({ id: 'urn:1', event: 'Flood Warning', severity: 'Severe' })))
    const watch = parseNws(nwsResponse({ id: 'urn:2', event: 'Tropical Storm Watch', severity: 'Moderate' }))
    syncSiteAlerts(db, 'nws', a1, [...parseNws(nwsResponse({ id: 'urn:1', event: 'Flood Warning', severity: 'Severe' })), ...watch])
    syncSiteAlerts(db, 'nws', a2, watch)

    const sites = [toSite(a1), toSite(a2)]
    const feed = liveFeed(sites, clientAlerts(db, a.id))
    expect(feed.demo).toBe(false)
    expect(feed.alerts.map((x) => [x.severity, x.siteId])).toEqual([
      ['HIGH', a1.id],
      ['MED', null],
    ])
    expect(feed.summaries[a1.id]).toEqual({ threatLevel: 'HIGH', activeAlertId: feed.alerts[0].id })
    expect(feed.summaries[a2.id]).toEqual({ threatLevel: 'ELEVATED', activeAlertId: null })
    expect(feed.summaries[ALL_SITES].threatLevel).toBe('HIGH')
    expect(feed.incidents.map((i) => [i.siteId, i.severity])).toEqual(
      expect.arrayContaining([
        [a1.id, 'HIGH'],
        [a2.id, 'MED'],
      ]),
    )
  })
})
