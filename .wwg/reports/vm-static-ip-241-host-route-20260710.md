# VM Static IP 10.184.37.241 Host Route Repair - 2026-07-10

Status: COMPLETE

## Finding

The running Hyper-V VM already had the desired guest IP `10.184.37.241/24`,
but Windows could not reach it because `vEthernet (Default Switch)` only had
the Default Switch subnet address `192.168.224.1/20`. Windows therefore routed
`10.184.37.241` through Wi-Fi, where the VM was not reachable.

Hyper-V also reported the transient Default Switch guest IP
`192.168.237.193`. That address worked, but it is not the intended Project
Truth static VM target.

## Repair

Added `10.184.37.250/24` to `vEthernet (Default Switch)` so the Windows host
has a direct same-subnet path to the VM static IP.

Added `scripts/ensure-project-truth-vm-241-host-route.ps1` as an idempotent
host-side recovery command. It does not touch VM internals, Docker, WSL, or the
VM-managed Cloudflare tunnel. It ensures the host-side Default Switch address
exists and probes:

- `10.184.37.241:22`
- `10.184.37.241:3000`
- `10.184.37.241:3001`
- `10.184.37.241:15432`
- `10.184.37.241:15433`
- `10.184.37.241:15434`

## Validation

- Hyper-V reported VM state `Running`, switch `Default Switch`, and guest IPs
  including `10.184.37.241`.
- SSH to `infra@10.184.37.241` returned hostname `project-truth-node`.
- Windows TCP probes passed for SSH, app/API, and PROD/DEV/UAT DB ports.
- Prisma from Windows to DEV DB at `10.184.37.241:15433` returned:
  `db=bnpi-pats`, `user=postgres`, server port `5432`, and `public_tables=73`.
- `http://10.184.37.241:3001/health` passed.
- `http://localhost:3001/health` and admin login passed after the route repair.
- Headless browser login through `http://localhost:5175/auth/login` reached
  `http://localhost:5175/admin/dashboard`.

## Evidence

- Evidence directory:
  `.runtime/vm-static-ip-241-repair-20260710-075945/`
- VM/IP proof screenshot:
  `.runtime/vm-static-ip-241-repair-20260710-075945/vm-10.184.37.241-proof.png`
- Browser refresh/login proof screenshot:
  `.runtime/vm-static-ip-241-repair-20260710-075945/localhost-app-refresh-login-proof.png`
- Script proof:
  `.runtime/vm-static-ip-241-repair-20260710-075945/ensure-project-truth-vm-241-host-route-output.json`

## Recommendation Review

No new recommendations were identified.

## WWG Truth Synchronization

- Task mode: Mixed infrastructure/runtime repair and host-route validation
- New truth detected: YES at the time — host needed `10.184.37.250/24` on `vEthernet (Default Switch)` to reach guest static `10.184.37.241`
- Wiki updated: NO in this historical report; current Project Truth summary may supersede with later pure-static LAN evidence (`10.184.37.19` / `10.184.37.78`)
- Workspace updated: NO for this historical report
- Governance review completed: YES
- Drift status: STALE relative to later 2026-07-03+ pure-static LAN cutover — treat `10.184.37.241` host-route proof as incident snapshot, not current canonical operator IP
- Canonical files changed (historical pass):
  - `scripts/ensure-project-truth-vm-241-host-route.ps1`
  - Host-side Default Switch address assignment (not committed as VM guest change)
- Implementation discoveries synced:
  - Guest static IP alone is insufficient when host switch lacks a same-subnet address
  - Script is idempotent and must not touch Cloudflare tunnel, WSL, or Docker Desktop
- Remaining stale context:
  - Current operator/LAN target in Project Truth summary is pure static `10.184.37.19` with secondary `10.184.37.78`; do not assume `.241` is still the live target without fresh probe evidence
