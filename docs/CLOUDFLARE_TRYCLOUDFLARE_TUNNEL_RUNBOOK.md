# Deprecated TryCloudflare Tunnel Runbook

This is a legacy/manual proof runbook. The normal Project Truth public path is
the named Cloudflare Tunnel in
[Cloudflare Named Tunnel Runbook](CLOUDFLARE_NAMED_TUNNEL_RUNBOOK.md).

This runbook exposes the verified Project Truth HRIS app through a temporary
Cloudflare quick tunnel. It does not configure a named tunnel, DNS record,
account token, or persistent Cloudflare service.

Cloudflare quick tunnels are an experimental Project Truth test path. Current
appliance builds keep them disabled by default:

```powershell
EXPERIMENTAL_TRY_CLOUDFLARE=false
```

Research constraints from Cloudflare docs:

- Quick tunnels generate a random `https://*.trycloudflare.com` URL for the local server and are for testing.
- Cloudflare Tunnel creates outbound-only connections, so no inbound router port forward is required.
- Stable multi-service routing belongs to named tunnels with config/DNS, not quick tunnels.
- Quick tunnels can be blocked when a `.cloudflared/config.yaml` exists; move it only when that is safe and reversible.
- Raw Postgres/database access is not exposed through trycloudflare HTTP quick tunnels. Use Cloudflare Access arbitrary TCP with named hostnames and client-side `cloudflared access tcp`.

The preferred tunnel target is the Hyper-V VM's LAN-reachable PROD app:

```powershell
.\scripts\project-truth.ps1 start-trycloudflare-tunnel -LocalUrl http://<guest-lan-ip>:3000 -VerifyLocalFirst
```

Use `http://127.0.0.1:3000` only after the VM path is proven impossible or while running a host-local diagnostic.

## Prerequisites

```powershell
git branch --show-current
Get-Command docker
Get-Command cloudflared
```

`cloudflared` must be installed and available in `PATH`. The current HRIS appliance ports are:

| Environment | App | API |
|---|---:|---:|
| PROD | `http://<guest-lan-ip>:3000` | `http://<guest-lan-ip>:3001/health` |
| DEV | `http://<guest-lan-ip>:3100` | `http://<guest-lan-ip>:3101/health` |
| UAT | `http://<guest-lan-ip>:3200` | `http://<guest-lan-ip>:3201/health` |

Database LAN URLs are published by the VM on the bridged LAN:

| Environment | Postgres URL |
|---|---|
| PROD | `postgresql://postgres:postgres@<guest-lan-ip>:15432/hris` |
| DEV | `postgresql://postgres:postgres@<guest-lan-ip>:15433/hris` |
| UAT | `postgresql://postgres:postgres@<guest-lan-ip>:15434/hris` |

To inspect local DB access from the VM:

```bash
project-truth-db-access
```

## Host-Local Diagnostic Runtime

```powershell
.\scripts\project-truth.ps1 start-local-hris-runtime -Environment prod
```

For all local environments:

```powershell
.\scripts\project-truth.ps1 start-local-hris-runtime -Environment all
```

## Verify Host-Local Diagnostic Runtime

```powershell
.\scripts\project-truth.ps1 verify-local-hris-runtime -Environment all
```

## Start Temporary Public Tunnel To The Verified VM

PROD app:

```powershell
.\scripts\project-truth.ps1 start-trycloudflare-tunnel -LocalUrl http://<guest-lan-ip>:3000 -VerifyLocalFirst
```

Full experimental suite:

```powershell
$env:EXPERIMENTAL_TRY_CLOUDFLARE = "true"
.\scripts\project-truth.ps1 start-trycloudflare-suite -GuestIp <guest-lan-ip> -VerifyLocalFirst
```

Focused retry for only selected targets:

```powershell
$env:EXPERIMENTAL_TRY_CLOUDFLARE = "true"
.\scripts\project-truth.ps1 start-trycloudflare-suite -GuestIp <guest-lan-ip> -VerifyLocalFirst -TargetName prod-app,prod-api,grafana
```

The suite attempts these HTTP targets and writes evidence under
`.runtime\trycloudflare\<timestamp>`:

