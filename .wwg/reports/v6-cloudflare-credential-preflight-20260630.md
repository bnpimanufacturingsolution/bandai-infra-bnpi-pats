# V6 Cloudflare Credential Preflight - 2026-06-30

## Summary

Task mode: infrastructure/runtime credential preflight.

Result: The named Cloudflare Tunnel credential is available on this Windows host
and has been copied into a stable host-side handoff path for V6 one-shot import.
The current proof VM already has the matching credential installed root-only and
its VM-side `cloudflared-bnpi-pats.service` is active.

## Host Credential State

- Tunnel ID: `e3486f00-f974-46d3-9e11-911266749d00`
- User-profile credential source exists:
  `%USERPROFILE%\.cloudflared\e3486f00-f974-46d3-9e11-911266749d00.json`
- Stable V6 handoff credential path now exists:
  `C:\ProgramData\ProjectTruth\secrets\cloudflared\e3486f00-f974-46d3-9e11-911266749d00.json`
- Stable credential JSON contains the required Cloudflare tunnel fields:
  `AccountTag`, `TunnelSecret`, and `TunnelID`.
- Stable credential ACL:
  - `NT AUTHORITY\SYSTEM`: full control
  - `BUILTIN\Administrators`: full control
  - current operator account: read
- Host Cloudflare origin cert exists:
  `%USERPROFILE%\.cloudflared\cert.pem`
- Host SSH key exists:
  `%USERPROFILE%\.ssh\node-health-appliance_ed25519`

## Current VM Credential State

- VM credential path exists:
  `/etc/cloudflared/e3486f00-f974-46d3-9e11-911266749d00.json`
- VM credential owner/mode:
  `root:root`, mode `600`
- VM credential SHA-256 prefix matches the stable host handoff credential.
- VM config path exists:
  `/etc/cloudflared/config.yml`
- VM config validation:
  `cloudflared tunnel --config /etc/cloudflared/config.yml ingress validate`
  returned `OK`.
- VM service:
  `cloudflared-bnpi-pats.service` is enabled and active.

## Public CORS Smoke

The public preflight checks for `system-provisioning/status` passed:

- PROD: `https://bnpi-pats.tech` -> `https://bnpi-pats.tech/api/system-provisioning/status`
- DEV: `https://dev.bnpi-pats.tech` -> `https://dev-api.bnpi-pats.tech/api/system-provisioning/status`
- UAT: `https://uat.bnpi-pats.tech` -> `https://uat-api.bnpi-pats.tech/api/system-provisioning/status`

Each returned HTTP `204` with `Access-Control-Allow-Origin` matching the request
origin and `Access-Control-Allow-Credentials: true`.

## Dry-Run Warnings

- `project-truth-ansible-pull.timer` exists and is active on the current proof
  VM, but its recorded sync commit is stale relative to current `develop`.
- `/opt/project-truth` on the current proof VM is a copied install tree rather
  than a normal git checkout, so V6 automation must verify ansible-pull state
  and the live runtime, not just run `git log` under `/opt/project-truth`.
- V6 one-shot must explicitly rebuild/recreate app/API containers when browser
  proof or container age shows stale local images.

## Required V6 Inputs

The one-shot V6 command should require or discover:

- Target VM LAN IP or VM name.
- SSH access as `infra`.
- SSH key:
  `%USERPROFILE%\.ssh\node-health-appliance_ed25519`
- Stable Cloudflare tunnel credential:
  `C:\ProgramData\ProjectTruth\secrets\cloudflared\e3486f00-f974-46d3-9e11-911266749d00.json`
- Branch:
  `develop`

## Recommended V6 Contract

The V6 image may include:

- `cloudflared`
- `project-truth-cloudflare-vm-tunnel`
- `cloudflared-bnpi-pats.service` template/support
- ansible-pull tooling
- Docker/K3s/Argo runtime tooling

The V6 image should not bake the actual Cloudflare tunnel credential. The
credential should be imported at runtime from the stable host handoff path above.

## Final Preflight Status

READY WITH WARNINGS.

The Cloudflare credential handoff is now available and validated. The main risk
for the overnight V6 run is stale ansible-pull/runtime image state, so the
one-shot command must include explicit sync, rebuild/recreate, LAN proof, public
CORS proof, and browser proof.
