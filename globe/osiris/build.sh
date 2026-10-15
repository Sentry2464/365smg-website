#!/usr/bin/env bash
# Builds the 365 SMG client edition of OSIRIS from the pinned upstream commit:
# removes what clients must not get (remove.txt), applies our edits (upstream.patch),
# adds our files (overlay/), runs the tests and builds a standalone Next.js server.
#
#   globe/osiris/build.sh [OUT_DIR]      default: ./osiris-client-edition
#
# OUT_DIR then holds a ready-to-run app: node OUT_DIR/server.js (see README.md).
set -euo pipefail
# Upstream code (its tests and build) runs here: never as root.
if [ "$(id -u)" = 0 ] && [ "${ALLOW_ROOT:-}" != 1 ]; then
  echo "run build.sh as an unprivileged user (it runs upstream code)" >&2
  exit 1
fi
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=UPSTREAM
. "$HERE/UPSTREAM"
OUT=$(realpath -m "${1:-$PWD/osiris-client-edition}")
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

echo "==> OSIRIS ${OSIRIS_COMMIT:0:7} from $OSIRIS_REPO"
git clone -q --filter=blob:none --no-checkout "$OSIRIS_REPO" "$WORK/osiris"
cd "$WORK/osiris"
git checkout -q "$OSIRIS_COMMIT"

echo "==> client edition: remove, patch, overlay"
git rm -rq -- $(cat "$HERE/remove.txt")
git apply --whitespace=nowarn "$HERE/upstream.patch"
cp -R "$HERE/overlay/." .

echo "==> install (lockfile only, no package install scripts), test, build"
# --ignore-scripts: no dependency runs code at install time. The one script the build
# needs, tools/prepare-map-worker.mjs (copies MapLibre's worker into public/), runs as
# npm's prebuild step and is part of the reviewed source.
npm ci --ignore-scripts --no-audit --no-fund
npx vitest run
npm run build

echo "==> assemble $OUT"
rm -rf "$OUT"
mkdir -p "$OUT"
cp -R .next/standalone/. "$OUT/"
cp -R public "$OUT/public"
mkdir -p "$OUT/.next"
cp -R .next/static "$OUT/.next/static"
printf 'OSIRIS %s + 365 SMG client edition (%s)\n' "$OSIRIS_COMMIT" "$(git -C "$HERE" rev-parse --short HEAD 2>/dev/null || echo local)" > "$OUT/VERSION"
echo "==> done: node $OUT/server.js"
