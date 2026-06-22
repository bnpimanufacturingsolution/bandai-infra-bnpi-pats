# Cloudflare trycloudflare Tunnel Runbook

This runbook exposes the verified Project Truth HRIS app through a temporary Cloudflare quick tunnel. It does not configure a named tunnel, DNS record, account token, or persistent Cloudflare service.

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

## Stop Tunnel

Press `Ctrl+C` in the terminal running `cloudflared`.

## Troubleshooting

```powershell
.\scripts\project-truth.ps1 verify-local-hris-runtime -Environment prod
docker ps
docker compose -f appliance\docker-compose.yml ps
```

Do not expose local services that contain production secrets or private client data unless the operator has approved the public tunnel.
