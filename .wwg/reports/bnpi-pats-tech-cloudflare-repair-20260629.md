# BNPI BNPI PATS .tech Cloudflare Repair Report - 2026-06-29

## Task Mode

Mixed infrastructure/runtime repair and validation.

## Goal

Recover public access for `https://bnpi-pats.tech/auth/login` through the existing Cloudflare named tunnel and verify the VM app/API/login/Grafana path.

## Actions Taken

- Started the host-managed scheduled task `ProjectTruth-BNPI-PATS-Cloudflared`.
- Recovered the named tunnel connector for tunnel `bnpi-pats` / `1c8ee2c4-c9c5-4840-be39-639e4b5f605b`.
- Let the wrapper rediscover the live VM LAN IP.
- Updated `cloudflared-bnpi-pats.yml` from stale origin `10.184.38.91:3000` to live origin `192.168.254.148:3000`.
- Cleaned up accidental wrong-zone DNS records created under `uzaro.net`:
  - `bnpi-pats.tech.uzaro.net`
  - `www.bnpi-pats.tech.uzaro.net`
  - `app.bnpi-pats.tech.uzaro.net`

## Evidence

- VM origin discovered by wrapper: `192.168.254.148`.
- PROD app LAN: `http://192.168.254.148:3000/auth/login` returned HTTP 200 and title `HR Management System`.
- PROD API LAN: `http://192.168.254.148:3001/health` returned HTTP 200.
- DEV app/API LAN: `3100/auth/login` and `3101/health` returned HTTP 200.
- UAT app/API LAN: `3200/auth/login` and `3201/health` returned HTTP 200.
- Grafana LAN: `http://192.168.254.148:53000/api/health` returned HTTP 200.
- API CORS preflight to LAN API returned HTTP 204.
- Wrong-password login probe returned HTTP 401, confirming the auth endpoint is reachable and enforcing credentials.
- `cloudflared tunnel info bnpi-pats` showed an active connector.
- `bnpi-pats.tech`, `www.bnpi-pats.tech`, and `app.bnpi-pats.tech` still returned HTTP 530 / Cloudflare error 1033.

## Follow-Up Repair Result

After logging in to the Cloudflare account that owns `bnpi-pats.tech`, the mismatch was resolved:

- Cloudflare account: `933c5547e32839d664d155ce8a7424d5`
- Zone: `bnpi-pats.tech`
- Zone status: `active`
- New named tunnel: `bnpi-pats`
- New tunnel ID: `e3486f00-f974-46d3-9e11-911266749d00`
- Local credentials file: `%USERPROFILE%\.cloudflared\e3486f00-f974-46d3-9e11-911266749d00.json`

The old `cert.pem` was preserved as a timestamped backup before login.

## Public Verification After Repair

The wrapper regenerated `cloudflared-bnpi-pats.yml` from the live VM IP `192.168.254.148` and started the new connector. Public checks passed:

- `https://bnpi-pats.tech/auth/login` HTTP 200, title `HR Management System`
- `https://www.bnpi-pats.tech/auth/login` HTTP 200, title `HR Management System`
- `https://app.bnpi-pats.tech/auth/login` HTTP 200, title `HR Management System`
- `https://api.bnpi-pats.tech/health` HTTP 200
- `https://bnpi-pats.tech/api/auth/login` POST with wrong password returned HTTP 401 through same-host `/api/*` tunnel routing.
- `https://dev.bnpi-pats.tech/auth/login` HTTP 200, title `HR Management System`
- `https://dev-api.bnpi-pats.tech/health` HTTP 200
- `https://uat.bnpi-pats.tech/auth/login` HTTP 200, title `HR Management System`
- `https://uat-api.bnpi-pats.tech/health` HTTP 200
- `https://grafana.bnpi-pats.tech/api/health` HTTP 200
- Public CORS preflight against `https://api.bnpi-pats.tech/api/auth/login` returned HTTP 204.
- Public wrong-password login probes returned HTTP 401 on both `api.bnpi-pats.tech` and same-host `bnpi-pats.tech/api/*`, confirming the public auth endpoint is reachable and enforcing credentials.

## SSH and VM Summary Verification

- `Test-NetConnection 192.168.254.148 -Port 22` passed.
- OpenSSH key login succeeded with `%USERPROFILE%\.ssh\node-health-appliance_ed25519`.
- Pinned-host-key password login succeeded through `plink` with `infra / infra`; current SSH host key fingerprint is `SHA256:+Xxejdej6SPlSKBEvEO/++Hh3j+QvoFSetx6DZXxiok`.
- Live VM summary script was updated and installed to `/usr/local/bin/project-truth-lan-summary`.
- `/etc/issue`, `/etc/motd`, `/run/project-truth/network-summary.txt`, and `project-truth-lan-summary --screen-overview` now show the current SSH target `ssh infra@192.168.254.148`.
- Summary line-width check remained readable at max line length `66`; stale `10.184.38.91` was not present in the live generated summary files checked.

## Original Diagnosis

The VM, BNPI PATS app/API, Grafana, and local named tunnel connector are healthy after repair.

The remaining public `.tech` failure is Cloudflare-side routing/account drift. The local `cloudflared` certificate/token can only see the `uzaro.net` zone in account `49d353a7bd06c70dd6ae4bc1f3d3122c`; it cannot see `bnpi-pats.tech`. Running `cloudflared tunnel route dns bnpi-pats bnpi-pats.tech` therefore created records under `uzaro.net`, proving the local CLI identity is scoped to the wrong zone for `.tech`.

Most likely, `bnpi-pats.tech` is in a different Cloudflare account/context than the named tunnel `bnpi-pats`. Cloudflare returns error 1033 when the public hostname cannot resolve to a usable tunnel connector in the relevant account path.

## Required Fix Applied

Created a new named tunnel in the `bnpi-pats.tech` account, installed its credentials on this Windows host, updated `cloudflared-bnpi-pats.yml` and `scripts/start-bnpi-cloudflare-tunnel.ps1` to the new tunnel ID/credentials, routed all needed public hostnames, and restarted the connector.

## WWG Truth Synchronization

- Task mode: Mixed infrastructure/runtime repair and validation.
- New truth detected: Yes.
- Wiki updated: Yes.
- Workspace updated: No.
- Governance review completed: Yes.
- Drift status: Medium.
- Canonical files changed:
  - `.wwg/wiki/project-truth-summary.md`
  - `.wwg/wiki/project-truth.md`
  - `.wwg/governance/recommendation-registry.md`
  - `.wwg/reports/bnpi-pats-tech-cloudflare-repair-20260629.md`
  - `cloudflared-bnpi-pats.yml`
- Implementation discoveries synced:
  - VM live origin is currently `192.168.254.148`.
  - VM SSH is proven at `192.168.254.148:22`.
  - VM visible Project Truth summary now shows the current LAN SSH command and public Cloudflare endpoints.
  - Named tunnel connector is active under the Cloudflare account that owns `bnpi-pats.tech`.
  - Public `.tech` app/API/dev/uat/Grafana checks pass.
- Remaining stale context:
  - GitOps/Argo CD state was not re-proven against `192.168.254.148` during the SSH summary repair pass.
