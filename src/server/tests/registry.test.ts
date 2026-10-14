import type { Database } from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import { openDatabase } from '../core.mjs'
import { parseCsv, pollRegistry, publishedAddress, registryNear } from '../registry'
import { createClient, createSite, setRegistryEnabled } from '../store'

// FDLE public data file header (12 Oct 2026), with placeholder people.
const HEADER =
  'PERSON_NBR,FIRST_NAME,MIDDLE_NAME,LAST_NAME,SUFFIX_NAME,STATUS,SUBJECT_TYPE,RACE,SEX,EYE_COLOR,HAIR,HEIGHT,WEIGHT,BIRTH_DATE,DC_NUMBER,PERM_ADDRESS_ADDED,PERM_ADDRESS_LINE_1,PERM_ADDRESS_LINE_2,PERM_CITY,PERM_STATE,PERM_ZIP5,PERM_ZIP4,PERM_COUNTY,TEMP_ADDRESS_ADDED,TEMP_ADDRESS_LINE_1,TEMP_ADDRESS_LINE_2,TEMP_CITY,TEMP_STATE,TEMP_ZIP5,TEMP_ZIP4,TEMP_COUNTY,TRANS_ADDRESS_ADDED,TRANS_ADDRESS_LINE_1,TRANS_ADDRESS_LINE_2,TRANS_CITY,TRANS_STATE,TRANS_ZIP5,TRANS_ZIP4,TRANS_COUNTY,VICTIM_MINOR,IMAGE_URL'
