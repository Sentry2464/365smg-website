#!/usr/bin/env bash
# Local patches to God's Eye View on VM 151, applied after each install or update of GEV.
# Each patch checks the exact upstream text it changes and stops if that text is not there,
# so a GEV update can't be patched blindly.
#
#   sudo deploy/globe/gev-patches/apply.sh [GEV_DIR]      default /opt/gev/gods-eye-view
#
# Then restart God's Eye. See README.md.
set -euo pipefail
GEV_DIR=${1:-/opt/gev/gods-eye-view}
PINNED=591f299
SESSIONS=${GEV_HLS_SESSIONS:-5}
# Where "Watch live on FL511" goes; {id} becomes the FDOT camera number (fdot-<id> in the pack).
FL511_LIVE_URL=${FL511_LIVE_URL:-https://fl511.com/cctv}

[ -d "$GEV_DIR" ] || { echo "no God's Eye at $GEV_DIR" >&2; exit 1; }
HEAD=$(git -C "$GEV_DIR" rev-parse --short=7 HEAD 2>/dev/null || echo unknown)
if [ "$HEAD" != "$PINNED" ] && [ "${GEV_PATCH_ANY_VERSION:-}" != 1 ]; then
  echo "God's Eye is at $HEAD, these patches are for $PINNED. Review them against the new version," >&2
  echo "then rerun with GEV_PATCH_ANY_VERSION=1." >&2
  exit 1
fi

# 1. HLS live-video sessions: 2 -> $SESSIONS server-wide (HLS_LIMITS in stream.js).
#    One per client is enforced by the login gate (GATE_STREAMS_PER_CLIENT).
FILE="$GEV_DIR/server/providers/cctv/stream.js"
node - "$FILE" "$SESSIONS" <<'JS'
const fs = require('node:fs')
const [file, sessions] = process.argv.slice(2)
const src = fs.readFileSync(file, 'utf8')
const block = /HLS_LIMITS\s*=\s*Object\.freeze\(\{[\s\S]*?\}\)/.exec(src)
if (!block) { console.error(`HLS_LIMITS block not found in ${file}`); process.exit(1) }
const re = /(\bsessions\s*:\s*)(\d+)\b/g
const found = [...block[0].matchAll(re)]
if (found.length !== 1) { console.error(`expected one "sessions:" in HLS_LIMITS, found ${found.length}`); process.exit(1) }
const current = found[0][2]
if (current === sessions) { console.log(`HLS sessions already ${sessions}`); process.exit(0) }
if (current !== '2') { console.error(`HLS sessions is ${current}, expected the upstream 2; not touching it`); process.exit(1) }
const patched = block[0].replace(re, `$1${sessions}`)
fs.writeFileSync(file, src.replace(block[0], patched))
console.log(`HLS sessions: 2 -> ${sessions} (${file})`)
JS
# 2. "Watch live on FL511" in the camera panel, for FDOT cameras. Live video can't go through
#    our Cloudflare Tunnel (the gate refuses it), so clients watch on FDOT's own site.
#    This changes the browser code: rebuild God's Eye (npm run build) before restarting it.
FILE="$GEV_DIR/src/ui/cctvPresentation.js"
node - "$FILE" "$FL511_LIVE_URL" <<'JS'
const fs = require('node:fs')
const [file, liveUrl] = process.argv.slice(2)
if (!/^https:\/\/[^\s'"\\<>`]+$/.test(liveUrl)) { console.error(`FL511_LIVE_URL must be a plain https URL: ${liveUrl}`); process.exit(1) }
const src = fs.readFileSync(file, 'utf8')
const BEGIN = '  // 365 SMG patch 2 begin'
const END = '  // 365 SMG patch 2 end\n'
const block = `${BEGIN}: FDOT cameras link to FDOT's own live view on FL511.
  if (this._cctvMeta) {
    let link = this._smgLiveLink;
    if (!link) {
      link = this._smgLiveLink = document.createElement('a');
      link.id = 'smg-fl511-live';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'Watch live on FL511 \u2197';
      link.style.cssText =
        'display:inline-block;margin-top:6px;font-size:12px;font-weight:600;color:#7fd3ff;text-decoration:underline';
      this._cctvMeta.after(link);
    }
    const fdotId = enabled
      ? /^fdot-(\\d+)$/.exec(String(activeCamera?.id || ''))?.[1]
      : null;
    link.hidden = !fdotId;
    if (fdotId) link.href = ${JSON.stringify(liveUrl)}.replace('{id}', fdotId);
  }
${END}`
const ANCHOR = '  const liveIntent = enabled && !!activeCamera?.isVideo;\n'
let out
if (src.includes(BEGIN)) {
  out = src.slice(0, src.indexOf(BEGIN)) + block + src.slice(src.indexOf(END) + END.length)
} else {
  if (src.split(ANCHOR).length !== 2) { console.error(`camera panel anchor not found once in ${file}`); process.exit(1) }
  out = src.replace(ANCHOR, block + '\n' + ANCHOR)
}
if (out === src) { console.log('FL511 link already in place'); process.exit(0) }
fs.writeFileSync(file, out)
console.log(`FL511 link -> ${liveUrl} (${file})`)
JS
echo "Done. Rebuild God's Eye (npm run build, as its own user), then restart it."
