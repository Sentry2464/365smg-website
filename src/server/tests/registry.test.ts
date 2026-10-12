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
    expect(registryNear(db, other.id)).toBeNull() // not opted in

    // Next file no longer lists #1: gone. Turning the client off drops the county entirely.
    await pollRegistry(db, fakeFetch([HEADER, person('4', 'GONE', 'Absconded', 'Offender', '7 TEMP ST', true)].join('\n')).impl)
    expect(registryNear(db, c.id)!.people.map((p) => p.id)).toEqual(['4'])
    setRegistryEnabled(db, admin, c.id, false)
    await pollRegistry(db, fakeFetch(csv).impl)
    expect((db.prepare('SELECT COUNT(*) AS n FROM registrants').get() as { n: number }).n).toBe(0)
  })
})
