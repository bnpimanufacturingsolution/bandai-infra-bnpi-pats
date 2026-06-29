# Cloudflare Named Tunnel Runbook

## Current Canonical Path

Project Truth public access uses the named Cloudflare Tunnel `bnpi-hris`.

```text
Windows host cloudflared
-> cloudflared-bnpi-hris.yml
-> Hyper-V VM LAN IP
-> HRIS app/API/dev/uat/Grafana ports
-> bnpi-hris.tech public hostnames
```

Current tunnel:

```text
Name: bnpi-hris
ID: e3486f00-f974-46d3-9e11-911266749d00
Config: cloudflared-bnpi-hris.yml
Current connectors: Windows host scheduled task and optional VM-side systemd
```

The Windows host remains the canonical bootstrap owner for fresh imports. The wrapper discovers the
running VM LAN IP, rewrites `cloudflared-bnpi-hris.yml`, starts one named tunnel
connector, and writes evidence under `.runtime/cloudflare-named-tunnel`.

The current proof VM can also run the same named tunnel inside Linux after the
credential is imported as root-only runtime state. That VM-side connector targets
`localhost` services, including `ssh://localhost:22`, and does not require
router port forwarding, Windows hosts-file changes, or Windows network changes.

## Host-Managed Startup

Use this after a fresh VM import, reboot, DHCP change, DNS drift, or public access drift:

```powershell
.\scripts\project-truth.ps1 start-bnpi-cloudflare-tunnel -RepairScheduledTask -ProvisionDns -VerifyPublic
```

The wrapper:

- starts `project-truth-local-vhdx-proof` if needed,
- discovers the VM LAN IP,
- verifies the production app origin,
- rewrites `cloudflared-bnpi-hris.yml`,
- optionally provisions the public DNS routes, including `ssh.bnpi-hris.tech`,
- stops conflicting `cloudflared` named tunnel processes,
- starts the `bnpi-hris` tunnel,
- optionally verifies public URLs.

To check a Windows host before running or exporting the appliance setup:

```powershell
.\scripts\project-truth.ps1 ensure-bnpi-cloudflare-host
```

To repair DNS routes and start the tunnel from one command:

```powershell
.\scripts\project-truth.ps1 ensure-bnpi-cloudflare-host -ProvisionDns -StartTunnel -VerifyPublic
```

## Public URLs

```text
https://bnpi-hris.tech/auth/login
https://www.bnpi-hris.tech/auth/login
https://app.bnpi-hris.tech/auth/login
https://api.bnpi-hris.tech/health
https://dev.bnpi-hris.tech/auth/login
https://dev-api.bnpi-hris.tech/health
https://uat.bnpi-hris.tech/auth/login
https://uat-api.bnpi-hris.tech/health
https://grafana.bnpi-hris.tech/api/health
```

Same-host API routing is also expected:

```text
https://bnpi-hris.tech/api/*
```

## Fresh Or Final Images

Fresh VM images should not contain Cloudflare tunnel credentials. The repeatable
host-managed setup is:

1. Boot/import the fresh Project Truth VM.
2. Let the VM obtain a LAN IP.
3. From the Windows host, run:

```powershell
.\scripts\project-truth.ps1 start-bnpi-cloudflare-tunnel -RepairScheduledTask -ProvisionDns -VerifyPublic
```

This model works on another Windows host only after that host has:

- `cloudflared` installed,
- access to the Cloudflare account that owns `bnpi-hris.tech`,
- the named tunnel credentials installed under the operator's `.cloudflared`
  profile, or a deliberate credential import step,
- network reachability to the VM LAN IP.

If the target host does not yet have Cloudflare account trust, run:

```powershell
.\scripts\project-truth.ps1 ensure-bnpi-cloudflare-host -Login
```

This starts the browser login for the Cloudflare tunnel-management certificate.
The named tunnel credential JSON is still secret material and must be imported
securely or recreated out-of-band. Do not put it in the repo or appliance image.

## VM-Managed Runtime Connector

A VM-managed tunnel can be cleaner for appliance portability because cloudflared
runs inside the VM and targets localhost services:

```yaml
ingress:
  - hostname: bnpi-hris.tech
    path: /api/.*
    service: http://localhost:3001
  - hostname: bnpi-hris.tech
    service: http://localhost:3000
  - hostname: api.bnpi-hris.tech
    service: http://localhost:3001
  - hostname: grafana.bnpi-hris.tech
    service: http://localhost:53000
```

To install it on a running VM, copy the named tunnel credential JSON to a
temporary VM path, then run:

```bash
sudo project-truth-cloudflare-vm-tunnel /tmp/e3486f00-f974-46d3-9e11-911266749d00.json
rm -f /tmp/e3486f00-f974-46d3-9e11-911266749d00.json
```

The script writes:

```text
/etc/cloudflared/e3486f00-f974-46d3-9e11-911266749d00.json
/etc/cloudflared/config.yml
/etc/systemd/system/cloudflared-bnpi-hris.service
```

Do not run this during image baking. Fresh/final images must still avoid baked
tunnel credentials. Import the credential only as a deliberate runtime setup
step on the target VM.

## SSH Through Domain

Public SSH through the domain is possible with Cloudflare Access TCP/SSH, not
with normal HTTPS routing.

Preferred hostname:

```text
ssh.bnpi-hris.tech
```

Current host-managed origin:

```text
ssh://192.168.254.148:22
```

VM-managed origin if enabled:

```text
ssh://localhost:22
```

Verified client command:

```powershell
ssh -i $env:USERPROFILE\.ssh\node-health-appliance_ed25519 `
  -o ProxyCommand="cloudflared access ssh --hostname %h" `
  infra@ssh.bnpi-hris.tech
```

The Windows SSH alias is also configured on the current host:

```powershell
ssh project-truth-hris
```

Current status: DNS route, tunnel ingress, Cloudflare Access policy, public SSH,
alias login, and a VM-side Linux connector with `ssh://localhost:22` ingress are
verified. The Access policy currently allows `1bis.solutions.tech@gmail.com`.

## TryCloudflare Boundary

TryCloudflare quick tunnels are deprecated for the normal Project Truth path.
They may remain as a manual, temporary proof tool only. They must not appear as
the default VM/SSH visual proof path, and random `*.trycloudflare.com` URLs must
not be treated as durable project truth.
