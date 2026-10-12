#!/usr/bin/env bash
# One-time setup inside the portal VM (Ubuntu 24.04). Run with sudo.
# See deploy/README.md, step 3.
#
# Required:  MGMT_CIDR       network allowed to SSH in (same as create-vm.sh)
# Optional:  CF_TUNNEL_TOKEN Cloudflare Tunnel token; installs the tunnel service
set -euo pipefail

: "${MGMT_CIDR:?Set MGMT_CIDR, e.g. sudo MGMT_CIDR=10.10.0.0/24 ./provision.sh}"
[ "$(id -u)" = 0 ] || { echo "run with sudo" >&2; exit 1; }
HERE=$(cd "$(dirname "$0")" && pwd)
APP_USER=smg
APP_DIR=/opt/smg-portal
DATA_DIR=/var/lib/smg
export DEBIAN_FRONTEND=noninteractive

echo "==> System updates and base packages"
apt-get update
apt-get -y upgrade
apt-get install -y ca-certificates curl git gnupg ufw unattended-upgrades qemu-guest-agent sqlite3
systemctl enable --now qemu-guest-agent

echo "==> Automatic security updates (reboot at 04:30 if needed)"
cat > /etc/apt/apt.conf.d/52smg-unattended <<'EOF'
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "04:30";
EOF
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF

echo "==> Host firewall: SSH from $MGMT_CIDR only; the app listens on localhost"
ufw --force reset >/dev/null
ufw default deny incoming
ufw default allow outgoing
ufw allow from "$MGMT_CIDR" to any port 22 proto tcp
ufw --force enable

echo "==> SSH: keys only"
cat > /etc/ssh/sshd_config.d/60-smg.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
EOF
systemctl reload ssh

echo "==> Node.js 22 LTS"
if ! node -v 2>/dev/null | grep -q '^v22\.'; then
  install -d -m 0755 /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
  apt-get update
  apt-get install -y nodejs
fi
node -v

echo "==> cloudflared"
if ! command -v cloudflared >/dev/null; then
  install -d -m 0755 /usr/share/keyrings
  curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg -o /usr/share/keyrings/cloudflare-main.gpg
  echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main" > /etc/apt/sources.list.d/cloudflared.list
  apt-get update
  apt-get install -y cloudflared
fi
if [ -n "${CF_TUNNEL_TOKEN:-}" ] && ! systemctl is-active --quiet cloudflared; then
  cloudflared service install "$CF_TUNNEL_TOKEN"
fi

echo "==> App user and folders"
id "$APP_USER" >/dev/null 2>&1 || useradd --system --home-dir "$APP_DIR" --shell /bin/bash "$APP_USER"
install -d -o "$APP_USER" -g "$APP_USER" -m 0750 "$APP_DIR" "$APP_DIR/releases" "$DATA_DIR"
install -d -o "$APP_USER" -g "$APP_USER" -m 0700 "$APP_DIR/.ssh"
if [ ! -f "$APP_DIR/.ssh/id_ed25519" ]; then
  sudo -u "$APP_USER" ssh-keygen -q -t ed25519 -N '' -C "smg-portal deploy key" -f "$APP_DIR/.ssh/id_ed25519"
fi
# VLAN 50 only allows web ports out, so reach GitHub's SSH service on port 443.
cat > "$APP_DIR/.ssh/config" <<'SSHCFG'
Host github.com
  HostName ssh.github.com
  Port 443
  User git
  IdentityFile ~/.ssh/id_ed25519
  IdentitiesOnly yes
SSHCFG
chown "$APP_USER:$APP_USER" "$APP_DIR/.ssh/config"
chmod 600 "$APP_DIR/.ssh/config"
if ! grep -q '^\[ssh.github.com\]:443 ' "$APP_DIR/.ssh/known_hosts" 2>/dev/null; then
  keys=$(ssh-keyscan -p 443 -t ed25519 ssh.github.com 2>/dev/null)
  [ -n "$keys" ] || { echo "error: cannot reach ssh.github.com:443 to fetch GitHub's host key" >&2; exit 1; }
  echo "$keys" | sudo -u "$APP_USER" tee -a "$APP_DIR/.ssh/known_hosts" >/dev/null
fi
install -m 0755 "$HERE/deploy.sh" /usr/local/bin/smg-deploy

echo "==> Settings file /etc/smg-portal.env"
if [ ! -f /etc/smg-portal.env ]; then
  umask 077
  cat > /etc/smg-portal.env <<ENV
# Read by systemd as root; the app never sees this file directly.
# Encrypts authenticator secrets. Keep a copy somewhere safe (e.g. your password
# manager): if it is lost, every user has to set up two-step login again.
SMG_SECRET_KEY=$(head -c 32 /dev/urandom | base64)

# Outgoing email for feedback and investigation alerts (leave blank to log only).
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=Client Portal <portal@365smg.com>
# Contact sent to public data APIs (NWS etc.) in the User-Agent, as they ask.
SMG_API_CONTACT=admin@365securitymg.com
# Live alert feeds (see deploy/README.md, "Live alerts"). NWS weather is on by default.
# Orlando PD dispatched calls: set to 1 once the City has OK'd showing them to clients.
SMG_FEED_OPD=0
SMG_CRIME_RADIUS_MI=1

# Investigations alerts go only here (case reference only, never the details).
NOTIFY_INVESTIGATIONS_TO=
# Feedback goes to each client's account manager; this catches clients without one.
NOTIFY_DEFAULT_TO=
ENV
  umask 022
fi
chmod 600 /etc/smg-portal.env

echo "==> systemd units and the smg-admin command"
install -m 0644 "$HERE/smg-portal.service" /etc/systemd/system/smg-portal.service
install -m 0644 "$HERE/smg-db-backup.service" "$HERE/smg-db-backup.timer" /etc/systemd/system/
install -m 0755 "$HERE/smg-admin" /usr/local/bin/smg-admin
install -d -o "$APP_USER" -g "$APP_USER" -m 0750 "$DATA_DIR/backups"
systemctl daemon-reload
systemctl enable smg-portal
systemctl enable --now smg-db-backup.timer

cat <<EOF

Provisioning complete.

1. Add this read-only deploy key to GitHub
   (repo > Settings > Deploy keys > Add deploy key, leave write access off):

$(cat "$APP_DIR/.ssh/id_ed25519.pub")

2. Then deploy:   sudo smg-deploy
3. Create your own admin account:
   sudo smg-admin create-staff --email you@365smg.com --name "Your Name"
EOF
[ -z "${CF_TUNNEL_TOKEN:-}" ] && echo "4. Cloudflare Tunnel not installed yet: sudo cloudflared service install <TOKEN>  (README step 4)"
exit 0
