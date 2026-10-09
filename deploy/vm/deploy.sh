#!/usr/bin/env bash
# Build and release the portal on the VM. Installed as /usr/local/bin/smg-deploy.
#   sudo smg-deploy               deploy the latest commit on main
#   sudo BRANCH=foo smg-deploy    deploy another branch
#   sudo smg-deploy --rollback    switch back to the previous release
set -euo pipefail

REPO_URL=${REPO_URL:-git@github.com:sentry2464/365smg-website.git}
BRANCH=${BRANCH:-main}
APP_USER=smg
APP_DIR=/opt/smg-portal
SRC=$APP_DIR/src
KEEP=5

[ "$(id -u)" = 0 ] || { echo "run with sudo" >&2; exit 1; }
as_app() { sudo -u "$APP_USER" -H "$@"; }

health() {
  for _ in $(seq 1 30); do
    curl -fsS -o /dev/null http://127.0.0.1:3000/portal && return 0
    sleep 1
  done
  return 1
}

switch_to() {
  ln -sfn "$1" "$APP_DIR/current.new" && mv -T "$APP_DIR/current.new" "$APP_DIR/current"
  systemctl restart smg-portal
}

if [ "${1:-}" = "--rollback" ]; then
  current=$(basename "$(readlink -f "$APP_DIR/current")")
  # Release names start with a timestamp, so the newest one older than current sorts just before it.
  previous=$(ls -1d "$APP_DIR"/releases/* | awk -v c="$current" '{ n = $0; sub(".*/", "", n); if (n < c) p = $0 } END { print p }')
  [ -n "$previous" ] || { echo "no previous release" >&2; exit 1; }
  echo "==> Rolling back to $(basename "$previous")"
  switch_to "$previous"
  health && echo "Rolled back." || { echo "rollback release is not healthy either" >&2; exit 1; }
  exit 0
fi

echo "==> Fetching $BRANCH"
if [ ! -d "$SRC/.git" ]; then
  as_app git clone --branch "$BRANCH" "$REPO_URL" "$SRC"
else
  as_app git -C "$SRC" fetch --prune origin "$BRANCH"
  as_app git -C "$SRC" checkout -B "$BRANCH" "origin/$BRANCH"
  as_app git -C "$SRC" reset --hard "origin/$BRANCH"
fi
REV=$(as_app git -C "$SRC" rev-parse --short HEAD)
RELEASE=$APP_DIR/releases/$(date +%Y%m%d-%H%M%S)-$REV

echo "==> Building $REV"
as_app bash -c "cd '$SRC' && npm ci --no-audit --no-fund && NEXT_TELEMETRY_DISABLED=1 npm run build"

echo "==> Assembling release $(basename "$RELEASE")"
as_app mkdir -p "$RELEASE"
as_app cp -a "$SRC/.next/standalone/." "$RELEASE/"
as_app mkdir -p "$RELEASE/.next/cache"
as_app cp -a "$SRC/.next/static" "$RELEASE/.next/static"
as_app cp -a "$SRC/public" "$RELEASE/public"

previous=$(readlink -f "$APP_DIR/current" 2>/dev/null || true)
switch_to "$RELEASE"

if health; then
  echo "==> $REV is live"
else
  echo "!! $REV failed its health check" >&2
  journalctl -u smg-portal -n 30 --no-pager >&2 || true
  if [ -n "$previous" ] && [ -d "$previous" ]; then
    echo "==> Restoring $(basename "$previous")" >&2
    switch_to "$previous"
  fi
  exit 1
fi

echo "==> Pruning old releases (keeping $KEEP)"
ls -1d "$APP_DIR"/releases/* | head -n -"$KEEP" | xargs -r rm -rf
