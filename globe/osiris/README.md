# Intel map: OSIRIS client edition

The portal's intel map, built from [OSIRIS](https://github.com/simplifaisoul/osiris)
(MIT licence) at the commit pinned in `UPSTREAM`, trimmed for clients and driven by the
portal. It replaces God's Eye View on VM 151 behind the same login gate
(`deploy/globe/`).

## What clients get

The map only, with the layers the portal's pills switch:

| Portal pill | OSIRIS layers | Source |
| --- | --- | --- |
| Weather | `weather` (warnings as points), `live_clouds` (infrared clouds) | NWS, GDACS, NASA EONET, NOAA nowCOAST |
| Hurricanes | `weather` (tropical cyclones as points) | GDACS, NWS; the storm list under the map comes from NHC in the portal |
| Fires | `fires` | NASA FIRMS |
| Earthquakes | `earthquakes` | USGS |
| Flights | `flights` | adsb.fi, OpenSky |
| Cameras | `cctv`, `cctv_previews` | **FDOT FL511** (about 4,950 cameras, snapshots), with FDOT's approval |

Clicking a camera opens its current still, updated every minute. Per the FDOT arrangement:

- **One server:** stills are fetched by our server (`/api/smg/fdot-snapshot`), never by
  viewers' browsers. Each camera is fetched at most once a minute, shared by every viewer.
- **Identified:** every request says who we are (`OSIRIS_USER_AGENT`, default
  `365SMG-IntelMap (globe.365securitymg.com; admin@365securitymg.com)`).
- **Nothing kept:** no still is stored beyond the current one.
- **Not an open proxy:** the route fetches only URLs in FDOT's own camera list.
- **Florida only:** the server serves only permitted camera networks (`OSIRIS_CCTV_REGIONS`,
  default `florida`). The page asks for `NEXT_PUBLIC_CCTV_REGIONS`, also `florida`.

FDOT's camera list itself is fetched by the server and cached for 30 minutes.

The portal's site pins show as labelled markers (one colour; OSIRIS has no per-pin colours).
There's no radar, lightning or NHC cone layer in OSIRIS.

## What's taken out, and why

`remove.txt` deletes about 880 upstream files, including their server routes, so they can't be
reached even by URL:

- the `$OSIRIS` crypto-token button and the markets, crypto and chain panels;
- "Marauder", a Web Bluetooth scanner that talks to devices near the viewer;
- the OSINT/recon panel (leaked credentials, phone and username lookups, Shodan, port scans);
- the AI analyst and "OI" assistant (Gemini and other model providers), and the MCP server;
- the "stealth" fetch, which sent random browser user agents and spoofed residential
  `X-Forwarded-For` addresses to data providers. It's replaced by one that identifies us;
- the camera image proxies (`/api/cctv/proxy`, `frame`, `resolve`, `stream-status`), which
  posed as a Chrome browser;
- the analytics middleware, which reported every request with the visitor's IP to an Umami
  server; IP geolocation (sent visitor IPs to ipapi.co, freeipapi.com and ip-api.com over
  plain HTTP); Google Fonts; the splash screen, docs and privacy pages, Docker and nginx files.

Server routes left: `/api/cctv`, `/api/smg/fdot-snapshot`, `weather`, `fires`, `flights`, `aircraft`, `flight-route`,
`satellites`, `proxy-tiles` (basemap) and `health`.

## Our changes

- `overlay/`: our own files, copied over upstream.
  - `src/app/page.tsx` is the whole client page.
  - `src/lib/smg/embed.ts` is the portal protocol: `gev:ready`, `gev:view` (camera, layers,
    pins) and `gev:view-applied`, the same messages God's Eye used.
  - `src/middleware.ts` sets the CSP, with `frame-ancestors` from `OSIRIS_FRAME_ANCESTORS`
    (default `https://portal.365securitymg.com`).
  - `src/components/smg/CameraSnapshot.tsx` is the camera viewer.
- `upstream.patch`: small edits to upstream files.
  - `OsirisMap` takes an exact camera from the page.
  - Conflict zones are off unless asked for.
  - The camera list can be limited to some regions.
  - `X-Frame-Options` is dropped, since the CSP now decides who may frame the map.
  - The Google Fonts import is removed.

Opened directly (by staff, through the gate), the page shows a small layer bar instead of
waiting for the portal.

## Build

Needs Node 20 or newer, git and network access to GitHub and npm. Run it as an ordinary
user, not root: it runs upstream code (tests and build).

```bash
globe/osiris/build.sh /tmp/osiris-build      # clones, trims, tests (vitest), builds
```

Supply chain:
- **Pinned upstream:** the exact commit in `UPSTREAM`.
- **Exact dependencies:** installed with `npm ci` from upstream's lockfile.
- **No install scripts:** `--ignore-scripts` stops any package running code at install time.
- **One build script:** `tools/prepare-map-worker.mjs` only copies MapLibre's worker into
  `public/`.

## Install on VM 151

```bash
REL=/opt/osiris/releases/$(date +%Y%m%d-%H%M%S)
sudo mkdir -p /opt/osiris/releases && sudo cp -R /tmp/osiris-build "$REL"
sudo ln -sfn "$REL" /opt/osiris/current
sudo install -m 644 globe/osiris/osiris.service /etc/systemd/system/osiris.service
sudo systemctl daemon-reload && sudo systemctl enable --now osiris
curl -s http://127.0.0.1:4174/api/health                     # OSIRIS answers
curl -s 'http://127.0.0.1:4174/api/cctv?region=florida' | head -c 300   # FDOT cameras
```

Then point the gate at it in `/etc/gev-gate.env`: `GATE_UPSTREAM=http://127.0.0.1:4174`,
and run `sudo systemctl restart gev-gate`. God's Eye can keep running on 4173; switching back
only takes changing `GATE_UPSTREAM` again. On VM 150 set `SMG_GLOBE_LOCAL_CAMERAS=1`, so the
portal stops saying there are no cameras nearby.

To roll back a release: point `/opt/osiris/current` at the previous one and restart `osiris`.

## Updating OSIRIS

Change `OSIRIS_COMMIT` in `UPSTREAM` and run `build.sh`.
- **If `git apply` fails:** fix `upstream.patch`.
- **If the build fails on a missing module:** a newly added upstream file probably imports
  something we removed. Add it to `remove.txt`, or keep what it needs.
- **Before installing:** review what's new upstream, the same way, for anything that phones
  home or adds tools clients shouldn't have.
