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
Owner: Windows host scheduled task ProjectTruth-BNPI-HRIS-Cloudflared
```

The Windows host is the canonical owner for now. The wrapper discovers the
running VM LAN IP, rewrites `cloudflared-bnpi-hris.yml`, starts one named tunnel
connector, and writes evidence under `.runtime/cloudflare-named-tunnel`.

## Host-Managed Startup

Use this after a fresh VM import, reboot, DHCP change, or public access drift:

```powershell
.\scripts\project-truth.ps1 start-bnpi-cloudflare-tunnel -RepairScheduledTask -VerifyPublic
```

The wrapper:

- starts `project-truth-local-vhdx-proof` if needed,
- discovers the VM LAN IP,
- verifies the production app origin,
- rewrites `cloudflared-bnpi-hris.yml`,
- stops conflicting `cloudflared` named tunnel processes,
- starts the `bnpi-hris` tunnel,
- optionally verifies public URLs.

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
.\scripts\project-truth.ps1 start-bnpi-cloudflare-tunnel -RepairScheduledTask -VerifyPublic
```

This model works on another Windows host only after that host has:

- `cloudflared` installed,
- access to the Cloudflare account that owns `bnpi-hris.tech`,
- the named tunnel credentials installed under the operator's `.cloudflared`
  profile, or a deliberate credential import step,
- network reachability to the VM LAN IP.

## VM-Managed Option

A VM-managed tunnel can be cleaner for appliance portability because cloudflared
would run inside the VM and target localhost services:

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

Do not enable VM-managed mode until a secure credential install/import process
exists. Do not bake tunnel credentials into the repo or public image.

## SSH Through Domain

Public SSH through the domain is possible with Cloudflare Access TCP/SSH, not
with normal HTTPS routing.

Preferred hostname:

```text
ssh.bnpi-hris.tech
```

Host-managed origin if enabled:

```text
ssh://192.168.254.148:22
```

VM-managed origin if enabled:

```text
ssh://localhost:22
```

Client examples after Access app, policy, DNS, and tunnel ingress are configured:

```powershell
cloudflared access ssh --hostname ssh.bnpi-hris.tech
```

or:

```powershell
cloudflared access tcp --hostname ssh.bnpi-hris.tech --url localhost:2222
ssh -p 2222 infra@localhost
```

Current status: not enabled. Use LAN SSH until `ssh.bnpi-hris.tech` is configured
and verified.

## TryCloudflare Boundary

TryCloudflare quick tunnels are deprecated for the normal Project Truth path.
They may remain as a manual, temporary proof tool only. They must not appear as
the default VM/SSH visual proof path, and random `*.trycloudflare.com` URLs must
not be treated as durable project truth.

