# Live FDOT video

FDOT has approved live video for our clients. Cloudflare support has confirmed that on our
plan (Free), video can't be served through a Tunnel public hostname such as
`globe.365securitymg.com`. So:

| Who | Live video | Cost |
| --- | --- | --- |
| Clients | **"Watch live on FL511"** in the camera panel: opens the camera on FDOT's own site in a new tab | $0 |
| Clients, later | Cloudflare Stream, only if clients ask for live video inside the portal (below) | ~$1 per 1,000 viewer-minutes, capped |
| Staff | Directly from VM 151 on the office network or VPN, never through Cloudflare (not built yet) | $0 |
| Everyone | Stills, at most one FDOT fetch per camera per minute (`sidecar.mjs`), as before | $0 |

## What's in place

- **Gate:** `GATE_LIVE_VIDEO=0` (the default) refuses `/api/cctv/stream|media/…` with 403
  before it reaches God's Eye, so no video goes through the Tunnel even if a camera were set
  to HLS by mistake. Stills (`/api/cctv/frame/…`) are unaffected.
- **God's Eye patch 2** (`../gev-patches/apply.sh`): a "Watch live on FL511" link under the
  camera details, shown only for FDOT cameras (`fdot-<id>`). The address comes from
  `FL511_LIVE_URL` (default `https://fl511.com/cctv`); `{id}` in it becomes the FDOT camera
  number, for a per-camera link once we know FL511's format.
- **Portal:** the map frame allows that link to open as a normal tab
  (`allow-popups-to-escape-sandbox`), so FL511's player isn't sandboxed.

## Rollout (VM 151, Mac session)

```bash
cd /opt/gev/gods-eye-view
sudo FL511_LIVE_URL=https://fl511.com/cctv /path/to/repo/deploy/globe/gev-patches/apply.sh "$PWD"
sudo -u <god's eye user> npm run build
sudo systemctl restart <god's eye service>
sudo install -m 644 /path/to/repo/deploy/globe/gate.mjs /opt/gev-gate/gate.mjs
sudo systemctl restart gev-gate
journalctl -u gev-gate -n 3        # "... live video off"
```

Then open the portal map, turn on Cameras, pick an FDOT camera, and check the link opens
FL511. **Check the address:** open a camera on fl511.com and see whether its address names
the camera. If it does, rerun `apply.sh` with that pattern, e.g.
`FL511_LIVE_URL='https://fl511.com/…{id}…'`, rebuild and restart.

## Cloudflare Stream (later, only if clients ask)

The design if we need live video inside the portal:

- **Relay (VM 151):** pulls a camera's HLS from FDOT only while someone is watching, and
  pushes it to a Cloudflare Stream live input (RTMPS/SRT), with recording off. One upstream
  per camera, whatever the number of viewers. It stops about 30 s after the last viewer.
- **Playback:** the portal hands each signed-in client a signed Stream URL that expires in
  minutes.
- **Cost controls:**
  - live only on click;
  - auto-stop after 2 minutes, with "Still watching?";
  - pause when the tab is hidden;
  - one live camera per client;
  - a monthly limit per client;
  - a hard account-wide monthly limit (e.g. 5,000 minutes ≈ $5), after which it falls back
    to stills and the FL511 link.
- **Needs:**
  - FDOT's OK for redistribution through Cloudflare's network;
  - FDOT's method for authorised video access (FL511 marks its HLS `isVideoAuthRequired`);
  - a Stream subscription;
  - a Stream-only API token, entered directly on VM 151.

## Staff (another session)

Staff can watch live video from VM 151 without Cloudflare: on the office network, or over
the office VPN (pfSense), with `GATE_LIVE_VIDEO=1` on a separate, LAN-only gate instance (not
the one behind the Tunnel). That path also needs:
- the sidecar's HLS relay (one FDOT upstream per camera, idle stop, only FDOT's own list);
- FDOT's method for video access;
- `apply.sh` patch 1 (God's Eye's HLS session cap, 2 → 5).

The per-client stream limit already in the gate (`GATE_STREAMS_PER_CLIENT`) applies there.

## Bandwidth (for the staff path)

The office link is about 285 Mbps down and 34 Mbps up, shared with 3CX and the SIEM. Keep
video under ~10 Mbps of upload: about 5 streams at ~1.5 Mbps. Over the LAN, viewers cost no
upload at all; over the VPN, each remote viewer is one stream.
