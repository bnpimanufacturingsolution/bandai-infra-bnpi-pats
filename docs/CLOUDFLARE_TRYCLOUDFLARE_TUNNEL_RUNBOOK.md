# Cloudflare trycloudflare Tunnel Runbook

This runbook exposes the verified Project Truth HRIS app through a temporary Cloudflare quick tunnel. It does not configure a named tunnel, DNS record, account token, or persistent Cloudflare service.

Cloudflare quick tunnels are an experimental Project Truth test path. Current
appliance builds opt in by default for demo proof by writing:

```powershell
EXPERIMENTAL_TRY_CLOUDFLARE=true
```

Research constraints from Cloudflare docs:

- Quick tunnels generate a random `https://*.trycloudflare.com` URL for the local server and are for testing.
- Cloudflare Tunnel creates outbound-only connections, so no inbound router port forward is required.
- Stable multi-service routing belongs to named tunnels with config/DNS, not quick tunnels.
- Quick tunnels can be blocked when a `.cloudflared/config.yaml` exists; move it only when that is safe and reversible.
- Raw Postgres/database tunnels are disabled by default. Record redacted DB topology facts instead.

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

## VM Boot Test Hook

The VM image includes an enabled boot hook. Reapply it manually after drift with:

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
