# CORS K3s Runtime Repair 2026-07-01

## Task Mode

Mixed regression repair and runtime/GitOps drift investigation.

## Current-State Report

- Working repo: `C:\Users\anoni\OneDrive\Desktop\PROJECT_TRUTH_HYPERV_FRESH`
- Branch: `develop`
- Current VM LAN IP observed during repair: `10.184.38.144`
- Runtime serving DEV app/API: K3s host ports `3100` and `3101`
- Initial browser symptom: DEV app at `http://10.184.38.144:3100` failed credentialed requests to `http://10.184.38.144:3101/api/*` because preflight responses omitted `Access-Control-Allow-Credentials: true`.

## Findings

- K3s DEV API pod had `APP_ENV=dev` and `PORT=3001`, but no `CORS_CREDENTIALS`, `CORS_ORIGINS`, or `ALLOW_LAN_CORS`.
- GitOps runtime manifests for DEV/UAT/PROD did not explicitly set the API CORS env vars, while Docker Compose used `appliance/env/hris-api.env` with `CORS_CREDENTIALS=true`.
- Runtime manifests intentionally use `imagePullPolicy: Never`; K3s does not pull images from a registry in this appliance path. `enable-k8s-runtime` imports local images into K3s/containerd and stores the archive for pre-import.
- DEV data is split between runtimes: K3s DEV Postgres had `employees=7`; Docker `hris-postgres-dev` had `employees=2217`.
- No employee records were deleted by this CORS repair.

## Changes

- Added explicit `ALLOW_LAN_CORS=true`, `CORS_CREDENTIALS=true`, and `CORS_ORIGINS=...` to K3s API deployments in DEV/UAT/PROD runtime manifests.
- Corrected DEV Hikvision watcher manifest back to the client DEV target `HIKVISION-TEST001` at `10.184.38.215` after the operator clarified that this is the active client device endpoint.
- Extended `scripts/test-self-heal-contract.ps1` so CI checks the K3s runtime CORS contract.
- Added proposed follow-up `REC-20260701-DEV-K3S-DATA-SPLIT` for the Docker DEV to K3s DEV employee data split.

## Validation Evidence

- Before repair, DEV CORS preflights returned HTTP `204` with matching `Access-Control-Allow-Origin` but blank `Access-Control-Allow-Credentials`.
- After live API rollout, DEV `/api/system-provisioning/status` and `/api/auth/login` preflights returned HTTP `204` with `Access-Control-Allow-Credentials: true`.
- A wrong-password DEV login POST from origin `http://10.184.38.144:3100` reached the API and returned HTTP `401`, proving the browser path was no longer blocked at CORS.
- `npx tsx node_modules/mocha/bin/mocha --no-config tests/cors-origin.contract.spec.ts` passed.
- `.\scripts\test-self-heal-contract.ps1` passed `166` checks.
- `git diff --check` passed.

## WWG Truth Synchronization

- Task mode: mixed regression repair / runtime drift investigation.
- New truth detected: yes, current VM IP changed to `10.184.38.144`; DEV K3s and Docker DEV databases currently differ in employee count.
- Wiki updated: no; runtime IP and data split are incident-level evidence and should be promoted only after review.
- Workspace updated: no.
- Governance review completed: yes; recommendation registry updated.
- Drift status: medium.
- Canonical files changed:
  - `gitops/runtime-k8s/overlays/dev/runtime.yaml`
  - `gitops/runtime-k8s/overlays/prod/runtime.yaml`
  - `gitops/runtime-k8s/overlays/uat/runtime.yaml`
  - `scripts/test-self-heal-contract.ps1`
  - `.wwg/governance/recommendation-registry.md`
- Implementation discoveries synced:
  - DEV LAN CORS requires explicit credentialed CORS env vars in K3s API runtime manifests.
  - DEV Docker and K3s databases differed during the incident and need a governed promotion path.
- Remaining stale context: Project Truth still contains older `192.168.254.148` runtime evidence as previous proof. Treat runtime IPs as snapshots unless persisted.
