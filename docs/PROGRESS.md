# 365 SMG Client Portal: progress

Status as of **15 October 2026**. Branch `claude/dreamy-franklin-rmnvi0`, pull request
[Sentry2464/365smg-website#1](https://github.com/Sentry2464/365smg-website/pull/1).

## Live in production

| Where | What | Version |
| --- | --- | --- |
| VM 150 (10.50.0.10) | Client portal, https://portal.365securitymg.com | release `20261015-024412-89a6866` |
| VM 151 (10.50.0.11) | God's Eye View 591f299, with local patches 1–4 (`deploy/globe/gev-patches`) | rebuilt 15 Oct for patches 3–4 |
| VM 151 | Login gate (`deploy/globe/gate.mjs`), https://globe.365securitymg.com | from ef78393: live video through the Tunnel off, Stream player off |
| VM 151 | FDOT camera service (`deploy/globe/fdot/sidecar.mjs`) | from ef78393: stills plus each camera's stream address |

Both sites are reached only through the Cloudflare Tunnel. Infrastructure changes go through
the Mac session (Jorge's Mac), with Jorge's approval given there.

## What clients have

**Dashboard**
- Live alerts near each site:
  - National Weather Service watches and warnings;
  - DHS terrorism advisories;
  - Orlando PD dispatched calls (the City approved; `SMG_FEED_OPD=1`).
- When nothing is at a site, the nearest activity further out is listed as "nearby".
- **Threat level** (since 89a6866): the worst alert at a site sets the floor. A score then adds
  the alerts at the site and the 5 closest nearby ones, weighted by severity and by distance,
  so clusters and close incidents raise it. Details are in `deploy/README.md` › Live alerts,
  with tests in `src/server/tests/alerts.test.ts`.
- Public safety cards:
  - FDLE missing persons;
  - FBI Wanted (Tampa field office);
  - **FDLE sexual offender and predator registry**, for opted-in clients (on for all
    clients). Each entry is numbered, and a **Details** expander shows FDLE's published
    description (sex, race, height, weight, hair, eyes, birth date, victim a minor, DOC
    number, every listed address with the date it was added). It is verbatim, with FDLE's
    warnings. Photos are never shown. Every view is audit-logged.
- Header navigation, with Public safety and Feedback menus and a "More" sheet on phones.
- Feedback and investigation request forms, mailed to staff through Microsoft 365.

**Intel map (God's Eye View, framed through the login gate)**
- Taller map, **Full screen** (on phones too), and **⌖ Back to my sites**.
- Pills: Weather, Hurricanes (NHC, on while an Atlantic storm is active), Fires,
  Earthquakes, Flights, Cameras, Satellites, **Alerts** (on by default), and **Registry** for
  registry clients.
- **Alert pins** carry their distance from the site, e.g. "Nearby: Vandalism · 7.3 mi from
  RCP Community · Orlando PD".
- **Registry pins** are numbered ①, ②… to match the card, with no names. Clicking one opens
  that entry's Details in the card. `SMG_REGISTRY_MAP=0` would hide them; Jorge chose to keep
  them.
- **FDOT traffic cameras:** stills of about 1,800 cameras (10 counties), fetched at most once a
  minute per camera from our server. The camera panel shows **Watch live on FL511 ↗** (FDOT's
  own site, $0).
- **Satellites** (CelesTrak, core catalog with no Starlink):
  - clicking one follows it and shows speed, orbit time, altitude, tilt, its distance from
    the client's site, and whether it is above the horizon there now (direction and
    elevation);
  - the view zooms out to 20,000 km when the pill is on.

**Staff**
- Admin accounts are created on VM 150 with
  `sudo smg-admin create-staff --email … --name … --role admin`, run in the person's own SSH
  terminal; it prints a one-time password there. Clients and users are then managed in
  Portal admin.

## Deploy history (13–15 October)

| Portal release | What |
| --- | --- |
| `20261014-024830-585e58c` | Header navigation, Public safety and Feedback menus |
| `20261014-113518-ef78393` | FL511 link support; VM 151: gate (no video through the Tunnel), sidecar, God's Eye patches 1–2 |
| `20261014-182023-f592517` | Taller map, Full screen, Registry pins |
| `20261014-193126-1a07792` | Pin priority (alerts before registry), `SMG_REGISTRY_MAP` switch |
| `20261015-002256-38e1246` | Registry Details, clickable registry pins, Satellites, Back to my sites; VM 151: God's Eye patches 3–4, rebuilt |
| `20261015-024412-89a6866` | Alerts pill, new threat-level formula, alert pin distances |

## Waiting on others

1. **FDOT live video (Cloudflare Stream).** The relay and player are built and tested
   (`deploy/globe/fdot/live-relay.mjs`, `VIDEO.md`) but not installed. Two blockers:
   - **FDOT authorisation:** all 1,422 camera streams are marked `isVideoAuthRequired`. A draft
     question to FDOT is with Jorge: how to authenticate (token, header or allow-listing our
     IP), which hosts and ports, and confirming Cloudflare Stream delivery is covered.
   - **Outbound TCP 8200:** the streams come from `dis-*.divas.cloud:8200`, and VLAN 50 only
     allows 80/443/587/7844 out. A pfSense rule (only VM 151 to `*.divas.cloud`) needs Jorge's
     OK once FDOT answers.

   FDOT's terms, already built in: one camera per client, at most 5 minutes per session.
   Cost limits: 120 minutes per client and 5,000 for the whole account each month (about $5).
   The Stream plan is active; the API token isn't created yet.
2. **Registry on the map:** keep or hide pending the counsel's view (`SMG_REGISTRY_MAP=0`).
   Photos stay off until counsel says otherwise.
3. **FL511 per-camera link:** the button opens FL511's camera list. If a single camera's page
   on fl511.com has the camera number in its address, set `FL511_LIVE_URL` with `{id}` and
   rerun `apply.sh`.

## Ideas offered, not built

- Satellites: next visible pass over the client's site (about 2 h); launch year (needs two more
  God's Eye files changed).
- Staff live video straight from VM 151 on the office network or VPN, with no Cloudflare
  (`VIDEO.md` › Staff).
- `smg-admin reset-password` for a lone admin who loses their password.
- A general "Verify on NSOPW" link in the registry card.
- Tuning the threat-level weights once real incidents have come in.

## Parked

- **OSIRIS client edition** (`globe/osiris`): built and kept, not deployed. God's Eye View is
  the intel map.

## Rules this work follows

- Secrets (API tokens, the shared globe secret, the Microsoft 365 mail secret, one-time
  passwords) are typed directly on the VMs. They never pass through chat or commits.
- Large or infrastructure changes are approved by Jorge in the Mac session, not relayed.
- No video through the Cloudflare Tunnel's public hostnames (Cloudflare Free plan terms).
  Stills are fine.
- FDOT: our server only, at most one fetch per camera per minute, honest User-Agent, nothing
  stored beyond the current still.
- FDLE registry: verbatim records and warnings, audit-logged views, no links to FDLE's
  registry site, no CAPTCHA bypass.
- No Cloudflare Access on globe.365securitymg.com (it has its own login through the portal).
