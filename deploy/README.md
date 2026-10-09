# Deploying the Client Portal on Proxmox

The client portal runs on its own Ubuntu 24.04 VM on VLAN 50 and is published at
**https://portal.365smg.com** through a Cloudflare Tunnel. The VM accepts no inbound web
traffic: `cloudflared` makes an outbound connection to Cloudflare, and Next.js listens on
`127.0.0.1:3000` only. On this VM, `/` redirects to `/portal` and the marketing pages
return 404 (`PORTAL_ONLY=1`, see `src/proxy.ts`).

```
client ──https──▶ Cloudflare ◀──tunnel (outbound)── cloudflared ─▶ 127.0.0.1:3000 Next.js
                                                   └──────── VM smg-portal, VLAN 50 ────────┘
```

| File | Runs on | Purpose |
| --- | --- | --- |
| `proxmox/create-vm.sh` | Proxmox host, as root | Creates the VM from the Ubuntu cloud image, on VLAN 50, with firewall rules |
| `proxmox/vm-firewall.fw` | (template) | Proxmox firewall rules for the VM |
| `vm/provision.sh` | VM, with sudo, once | Updates, firewall, Node 22, cloudflared, app user, deploy key, service |
| `vm/deploy.sh` | VM, as `sudo smg-deploy` | Pulls, builds, releases, health-checks, rolls back on failure |
| `vm/smg-portal.service` | (installed by provision) | systemd unit for the Next.js server |

Values used below: VM ID `150`, VM IP `10.50.0.10/24`, gateway and DNS `10.50.0.1`. Change
them if your VLAN 50 subnet is different; every script takes them as variables.

> **Before Phase 3 (logins) is done**, the portal only shows sample data and has no login.
> Step 4 puts Cloudflare Access in front of it so only 365 SMG staff can open it.

---

## 1. Network: VLAN 50

On your router/firewall and switches:

1. Create **VLAN 50** with its own subnet (e.g. `10.50.0.0/24`, gateway `10.50.0.1`) and DNS on the gateway.
2. Make the switch port to the Proxmox host a **trunk** that carries VLAN 50 (tagged).
3. Add these firewall rules for VLAN 50, in this order:

| # | From | To | Ports | Action |
| --- | --- | --- | --- | --- |
| 1 | Management network | VLAN 50 | TCP 22 | Allow |
| 2 | VLAN 50 | Gateway `10.50.0.1` | DNS 53 | Allow |
| 3 | VLAN 50 | All private networks (office LAN, guard portal, GSOC, management, other VLANs) | any | **Deny** |
| 4 | VLAN 50 | Internet | 443, 80, 7844 (TCP+UDP), 123/UDP, 587 | Allow |
| 5 | Internet | VLAN 50 | any | **Deny** (no port forwards) |

The Proxmox VM firewall (step 2) enforces the same rules a second time on the host.

On the Proxmox host, the bridge must be **VLAN aware**: *Node › System › Network › vmbr0 ›
tick "VLAN aware" › Apply Configuration*. `create-vm.sh` checks this.

## 2. Create the VM (on the Proxmox host)

Copy the `deploy/proxmox` folder to the Proxmox host (for example with `scp`), and your SSH
public key too. Then, as root:

```bash
cd proxmox
MGMT_CIDR=10.10.0.0/24 SSH_KEY_FILE=/root/smgadmin.pub ./create-vm.sh
```

- `MGMT_CIDR` is the network you administer from. Only it can SSH to the VM.
- **Storage:** the script uses `local` by default. Proxmox's `local` storage normally holds
  only ISOs and backups. If the script says it doesn't accept disk images, either enable
  *Disk image* on it (*Datacenter › Storage › local › Content*) or rerun with
  `STORAGE=local-lvm`, which is the usual place for VM disks.
- Other settings: `VMID`, `IP_CIDR`, `GATEWAY`, `DNS`, `CORES`, `MEMORY_MB`, `DISK_GB`.
- `BACKUP_STORAGE=<storage id>` also creates the nightly backup job (step 6).

The VM gets 2 vCPU, 4 GB RAM, a 40 GB disk, a VLAN 50 NIC with the firewall on, starts at
boot, and has a user `smgadmin` that logs in with your key.

### Proxmox firewall

VM firewall rules are only enforced when the firewall is enabled for the datacenter
(*Datacenter › Firewall › Options › Firewall: Yes*). If it's off, the script warns you.
Before turning it on, make sure the datacenter rules allow your own access to the Proxmox
web UI (8006) and SSH from your management network, or you can lock yourself out.

## 3. Set up the VM

From a machine on the management network:

```bash
scp -r deploy/vm smgadmin@10.50.0.10:
ssh smgadmin@10.50.0.10
sudo MGMT_CIDR=10.10.0.0/24 ./vm/provision.sh
```

This installs updates (with automatic security updates and a 04:30 reboot when needed), a
host firewall that allows SSH from `MGMT_CIDR` only, Node.js 22, `cloudflared`, a service
user `smg`, and the `smg-portal` service. At the end it prints a **deploy key**.

Add that key to GitHub: *sentry2464/365smg-website › Settings › Deploy keys › Add deploy key*,
title `smg-portal VM`, **leave "Allow write access" off**.

## 4. Cloudflare Tunnel and Access

Requires the `365smg.com` DNS zone to be on Cloudflare.

1. In Cloudflare **Zero Trust › Networks › Tunnels › Create a tunnel**, choose *Cloudflared*,
   name it `smg-portal`, and copy the token from the install command it shows.
2. On the VM: `sudo cloudflared service install <TOKEN>`
3. In the tunnel's **Public hostnames** tab, add: subdomain `portal`, domain `365smg.com`,
   service type `HTTP`, URL `localhost:3000`.
4. **Until Phase 3 is live**, protect it: *Zero Trust › Access › Applications › Add › Self-hosted*,
   domain `portal.365smg.com`, policy *Allow* for emails ending in `@365smg.com` (one-time PIN
   login). Remove or loosen this when client logins ship.

## 5. Deploy, update, roll back

```bash
sudo smg-deploy                                         # latest commit on main
sudo BRANCH=claude/dreamy-franklin-rmnvi0 smg-deploy    # this branch, before it's merged
sudo smg-deploy --rollback                              # previous release
```

Each deploy builds into `/opt/smg-portal/releases/<time>-<commit>`, switches the
`current` link, restarts the service and checks `http://127.0.0.1:3000/portal`. If the check
fails it switches back automatically. The last 5 releases are kept.

Then open https://portal.365smg.com: it should redirect to `/portal`.

## 6. Backups

Use *Datacenter › Backup › Add*: VM 150, schedule `02:30`, mode *Snapshot*, retention
7 daily and 4 weekly, stored on a **Proxmox Backup Server or NAS**. A backup on the same
disk as the VM doesn't survive a disk failure. Test a restore once before launch.

App data (from Phase 3 on) lives in `/var/lib/smg` and is included in the VM backup.

## Troubleshooting

```bash
systemctl status smg-portal          # app service
journalctl -u smg-portal -f          # app logs
systemctl status cloudflared         # tunnel
curl -I http://127.0.0.1:3000/portal # app answering locally?
sudo ufw status verbose              # host firewall
```

On the Proxmox host: `pve-firewall status`, and the VM's *Firewall › Log* tab shows dropped traffic.
