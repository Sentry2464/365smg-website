// 365 SMG patch 4 (deploy/globe/gev-patches): plain-language facts on a followed satellite's
// card, and its distance and direction from the signed-in client's site.
//
// The portal that frames the map sends its site list ({type: 'smg:sites', sites, selected})
// with each view; only messages from the framing page are accepted. Facts come from the
// satellite's CelesTrak orbit (SGP4 elements) and its current propagated position.

const MU_KM3_S2 = 398600.4418; // Earth's gravitational parameter
const EARTH_RADIUS_KM = 6378.137;
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

const sites = { list: [], selected: null };

if (typeof window !== 'undefined' && window.parent !== window) {
  window.addEventListener('message', (event) => {
    const data = event.data;
    if (event.source !== window.parent || data?.type !== 'smg:sites' || !Array.isArray(data.sites)) return;
    sites.list = data.sites
      .filter((s) => s && typeof s.name === 'string' && Number.isFinite(s.lat) && Number.isFinite(s.lng))
      .slice(0, 50)
      .map((s) => ({ name: s.name.slice(0, 80), lat: s.lat, lng: s.lng }));
    sites.selected = typeof data.selected === 'string' ? data.selected : null;
  });
}

const fmt = (n) => Math.round(n).toLocaleString('en-US');

/** Speed, orbit time, altitude range and tilt, from the SGP4 elements and current speed. */
export function orbitFacts(satrec, speedMps) {
  if (!satrec || !(satrec.no > 0)) return [];
  const periodMin = (2 * Math.PI) / satrec.no; // satrec.no: radians per minute
  const nRadS = satrec.no / 60;
  const a = Math.cbrt(MU_KM3_S2 / (nRadS * nRadS));
  const e = Number.isFinite(satrec.ecco) ? satrec.ecco : 0;
  const low = a * (1 - e) - EARTH_RADIUS_KM;
  const high = a * (1 + e) - EARTH_RADIUS_KM;
  const tilt = (satrec.inclo * 180) / Math.PI;
  const period = periodMin >= 120 ? `${(periodMin / 60).toFixed(1)} h` : `${Math.round(periodMin)} min`;
  const speed = Number.isFinite(speedMps) && speedMps > 0 ? `${fmt(speedMps * 3.6)} km/h · ` : '';
  const range = Math.abs(high - low) < 10 ? `${fmt((low + high) / 2)} km up` : `${fmt(low)}–${fmt(high)} km up`;
  return [`${speed}one orbit every ${period}`, `${range} · tilt ${tilt.toFixed(1)}°`];
}

/** Distance from the picked (or nearest) site, and where to look from there. */
export function siteFacts(Cesium, satEcef, list = sites.list, selected = sites.selected) {
  if (!satEcef || list.length === 0) return [];
  const pool = selected ? list.filter((s) => s.name === selected) : [];
  let best = null;
  for (const s of pool.length ? pool : list) {
    const p = Cesium.Cartesian3.fromDegrees(s.lng, s.lat, 0);
    const d = Cesium.Cartesian3.distance(p, satEcef);
    if (!best || d < best.d) best = { s, p, d };
  }
  const up = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(best.p, new Cesium.Cartesian3());
  const v = Cesium.Cartesian3.normalize(Cesium.Cartesian3.subtract(satEcef, best.p, new Cesium.Cartesian3()), new Cesium.Cartesian3());
  const east = Cesium.Cartesian3.normalize(Cesium.Cartesian3.cross(Cesium.Cartesian3.UNIT_Z, up, new Cesium.Cartesian3()), new Cesium.Cartesian3());
  const north = Cesium.Cartesian3.cross(up, east, new Cesium.Cartesian3());
  const elevation = (Math.asin(Math.max(-1, Math.min(1, Cesium.Cartesian3.dot(v, up)))) * 180) / Math.PI;
  const azimuth = ((Math.atan2(Cesium.Cartesian3.dot(v, east), Cesium.Cartesian3.dot(v, north)) * 180) / Math.PI + 360) % 360;
  const name = best.s.name;
  return [
    `${fmt(best.d / 1000)} km from ${name}`,
    elevation >= 85
      ? 'Above the horizon there now: almost straight overhead'
      : elevation > 0
        ? `Above the horizon there now: ${Math.round(elevation)}° up, ${COMPASS[Math.round(azimuth / 45) % 8]}`
        : `Below the horizon at ${name} now`,
  ];
}

// The card is refreshed every frame; the facts change slowly, so work them out once a second.
let cached = { satrec: null, at: 0, lines: [] };

/** Extra card lines for a followed satellite. */
export function smgSatelliteFacts(Cesium, satrec, geo, satEcef) {
  const now = Date.now();
  if (cached.satrec === satrec && now - cached.at < 1000) return cached.lines;
  let lines = [];
  try {
    lines = [...orbitFacts(satrec, geo?.speedMps), ...siteFacts(Cesium, satEcef)];
  } catch {
    lines = [];
  }
  cached = { satrec, at: now, lines };
  return lines;
}
