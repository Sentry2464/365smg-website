# Live FDOT video

FDOT has approved live video for our clients: **one camera per client at a time, at most 5
minutes per session**. Cloudflare support has confirmed that on our plan, video can't go
through a Tunnel public hostname such as `globe.365securitymg.com`, so live video goes through
**Cloudflare Stream** instead.

| Who | Live video | Cost |
| --- | --- | --- |
| Clients | **Watch live ▶** in the camera panel: our player page, video from Cloudflare Stream | ~$1 per 1,000 viewer-minutes, capped |
| Clients | **Watch live on FL511 ↗**: FDOT's own site, in a new tab | $0 |
| Staff | Directly from VM 151 on the office network or VPN (not built yet) | $0 |
| Everyone | Stills, at most one FDOT fetch per camera per minute (`sidecar.mjs`) | $0 |

## How it works

```
camera panel (God's Eye) ─"Watch live ▶"─► globe.365securitymg.com/live/fdot-<id>   player page (gate.mjs)
   player page ─POST /live/<id>/start─► gate ─(client id from the gate cookie)─► fdot-live 127.0.0.1:4186
   fdot-live: limits ─► Stream live input for the camera ─► ffmpeg: FDOT HLS ─RTMPS─► Cloudflare Stream
   player page ◄─ signed link (expires with the session) ─ fdot-live
   viewer's browser ◄──── video ──── Cloudflare Stream (customer-<code>.cloudflarestream.com)
```

- **No video through the Tunnel:** the player page is a few KB of HTML; the video plays in
  Cloudflare's own player from Cloudflare's servers. The gate still refuses God's Eye's own
  stream routes (`GATE_LIVE_VIDEO=0`).
- **One pull per camera:** however many clients watch a camera, VM 151 pulls it from FDOT
  once and sends it to Cloudflare once (~1.5 Mbps of office upload per camera).
  `LIVE_MAX_CAMERAS` (5) caps cameras at once.
- **FDOT's terms, enforced by the relay:**
  - One camera per client: a second camera gets "already watching another live camera" until
    the first is closed (closing the page frees it at once) or its session ends.
  - Sessions last at most 5 minutes. `LIVE_SESSION_MIN` can shorten that, never lengthen it.
    The signed link stops working 30 s after the session ends; the page then asks
    "Still watching?", and a click starts a new session.
- **Cost limits:** each session is charged in full when it starts (5 minutes, the most that
  link can play), against:
  - the client's monthly minutes (`LIVE_CLIENT_MONTHLY_MIN`, 120);
  - the whole account's monthly minutes (`LIVE_MONTHLY_MIN`, 5000 ≈ $5).

  At either limit, live video stops until the 1st (Eastern time); stills and the FL511 link
  keep working. The page also stops the video when its tab is hidden.
- **Playback is locked down:** inputs require signed links, and only
  `globe.365securitymg.com` may embed them (`STREAM_ALLOWED_ORIGINS`). The signing key is
  created through the API on first use and never leaves VM 151 (`/var/lib/fdot-live`, mode
  700, user `fdotlive`).
- **Recording:** Stream may only play live inputs that record (`STREAM_RECORDING_MODE=automatic`),
  so the relay deletes each camera's recordings when it stops pulling it, and on start-up.
  Test `off` once (below): if video still plays, keep it, and nothing is recorded at all.
- **Usage:** `curl -s http://127.0.0.1:4186/live/usage` on VM 151 shows this month's minutes
  per client and in total, the limits and the cameras being pulled.

## Install (VM 151, Mac session)

### 0. Check FDOT's streams first

FL511 lists a stream address per camera, and marks some as needing an authorised session
(`isVideoAuthRequired`). Update the camera service so it passes those addresses on, then try
one before anything else:

```bash
sudo install -m 644 deploy/globe/fdot/sidecar.mjs /opt/fdot-cameras/sidecar.mjs
sudo systemctl restart fdot-cameras
# The saved list predates stream addresses: if every videoUrl below is null, refresh it now.
curl -s http://127.0.0.1:4185/fdot/video/$(curl -s http://127.0.0.1:4185/fdot/cameras.json | grep -o 'fdot-[0-9]*' | head -1)
#   all null? sudo systemctl stop fdot-cameras; sudo rm /var/lib/fdot-cameras/cameras.json; sudo systemctl start fdot-cameras
#   (the God's Eye pack file stays; the list is fetched again from FDOT in about a minute)

sudo apt-get install -y ffmpeg
URL=<a videoUrl from above>
ffprobe -v error -user_agent '365SMG-IntelMap (globe.365securitymg.com; admin@365securitymg.com)' \
  -show_entries stream=codec_name,width,height -of compact "$URL"
```

