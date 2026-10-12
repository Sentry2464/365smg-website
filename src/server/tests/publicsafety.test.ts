import type { Database } from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import { clientAlerts } from '../alerts'
import { openDatabase } from '../core.mjs'
import { NTAS_FEED, parseNtas, parseWanted, pollNtas, pollWanted, wantedList } from '../publicsafety'
import { createClient, createSite } from '../store'

const ntas = (alerts = '') => `<?xml version="1.0" encoding="UTF-8"?><alerts>${alerts}</alerts>`
const advisory = `<alert start="2026/10/12 12:00" end="2099/01/01 12:00" type="Elevated Threat" link="https://www.dhs.gov/ntas/advisory/example">
  <summary><![CDATA[<p>Heightened threat environment across the United States.</p>]]></summary>
  <details>…</details></alert>`

const fbiItem = (uid: string, title: string, modified: string, extra: Record<string, unknown> = {}) => ({
  uid,
  title,
  url: `https://www.fbi.gov/wanted/example/${uid}`,
  subjects: ['Additional Violent Crimes'],
  reward_text: 'The FBI is offering a reward of up to $10,000.',
  images: [{ thumb: `https://www.fbi.gov/wanted/example/${uid}/@@images/image/thumb` }],
  field_offices: ['tampa'],
  modified,
  ...extra,
})

let db: Database
beforeEach(() => {
  db = openDatabase(':memory:')
})

describe('DHS NTAS', () => {
  it('reads advisories and treats an empty feed as none', () => {
    expect(parseNtas(ntas())).toEqual([])
    const [a] = parseNtas(ntas(advisory))
    expect(a).toMatchObject({ severity: 'MED', url: 'https://www.dhs.gov/ntas/advisory/example', area: 'United States' })
    expect(a.headline).toBe(
      'National Terrorism Advisory: Elevated Threat · Heightened threat environment across the United States.',
    )
    expect(parseNtas(ntas(advisory.replace('Elevated Threat', 'Imminent Threat')))[0].severity).toBe('HIGH')
    expect(() => parseNtas('<html/>')).toThrow()
  })

  it('shows an active advisory to every client, then clears it', async () => {
    const admin = { id: 'system' }
    const a = createClient(db, admin, { name: 'A', industry: 'HOA', industryPlural: '', managerEmail: '' })
    const b = createClient(db, admin, { name: 'B', industry: 'Office', industryPlural: '', managerEmail: '' })
    createSite(db, admin, a.id, { name: 'A1', city: 'Orlando, FL', timeZone: '', lat: '', lng: '' })
    createSite(db, admin, b.id, { name: 'B1', city: 'Tampa, FL', timeZone: '', lat: '', lng: '' })
    const serve = (xml: string) => (async (url: string) => {
      expect(url).toBe(NTAS_FEED)
      return new Response(xml, { headers: { 'content-type': 'application/rss+xml' } })
    }) as unknown as typeof fetch

    await pollNtas(db, serve(ntas(advisory)))
    expect(clientAlerts(db, a.id).map((r) => r.source)).toEqual(['ntas'])
    expect(clientAlerts(db, b.id)).toHaveLength(1)
    await pollNtas(db, serve(ntas()))
    expect(clientAlerts(db, a.id)).toEqual([])
  })
})

describe('FBI Wanted', () => {
  it('keeps FBI-hosted notices, newest first, and drops withdrawn ones on refresh', async () => {
    const items = parseWanted({
      total: 3,
      items: [
        fbiItem('a', 'JOHN DOE', '2026-09-01T00:00:00+00:00'),
        fbiItem('b', 'JANE ROE', '2026-10-01T00:00:00+00:00', { reward_text: '' }),
        fbiItem('c', 'ELSEWHERE', '2026-10-02T00:00:00+00:00', { url: 'https://example.com/x' }),
      ],
    })
    expect(items.map((i) => [i.title, i.reward])).toEqual([
      ['JANE ROE', null],
      ['JOHN DOE', 'The FBI is offering a reward of up to $10,000.'],
    ])

    expect(wantedList(db)).toEqual([]) // nothing fetched yet: card hidden
    let served = [fbiItem('a', 'JOHN DOE', '2026-09-01'), fbiItem('b', 'JANE ROE', '2026-10-01')]
    const fbi = (async (url: string) => {
      expect(url).toBe('https://api.fbi.gov/wanted/v1/list?field_offices=tampa&pageSize=50')
      return Response.json({ total: served.length, items: served })
    }) as unknown as typeof fetch
    await pollWanted(db, fbi)
    expect(wantedList(db)[0]).toMatchObject({ office: 'tampa', total: 2 })

    served = [fbiItem('b', 'JANE ROE', '2026-10-01')]
    await pollWanted(db, fbi)
    expect(wantedList(db)[0].items.map((i) => i.uid)).toEqual(['b'])
  })
})
