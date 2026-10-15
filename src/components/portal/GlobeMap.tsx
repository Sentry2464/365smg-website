'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { usePortal } from './context'
import { distanceMi } from '@/lib/geo'
import type { Storm } from '@/server/storms'
import type { NearbyRegistrant, RegistryView } from '@/server/registry'
import { REGISTRY_OPEN, registryMark, registryNumber } from './registryMark'
import { ALL_SITES, type Alert, type Site, type SiteId } from './data'

// The intel map: the OSIRIS client edition (globe/osiris) or God's Eye View, framed in embed
// mode; both speak the same protocol. The globe runs
// on its own VM; the portal tells it what to show with gev:view messages: the camera on
// the client's sites, their sites as pins, and the layers picked with the pills.
// Protocol: globe/osiris/overlay/src/lib/smg/embed.ts (and docs/TOOLS.md in gods-eye-view).

const LAYERS = {
  Weather: ['weather-radar', 'weather-lightning'],
  Hurricanes: ['weather-cyclones'],
  Fires: ['fire-perimeters'],
  Earthquakes: ['earthquakes'],
  Flights: ['flights'],
  Cameras: ['cctv'],
  Satellites: ['satellites'],
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
function cameraFor(sites: Located[], minAltitude = 25_000) {
  const lat = sites.reduce((a, s) => a + s.lat, 0) / sites.length
  const lon = sites.reduce((a, s) => a + s.lng, 0) / sites.length
  // Rough spread in km (1° ≈ 111 km), then pull back far enough to see it with margin.
  const spreadKm = Math.max(
    ...sites.map((s) => Math.hypot(s.lat - lat, (s.lng - lon) * Math.cos((lat * Math.PI) / 180)) * 111),
  )
  const altitude_m = Math.round(Math.max(minAltitude, spreadKm * 3_000))
  return { lat, lon, altitude_m, heading_deg: 0, pitch_deg: -60 }
}

/** Camera far enough out to see the whole globe and the satellites around it. */
function cameraForSatellites(sites: Located[]) {
  const lat = sites.reduce((a, s) => a + s.lat, 0) / sites.length
  const lon = sites.reduce((a, s) => a + s.lng, 0) / sites.length
  return { lat, lon, altitude_m: 20_000_000, heading_deg: 0, pitch_deg: -90 }
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
function incidentPins(alerts: Alert[], nearby: boolean) {
  const seen = new Set<string>()
  const pins = []
  for (const a of alerts) {
    if (a.lat == null || a.lng == null || !!a.nearby !== nearby) continue
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

/**
 * FDLE registrants near the sites as numbered pins, matching the Registry card's numbers.
 * No names on the globe: the number, the registry's own type and the distance; the card
 * has the record and FDLE's warnings.
 */
function registryPins(people: (NearbyRegistrant & { n: number })[], budget: number) {
  return people.slice(0, Math.max(0, budget)).map((p) => ({
    type: 'pin',
    latitude: p.lat,
    longitude: p.lng,
    label: `${registryMark(p.n)} ${p.subjectType || 'Registrant'} · ${p.distanceMi} mi from ${p.siteName}`.slice(0, 120),
    color: 'cyan',
  }))
}

export function GlobeMap({
  siteId,
  url,
  alerts,
  storms,
  localCameras,
  registry = null,
}: {
  siteId: SiteId
  url: string
  alerts: Alert[]
  /** NHC active storms; null when the list isn't available. */
  storms: Storm[] | null
  /** True once God's Eye has public cameras near the client sites (SMG_GLOBE_LOCAL_CAMERAS=1). */
  localCameras: boolean
  /** FDLE registry near the sites; only for opted-in clients (adds the Registry pill). */
  registry?: RegistryView | null
}) {
  const { sites } = usePortal()
  const frame = useRef<HTMLIFrameElement>(null)
  const seq = useRef(0)
  const lastSent = useRef('')
  const lastAcked = useRef('')
  const retry = useRef<ReturnType<typeof setTimeout>>(undefined)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  // Full screen: the map fills the window (phones too, where the browser's own full screen
  // isn't available for frames); Esc or Close returns, and the page doesn't scroll behind it.
  const [full, setFull] = useState(false)
  useEffect(() => {
    if (!full) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setFull(false)
    const root = document.documentElement
    const before = root.style.overflow
    root.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      root.style.overflow = before
      window.removeEventListener('keydown', onKey)
    }
  }, [full])
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
    Satellites: false,
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

  // Registry pins: off until picked. Numbered in the card's order, so ③ here is ③ there.
  const [showRegistry, setShowRegistry] = useState(false)
  // Alerts on the map (on by default): site pins coloured and titled by their worst alert,
  // and police calls as pins. Off leaves plain site pins; the alerts list is unaffected.
  const [showAlerts, setShowAlerts] = useState(true)
  const mapAlerts = useMemo(() => (showAlerts ? alerts : []), [showAlerts, alerts])
  const located = useMemo(() => sites.filter((s): s is Located => s.lat != null && s.lng != null), [sites])
  const registryPeople = useMemo(() => {
    if (!showRegistry || !registry) return []
    const numbered = registry.people.map((p, i) => ({ ...p, n: i + 1 }))
    const site = siteId === ALL_SITES ? null : located.find((s) => s.id === siteId)
    return numbered.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && (!site || p.siteName === site.name))
  }, [showRegistry, registry, siteId, located])
  // The globe takes 24 marks. In order: the sites, alerts at the sites, registrants (in the
  // card's order, so a dropped pin is always the farthest), then nearby context.
  const atSitePins = useMemo(() => incidentPins(mapAlerts, false), [mapAlerts])
  const registryRoom = Math.max(0, MAX_PINS - located.length - atSitePins.length)
  const activeStorms = layers.Hurricanes && storms?.length ? storms : null

  // home: the button "Back to my sites", which flies to the sites even with Satellites on.
  const send = useCallback((home = false) => {
    const win = frame.current?.contentWindow
    if (!win || located.length === 0) return
    const focus = siteId === ALL_SITES ? located : located.filter((s) => s.id === siteId)
    const view = {
      camera: layers.Satellites && !home
        ? cameraForSatellites(focus.length ? focus : located)
        : activeStorms
        ? cameraWithStorms(focus.length ? focus : located, activeStorms)
        : cameraFor(focus.length ? focus : located, registryPeople.length ? 8_000 : 25_000),
      layers: (Object.keys(LAYERS) as Layer[]).filter((l) => layers[l]).flatMap((l) => LAYERS[l]),
      annotations: [...located.map((s) => {
        // Worst alert at the site colours its pin and names the event.
        const hit = mapAlerts.find((a) => !a.nearby && (a.siteId === s.id || a.siteId === null))
        // Cyan marks the picked site, unless the registry's cyan pins are showing.
        const picked = s.id === siteId && registryPeople.length === 0
        const color = hit?.severity === 'HIGH' ? 'red' : hit?.severity === 'MED' ? 'amber' : picked ? 'cyan' : 'primary'
        return {
          type: 'pin',
          latitude: s.lat,
          longitude: s.lng,
          label: (hit ? `${s.name} · ${hit.title}` : s.name).slice(0, 120),
          color,
        }
      }), ...atSitePins, ...registryPins(registryPeople, registryRoom), ...incidentPins(mapAlerts, true)].slice(0, MAX_PINS),
    }
    const id = `smg-${++seq.current}`
    // The sites, for a followed satellite's distance and direction (God's Eye patch 4).
    const sitesMessage = {
      type: 'smg:sites',
      sites: located.map((s) => ({ name: s.name, lat: s.lat, lng: s.lng })),
      selected: siteId === ALL_SITES ? null : (focus[0]?.name ?? null),
    }
    const post = () => {
      win.postMessage(sitesMessage, origin)
      win.postMessage({ type: 'gev:view', id, view }, origin)
    }
    lastSent.current = id
    post()
    // Each view replaces the last one; resend once if the globe doesn't acknowledge it.
    clearTimeout(retry.current)
    retry.current = setTimeout(() => {
      if (lastAcked.current !== id && lastSent.current === id) post()
    }, 10_000)
  }, [located, siteId, layers, origin, mapAlerts, activeStorms, registryPeople, registryRoom, atSitePins])

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
      // A Registry pin clicked on the globe (God's Eye patch 3): open its entry in the card.
      if (e.data?.type === 'gev:pin-click' && typeof e.data.label === 'string') {
        const n = registryNumber(e.data.label)
        if (n == null) return
        setFull(false)
        // After full screen has closed, so the page can scroll to the entry.
        setTimeout(() => window.dispatchEvent(new CustomEvent(REGISTRY_OPEN, { detail: n })), 50)
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
    <section
      id="intel-map"
      tabIndex={-1}
      className={`cp-card cp-map cp-map--globe cp-area-map cp-anchor${full ? ' cp-map--full' : ''}`}
      aria-labelledby="cp-map-title"
      role={full ? 'dialog' : undefined}
      aria-modal={full || undefined}
    >
      <div className="cp-map__head">
        <h2 id="cp-map-title" className="cp-card__title">
          Intel map
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
          <button type="button" className="cp-pill" aria-pressed={showAlerts} onClick={() => setShowAlerts((v) => !v)}>
            Alerts
          </button>
          {registry && (
            <button type="button" className="cp-pill" aria-pressed={showRegistry} onClick={() => setShowRegistry((v) => !v)}>
              Registry
            </button>
          )}
        </div>
        <button
          type="button"
          className="cp-map__full"
          aria-pressed={full}
          aria-label={full ? 'Close full-screen map' : 'Show the map full screen'}
          onClick={() => setFull((f) => !f)}
        >
          {full ? '✕ Close' : '⤢ Full screen'}
        </button>
      </div>
      <div className="cp-map__body">
        <div className="cp-map__canvas cp-globe">
          <iframe
            ref={frame}
            src={embedUrl.toString()}
            title="Map of your sites with weather, hurricanes, fires, earthquakes, flights, cameras and satellites"
            className="cp-globe__frame"
            allow="fullscreen"
            referrerPolicy="strict-origin"
            sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
            // gev:ready is sent once; if this component remounts after it, the globe's
            // listener is already up, so send the view shortly after load as well.
            onLoad={() => setTimeout(() => latestSend.current(), 1500)}
          />
          {ready && (
            // Re-sending the view stops following a satellite, flight or camera and flies back.
            <button type="button" className="cp-globe__home" onClick={() => send(true)}>
              ⌖ Back to my sites
            </button>
          )}
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
          <span className="cp-legend__hint">Weather: NWS, NOAA · Fires: NASA · Quakes: USGS · Flights: ADS-B · Cameras: FDOT (FL511) · Satellites: CelesTrak</span>
        </div>
        {layers.Cameras && !localCameras && (
          <p className="cp-meta cp-storms__note">No public cameras in this area yet.</p>
        )}
        {layers.Hurricanes && <StormList storms={storms} sites={located} />}
        {showRegistry && registry && (
          <p className="cp-meta cp-storms__note">
            {registryPeople.length === 0
              ? 'No registrants to show on the map for this view.'
              : `Registry: ${Math.min(registryPeople.length, registryRoom)} registrant${registryPeople.length === 1 ? '' : 's'} as numbered pins, matching the list in the registry card. Names and FDLE’s warnings are in the card.`}
            {registryPeople.length > registryRoom && ` The map has room for ${registryRoom}; the card lists all ${registryPeople.length}.`}
          </p>
        )}
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
