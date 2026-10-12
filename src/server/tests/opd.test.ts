import type { Database } from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import { clientAlerts } from '../alerts'
import { openDatabase } from '../core.mjs'
import { classify, easternToIso, geocodeQuery, OPD_FEED, parseOpd, pollOpd } from '../opd'
import { createClient, createSite } from '../store'

// Trimmed copy of the real feed's shape (12 Oct 2026), including the UTF-8 BOM.
const feed = (...calls: [string, string, string, string][]) =>
  '﻿<?xml version="1.0" encoding="utf-8"?><?xml-stylesheet type="text/xsl" href="genhtmlpolice.xslt"?>' +
  '<CALLS xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
  calls
    .map(
      ([id, date, desc, loc]) =>
        `<CALL incident="${id}"><DATE>${date}</DATE><DESC>${desc}</DESC><LOCATION>${loc}</LOCATION><DISTRICT>F2</DISTRICT></CALL>`,
    )
    .join('') +
  '</CALLS>'

const SOUTH_ST = { lat: 28.5386, lng: -81.3925 } // geocoded point for 1200 W South St

function fakeFetch(xml: string, geocoded: Record<string, { lat: number; lng: number } | null>) {
  const asked: string[] = []
  const impl = (async (url: string) => {
    asked.push(url)
    if (url === OPD_FEED) return new Response(xml, { headers: { 'content-type': 'text/xml' } })
    const address = new URL(url).searchParams.get('address')!
    const p = geocoded[address]
    return Response.json({ result: { addressMatches: p ? [{ coordinates: { x: p.lng, y: p.lat } }] : [] } })
  }) as unknown as typeof fetch
  return { impl, asked }
}

let db: Database
beforeEach(() => {
  db = openDatabase(':memory:')
})

describe('Orlando PD feed', () => {
  it('parses calls, local times and locations', () => {
    const calls = parseOpd(
      feed(
        ['2026-00370705', '10/12/2026 10:41', 'Suspicious incident', '1200 BLOCK W SOUTH ST'],
        ['2026-00370686', '10/12/2026 10:33', 'Signal out', 'VINELAND RD / L B MCLEOD RD'],
      ),
    )
    expect(calls).toHaveLength(2)
    expect(calls[0]).toMatchObject({ incident: '2026-00370705', desc: 'Suspicious incident', date: '2026-10-12T14:41:00.000Z' })
    expect(easternToIso('01/15/2027 08:00')).toBe('2027-01-15T13:00:00.000Z') // EST
    expect(() => parseOpd('<html></html>')).toThrow()
  })

  it('keeps crime calls only and geocodes block addresses', () => {
    expect(classify('Armed robbery')).toBe('HIGH')
    expect(classify('Shooting')).toBe('HIGH')
    expect(classify('Vandalism/criminal mischief')).toBe('MED')
    expect(classify('Suspicious incident')).toBe('MED')
    expect(classify('Signal out')).toBeNull()
    expect(classify('Hit and run (minor)')).toBeNull()
    expect(geocodeQuery('1200 BLOCK W SOUTH ST')).toBe('1200 W SOUTH ST, Orlando, FL')
    expect(geocodeQuery('VINELAND RD / L B MCLEOD RD')).toBeNull()
  })

  it('links nearby calls to sites, caches geocodes and keeps calls after they leave the feed', async () => {
    const admin = { id: 'system' }
    const c = createClient(db, admin, { name: 'Downtown Lofts', industry: 'Residential', industryPlural: '', managerEmail: '' })
    const near = createSite(db, admin, c.id, { name: 'Lofts', city: 'Orlando, FL', timeZone: '', lat: '28.5400', lng: '-81.3900' })
    const far = createSite(db, admin, c.id, { name: 'Lake Nona', city: 'Orlando, FL', timeZone: '', lat: '28.3995', lng: '-81.2431' })

    const now = new Date()
    const local = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(now)
    const v = (t: string) => local.find((p) => p.type === t)!.value
    const stamp = `${v('month')}/${v('day')}/${v('year')} ${v('hour')}:${v('minute')}`

    const xml = feed(
      ['2026-1', stamp, 'Vandalism/criminal mischief', '1200 BLOCK W SOUTH ST'],
      ['2026-2', stamp, 'Signal out', '1300 BLOCK W SOUTH ST'],
      ['2026-3', stamp, 'Burglary', 'ORANGE AVE / CHURCH ST'],
    )
    const first = fakeFetch(xml, { '1200 W SOUTH ST, Orlando, FL': SOUTH_ST })
    expect(await pollOpd(db, first.impl)).toEqual({ calls: 3, geocoded: 1 })

    const rows = clientAlerts(db, c.id)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ site_id: near.id, severity: 'MED', source: 'opd', lat: SOUTH_ST.lat })
    expect(rows[0].distance_mi).toBeLessThan(0.3)
    expect(rows.some((r) => r.site_id === far.id)).toBe(false)

    // Second run: cached geocode, and the call has rolled off the feed but stays for 12 hours.
    const second = fakeFetch(feed(), {})
    await pollOpd(db, second.impl)
    expect(second.asked).toEqual([OPD_FEED])
    expect(clientAlerts(db, c.id)).toHaveLength(1)
    expect(clientAlerts(db, c.id, new Date(now.getTime() + 13 * 3_600_000))).toEqual([])
  })
})