const person = (nbr: string, last: string, status: string, type: string, street: string, temp = false) => {
  const addr = [`01/01/2020`, street, '', 'ORLANDO', 'FL', '32801', '', 'ORANGE']
  const blank = ['', '', '', '', '', '', '', '']
  const [perm, tmp] = temp ? [blank, addr] : [addr, blank]
  return [nbr, 'FIRST', '', last, '', status, type, 'X', 'X', 'X', 'X', `5'10"`, '180', '01/01/1980', 'X1', ...perm, ...tmp, ...blank, 'No', 'https://offender.fdle.state.fl.us/offender/CallImage?imgID=1']
    .map((v) => (/[",]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v))
    .join(',')
}

const SITE = { lat: 28.54, lng: -81.38 }
const POINTS: Record<string, [number, number] | null> = {
  '1': [28.545, -81.38], // ~0.35 mi
  '2': [28.6, -81.38], // ~4 mi
  '3': [28.541, -81.381], // near, but Confinement
  '4': [28.542, -81.379], // near, Absconded, temporary address
}

function fakeFetch(csv: string) {
  const asked: string[] = []
  const impl = (async (url: string, init?: RequestInit) => {
    asked.push(url)
    if (url.includes('/geographies/coordinates')) return Response.json({ result: { geographies: { Counties: [{ BASENAME: 'Orange', STATE: '12' }] } } })
    if (url.includes('publicDataFile.jsf')) return new Response(csv)
    if (url.includes('addressbatch')) {
      const file = await ((init!.body as FormData).get('addressFile') as Blob).text()
      return new Response(
        file
          .split('\n')
          .map((l) => {
            const id = /^"([^"]+)"/.exec(l)![1]
            const p = POINTS[id]
            return p ? `"${id}","x","Match","Exact","x","${p[1]},${p[0]}","1","L"` : `"${id}","x","No_Match"`
          })
          .join('\n'),
      )
    }
    throw new Error(`unexpected ${url}`)
  }) as unknown as typeof fetch
  return { impl, asked }
}

let db: Database
beforeEach(() => {
  db = openDatabase(':memory:')
})

describe('FDLE registry', () => {
  it('parses the CSV and picks the published address', () => {
    const rows = parseCsv([HEADER, person('1', 'DOE', 'Released - Subject to Registration', 'Offender', '1 MAIN ST, UNIT "A"')].join('\r\n'))
    expect(rows).toHaveLength(1)
    expect(rows[0].PERM_ADDRESS_LINE_1).toBe('1 MAIN ST, UNIT "A"')
    expect(rows[0].HEIGHT).toBe(`5'10"`)
    expect(publishedAddress(rows[0])).toMatchObject({ type: 'Permanent', display: '1 MAIN ST, UNIT "A", ORLANDO, FL 32801' })
    expect(() => parseCsv('<html>error</html>')).toThrow()
  })

  it('only downloads for opted-in clients, and shows nearby people unaltered', async () => {
    const admin = { id: 'system' }
    const c = createClient(db, admin, { name: 'Lofts', industry: 'Residential', industryPlural: '', managerEmail: '' })
    const other = createClient(db, admin, { name: 'Other', industry: 'Office', industryPlural: '', managerEmail: '' })
    createSite(db, admin, c.id, { name: 'Lofts', city: 'Orlando, FL', timeZone: '', lat: String(SITE.lat), lng: String(SITE.lng) })
    createSite(db, admin, other.id, { name: 'Other', city: 'Orlando, FL', timeZone: '', lat: String(SITE.lat), lng: String(SITE.lng) })
    const csv = [
      HEADER,
      person('1', 'NEAR', 'Released - Subject to Registration', 'Predator', '100 MAIN ST'),
      person('2', 'FAR', 'Released - Subject to Registration', 'Offender', '900 FAR RD'),
      person('3', 'INSIDE', 'Confinement', 'Offender', '5 JAIL WAY'),
      person('4', 'GONE', 'Absconded', 'Offender', '7 TEMP ST', true),
    ].join('\n')

    // Nobody opted in: nothing downloaded, nothing shown.
    const none = fakeFetch(csv)
    await pollRegistry(db, none.impl)
    expect(none.asked.some((u) => u.includes('publicDataFile'))).toBe(false)
    expect(registryNear(db, c.id)).toBeNull()

    setRegistryEnabled(db, admin, c.id, true)
    const run = fakeFetch(csv)
    await pollRegistry(db, run.impl)
    expect(run.asked.find((u) => u.includes('publicDataFile'))).toBe(
      'https://offender.fdle.state.fl.us/offender/publicDataFile.jsf?email=admin%40365securitymg.com&county=Orange&mode=auto',
    )
    const view = registryNear(db, c.id)!
    expect(view.asOf).toBeTruthy()
    expect(view.people.map((p) => [p.name, p.subjectType, p.status, p.addressType])).toEqual([
      ['FIRST GONE', 'Offender', 'Absconded', 'Temporary'], // closest first
      ['FIRST NEAR', 'Predator', 'Released - Subject to Registration', 'Permanent'],
    ])
    expect(view.expanded).toBe(false)
    // Each carries its geocoded position, for the intel map's numbered Registry pins.
    expect(view.people.every((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))).toBe(true)
    expect(registryNear(db, other.id)).toBeNull() // not opted in

    // Next file no longer lists #1: gone. Turning the client off drops the county entirely.
    await pollRegistry(db, fakeFetch([HEADER, person('4', 'GONE', 'Absconded', 'Offender', '7 TEMP ST', true)].join('\n')).impl)
    expect(registryNear(db, c.id)!.people.map((p) => p.id)).toEqual(['4'])

    // Nobody within 1 mi: the nearest within 5 mi are shown, marked as expanded.
    await pollRegistry(db, fakeFetch([HEADER, person('2', 'FAR', 'Released - Subject to Registration', 'Offender', '900 FAR RD')].join('\n')).impl)
    const wider = registryNear(db, c.id)!
    expect(wider).toMatchObject({ expanded: true, maxRadiusMi: 5 })
    expect(wider.people.map((p) => p.id)).toEqual(['2'])
    setRegistryEnabled(db, admin, c.id, false)
    await pollRegistry(db, fakeFetch(csv).impl)
    expect((db.prepare('SELECT COUNT(*) AS n FROM registrants').get() as { n: number }).n).toBe(0)
  })

  it('keeps going and keeps data when a lookup or download fails', async () => {
    const admin = { id: 'system' }
    const c = createClient(db, admin, { name: 'Two', industry: 'Office', industryPlural: '', managerEmail: '' })
    createSite(db, admin, c.id, { name: 'Orlando', city: 'Orlando, FL', timeZone: '', lat: String(SITE.lat), lng: String(SITE.lng) })
    createSite(db, admin, c.id, { name: 'Sanford', city: 'Sanford, FL', timeZone: '', lat: '28.8', lng: '-81.27' })
    setRegistryEnabled(db, admin, c.id, true)
    const csv = [HEADER, person('1', 'NEAR', 'Released - Subject to Registration', 'Predator', '100 MAIN ST')].join('\n')
    const ok = fakeFetch(csv)
    const counties = (async (url: string, init?: RequestInit) =>
      url.includes('/geographies/coordinates')
        ? Response.json({ result: { geographies: { Counties: [{ BASENAME: url.includes('y=28.8') ? 'Seminole' : 'Orange', STATE: '12' }] } } })
        : ok.impl(url, init)) as unknown as typeof fetch
    expect((await pollRegistry(db, counties)).errors).toEqual([])

    // Census down for Sanford's lookup and FDLE failing for Orange: both errors are reported and
    // neither county's data is dropped.
    db.prepare(`DELETE FROM feed_cache WHERE key LIKE 'county:28.8%'`).run()
    const flaky = (async (url: string, init?: RequestInit) => {
      if (url.includes('/geographies/coordinates')) return new Response('busy', { status: 503 })
      if (url.includes('county=Orange')) return new Response('busy', { status: 503 })
      return counties(url, init)
    }) as unknown as typeof fetch
    const r = await pollRegistry(db, flaky)
    expect(r.counties).toEqual(['Orange'])
    expect(r.errors).toHaveLength(2)
    expect((db.prepare('SELECT county FROM registry_imports ORDER BY county').all() as { county: string }[]).map((x) => x.county)).toEqual([
      'Orange',
      'Seminole',
    ])
    expect(registryNear(db, c.id)!.people.map((p) => p.id)).toEqual(['1'])
  })

  it('turns new clients on with SMG_REGISTRY_DEFAULT=1 and asks for a run when sites change', () => {
    const admin = { id: 'system' }
    const requested = () => !!db.prepare(`SELECT 1 FROM feed_cache WHERE key = 'registry:requested'`).get()
    const off = createClient(db, admin, { name: 'Off', industry: 'Office', industryPlural: '', managerEmail: '' })
    createSite(db, admin, off.id, { name: 'A', city: 'Orlando, FL', timeZone: '', lat: '28.5', lng: '-81.4' })
    expect(requested()).toBe(false)

    process.env.SMG_REGISTRY_DEFAULT = '1'
    try {
      const on = createClient(db, admin, { name: 'On', industry: 'Office', industryPlural: '', managerEmail: '' })
      expect(registryNear(db, on.id)).not.toBeNull()
      expect(registryNear(db, off.id)).toBeNull()
      db.prepare(`DELETE FROM feed_cache WHERE key = 'registry:requested'`).run()
      createSite(db, admin, on.id, { name: 'B', city: 'Sanford, FL', timeZone: '', lat: '28.8', lng: '-81.27' })
      expect(requested()).toBe(true)
      const audit = db.prepare(`SELECT detail FROM audit_log WHERE action = 'client.registry_on' AND client_id = ?`).get(on.id) as {
        detail: string
      }
      expect(JSON.parse(audit.detail)).toEqual({ via: 'default' })
    } finally {
      delete process.env.SMG_REGISTRY_DEFAULT
    }
  })
})
