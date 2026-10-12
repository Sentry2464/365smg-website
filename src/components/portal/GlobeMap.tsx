'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { usePortal } from './context'
import { distanceMi } from '@/lib/geo'
import type { Storm } from '@/server/storms'
import { ALL_SITES, type Alert, type Site, type SiteId } from './data'

// The intel map as God's Eye View (gods-eye-view), framed in embed mode. The globe runs
// on its own VM; the portal tells it what to show with gev:view messages: the camera on
// the client's sites, their sites as pins, and the layers picked with the pills.
// Protocol: docs/TOOLS.md "Embed mode" in the gods-eye-view repo.

const LAYERS = {
  Weather: ['weather-radar', 'weather-lightning'],
  Hurricanes: ['weather-cyclones'],
  Fires: ['fire-perimeters'],
  Earthquakes: ['earthquakes'],
  Flights: ['flights'],
  Cameras: ['cctv'],
} as const
type Layer = keyof typeof LAYERS

// Set when someone turns Hurricanes off, so the auto-on doesn't come back this session.
const HURRICANES_OFF = 'smg-hurricanes-off'
const readHurricanesOff = () => {
  try {
    return sessionStorage.getItem(HURRICANES_OFF) === '1'
  } catch {
    return false
  }
}
const noSubscribe = () => () => {}

const MAX_PINS = 24 // the embed accepts at most 24 annotations

type Located = Site & { lat: number; lng: number }

/** Camera over one site, or high enough to take in all of them. */
function cameraFor(sites: Located[]) {
  const lat = sites.reduce((a, s) => a + s.lat, 0) / sites.length
  const lon = sites.reduce((a, s) => a + s.lng, 0) / sites.length
  // Rough spread in km (1° ≈ 111 km), then pull back far enough to see it with margin.
  const spreadKm = Math.max(
    ...sites.map((s) => Math.hypot(s.lat - lat, (s.lng - lon) * Math.cos((lat * Math.PI) / 180)) * 111),
  )
  const altitude_m = Math.round(Math.max(25_000, spreadKm * 3_000))
  return { lat, lon, altitude_m, heading_deg: 0, pitch_deg: -60 }
}

/** Camera looking down on the sites and the storms together (at most 6,000 km up). */
function cameraWithStorms(sites: Located[], storms: Storm[]) {
  const pts = [...sites.map((s) => [s.lat, s.lng]), ...storms.map((s) => [s.lat, s.lng])]
  const lats = pts.map((p) => p[0])
  const lngs = pts.map((p) => p[1])
  const [south, north, west, east] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)]
  const lat = (south + north) / 2
  const lon = (west + east) / 2
  const spanKm = Math.max((north - south) * 111, (east - west) * 111 * Math.cos((lat * Math.PI) / 180))
  const altitude_m = Math.round(Math.min(6_000_000, Math.max(250_000, spanKm * 1_400)))
  return { lat, lon, altitude_m, heading_deg: 0, pitch_deg: -85 }
}


/** Alerts with their own location (police calls) as pins, worst first, one per place and title. */
function incidentPins(alerts: Alert[]) {
  const seen = new Set<string>()
  const pins = []
  for (const a of alerts) {
    if (a.lat == null || a.lng == null) continue
    const key = `${a.lat},${a.lng},${a.title}`
    if (seen.has(key)) continue
    seen.add(key)
    pins.push({
      type: 'pin',
      latitude: a.lat,
      longitude: a.lng,
      label: `${a.nearby ? 'Nearby: ' : ''}${a.title} · ${a.source}`.slice(0, 120),
      // Nearby context in a muted colour; at-site alerts by severity.
      color: a.nearby ? 'green' : a.severity === 'HIGH' ? 'red' : 'amber',
    })
  }
  return pins
}

