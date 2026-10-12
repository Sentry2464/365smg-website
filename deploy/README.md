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
| `vm/smg-admin` | VM, as `sudo smg-admin` | Creates 365 SMG staff accounts from the command line |
| `vm/smg-db-backup.*` | (installed by provision) | Daily consistent copy of the database at 02:00, kept 14 days |

Values used below: VM ID `150`, VM IP `10.50.0.10/24`, gateway and DNS `10.50.0.1`. Change
them if your VLAN 50 subnet is different; every script takes them as variables.

> **Until you've tested real accounts**, keep Cloudflare Access (step 4) in front of the portal
> so only 365 SMG staff can reach it. The portal has its own login with two-step codes; Access
> is a second gate you remove when clients start using it.

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

On the Proxmox host, `vmbr0` does **not** need to be VLAN aware. When it isn't, Proxmox
gives the tagged VM its own VLAN device and bridge (`vmbr0v50`) when the VM starts, so
`vmbr0` and the other guests are never touched.

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

### Without a VLAN (simpler)

If you'd rather not touch the router, put the VM straight on the LAN bridge and let the
Proxmox firewall isolate it. The same rules apply: SSH only from `MGMT_CIDR`, outbound to
the internet only, and nothing to private networks.

```bash
VLAN=none MGMT_CIDR=10.1.10.0/23 SSH_KEY_FILE=/root/smgadmin.pub \
IP_CIDR=<free-LAN-IP>/23 GATEWAY=10.1.10.1 DNS=10.1.10.1 bash ./create-vm.sh
```

Replace `<free-LAN-IP>` with an address outside your DHCP range that nothing uses: check
that it doesn't answer `ping` and isn't in the router's DHCP leases or ARP table. The script refuses to run until the
Proxmox firewall is enabled, because here it's the only thing keeping the VM apart from
the LAN. Enable it safely: *Datacenter › Firewall › Options*, set **Input Policy** to
`ACCEPT` first (so your own access to the host over LAN and Tailscale is unaffected),
then set **Firewall** to `Yes`. The VM's outbound traffic follows your LAN's route
(including a VPN tunnel, if the LAN uses one).

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
user `smg`, the `smg-portal` service and a daily database copy. It also writes
`/etc/smg-portal.env` with a newly generated `SMG_SECRET_KEY`. At the end it prints a **deploy key**.

> **Save `SMG_SECRET_KEY` somewhere safe**, such as your password manager. It encrypts the
> authenticator secrets in the database. If the VM is rebuilt without it, every user has
> to set up two-step login again.

Add that key to GitHub: *sentry2464/365smg-website › Settings › Deploy keys › Add deploy key*,
title `smg-portal VM`, **leave "Allow write access" off**.

## 4. Cloudflare Tunnel and Access

Requires the `365smg.com` DNS zone to be on Cloudflare.

1. In Cloudflare **Zero Trust › Networks › Tunnels › Create a tunnel**, choose *Cloudflared*,
   name it `smg-portal`, and copy the token from the install command it shows.
2. On the VM: `sudo cloudflared service install <TOKEN>`
3. In the tunnel's **Public hostnames** tab, add: subdomain `portal`, domain `365smg.com`,
   service type `HTTP`, URL `localhost:3000`.
4. **Until clients start using it**, add a second gate: *Zero Trust › Access › Applications ›
   Add › Self-hosted*, domain `portal.365smg.com`, policy *Allow* for emails ending in
   `@365smg.com` (one-time PIN login). Delete this application when you open the portal to clients.

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

## 6. Accounts and email

Create your own admin account on the VM (it prints a one-time password):

```bash
sudo smg-admin create-staff --email you@365smg.com --name "Your Name"
sudo smg-admin create-staff --email pi@365smg.com --name "Investigator Name" --role investigator
```

Sign in at https://portal.365smg.com: you choose a new password, then scan a QR code with
an authenticator app (Microsoft Authenticator, Google Authenticator, 1Password and so on).
Every later sign-in asks for the 6-digit code.

