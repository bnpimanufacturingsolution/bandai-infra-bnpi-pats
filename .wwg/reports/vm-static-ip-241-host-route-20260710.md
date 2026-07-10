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
  `db=hris`, `user=postgres`, server port `5432`, and `public_tables=73`.
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
