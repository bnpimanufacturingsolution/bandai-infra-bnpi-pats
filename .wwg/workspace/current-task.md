# Current Task

Status: READY FOR REVIEW

## Task Summary

- Task mode: Mixed docs/config/runtime drift repair after Existing Project Adoption
- Existing Project Adoption context:
  - This repo was adopted into WWG from existing code/docs/config.
  - Code/docs/config remain evidence of operational reality.
  - Inferred or stale adoption truth must stay labeled and reconciled instead of silently overwritten.
- User request:
  - Make the `bnpi-hris.tech` named Cloudflare Tunnel the first-class public path.
  - Remove normal TryCloudflare usage from Project Truth, VM login, SSH login, visual proof, image/bootstrap, and WWG truth surfaces.
  - Clarify whether SSH can be accessed through the domain.
  - Clarify how fresh/final images work on another device.

## Current Decision

- Current tunnel ownership: host-managed on the Windows host.
- Canonical startup/repair command:

```powershell
.\scripts\project-truth.ps1 start-bnpi-cloudflare-tunnel -RepairScheduledTask -VerifyPublic
```

- Fresh/final images must not contain Cloudflare tunnel credentials.
- TryCloudflare is disabled by default and remains only a deprecated manual proof tool.
- Public SSH through `ssh.bnpi-hris.tech` is not enabled. It requires Cloudflare Access TCP/SSH configuration and verification.

## Evidence

- Runtime VM: `project-truth-local-vhdx-proof`
- Current VM LAN IP: `192.168.254.148`
- LAN SSH: `ssh -i %USERPROFILE%\.ssh\node-health-appliance_ed25519 infra@192.168.254.148`
- Named tunnel: `bnpi-hris`
- Named tunnel ID: `e3486f00-f974-46d3-9e11-911266749d00`
- Public verification artifact: `.runtime/cloudflare-drift-proof/20260629-220610/public-verification-final.json`
- VM text proof: `.runtime/cloudflare-drift-proof/20260629-220610/screen-overview.txt`, `.runtime/cloudflare-drift-proof/20260629-220610/screen-tunnels.txt`, `.runtime/cloudflare-drift-proof/20260629-220610/vm-text-surfaces.txt`
- Named tunnel wrapper evidence: `.runtime/cloudflare-named-tunnel/20260629-220627/bnpi-cloudflare-tunnel.json`

## Validation Notes

- LAN SSH and LAN HRIS endpoints passed.
- Public app/API/dev/uat/Grafana checks passed after connector warmup.
- CORS preflight returned HTTP 204.
- Wrong-password auth probe returned HTTP 401.
- `git diff --check` passed.
- `wwg test-check --format plain` passed.
- `wwg validate` still fails on generated report truth-sync fields outside this Cloudflare task.

## Follow-Up Needed

- Review and decide whether to implement VM-managed Cloudflare Tunnel as a future portability improvement.
- Review and decide whether to configure Cloudflare Access SSH for `ssh.bnpi-hris.tech`.
- Resolve existing WWG generated-report validation findings before release/commit claims that require a fully green WWG gate.
