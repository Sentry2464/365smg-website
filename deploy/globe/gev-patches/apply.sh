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
echo "Done. Restart God's Eye to load the change."
