# FDOT traffic cameras for God's Eye View (VM 151)

`sidecar.mjs` serves Florida's FDOT/FL511 traffic cameras to God's Eye View on the terms
agreed with FDOT:

- **One server:** it fetches the camera stills; browsers never contact fl511.com.
- **Rate:** each camera is fetched at most once a minute, and that fetch is shared by every viewer.
- **Identified:** every request carries `365SMG-IntelMap (globe.365securitymg.com; admin@365securitymg.com)`.
- **Nothing kept:** only the current still is held, in memory.
- **Not an open proxy:** it fetches only cameras in FDOT's own list.

```
God's Eye (127.0.0.1:4173) ──► fdot-cameras (127.0.0.1:4185) ──► fl511.com
     GET /fdot/cameras.json   the camera pack, in God's Eye's CCTV source format
     GET /fdot/snap/<id>      a camera's current still
     GET /fdot/video/<id>     a camera's live stream address, for live-relay.mjs (VIDEO.md)
     GET /healthz             "ok"
```

God's Eye 591f299 needs no code changes. These facts were checked in its source:
- **Pack format:** it reads a JSON array of cameras from `CCTV_SOURCES_FILE` and re-reads the
  file every 15 minutes.
- **Frame fetching:** its frame proxy (`/api/cctv/frame/<id>`) fetches each camera's
  `snapshotUrl` server-side and accepts `http://127.0.0.1`. Browsers only ever get frames from
  God's Eye, behind the login gate, and never contact fl511.com.
- **Polling:** God's Eye asks for a still every 10 seconds per open camera. The sidecar answers
  those from memory and goes to FDOT at most once a minute.
- **Failures:** past 5 minutes without a fresh still, the sidecar returns an error. God's Eye
  then shows its own "no image" instead of an old picture.

## Install (VM 151)

```bash
# 1. The sidecar, as its own system user.
sudo useradd --system --no-create-home --shell /usr/sbin/nologin fdotcam
sudo install -d -m 755 /opt/fdot-cameras
sudo install -m 644 deploy/globe/fdot/sidecar.mjs /opt/fdot-cameras/sidecar.mjs
sudo install -m 644 deploy/globe/fdot/fdot-cameras.service /etc/systemd/system/
echo 'FDOT_COUNTIES=Orange,Seminole,Osceola,Lake,Volusia,Brevard,Polk' | sudo tee /etc/fdot-cameras.env
sudo systemctl daemon-reload && sudo systemctl enable --now fdot-cameras

# 2. Check it.
curl -s http://127.0.0.1:4185/healthz                                   # ok
curl -s http://127.0.0.1:4185/fdot/cameras.json | head -c 600           # FDOT cameras
ls -l /var/lib/fdot-cameras/cctv_sources.florida.json                   # -rw-r--r--
ID=$(curl -s http://127.0.0.1:4185/fdot/cameras.json | grep -o 'fdot-[0-9]*' | head -1)
curl -s -o /tmp/still.jpg -w '%{http_code} %{content_type}\n' http://127.0.0.1:4185/fdot/snap/$ID
```

3. In God's Eye's environment, then restart God's Eye:

```
CCTV_SOURCES_FILE=/var/lib/fdot-cameras/cctv_sources.florida.json
CCTV_PREFER_AUSTIN=0
```

- **Other networks switch off:** a non-empty pack file turns off God's Eye's built-in camera
  networks (TfL, Caltrans, Ontario…), unless `CCTV_FORCE_AUSTIN=1`.
- **They stay off:** `CCTV_PREFER_AUSTIN=0` keeps them off even if the file is ever empty or
  unreadable.
- **If the path doesn't resolve:** God's Eye resolves the path against its working directory.
  If it doesn't take an absolute path, link the file into its `config/` folder instead.

4. On VM 150, set `SMG_GLOBE_LOCAL_CAMERAS=1` in `/etc/smg-portal.env` and restart the
   portal, so the map stops saying there are no cameras nearby.

To roll back, remove the two God's Eye settings, restart it, and stop `fdot-cameras`.

**Credit:** each camera carries `license` "Florida Department of Transportation / FL511
(approved for 365 SMG clients)". God's Eye shows it in the camera panel (from
`/api/cctv/sources`). Adding FDOT to God's Eye's data-credits list would need a patch there;
it isn't needed for the panel credit.

## Settings (`/etc/fdot-cameras.env`)

| Setting | Default | Meaning |
| --- | --- | --- |
| `FDOT_COUNTIES` | all | Only these counties (comma-separated). |
| `FDOT_BOUNDS` | all of Florida | `minLat,minLng,maxLat,maxLng`. |
| `FDOT_PUBLIC_BASE` | `http://127.0.0.1:4185` | How God's Eye reaches this service. Used in the pack's `url`/`snapshotUrl`. |
| `FDOT_SOURCE_KIND` | `fdot` | The pack's `sourceKind`. |
| `FDOT_LIST_REFRESH_MIN` | `30` | How often FDOT's camera list is refreshed. |
| `FDOT_PACK_FILE` | none (set by the service) | Where the God's Eye pack file is written. |
| `FDOT_USER_AGENT` | as above | How requests to FDOT identify us. |