- **Video details printed** (e.g. `codec_name=h264|width=…`): go on.
- **401/403 or "Invalid data":** FDOT has to tell us how to access their video. Stop here and
  send me the output. If they give us a header (token), it goes in `FDOT_VIDEO_HEADERS`.

### 1. The relay

```bash
sudo useradd --system --no-create-home --shell /usr/sbin/nologin fdotlive
sudo install -m 644 deploy/globe/fdot/live-relay.mjs /opt/fdot-cameras/live-relay.mjs
sudo install -m 644 deploy/globe/fdot/fdot-live.service /etc/systemd/system/
sudo install -m 600 deploy/globe/fdot/fdot-live.env.example /etc/fdot-live.env
sudo nano /etc/fdot-live.env    # Jorge types CF_API_TOKEN and STREAM_CUSTOMER_DOMAIN here
sudo systemctl daemon-reload && sudo systemctl enable --now fdot-live
journalctl -u fdot-live -n 5     # "listening on 127.0.0.1:4186; sessions 5 min; …"
```

The token: Cloudflare dashboard → My Profile → API Tokens → Create Token → Custom token;
Permissions **Account · Stream · Edit** only; Account resources: the 365 SMG account; Client
IP filtering: the office's public IP. Type it into `/etc/fdot-live.env` on VM 151. Never send
it by chat or email.

**Try it locally** (this charges 5 minutes to the made-up client `smg-test`):

```bash
CAM=<an FDOT camera id with a videoUrl, e.g. fdot-1234>
curl -s -X POST -H 'x-smg-cid: smg-test' http://127.0.0.1:4186/live/$CAM/start | grep -o '"sessionSeconds":[0-9]*\|"error":"[a-z_]*"'
sleep 20; curl -s -H 'x-smg-cid: smg-test' http://127.0.0.1:4186/live/$CAM/status   # {"live":true,…}
curl -s -X POST -H 'x-smg-cid: smg-test' http://127.0.0.1:4186/live/$CAM/stop
journalctl -u fdot-live -n 20     # pulling, then "stopped (no viewers)" ~30 s later, recordings deleted
```

`"live":true` means Cloudflare is receiving the camera. In the dashboard, Stream → Live
inputs shows `smg-<camera>`. The start response holds a signed link; the command above
prints only the session length, and neither the relay nor the gate logs the link.

### 2. The gate and God's Eye

```bash
# Gate: the player page and the relay routes.
sudo install -m 644 deploy/globe/gate.mjs /opt/gev-gate/gate.mjs
echo 'GATE_LIVE_RELAY=http://127.0.0.1:4186' | sudo tee -a /etc/gev-gate.env
sudo systemctl restart gev-gate
journalctl -u gev-gate -n 3       # "… live video off, Stream player on"

# God's Eye: "Watch live ▶" next to "Watch live on FL511 ↗" (FDOT cameras only).
cd <GEV dir>
sudo SMG_LIVE=1 FL511_LIVE_URL=https://fl511.com/cctv <repo>/deploy/globe/gev-patches/apply.sh "$PWD"
sudo -u <God's Eye user> npm run build
sudo systemctl restart <God's Eye service>
```

No change on VM 150 (the portal) and none in Cloudflare's Tunnel, DNS or Access settings.

### 3. Test from a browser

1. Portal → Intel map → Cameras → pick an FDOT camera → **Watch live ▶**.
2. A new tab shows the still and "Connecting live…", then the video within about 20 s, with a
   countdown from 5:00.
3. In a second tab, try another camera: it should say you're already watching one.
4. Switch away from the tab: the video stops ("Paused while this tab was hidden").
5. `curl -s http://127.0.0.1:4186/live/usage` shows the minutes charged.

**Then try `STREAM_RECORDING_MODE=off`** in `/etc/fdot-live.env`, restart `fdot-live`, stop
watching for a minute, and repeat step 1. If video still plays, keep `off`. If the player
says the stream isn't available, put `automatic` back.

### Turning it off

- **Quickly:** remove `GATE_LIVE_RELAY` from `/etc/gev-gate.env` and restart `gev-gate`.
  "Watch live ▶" then gives "not available"; FL511 and stills keep working.
- **Fully:**
  1. Stop and disable `fdot-live`.
  2. Rerun `apply.sh` without `SMG_LIVE=1`, then rebuild God's Eye.
  3. Revoke the API token in Cloudflare.

## Staff (another session)

Staff can watch live video from VM 151 without Cloudflare, on the office network or the office
VPN (pfSense), through a separate, LAN-only gate instance with `GATE_LIVE_VIDEO=1`. That path
needs:
- the sidecar's HLS relay;
- FDOT's method for video access;
- `apply.sh` patch 1 (God's Eye's HLS session cap, 2 → 5).

The per-client stream limit already in the gate (`GATE_STREAMS_PER_CLIENT`) applies there.
