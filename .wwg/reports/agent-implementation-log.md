# Agent Implementation Log

## 2026-07-01 Public HRIS Restore

Task mode: Mixed runtime incident repair and WWG documentation update.

Current-state finding:
- PROD and UAT public app pages were loading, but the stale frontend container
  image caused browser traffic to attempt public `:3001` API calls and strand
  session validation.
- DEV public `https://dev.bnpi-hris.tech/` returned Cloudflare 502 because
  `hris-api-dev` and `hris-app-dev` Docker containers were missing; only
  `hris-postgres-dev` was running.
- K3s HRIS workloads for DEV/UAT/PROD were already paused at zero replicas.
  Docker Compose, not K3s, is the current public serving path.

Actions taken:
- Stopped a stale interrupted frontend build process on the VM.
- Recreated only `hris-app` and `hris-app-uat` from existing
  `hris-app-local:develop`
  `sha256:fa41efd235cbb372b7b9c2cd631081d8f7a6738af464b7ca67a0dcf47cdd83c5`.
- Recreated only `hris-api-dev` and `hris-app-dev` with Docker Compose
  `--no-build`, leaving `hris-postgres-dev` and its volume untouched.
- Did not run migrations, seeders, imports, database resets, K3s re-enable, or
  Argo app creation during this restore.

Validation:
- PROD origin:
  `http://localhost:3000/auth/login` HTTP 200,
  `http://localhost:3000/api/auth/me` HTTP 401,
  `http://localhost:3001/health` HTTP 200.
- UAT origin:
  `http://localhost:3200/auth/login` HTTP 200,
  `http://localhost:3201/health` HTTP 200.
- DEV origin:
  `http://localhost:3100/auth/login` HTTP 200,
  `http://localhost:3100/api/auth/me` HTTP 401,
  `http://localhost:3101/health` HTTP 200.
- Browser verification:
  `https://bnpi-hris.tech/` and `https://dev.bnpi-hris.tech/` both loaded the
  HR Management System login screen.
- Browser network proof:
  PROD requested `https://bnpi-hris.tech/api/system-provisioning/status` HTTP
  200; DEV requested `https://dev.bnpi-hris.tech/api/system-provisioning/status`
  HTTP 200. No public browser request to `:3001` was observed.

Evidence:
- VM restore evidence:
  `/var/lib/project-truth/backups/public-app-session-restore-20260701-061721`
- DEV restore evidence:
  `/var/lib/project-truth/backups/dev-public-origin-restore-20260701-062006`
- Browser screenshots:
  `.runtime/browser-evidence/screenshots/bnpi-public-after-restore.png`
  and `.runtime/browser-evidence/screenshots/dev-public-after-restore.png`

Drift guard note:
- Do not “fix” this by importing workbook data, resetting databases, or
  re-enabling K3s. The incident was public runtime routing/container drift, not
  a DM workbook mount problem.
- Future agents must first prove which runtime is serving the public hostname
  before touching data. As of this entry, public HRIS is Docker Compose behind
  the named Cloudflare Tunnel.

## 2026-07-01 Device Linux SDK Truth Documentation

Task mode: Mixed docs/truth synchronization with external SDK research.

Current-state finding:
- ZKTeco realtime attendance-terminal ingestion is not currently proven inside
  the Ubuntu VM or Linux Docker. Project Truth's proven sidecar path is still
  `appliance/zkteco-standalone-sdk`, which targets Windows COM / .NET Framework
  4.8.
- Hikvision has a proven DEV VM/K3s ACS-pull watcher through the existing ISAPI
  flow, but Project Truth does not yet have a Linux HCNetSDK/AlarmDemo listener
  or SDK container.

Actions taken:
- Updated `docs/ZKTECO_RUNTIME_TRUTH.md` with Linux VM/Docker feasibility
  boundaries and SDK-source findings.
- Updated `docs/HIKVISION_RUNTIME_TRUTH.md` with Linux VM/Docker feasibility
  boundaries and SDK-source findings.
- Synced the same boundaries into `.wwg/wiki/project-truth.md` and
  `.wwg/wiki/project-truth-summary.md`.
- Added proposed follow-up `REC-20260701-DEVICE-LINUX-SDK-PROOF` to
  `.wwg/governance/recommendation-registry.md`.

External source findings:
- Official ZKTeco Linux SDK material found during this pass is `ZKFinger SDK
  Linux`, which is scanner/template focused, not confirmed as the
  attendance-terminal Standalone/Pull runtime Project Truth needs.
- Hikvision publishes a Linux 64-bit Device Network SDK, so a Linux HCNetSDK
  runtime is plausible but remains unimplemented and unproven here.
