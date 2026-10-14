# Intel map login gate (VM 151)

`gate.mjs` sits between Cloudflare Tunnel and the intel map (the OSIRIS client edition in
`globe/osiris` on port 4174, or God's Eye View on 4173), so the map at
`https://globe.365securitymg.com` only opens for people signed in to the client portal.

```
browser ──► Cloudflare ──► cloudflared (VM 151) ──► gate 127.0.0.1:4180 ──► intel map 127.0.0.1:4174 (OSIRIS) or :4173 (God's Eye)
```

1. When a client opens their dashboard, the portal frames
   `https://globe.365securitymg.com/?embed=1&t=<ticket>`. The ticket is signed (HMAC-SHA256)
   with a secret shared by both VMs, names the client, lasts 60 seconds and works once
   (`src/server/globe.ts`).
2. The gate checks it, sets its own cookie (host-only, `Secure`, `HttpOnly`,
   `SameSite=Lax`, 12 hours) and redirects to the same address without the ticket, so the
   ticket never stays in the globe's address or reaches other sites in a `Referer`.
3. Every other request needs the cookie. With it, the request goes to God's Eye with
   Cloudflare and forwarding headers removed and `Host: localhost:<port>`, streamed (tiles)
   and with WebSockets passed through. Without it: a short 403 page.
4. Live camera video (`/api/cctv/stream|media/…`) is refused with 403 (`GATE_LIVE_VIDEO=0`,
   the default). Cloudflare doesn't allow video through a Tunnel public hostname on our plan,
   so clients use the camera panel's "Watch live on FL511" link. See `fdot/VIDEO.md`.

`/healthz` answers `ok` without a cookie. Ticket checks are rate-limited (30 a minute per
client IP, 600 in total). Spent tickets are remembered in memory until they expire; a gate
restart forgets them, so a ticket used in the minute before a restart could be used once
more within that minute. Cookies are signed rather than stored, so a restart signs no one out.

## Install (VM 151)

Node 20 or newer; no packages needed.

```bash
sudo install -d -m 755 /opt/gev-gate
sudo install -m 644 deploy/globe/gate.mjs /opt/gev-gate/gate.mjs
sudo install -m 600 deploy/globe/gev-gate.env.example /etc/gev-gate.env
sudo nano /etc/gev-gate.env          # set GATE_SECRET (see below)
sudo install -m 644 deploy/globe/gev-gate.service /etc/systemd/system/gev-gate.service
sudo systemctl daemon-reload
sudo systemctl enable --now gev-gate
curl -s http://127.0.0.1:4180/healthz   # ok
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4180/   # 403
```

**The secret.** Generate it once (`openssl rand -base64 48`) and type it into
`/etc/gev-gate.env` (`GATE_SECRET=`) on VM 151 and `/etc/smg-portal.env`
(`SMG_GLOBE_SECRET=`) on VM 150. Keep a copy in the password manager. Don't send it by chat
or email. To rotate, change both and restart both services; open maps then need a reload.

**God's Eye settings** (its own environment on VM 151):
`GEV_EMBED_FRAME_ANCESTORS=https://portal.365securitymg.com`. Its Host check accepts
`localhost`, which is what the gate sends, so `GEV_ALLOWED_HOSTS` isn't needed. Keep vite
preview listening on 127.0.0.1 only, so the gate is the only way in.

**Cloudflare Tunnel**: route `globe.365securitymg.com` to `http://127.0.0.1:4180` (the gate,
never the map's own port).

**Portal (VM 150)**, in `/etc/smg-portal.env`:

```
SMG_GLOBE_URL=https://globe.365securitymg.com/
SMG_GLOBE_SECRET=<the same secret>
```

Then `sudo systemctl restart smg-portal`. Without `SMG_GLOBE_SECRET`, the portal refuses to
frame a non-local globe and shows the static map instead.

## Testing before the tunnel

On one machine, with the portal on `http://localhost:3000` and the gate on `4180`:
`SMG_GLOBE_URL=http://localhost:4180/` plus the secret on the portal;
`GATE_FRAME_ANCESTORS=http://localhost:3000` on the gate, and God's Eye's
`GEV_EMBED_FRAME_ANCESTORS=http://localhost:3000`. Browsers treat `localhost` as secure, so
the `Secure` cookie works over plain http there. Put the production values back afterwards.

Logs: `journalctl -u gev-gate`. They show sign-ins by client id and rejected tickets with
the reason, never tickets or cookies.
