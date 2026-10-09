'use client'

import { useEffect, useState } from 'react'
import { ALL_SITES, mapIncidents, sites, type SiteId } from './data'

const LAYERS = ['Weather', 'Incidents', 'Fires', 'Earthquakes', 'Flights'] as const
type Layer = (typeof LAYERS)[number]

// Placeholder map: positioned overlays on a grid. Phase 5 swaps the canvas for
// MapLibre GL; the pills, legend and expand behaviour stay as they are.
export function IntelMap({ siteId }: { siteId: SiteId }) {
  const [layers, setLayers] = useState<Record<Layer, boolean>>({
    Weather: true,
    Incidents: true,
    Fires: false,
    Earthquakes: false,
    Flights: false,
  })
  const [zoom, setZoom] = useState(1)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (!expanded) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setExpanded(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expanded])

  return (
    <section
      className={`cp-card cp-map cp-area-map${expanded ? ' cp-map--expanded' : ''}`}
      aria-labelledby="cp-map-title"
      role={expanded ? 'dialog' : undefined}
      aria-modal={expanded || undefined}
    >
      <div className="cp-map__head">
        <h2 id="cp-map-title" className="cp-card__title">
          Intel map · God&apos;s Eye (OSIRIS)
        </h2>
        <div className="cp-pills" role="group" aria-label="Map layers">
          {LAYERS.map((l) => (
            <button
              key={l}
              type="button"
              className="cp-pill"
              aria-pressed={layers[l]}
              onClick={() => setLayers((s) => ({ ...s, [l]: !s[l] }))}
            >
              {l}
            </button>
          ))}
        </div>
        <button type="button" className="cp-map__close" aria-label="Close map" onClick={() => setExpanded(false)}>
          ✕
        </button>
      </div>
      <div className="cp-map__body">
        <div className="cp-map__canvas">
          <div className="cp-map__layer" style={{ transform: `scale(${zoom})` }}>
            <div className="cp-map__road-h" />
            <div className="cp-map__road-v" />
            <div className="cp-map__lake" />

            {layers.Weather && (
              <>
                <div className="cp-map__nws" />
                <span className="cp-map__tag" style={{ left: '8%', top: '10%', color: '#245C96' }}>
                  NWS · T-STORM WARNING
                </span>
              </>
            )}

            {layers.Incidents &&
              mapIncidents.map((i) => (
                <div
                  key={i.id}
                  className={`cp-map__ring cp-map__ring--${i.severity}`}
                  style={{ left: `${i.x}%`, top: `${i.y}%` }}
                  title={i.label}
                />
              ))}

            {layers.Fires && (
              <>
                <div className="cp-map__fire" style={{ left: '84%', top: '78%' }} />
                <span className="cp-map__tag" style={{ left: 'calc(84% + 18px)', top: '77%', color: '#A85A12' }}>
                  BRUSH FIRE · 6 AC
                </span>
              </>
            )}

            {layers.Flights && (
              <>
                <span className="cp-map__plane" style={{ left: '20%', top: '20%', transform: 'rotate(30deg)' }} aria-hidden="true">✈</span>
                <span className="cp-map__plane" style={{ left: '58%', top: '36%', transform: 'rotate(-60deg)' }} aria-hidden="true">✈</span>
                <span className="cp-map__plane" style={{ left: '78%', top: '10%', transform: 'rotate(110deg)' }} aria-hidden="true">✈</span>
              </>
            )}

            {sites.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`cp-marker${siteId === s.id ? ' cp-marker--active' : ''}`}
                style={{ left: `${s.map.x}%`, top: `${s.map.y}%` }}
                aria-label={`${s.name}, your site`}
              >
                <span className="cp-marker__name">{s.name}</span>
                <span className="cp-marker__pop">
                  {s.name} · Client site · {siteId === ALL_SITES || siteId === s.id ? 'in view' : 'other site'}
                </span>
              </button>
            ))}
          </div>

          <span className="cp-map__caption">MAPLIBRE GL · OSIRIS LAYERS · CLIENT SITES PINNED</span>
          {layers.Earthquakes && <span className="cp-map__quakes">USGS · 0 EARTHQUAKES IN VIEW</span>}

          <div className="cp-zoom">
            <button type="button" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(2, z + 0.25))}>
              +
            </button>
            <button type="button" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(1, z - 0.25))}>
              −
            </button>
          </div>

          <button type="button" className="cp-map__expand" aria-label="Expand map to full screen" onClick={() => setExpanded(true)}>
            <span aria-hidden="true">TAP TO EXPAND ⤢</span>
          </button>
        </div>

        <div className="cp-legend">
          <span>
            <i className="cp-legend__site" />
            Your sites
          </span>
          <span>
            <i className="cp-legend__ring" style={{ borderColor: '#C0392B' }} />
            High-impact radius
          </span>
          <span>
            <i className="cp-legend__ring" style={{ borderColor: '#e67e22' }} />
            Medium-impact radius
          </span>
          <span className="cp-legend__hint">Hover a marker for source</span>
        </div>
      </div>
    </section>
  )
}
