/*
 * 365 SMG client edition: the embed protocol the client portal speaks (the same
 * one God's Eye View used, so the portal's map card works unchanged).
 *
 *   globe  → portal  { type: 'gev:ready' }                      once the map is up
 *   portal → globe   { type: 'gev:view', id, view }             camera, layers, pins
 *   globe  → portal  { type: 'gev:view-applied', id }           after applying it
 *
 * view = { camera: { lat, lon, altitude_m, heading_deg, pitch_deg },
 *          layers: string[],                                    portal layer ids
 *          annotations: { type: 'pin', latitude, longitude, label, color }[] }  (≤ 24)
 */

/** Portal layer ids → this map's layer keys. */
export const LAYER_MAP: Record<string, string[]> = {
  'weather-radar': ['weather', 'live_clouds'],
  'weather-lightning': [],
  'weather-cyclones': ['weather'],
  'fire-perimeters': ['fires'],
  earthquakes: ['earthquakes'],
  flights: ['flights'],
  cctv: ['cctv', 'cctv_previews'],
};

/** Every map layer the portal can switch; anything else stays off. */
export const CLIENT_LAYERS = [...new Set(Object.values(LAYER_MAP).flat())]

export type Layers = Record<string, boolean>

export function layersFor(portalIds: unknown): Layers {
  const on = new Set(
    (Array.isArray(portalIds) ? portalIds : []).flatMap((id) => (typeof id === 'string' ? (LAYER_MAP[id] ?? []) : [])),
  )
  return Object.fromEntries(CLIENT_LAYERS.map((k) => [k, on.has(k)]))
}

export interface Camera {
  lat: number
  lng: number
  zoom: number
  bearing: number
  pitch: number
}

const num = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null)
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/**
 * God's Eye camera → MapLibre camera. Altitude becomes zoom (about 40 km up is zoom 10, a
 * metro area; 4,000 km is zoom 3.3, a continent); pitch -90 (straight down) becomes 0.
 */
export function cameraFor(c: unknown): Camera | null {
  const cam = (c ?? {}) as Record<string, unknown>
  const lat = num(cam.lat, -90, 90)
  const lng = num(cam.lon, -180, 180)
  const alt = num(cam.altitude_m, 1, 5e7)
  if (lat === null || lng === null || alt === null) return null
  return {
    lat,
    lng,
    zoom: clamp(Math.log2(4e7 / alt), 1.5, 16),
    bearing: num(cam.heading_deg, -360, 360) ?? 0,
    pitch: clamp(90 + (num(cam.pitch_deg, -90, 0) ?? -90), 0, 60),
  }
}

export interface Pin {
  lat: number
  lng: number
  label: string
}

/** Up to 24 labelled pins; anything malformed is dropped. */
export function pinsFor(annotations: unknown): Pin[] {
  if (!Array.isArray(annotations)) return []
  return annotations.slice(0, 24).flatMap((a) => {
    const lat = num(a?.latitude, -90, 90)
    const lng = num(a?.longitude, -180, 180)
    if (a?.type !== 'pin' || lat === null || lng === null) return []
    return [{ lat, lng, label: String(a.label ?? '').slice(0, 120) }]
  })
}