export function GlobeMap({
  siteId,
  url,
  alerts,
  storms,
  localCameras,
}: {
  siteId: SiteId
  url: string
  alerts: Alert[]
  /** NHC active storms; null when the list isn't available. */
  storms: Storm[] | null
  /** True once God's Eye has public cameras near the client sites (SMG_GLOBE_LOCAL_CAMERAS=1). */
  localCameras: boolean
}) {
  const { sites } = usePortal()
  const frame = useRef<HTMLIFrameElement>(null)
  const seq = useRef(0)
  const lastSent = useRef('')
  const lastAcked = useRef('')
  const retry = useRef<ReturnType<typeof setTimeout>>(undefined)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  // Hurricanes starts on while an Atlantic storm is active, unless turned off this session.
  const atlantic = !!storms?.some((s) => s.basin === 'AL')
  const dismissed = useSyncExternalStore(noSubscribe, readHurricanesOff, () => false)
  const [hurricanes, setHurricanes] = useState<boolean | null>(null) // null: not picked yet
  const [picked, setPicked] = useState<Record<Exclude<Layer, 'Hurricanes'>, boolean>>({
    Weather: true,
    Fires: false,
    Earthquakes: true,
    Flights: false,
    Cameras: false,
  })
  const layers = useMemo(
    () => ({ ...picked, Hurricanes: hurricanes ?? (atlantic && !dismissed) }),
    [picked, hurricanes, atlantic, dismissed],
  )
  const origin = new URL(url).origin

  const toggle = (l: Layer) => {
    if (l !== 'Hurricanes') return setPicked((s) => ({ ...s, [l]: !s[l] }))
    const on = !layers.Hurricanes
    setHurricanes(on)
    try {
      if (on) sessionStorage.removeItem(HURRICANES_OFF)
      else sessionStorage.setItem(HURRICANES_OFF, '1')
    } catch {
      // no storage: the choice lasts until the page reloads
    }
  }

  const located = useMemo(() => sites.filter((s): s is Located => s.lat != null && s.lng != null), [sites])
  const activeStorms = layers.Hurricanes && storms?.length ? storms : null

  const send = useCallback(() => {
    const win = frame.current?.contentWindow
    if (!win || located.length === 0) return
    const focus = siteId === ALL_SITES ? located : located.filter((s) => s.id === siteId)
    const view = {
      camera: activeStorms
        ? cameraWithStorms(focus.length ? focus : located, activeStorms)
        : cameraFor(focus.length ? focus : located),
      layers: (Object.keys(LAYERS) as Layer[]).filter((l) => layers[l]).flatMap((l) => LAYERS[l]),
      annotations: [...located.map((s) => {
        // Worst alert at the site colours its pin and names the event.
        const hit = alerts.find((a) => !a.nearby && (a.siteId === s.id || a.siteId === null))
        const color = hit?.severity === 'HIGH' ? 'red' : hit?.severity === 'MED' ? 'amber' : s.id === siteId ? 'cyan' : 'primary'
        return {
          type: 'pin',
          latitude: s.lat,
          longitude: s.lng,
          label: (hit ? `${s.name} · ${hit.title}` : s.name).slice(0, 120),
          color,
        }
      }), ...incidentPins(alerts)].slice(0, MAX_PINS),
    }
    const id = `smg-${++seq.current}`
    const post = () => win.postMessage({ type: 'gev:view', id, view }, origin)
    lastSent.current = id
    post()
    // Each view replaces the last one; resend once if the globe doesn't acknowledge it.
    clearTimeout(retry.current)
    retry.current = setTimeout(() => {
      if (lastAcked.current !== id && lastSent.current === id) post()
    }, 10_000)
  }, [located, siteId, layers, origin, alerts, activeStorms])

  useEffect(() => () => clearTimeout(retry.current), [])

  // On a full page load the frame can finish (and say gev:ready) before this component
  // hydrates, so neither the message nor onLoad reaches it: send once after mounting too.
  const latestSend = useRef(send)
  useEffect(() => {
    latestSend.current = send
  }, [send])
  useEffect(() => {
    const t = setTimeout(() => latestSend.current(), 1500)
    return () => clearTimeout(t)
  }, [])

  // Listen only to the framed globe, from its own origin.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== origin || e.source !== frame.current?.contentWindow) return
      if (e.data?.type === 'gev:ready') setReady(true)
      if (e.data?.type === 'gev:view-applied') {
        lastAcked.current = String(e.data.id)
        setReady(true)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [origin])

  // If the globe never says it's ready, say so rather than show an empty box.
  useEffect(() => {
    if (ready) return
    const t = setTimeout(() => setFailed(true), 20_000)
    return () => clearTimeout(t)
  }, [ready])

  useEffect(() => {
    if (ready) send()
  }, [ready, send])

  const embedUrl = new URL(url)
  embedUrl.searchParams.set('embed', '1')

  return (
    <section className="cp-card cp-map cp-area-map" aria-labelledby="cp-map-title">
      <div className="cp-map__head">
        <h2 id="cp-map-title" className="cp-card__title">
          Intel map · God&apos;s Eye
        </h2>
        <div className="cp-pills" role="group" aria-label="Map layers">
          {(Object.keys(LAYERS) as Layer[]).map((l) => (
            <button
              key={l}
              type="button"
              className="cp-pill"
              aria-pressed={layers[l]}
              onClick={() => toggle(l)}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="cp-map__body">
        <div className="cp-map__canvas cp-globe">
          <iframe
            ref={frame}
            src={embedUrl.toString()}
            title="Map of your sites with weather, hurricanes, fires, earthquakes, flights and cameras"
            className="cp-globe__frame"
            allow="fullscreen"
            referrerPolicy="strict-origin"
            sandbox="allow-scripts allow-same-origin allow-popups"
            // gev:ready is sent once; if this component remounts after it, the globe's
            // listener is already up, so send the view shortly after load as well.
            onLoad={() => setTimeout(() => latestSend.current(), 1500)}
          />
          {!ready && (
            <p className="cp-globe__status" role="status">
              {failed ? 'The map is unavailable right now. Your alerts below are unaffected.' : 'Loading map…'}
            </p>
          )}
        </div>
        <div className="cp-legend">
          <span>
            <i className="cp-legend__site" />
            Your sites
          </span>
          <span className="cp-legend__hint">Radar: NOAA · Hurricanes: NHC · Quakes: USGS · Flights: adsb.lol · Cameras: public DOT feeds</span>
        </div>
        {layers.Cameras && !localCameras && (
          <p className="cp-meta cp-storms__note">No public cameras in this area yet.</p>
        )}
        {layers.Hurricanes && <StormList storms={storms} sites={located} />}
      </div>
    </section>
  )
}

/** Active storms under the map: name, strength, distance to the nearest site, NHC advisory. */
function StormList({ storms, sites }: { storms: Storm[] | null; sites: Located[] }) {
  if (storms === null) return <p className="cp-meta cp-storms__note">Storm information is unavailable right now.</p>
  if (storms.length === 0) return <p className="cp-meta cp-storms__note">No active tropical storms.</p>
  return (
    <ul className="cp-storms" aria-label="Active tropical storms">
      {storms.map((s) => {
        const near = sites
          .map((site) => ({ site, mi: distanceMi(s, site) }))
          .sort((a, b) => a.mi - b.mi)[0]
        return (
          <li key={s.id}>
            <span className="cp-storms__name">{s.name}</span>
            <span className="cp-meta">
              {s.label}
              {s.windKt ? ` · ${Math.round(s.windKt * 1.15078)} mph` : ''}
              {near ? ` · ${Math.round(near.mi).toLocaleString('en-US')} mi from ${near.site.name}` : ''}
            </span>
            <a href={s.advisoryUrl} target="_blank" rel="noopener noreferrer">
              NHC advisory
            </a>
          </li>
        )
      })}
    </ul>
  )
}
