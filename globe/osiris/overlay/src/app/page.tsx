'use client';

/*
 * 365 SMG client edition. Only the map, with the layers the client portal switches, driven
 * by the portal through the embed protocol in src/lib/smg/embed.ts. Opened on its own (by
 * staff, through the same login gate) it shows a small layer bar instead.
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import dynamic from 'next/dynamic';
import ErrorBoundary from '@/components/ErrorBoundary';
import CameraSnapshot, { type SnapshotCamera } from '@/components/smg/CameraSnapshot';
import { loadCameraCatalog, mergeCameraCatalog } from '@/lib/camera-catalog';
import type { Highlight } from '@/lib/oi/assist/tools';
import { CLIENT_LAYERS, cameraFor, layersFor, pinsFor, type Camera, type Layers } from '@/lib/smg/embed';

const OsirisMap = dynamic(() => import('@/components/OsirisMap'), { ssr: false });

// Florida only by default: the portal's clients are in Central Florida, and one region loads fast.
const CCTV_REGIONS = (process.env.NEXT_PUBLIC_CCTV_REGIONS || 'florida').split(',').map(s => s.trim()).filter(Boolean);

type Data = Record<string, unknown>;
interface QuakeFeature {
  id: string;
  geometry?: { coordinates?: number[] };
  properties?: { mag?: number; place?: string; time?: number; url?: string; tsunami?: number; type?: string; felt?: number; alert?: string };
}

const EQ_URL = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson';
const eqTransform = (d: { features?: QuakeFeature[] }): Data => ({
  earthquakes: (d.features || []).map(f => ({
    id: f.id,
    lat: f.geometry?.coordinates?.[1] || 0,
    lng: f.geometry?.coordinates?.[0] || 0,
    depth: f.geometry?.coordinates?.[2] || 0,
    magnitude: f.properties?.mag,
    place: f.properties?.place,
    time: f.properties?.time,
    url: f.properties?.url,
    tsunami: f.properties?.tsunami,
    type: f.properties?.type,
    felt: f.properties?.felt,
    alert: f.properties?.alert,
  })),
});

/** Layer data: fetched when its layer is first switched on, then refreshed. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each feed's JSON has its own shape
const FEEDS: { layer: string; url: string; every: number; transform?: (d: any) => Data }[] = [
  { layer: 'earthquakes', url: EQ_URL, every: 15 * 60_000, transform: eqTransform },
  { layer: 'weather', url: '/api/weather', every: 5 * 60_000, transform: d => ({ weather_events: d.events }) },
  { layer: 'fires', url: '/api/fires', every: 30 * 60_000 },
  { layer: 'flights', url: '/api/flights', every: 5 * 60_000 },
];

const STANDALONE_PILLS: [string, string[]][] = [
  ['Weather', ['weather-radar', 'weather-cyclones']],
  ['Fires', ['fire-perimeters']],
  ['Earthquakes', ['earthquakes']],
  ['Flights', ['flights']],
  ['Cameras', ['cctv']],
];

const off = (): Layers => Object.fromEntries(CLIENT_LAYERS.map(k => [k, false]));
const CENTRAL_FLORIDA = { lat: 28.5, lng: -81.4, zoom: 8, bearing: 0, pitch: 0, ts: 0 };

// Framed by the portal, or opened directly? (Assume framed while rendering on the server.)
const isFramed = () => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
};
const noSubscribe = () => () => {};

export default function ClientEdition() {
  const [data, setData] = useState<Data>({});
  const embedded = useSyncExternalStore(noSubscribe, isFramed, () => true);
  const [portalLayers, setPortalLayers] = useState<Layers>(off);
  const [camera, setCamera] = useState<(Camera & { ts: number }) | null>(null);
  const [highlight, setHighlight] = useState<Highlight | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [activeCamera, setActiveCamera] = useState<SnapshotCamera | null>(null);
  const [standalonePills, setStandalonePills] = useState<string[]>(['Weather', 'Cameras']);

  const merge = useCallback((d: Data) => setData(prev => ({ ...prev, ...d })), []);
  const loaded = useRef(new Set<string>());

  // Embedded, the portal picks the layers; opened directly, the layer bar does.
  const layers = useMemo(
    () =>
      embedded
        ? portalLayers
        : layersFor(STANDALONE_PILLS.filter(([name]) => standalonePills.includes(name)).flatMap(([, ids]) => ids)),
    [embedded, portalLayers, standalonePills],
  );

  // Embedded: the portal drives everything. Only the window that framed us is listened to;
  // which sites may frame us at all is set by the Content-Security-Policy (src/middleware.ts).
  useEffect(() => {
    if (!embedded) return;
    const onMessage = (e: MessageEvent) => {
      if (e.source !== window.parent || e.data?.type !== 'gev:view') return;
      const view = e.data.view ?? {};
      const cam = cameraFor(view.camera);
      if (cam) setCamera({ ...cam, ts: Date.now() });
      setPortalLayers(layersFor(view.layers));
      const points = pinsFor(view.annotations);
      setHighlight(points.length ? { points, area: null } : null);
      window.parent.postMessage({ type: 'gev:view-applied', id: String(e.data.id ?? '') }, e.origin);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [embedded]);

  useEffect(() => {
    if (embedded && mapReady) window.parent.postMessage({ type: 'gev:ready' }, '*');
  }, [embedded, mapReady]);

  // Layer data, fetched on first use and refreshed for the life of the page.
  const started = useRef(new Set<string>());
  const timers = useRef<ReturnType<typeof setInterval>[]>([]);
  useEffect(() => () => timers.current.forEach(clearInterval), []);
  useEffect(() => {
    for (const f of FEEDS) {
      if (!layers[f.layer] || started.current.has(f.layer)) continue;
      started.current.add(f.layer);
      const load = async () => {
        if (document.hidden && loaded.current.has(f.layer)) return;
        try {
          const res = await fetch(f.url, { cache: 'no-store' });
          if (res.ok) {
            const json = await res.json();
            merge(f.transform ? f.transform(json) : json);
            loaded.current.add(f.layer);
          }
        } catch {
          // keep what is shown; the next refresh tries again
        }
      };
      void load();
      timers.current.push(setInterval(load, f.every));
    }
  }, [layers, merge]);

  useEffect(() => {
    if (!layers.cctv || started.current.has('cctv')) return;
    started.current.add('cctv');
    return loadCameraCatalog(
      cameras =>
        setData(prev => ({ ...prev, cameras: mergeCameraCatalog((prev.cameras as typeof cameras | undefined) ?? [], cameras) })),
      () => console.warn('[client edition] camera list failed to load; retrying'),
      CCTV_REGIONS,
    );
  }, [layers.cctv]);

  const onEntityClick = useCallback((entity: { type?: string } & SnapshotCamera) => {
    if (entity?.type === 'cctv') setActiveCamera(entity);
  }, []);

  return (
    <main className="fixed inset-0 overflow-hidden bg-[#06060C]">
      <ErrorBoundary name="Map">
        <OsirisMap
          data={data}
          activeLayers={layers}
          projection="globe"
          mapStyle="dark"
          onEntityClick={onEntityClick}
          onReady={() => setMapReady(true)}
          cameraCommand={camera ?? (embedded ? null : CENTRAL_FLORIDA)}
          oiHighlight={highlight}
        />
      </ErrorBoundary>

      {!embedded && (
        <nav aria-label="Map layers" className="absolute left-3 top-3 z-[500] flex flex-wrap gap-2">
          {STANDALONE_PILLS.map(([name]) => {
            const on = standalonePills.includes(name);
            return (
              <button
                key={name}
                type="button"
                aria-pressed={on}
                onClick={() => setStandalonePills(p => (on ? p.filter(n => n !== name) : [...p, name]))}
                className={`rounded-full border px-3 py-1 text-[12px] ${on ? 'border-[#C9A227] bg-[#C9A227] text-[#12122B]' : 'border-white/30 bg-black/50 text-white'}`}
              >
                {name}
              </button>
            );
          })}
        </nav>
      )}

      {activeCamera && <CameraSnapshot key={activeCamera.id} camera={activeCamera} onClose={() => setActiveCamera(null)} />}
    </main>
  );
}
