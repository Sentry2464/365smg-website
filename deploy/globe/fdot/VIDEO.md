# Live FDOT video: design (not active)

Today the map shows FDOT stills, updated at most once a minute per camera (`sidecar.mjs`).
Live video waits for **FDOT's written terms for video**. This note is the plan for when they
arrive, so it can be built to fit them.

## What's already in place

- **Gate:** `deploy/globe/gate.mjs` allows each client one live camera at a time
  (`GATE_STREAMS_PER_CLIENT=1`). A second camera gets `429` with "Close your other live camera
  first". A stream frees itself 20 s after its last request (`GATE_STREAM_IDLE_MS`; God's Eye
  drops idle streams after 15 s). Closing a camera (God's Eye sends `DELETE /api/cctv/media/<id>`) frees
  the slot at once, and a camera quiet for 8 s (`GATE_STREAM_TAKEOVER_MS`) can be taken over.
  - The limit is per client id from the gate cookie, so two users at the same client share it.
- **God's Eye:** `deploy/globe/gev-patches/apply.sh` raises God's Eye's server-wide HLS session
  limit from 2 to 5.

## Sidecar HLS path (to build once FDOT's terms are known)

```
viewer ─► gate ─► God's Eye /api/cctv/stream|media/<id> ─► sidecar /fdot/hls/<id>/… ─► FDOT
```

- **Pack:** the entry gets `feedType: "hls"` and `url: http://127.0.0.1:4185/fdot/hls/<id>/index.m3u8`.
  `snapshotUrl` stays the still.
- **Playlist:** the sidecar fetches the camera's playlist from FDOT and rewrites segment URLs
  to `/fdot/hls/<id>/seg/<n>`.
- **One upstream per camera:** each playlist and segment is fetched once and shared by every
  viewer of that camera. Segments are held in memory for a few seconds, never written to disk
  or recorded.
- **Stops when idle:** pulling stops 15 s after the last viewer leaves.
- **Only FDOT's list:** stream URLs are accepted only if they're in FDOT's camera list, and on
  FDOT's host. The request identifies us (same User-Agent as the stills).
- **Upstream cap:** at most `FDOT_HLS_MAX_CAMERAS` cameras pulled at once (e.g. 5), whatever
  God's Eye asks for.
- **Access:** FL511 marks its HLS as requiring an authorised session (`isVideoAuthRequired`);
  anonymous requests are refused. FDOT has to tell us how we're meant to access video (token,
  allow-listed IP, a separate feed) before this can be built.

## Bandwidth

- **The link:** the office measures about 285 Mbps down and 34 Mbps up. The upload is shared
  with 3CX VoIP, the SIEM and the rest.
- **Budget:** video should use at most ~10 Mbps of the upload. FDOT cameras run around 1–1.5
  Mbps each.
- **Per viewer:** every viewer is a separate stream through the tunnel, with no caching
  between viewers. Upload cost is viewers × bitrate, whatever the camera sharing.
- **The cap:** 5 sessions × ~1.5 Mbps ≈ 7.5 Mbps, inside the budget. The one-per-client gate
  rule spreads them across clients.
- **Download from FDOT:** at most 5 cameras × ~1.5 Mbps, which is negligible.
- **Room for 3CX:** if calls suffer, lower `GEV_HLS_SESSIONS` (and rerun `apply.sh`) or add a
  pfSense traffic shaper for VM 151's upload.

## Cloudflare (decide before enabling)

Cloudflare's Service-Specific Terms (Application Services, last updated 11 Aug 2025; recheck
the current version) say that unless you are an **Enterprise** customer, video and other large
files served through the CDN must come from Cloudflare's paid services, such as Stream, Images
or R2. Cloudflare may otherwise limit or disable CDN access. Tunnel public hostnames go through
that same proxy. The terms don't single out Tunnel, but there's no stated exemption.

Options, for Jorge:
1. **Stills only** (today): compliant, and almost no bandwidth.
2. **Ask Cloudflare:** confirm in writing that low-volume, access-controlled HLS through a
   Tunnel on our plan is acceptable. Get the plan name and the answer on record before
   switching video on.
3. **Cloudflare Stream:** paid. It suits our own video, but restreaming FDOT through it would
   need FDOT's OK too.
4. **Video outside Cloudflare:** not practical for clients without exposing the office network.

Recommendation: stay on stills until both FDOT's video terms and Cloudflare's answer are in
hand.
