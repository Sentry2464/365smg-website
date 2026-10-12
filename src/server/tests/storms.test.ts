import type { Database } from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import { openDatabase } from '../core.mjs'
import { hurricaneCategory, NHC_STORMS, parseStorms, pollStorms, stormList } from '../storms'

// Shape of NHC's CurrentStorms.json (trimmed).
const nhc = {
  activeStorms: [
    {
      id: 'al142026',
      binNumber: 'AT4',
      name: 'Milton',
      classification: 'HU',
      intensity: '105',
      pressure: '955',
      latitude: '24.1N',
      longitude: '85.9W',
      latitudeNumeric: 24.1,
      longitudeNumeric: -85.9,
      lastUpdate: '2026-10-12T21:00:00.000Z',
      publicAdvisory: { advNum: '12', url: 'https://www.nhc.noaa.gov/text/refresh/MIATCPAT4+shtml/122100.shtml' },
    },
    {
      id: 'ep202026',
      name: 'Xavier',
      classification: 'TS',
      intensity: '45',
      latitude: '15.0N',
      longitude: '105.5W',
      publicAdvisory: { url: 'https://evil.example/advisory' },
    },
    { id: 'al992026', name: 'Broken', classification: 'TD' },
  ],
}

let db: Database
beforeEach(() => {
  db = openDatabase(':memory:')
})

describe('NHC storms', () => {
  it('parses active storms with basin, strength and an NHC-only link', () => {
    const storms = parseStorms(nhc)
    expect(storms).toHaveLength(2)
    expect(storms[0]).toMatchObject({
      id: 'al142026',
      basin: 'AL',
      lat: 24.1,
      lng: -85.9,
      windKt: 105,
      label: 'Category 3 hurricane',
    })
    expect(storms[0].advisoryUrl).toMatch(/^https:\/\/www\.nhc\.noaa\.gov\//)
    // Text coordinates, East Pacific, and a link that isn't NHC's is replaced.
    expect(storms[1]).toMatchObject({ basin: 'EP', lat: 15, lng: -105.5, label: 'Tropical storm' })
    expect(storms[1].advisoryUrl).toBe('https://www.nhc.noaa.gov/')
    expect(parseStorms({ activeStorms: [] })).toEqual([])
    expect(() => parseStorms({})).toThrow()
  })

  it('maps wind to Saffir-Simpson categories', () => {
    expect([63, 64, 83, 96, 113, 137].map(hurricaneCategory)).toEqual([null, 1, 2, 3, 4, 5])
  })

  it('caches the list and keeps it when NHC is down, until it is stale', async () => {
    expect(stormList(db)).toBeNull()
    const asked: string[] = []
    const ok = (async (url: string) => {
      asked.push(url)
      return Response.json(nhc)
    }) as unknown as typeof fetch
    await pollStorms(db, ok)
    expect(asked).toEqual([NHC_STORMS])
    expect(stormList(db)?.map((s) => s.name)).toEqual(['Milton', 'Xavier'])

    const down = (async () => new Response('busy', { status: 503 })) as unknown as typeof fetch
    await pollStorms(db, down, { tries: 1 })
    expect(stormList(db)).toHaveLength(2)
    expect(stormList(db, new Date(Date.now() + 13 * 3600_000))).toBeNull()
  })
})