From then on, use **Portal admin** in the browser to add clients, their sites (with
coordinates) and their users. Each new user gets a temporary password to pass on by phone
or in person. Admins can also reset passwords and two-step login and disable accounts. If
someone loses their phone, confirm who they are, then use *Reset two-step*.

| Role | Can see |
| --- | --- |
| Client user | Their own client's portal only |
| Admin | Clients, sites, users, feedback inbox, audit log. **Not** investigation details |
| Investigator | Confidential investigation requests (every view is logged) |

**Email.** Fill in the `SMTP_*` lines in `/etc/smg-portal.env` (Microsoft 365 or Google
Workspace SMTP relay both work), set `NOTIFY_INVESTIGATIONS_TO`, then
`sudo systemctl restart smg-portal`. Feedback goes to each client's account manager email.
Investigation alerts carry only the case reference, never the details. Until SMTP is set,
messages are written to `journalctl -u smg-portal` instead.

## Live alerts

The portal checks public feeds every 5 minutes from the `smg-portal` service and shows
each client only the alerts at or near their own sites (sites need coordinates).

| Feed | Setting in `/etc/smg-portal.env` | Notes |
| --- | --- | --- |
| National Weather Service watches and warnings | on unless `SMG_FEED_NWS=0` | Public domain. Matched to each site's location. |
| DHS National Terrorism Advisory System | on unless `SMG_FEED_NTAS=0` | Checked every 30 minutes. An active advisory shows to every client. |
| FDLE missing persons alerts | on unless `SMG_FEED_FDLE=0` | Checked every 30 minutes (HTML page; FDLE has no feed). AMBER Alerts statewide, other alerts for Central Florida cities (`SMG_FDLE_CITIES` to change). Type, name, date, city and a link to FDLE's flyer only. |
| FDLE sexual offender/predator registry | per client, in *Portal admin › client* (off by default); `SMG_FEED_REGISTRY=0` stops it | Every 6 hours, FDLE's public data file for the counties of opted-in clients' sites (automated download per FDLE's public data file memo). Registrants within `SMG_REGISTRY_RADIUS_MI` (default 1) are listed unaltered with FDLE's warnings; Confinement and Deceased are left out. Addresses placed with the Census batch geocoder. Every view is audit-logged. |
| FBI Wanted | on unless `SMG_FEED_FBI=0` | Checked every 3 hours. A list card for `SMG_FBI_FIELD_OFFICES` (default `tampa`; comma-separated api.fbi.gov slugs). No map pins: the FBI gives no locations. |
| Orlando PD dispatched calls | `SMG_FEED_OPD=1` | Crime-related calls within `SMG_CRIME_RADIUS_MI` (default 1) of a site, kept 12 hours. Block addresses are placed with the US Census geocoder. Turn on only with the City's OK to show them to clients. |

`SMG_API_CONTACT` is the contact sent to these services, as they ask. Feed health:
`sudo -u smg sqlite3 /var/lib/smg/portal.db "select * from feed_status"`. After changing
settings, `sudo systemctl restart smg-portal`.

## 7. Backups

Use *Datacenter › Backup › Add*: VM 150, schedule `02:30`, mode *Snapshot*, retention
7 daily and 4 weekly, stored on a **Proxmox Backup Server or NAS**. A backup on the same
disk as the VM doesn't survive a disk failure. Test a restore once before launch.

The database is a single SQLite file, `/var/lib/smg/portal.db`. A timer copies it every
night at 02:00 to `/var/lib/smg/backups/` (kept 14 days), and the VM backup includes both.
To restore one day's copy: `sudo systemctl stop smg-portal`, copy the backup over
`portal.db` (as user `smg`), then `sudo systemctl start smg-portal`.

## Troubleshooting

```bash
systemctl status smg-portal          # app service
journalctl -u smg-portal -f          # app logs
systemctl status cloudflared         # tunnel
curl -I http://127.0.0.1:3000/portal # app answering locally?
sudo ufw status verbose              # host firewall
```

On the Proxmox host: `pve-firewall status`, and the VM's *Firewall › Log* tab shows dropped traffic.
