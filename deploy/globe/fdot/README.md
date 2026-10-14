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
     GET /healthz             "ok"
```

**Status:** the sidecar works and is tested (`src/server/tests/fdot-sidecar.test.ts`). How it
plugs into God's Eye still needs confirming against its source at 591f299:
- the pack format for `CCTV_SOURCES_FILE`;
- whether its frame proxy accepts a `127.0.0.1` source;
- that browsers only get frames through God's Eye.

The install steps for that part follow once it's confirmed.

## Install the sidecar

```bash
sudo install -d -m 755 /opt/fdot-cameras
sudo install -m 644 deploy/globe/fdot/sidecar.mjs /opt/fdot-cameras/sidecar.mjs
sudo install -m 644 deploy/globe/fdot/fdot-cameras.service /etc/systemd/system/
echo 'FDOT_COUNTIES=Orange,Seminole,Osceola,Lake,Volusia,Brevard,Polk' | sudo tee /etc/fdot-cameras.env
sudo systemctl daemon-reload && sudo systemctl enable --now fdot-cameras
curl -s http://127.0.0.1:4185/healthz
curl -s http://127.0.0.1:4185/fdot/cameras.json | head -c 600
```

## Settings (`/etc/fdot-cameras.env`)

| Setting | Default | Meaning |
| --- | --- | --- |
| `FDOT_COUNTIES` | all | Only these counties (comma-separated). |
| `FDOT_BOUNDS` | all of Florida | `minLat,minLng,maxLat,maxLng`. |
| `FDOT_PUBLIC_BASE` | `http://127.0.0.1:4185` | How God's Eye reaches this service. Used in the pack's `url`/`snapshotUrl`. |
| `FDOT_SOURCE_KIND` | `fdot` | The pack's `sourceKind`. |
| `FDOT_LIST_REFRESH_MIN` | `30` | How often FDOT's camera list is refreshed. |
| `FDOT_USER_AGENT` | as above | How requests to FDOT identify us. |
