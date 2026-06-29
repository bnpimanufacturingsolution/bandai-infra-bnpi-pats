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

- Current tunnel bootstrap ownership: host-managed on the Windows host.
- Current proof VM also has a VM-managed connector active after deliberate root-only credential import.
- Canonical startup/repair command:

```powershell
.\scripts\project-truth.ps1 ensure-bnpi-cloudflare-host -ProvisionDns -StartTunnel -VerifyPublic
```

- Fresh/final images must not contain Cloudflare tunnel credentials.
- TryCloudflare is disabled by default and remains only a deprecated manual proof tool.
- Public SSH through `ssh.bnpi-hris.tech` is verified through Cloudflare Access and the host-managed named tunnel.
- Public SSH through `ssh.bnpi-hris.tech` is also verified through the VM-side connector using `ssh://localhost:22`.

## Evidence

- Runtime VM: `project-truth-local-vhdx-proof`
- Current VM LAN IP: `192.168.254.148`
- LAN SSH: `ssh -i %USERPROFILE%\.ssh\node-health-appliance_ed25519 infra@192.168.254.148`
- Named tunnel: `bnpi-hris`
- Named tunnel ID: `e3486f00-f974-46d3-9e11-911266749d00`
- Public verification artifact: `.runtime/cloudflare-drift-proof/20260629-220610/public-verification-final.json`
- VM text proof: `.runtime/cloudflare-drift-proof/20260629-220610/screen-overview.txt`, `.runtime/cloudflare-drift-proof/20260629-220610/screen-tunnels.txt`, `.runtime/cloudflare-drift-proof/20260629-220610/vm-text-surfaces.txt`
- Named tunnel wrapper evidence: `.runtime/cloudflare-named-tunnel/20260629-220627/bnpi-cloudflare-tunnel.json`
- Latest host readiness/provision evidence: `.runtime/cloudflare-host-readiness/20260629-223648/bnpi-cloudflare-host-readiness.json`
- Latest SSH DNS/ingress evidence: `.runtime/cloudflare-named-tunnel/20260629-223910/bnpi-cloudflare-tunnel.json`

## Validation Notes

- LAN SSH and LAN HRIS endpoints passed.
- Public app/API/dev/uat/Grafana checks passed after connector warmup.
- CORS preflight returned HTTP 204.
- Wrong-password auth probe returned HTTP 401.
- `ssh.bnpi-hris.tech` DNS route and tunnel ingress were provisioned; LAN SSH passed; after Cloudflare Access policy allowed `1bis.solutions.tech@gmail.com`, SSH through `cloudflared access ssh --hostname %h` returned `SSH_ACCESS_OK`.
- On 2026-06-29, the named tunnel credential was imported into the proof VM as root-only runtime state, `cloudflared-bnpi-hris.service` was enabled and active, `cloudflared tunnel info bnpi-hris` showed a `linux_amd64` connector, and SSH through `ssh.bnpi-hris.tech` returned `SSH_DOMAIN_OK`.
- `git diff --check` passed.
- `wwg test-check --format plain` passed.
- `wwg validate` still fails on generated report truth-sync fields outside this Cloudflare task.

## Follow-Up Needed

- Decide whether VM-managed Cloudflare should become the canonical fresh-import path; this requires an explicit secure credential handoff procedure and must not bake credentials into images.
- Keep Cloudflare Access SSH policy in the `933c5547e32839d664d155ce8a7424d5` Zero Trust account aligned with the allowed operator email.
- Resolve existing WWG generated-report validation findings before release/commit claims that require a fully green WWG gate.
