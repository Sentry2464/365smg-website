# Local patches to God's Eye View (VM 151)

God's Eye runs from its upstream repository pinned at **591f299**. We change it as little as
possible. Each change is listed here and applied by `apply.sh`, which:
- checks the upstream text it changes, and refuses to run against another version unless you
  say so;
- can be re-run safely after any reinstall.

```bash
sudo deploy/globe/gev-patches/apply.sh /opt/gev/gods-eye-view
sudo systemctl restart <god's eye service>
```

| # | File | Change | Why |
| --- | --- | --- | --- |
| 1 | `server/providers/cctv/stream.js` | `HLS_LIMITS.sessions` 2 → 5 (`GEV_HLS_SESSIONS`) | Room for about 5 clients watching live camera video at once (~1.5 Mbps each, within the ~10 Mbps budget for portal video). The login gate allows one stream per client (`GATE_STREAMS_PER_CLIENT=1`). |

These patches only matter once live video is on, and that waits for FDOT's video terms (see
`../fdot/VIDEO.md`). With FDOT stills only, patch 1 changes nothing in practice.

When updating God's Eye: read each patched file in the new version first. Then run
`GEV_PATCH_ANY_VERSION=1 apply.sh` and update the pin above.
