import { describe, expect, it } from 'vitest'
import { incidentPins } from '@/components/portal/GlobeMap'
import type { Alert } from '@/components/portal/data'

describe('intel map alert pins', () => {
  it('label each police call with its distance from the matched site', () => {
    const base = { severity: 'MED' as const, time: '1h ago', source: 'Orlando PD', url: '', lat: 28.5, lng: -81.3 }
    const alerts = [
      { ...base, id: 'a@s1', title: 'Vandalism · 4600 Block Summeroak St', siteId: 's1', nearby: true, distanceMi: 7.3 },
      { ...base, id: 'b@s1', title: 'Suspicious incident', siteId: 's1', distanceMi: 0.4, severity: 'HIGH' as const, lat: 28.4 },
      { ...base, id: 'c', title: 'Statewide', siteId: null, lat: 28.3 },
    ] as Alert[]
    const names = new Map([['s1', 'RCP Community']])
    expect(incidentPins(alerts, true, names).map((p) => p.label)).toEqual([
      'Nearby: Vandalism · 4600 Block Summeroak St · 7.3 mi from RCP Community · Orlando PD',
    ])
    expect(incidentPins(alerts, false, names).map((p) => [p.label, p.color])).toEqual([
      ['Suspicious incident · 0.4 mi from RCP Community · Orlando PD', 'red'],
      ['Statewide · Orlando PD', 'amber'],
    ])
  })
})
