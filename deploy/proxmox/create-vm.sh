#!/usr/bin/env bash
# Create the 365 SMG Client Portal VM on a Proxmox VE 8 host.
# Run as root on the Proxmox host. See deploy/README.md, step 2.
#
# Required:
#   MGMT_CIDR      network allowed to SSH into the VM, e.g. 10.10.0.0/24
#   SSH_KEY_FILE   your SSH public key, e.g. /root/smgadmin.pub
# Optional (defaults shown):
#   VMID=150  NAME=smg-portal  STORAGE=local  BRIDGE=vmbr0  VLAN=50
#   VLAN=none puts the VM straight on the bridge (no VLAN); the Proxmox firewall
#   must then be running, because it is the only thing isolating the VM.
#   IP_CIDR=10.50.0.10/24  GATEWAY=10.50.0.1  DNS=10.50.0.1
#   CORES=2  MEMORY_MB=4096  DISK_GB=40  CI_USER=smgadmin
#   BACKUP_STORAGE=   (set to a PBS/NAS storage ID to add a nightly backup job)
set -euo pipefail

VMID=${VMID:-150}
NAME=${NAME:-smg-portal}
STORAGE=${STORAGE:-local}
BRIDGE=${BRIDGE:-vmbr0}
VLAN=${VLAN:-50}
IP_CIDR=${IP_CIDR:-10.50.0.10/24}
GATEWAY=${GATEWAY:-10.50.0.1}
DNS=${DNS:-$GATEWAY}
CORES=${CORES:-2}
MEMORY_MB=${MEMORY_MB:-4096}
DISK_GB=${DISK_GB:-40}
CI_USER=${CI_USER:-smgadmin}
BACKUP_STORAGE=${BACKUP_STORAGE:-}
: "${MGMT_CIDR:?Set MGMT_CIDR to the network allowed to SSH in, e.g. MGMT_CIDR=10.10.0.0/24}"
: "${SSH_KEY_FILE:?Set SSH_KEY_FILE to your SSH public key file}"

IMG_URL=https://cloud-images.ubuntu.com/noble/current
IMG_NAME=noble-server-cloudimg-amd64.img
IMG_DIR=/var/lib/vz/template/cloudimg
HERE=$(cd "$(dirname "$0")" && pwd)

die() { echo "error: $*" >&2; exit 1; }

command -v qm >/dev/null || die "run this on the Proxmox host (qm not found)"
[ -r "$SSH_KEY_FILE" ] || die "cannot read $SSH_KEY_FILE"
qm status "$VMID" >/dev/null 2>&1 && die "VM $VMID already exists; pick another VMID"

# Storage must accept VM disks. Proxmox's default 'local' only holds ISOs and backups.
if ! pvesm status --content images | awk 'NR>1 {print $1}' | grep -qx "$STORAGE"; then
  die "storage '$STORAGE' does not accept disk images. Either enable 'Disk image' on it
       (Datacenter > Storage > $STORAGE > Content) or rerun with STORAGE=local-lvm"
fi
STORAGE_TYPE=$(pvesm status | awk -v s="$STORAGE" '$1==s {print $2}')
DISK_FMT=""
[ "$STORAGE_TYPE" = "dir" ] && DISK_FMT=",format=qcow2"

TAG=""
if [ "$VLAN" = "none" ]; then
  # Without a VLAN, the VM's Proxmox firewall rules are the only isolation from the LAN.
  pve-firewall status 2>/dev/null | grep -q "enabled/running" || die "VLAN=none needs the Proxmox firewall running.
       Datacenter > Firewall > Options: first set 'Input Policy' to ACCEPT (so host
       access over LAN and Tailscale is unaffected), then set 'Firewall' to Yes. Rerun."
else
  TAG=",tag=$VLAN"
fi

# VLAN tagging needs a VLAN-aware bridge.
if [ -n "$TAG" ] && [ "$(cat "/sys/class/net/$BRIDGE/bridge/vlan_filtering" 2>/dev/null)" != "1" ]; then
  die "bridge $BRIDGE is not VLAN aware. In the Proxmox UI: Node > System > Network >
       $BRIDGE > tick 'VLAN aware', apply, then rerun"
fi

echo "==> Downloading and verifying Ubuntu 24.04 cloud image"
mkdir -p "$IMG_DIR"
cd "$IMG_DIR"
curl -fsSLO "$IMG_URL/SHA256SUMS"
if [ ! -f "$IMG_NAME" ] || ! grep " \*\?$IMG_NAME\$" SHA256SUMS | sha256sum -c --status; then
  curl -fL --progress-bar -o "$IMG_NAME" "$IMG_URL/$IMG_NAME"
  grep " \*\?$IMG_NAME\$" SHA256SUMS | sha256sum -c - || die "checksum mismatch for $IMG_NAME"
fi

echo "==> Creating VM $VMID ($NAME) on $BRIDGE${TAG:+, VLAN $VLAN}"
qm create "$VMID" \
  --name "$NAME" \
  --description "365 SMG Client Portal (portal.365smg.com). Created by deploy/proxmox/create-vm.sh" \
  --ostype l26 --machine q35 --cpu host --cores "$CORES" --memory "$MEMORY_MB" \
  --scsihw virtio-scsi-single \
  --net0 "virtio,bridge=$BRIDGE$TAG,firewall=1" \
  --agent enabled=1 --serial0 socket --vga serial0 \
  --onboot 1 --tags smg-portal
qm set "$VMID" --scsi0 "$STORAGE:0,import-from=$IMG_DIR/$IMG_NAME,discard=on,ssd=1,iothread=1$DISK_FMT"
qm set "$VMID" --boot order=scsi0
qm disk resize "$VMID" scsi0 "${DISK_GB}G"
qm set "$VMID" --ide2 "$STORAGE:cloudinit"
qm set "$VMID" --ciuser "$CI_USER" --sshkeys "$SSH_KEY_FILE" \
  --ipconfig0 "ip=$IP_CIDR,gw=$GATEWAY" --nameserver "$DNS" --ciupgrade 1

echo "==> Writing VM firewall rules (/etc/pve/firewall/$VMID.fw)"
sed -e "s#@MGMT_CIDR@#$MGMT_CIDR#g" -e "s#@DNS@#$DNS#g" \
  "$HERE/vm-firewall.fw" > "/etc/pve/firewall/$VMID.fw"

if [ -n "$BACKUP_STORAGE" ]; then
  echo "==> Adding nightly backup job to $BACKUP_STORAGE"
  pvesh create /cluster/backup --vmid "$VMID" --storage "$BACKUP_STORAGE" \
    --schedule "02:30" --mode snapshot --compress zstd \
    --prune-backups "keep-daily=7,keep-weekly=4" --enabled 1 \
    --comment "smg-portal nightly"
fi

qm start "$VMID"

if ! pve-firewall status 2>/dev/null | grep -q "enabled/running"; then
  echo
  echo "WARNING: the Proxmox firewall is not enabled at datacenter level, so the VM's"
  echo "rules are not enforced yet. See deploy/README.md, 'Proxmox firewall', before enabling it."
fi

cat <<EOF

Done. VM $VMID is booting at ${IP_CIDR%/*} (first boot takes a minute or two).
Next: ssh $CI_USER@${IP_CIDR%/*} and follow deploy/README.md, step 3.
EOF
