# Local patches to God's Eye View (VM 151)

God's Eye runs from its upstream repository pinned at **591f299**. We change it as little as
possible. Each change is listed here and applied by `apply.sh`, which:
- checks the upstream text it changes, and refuses to run against another version unless you
  say so;
- can be re-run safely after any reinstall.

```bash
sudo deploy/globe/gev-patches/apply.sh /opt/gev/gods-eye-view
sudo -u <god's eye user> npm run build     # patch 2 changes the browser code
sudo systemctl restart <god's eye service>
```

| # | File | Change | Why |
| --- | --- | --- | --- |
| 1 | `server/providers/cctv/stream.js` | `HLS_LIMITS.sessions` 2 → 5 (`GEV_HLS_SESSIONS`) | Room for about 5 clients watching live camera video at once (~1.5 Mbps each, within the ~10 Mbps budget for portal video). The login gate allows one stream per client (`GATE_STREAMS_PER_CLIENT=1`). |
| 2 | `src/ui/cctvPresentation.js` | Live video links under the camera details, for FDOT cameras only: "Watch live ▶" (`/live/fdot-<id>`, the Cloudflare Stream player, with `SMG_LIVE=1`) and "Watch live on FL511 ↗" (`FL511_LIVE_URL`, `{id}` = FDOT camera number) | Live video can't go through our Cloudflare Tunnel. Re-running replaces the block, so changing a setting is a rerun and a rebuild. |
| 3 | `src/annotations/screenAnnotationRenderer.js` | Numbered Registry pins (labels starting ①…⑳ or #21…) are clickable when God's Eye is framed: a click or Enter posts `{type: 'gev:pin-click', label}` to the portal, which opens that registrant's entry in the Registry card | The map stays free of names; the card holds FDLE's record and warnings. Only the pin's own label is sent. |
| 4 | `src/layers/satellites/tracking.js`, new `src/smg/satellites.js` (from `files/smg-satellites.js`) | A followed satellite's card adds speed, orbit time, altitude range and tilt (from its CelesTrak orbit), and its distance from the client's picked or nearest site, with whether it is above the horizon there now (direction and elevation). The portal sends its site names and coordinates (`{type: 'smg:sites'}`) with each view; only the framing page's messages are accepted | The portal's Satellites layer. Nothing is stored or sent anywhere; it is worked out in the browser once a second. |

Patch 1 only matters for staff live video off the Tunnel (not built yet); the public gate
refuses live video, so today it changes nothing in practice. See `../fdot/VIDEO.md`.

When updating God's Eye: read each patched file in the new version first. Then run
`GEV_PATCH_ANY_VERSION=1 apply.sh` and update the pin above.