| Target | Local URL |
|---|---|
| PROD app | `http://<guest-lan-ip>:3000/auth/login` |
| PROD API | `http://<guest-lan-ip>:3001/health` |
| DEV app | `http://<guest-lan-ip>:3100/auth/login` |
| DEV API | `http://<guest-lan-ip>:3101/health` |
| UAT app | `http://<guest-lan-ip>:3200/auth/login` |
| UAT API | `http://<guest-lan-ip>:3201/health` |
| Grafana | `http://<guest-lan-ip>:53000/api/health` |
| Prometheus | `http://<guest-lan-ip>:9091/-/ready` |
| Loki | `http://<guest-lan-ip>:3110/ready` |

To stop previously started suite tunnels:

```powershell
.\scripts\project-truth.ps1 start-trycloudflare-suite -StopExisting -Force
```

If the Windows default DNS resolver lags on a new random quick-tunnel hostname,
the suite verifies public reachability by resolving the hostname through
Cloudflare public DNS and checking the HTTPS URL against the published Cloudflare
edge address. The generated proof JSON records this fallback in each target's
detail field.

## Diagnostic Fallback Tunnel

Use these only when the Hyper-V VM path is proven impossible or while explicitly testing host-local Docker.

PROD app:

```powershell
.\scripts\project-truth.ps1 start-trycloudflare-tunnel -LocalUrl http://127.0.0.1:3000 -VerifyLocalFirst
```

DEV app:

```powershell
.\scripts\project-truth.ps1 start-trycloudflare-tunnel -LocalUrl http://127.0.0.1:3100 -VerifyLocalFirst
```

UAT app:

```powershell
.\scripts\project-truth.ps1 start-trycloudflare-tunnel -LocalUrl http://127.0.0.1:3200 -VerifyLocalFirst
```

Cloudflare prints a temporary `https://*.trycloudflare.com` URL. That URL changes every time the tunnel restarts.

## Public Postgres Via Cloudflare Access TCP

Do not use trycloudflare quick tunnels for Postgres. Use named Cloudflare Tunnel hostnames protected by Cloudflare Access. Cloudflare's arbitrary TCP flow requires `cloudflared` on the host side and on every client machine.

Server-side helper:

```powershell
.\scripts\project-truth.ps1 start-cloudflare-db-tcp -GuestIp <guest-lan-ip>
```

Client-side commands:

```powershell
cloudflared access tcp --hostname db.bnpi-hris.tech --url localhost:5432
cloudflared access tcp --hostname dev-db.bnpi-hris.tech --url localhost:5433
cloudflared access tcp --hostname uat-db.bnpi-hris.tech --url localhost:5434
```

Then point the DB client at:

```text
postgresql://postgres:postgres@localhost:5432/hris
postgresql://postgres:postgres@localhost:5433/hris
postgresql://postgres:postgres@localhost:5434/hris
```

Direct `postgresql://postgres:postgres@db.bnpi-hris.tech:5432/hris` requires
Cloudflare WARP private routing or Spectrum/raw TCP. Normal Access TCP uses the
local forwarded URL above.

## VM Boot Test Hook

The VM image includes the legacy hook command, but the service is disabled by
default. Reapply it manually only for a temporary proof:

```bash
sudo install -d -m 0755 /etc/project-truth
printf 'EXPERIMENTAL_TRY_CLOUDFLARE=true\n' | sudo tee /etc/project-truth/experimental.env
sudo systemctl enable --now project-truth-trycloudflare.service
project-truth-lan-summary
```

When enabled, it waits for local HTTP health, starts quick tunnels, and writes
temporary public URLs to:

```text
/run/project-truth/trycloudflare-public-urls.txt
```

Disable and remove the driftable test state only when public demo URLs are not
wanted:

```bash
sudo systemctl disable --now project-truth-trycloudflare.service || true
sudo rm -f /etc/project-truth/experimental.env /run/project-truth/trycloudflare-public-urls.txt /run/project-truth/trycloudflare-pids.txt
```

## Stop Tunnel

Press `Ctrl+C` in the terminal running `cloudflared`.

## Troubleshooting

```powershell
.\scripts\project-truth.ps1 verify-local-hris-runtime -Environment prod
docker ps
docker compose -f appliance\docker-compose.yml ps
```

Do not expose local services that contain production secrets or private client data unless the operator has approved the public tunnel.
