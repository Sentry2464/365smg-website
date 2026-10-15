import { describe, expect, it } from 'vitest'
import { cameraFor, layersFor, pinsFor } from './embed'

describe('client edition embed protocol', () => {
  it('maps portal layers and switches everything else off', () => {
    const l = layersFor(['cctv', 'earthquakes', 'nonsense', 4])
    expect(l).toMatchObject({ cctv: true, cctv_previews: true, earthquakes: true, flights: false, fires: false, weather: false })
    expect(layersFor('x')).toMatchObject({ cctv: false })
  })

  it('turns a God’s Eye camera into a MapLibre one', () => {
    expect(cameraFor({ lat: 28.5, lon: -81.4, altitude_m: 40_000, heading_deg: 0, pitch_deg: -60 })).toEqual({
      lat: 28.5,
      lng: -81.4,
      zoom: Math.log2(1000),
      bearing: 0,
      pitch: 30,
    })
    expect(cameraFor({ lat: 28.5, lon: -81.4, altitude_m: 6e6, pitch_deg: -85 })!.zoom).toBeCloseTo(2.74, 1)
    expect(cameraFor({ lat: 99, lon: 0, altitude_m: 1000 })).toBeNull()
    expect(cameraFor(null)).toBeNull()
  })

  it('keeps at most 24 valid pins', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ type: 'pin', latitude: 28, longitude: -81 + i / 100, label: `p${i}` }))
    expect(pinsFor(many)).toHaveLength(24)
    expect(pinsFor([{ type: 'pin', latitude: 'x', longitude: 1 }, { type: 'line' }])).toEqual([])
  })
})
