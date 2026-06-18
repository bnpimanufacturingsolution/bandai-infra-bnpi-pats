# Project Truth Overnight Hard-Cutover + Drift Repair Prompt

Date: 2026-06-18

Workspace:

```text
C:\Users\anoni\OneDrive\Desktop\PROJECT_TRUTH_HYPERV_FRESH
```

Current live targets:

| Environment | App | API |
| --- | --- | --- |
| PROD | http://192.168.110.204:3000 | http://192.168.110.204:3001 |
| DEV | http://192.168.110.204:3100 | http://192.168.110.204:3101 |
| UAT | http://192.168.110.204:3200 | http://192.168.110.204:3201 |

## Main Goal

Perform a Project Truth hard cutover so PROD, DEV, and UAT are consistent, drift-free, and using MinIO-backed local object storage for logos, avatars, and uploads. Do a self-repair loop until all environments pass browser and API proof.

## Bridge-LAN Acceptance Gate

The bridged LAN browser is the source of truth. Do not call the run done, passed, proven, or complete if the live browser at the bridged IP still fails.

Hard witness URL:

```text
http://192.168.110.204:3100/settings
```

The DEV settings page must be verified through the bridged address above, not only through localhost, container DNS, or a local dev server. The Network tab/API evidence must show that repeated `avatar` requests no longer return:

```json
{
  "status": "error",
  "message": "Cloudinary is not configured",
  "code": 500
}
```

If the bridged browser still shows that Cloudinary avatar error, the final status must be `PARTIAL` or `BLOCKED`, never `PASS` or `PROVEN`.

## Project Truth Architecture Truth Map

Before making fixes, build and save an architecture truth map. The run must distinguish documented desired architecture, local repo source, built image contents, and the currently running bridged runtime.

The live bridged runtime is the acceptance target. A repo edit, local build, localhost test, or Docker Compose file edit does not count unless the change is synced into the process/image/VM/container/pod that is actually serving `http://192.168.110.204:*`.

Known Project Truth architecture sources to inspect:

- `docs/ARCHITECTURE.md`
- `docs/HEALTHCHECKS.md`
- `docs/DEV_CURRENT_GCP_VDI_PROOF_RESULT.md`
- `docs/USER_JOURNEY_PROOF.md`
- `docs/GAPS_AND_NEXT_GOALS.md`
- `appliance/docker-compose.yml`
- `appliance/docker-compose.environments.yml`
- `appliance/env/hris-api.env`
- `scripts/project-truth.ps1`
- `scripts/verify-lan-health.ps1`
- `scripts/watch-until-healthy.ps1`
- `terraform-hyperv/`
- `gitops/`

Current observed bridge runtime shape:

```text
Bridge IP: 192.168.110.204
PROD app/API: 3000 / 3001
DEV app/API:  3100 / 3101
UAT app/API:  3200 / 3201
```

Important: do not confuse these app/API pairs with the older `docs/ARCHITECTURE.md` NodePort table that lists DEV/UAT/PROD health as `3001/3002/3000`. If the docs disagree with the bridge, record it as architecture drift and use the live bridged runtime as the acceptance target.

For each environment, identify all four layers:

1. Repo source files that would fix the issue.
2. Build artifact/image/container/VM layer that is actually serving the bridge.
3. Runtime environment variables actually loaded by the live API/app.
4. Browser-visible behavior at the bridge IP.

Do not claim a source fix is complete until the built/running bridge layer has been updated and browser proof passes. If you cannot access the actual Hyper-V/VM/container owner because admin rights, SSH, Docker, K3s, or Argo CD access is unavailable, record the exact blocker and final status must be `BLOCKED` or `PARTIAL`.

Required runtime sync proof:

- Name the actual bridge runtime owner for each environment, such as Docker Compose appliance, Hyper-V guest process, K3s service/pod, Argo CD app, systemd unit, PM2 process, or local Node process.
- Name the exact command/path that pushes source/config changes into that owner.
- Capture evidence that the owner restarted or reloaded the new build/config: container ID, image digest, pod restart time, process command line, service journal, asset hash, or equivalent.
- If the runtime owner cannot be discovered or controlled, stop claiming hard cutover and write `BLOCKED` or `PARTIAL` with the missing access named plainly.
- The bridge browser screenshots and network logs are the final judge. If `http://192.168.110.204:3100/settings` still shows Cloudinary avatar 500s or broken logo UI, the run is not passed.

## Known Current Issue

DEV avatar endpoint currently returns:

```text
GET http://192.168.110.204:3101/api/auth/me/avatar
```

```json
{
  "status": "error",
  "message": "Cloudinary is not configured",
  "code": 500
}
```

This means at least one live runtime is still trying Cloudinary. Treat that as storage-provider drift. The desired final state is MinIO, not Cloudinary.

## Hard Requirements

- Hard cutover all environments to MinIO unless a real blocker is proven.
- Check PROD, DEV, and UAT, not only DEV.
- Find drift between repo config, built images, running containers, env files, compose files, and live API behavior.
- Do not assume `terraform.tfvars`, compose YAML, or docs equal runtime truth.
- Do not mark success from health checks alone.
- Browser proof is required.
- Browser proof must use the bridged LAN URLs on `192.168.110.204`.
- API proof is required.
- Any fix made in repo/source must be rebuilt, restarted, and proven on the bridged running environment before it counts.
- Preserve user work. Do not git reset or discard unrelated changes.
- Save all evidence under `.runtime/overnight-hardcutover-minio-drift/<timestamp>/`.

## Acceptance Definition

PASS only if:

- PROD/DEV/UAT app login pages load.
- PROD/DEV/UAT API health endpoints return 200.
- PROD/DEV/UAT no longer return `Cloudinary is not configured` for avatar/storage paths.
- The bridged DEV settings page at `http://192.168.110.204:3100/settings` no longer has failed `avatar` network responses with `Cloudinary is not configured`.
- Bandai/company logo renders without broken image UI.
- Avatar display/upload/read path works or has a documented intentional fallback.
- MinIO is running and reachable from API runtimes.
- Bucket exists and object URLs or API-proxied file reads work from browser.
- Screenshots and logs prove the result.

## Ordered Execution Plan

### 1. Create Run Evidence Folder

```powershell
$runRoot = ".runtime\overnight-hardcutover-minio-drift\$(Get-Date -Format yyyyMMdd-HHmmss)"
New-Item -ItemType Directory -Force $runRoot | Out-Null
```

### 2. Snapshot Repo State

- `git status --short`
- `git diff --stat`
- Save current active file/doc context if useful.
- Do not revert user changes.

### 3. Snapshot Live HTTP State For All Environments

For each env:

- `curl -i <app>/auth/login`
- `curl -i <api>/health`
- `curl -i <api>/api/auth/me/avatar` without auth and with auth later
- Save outputs.

### 4. Discover Live Runtime Truth

Determine whether current Project Truth is running through:

- Hyper-V VM
- Docker Compose
- systemd
- local node processes
- other runtime

Capture:

- running containers/services
- exposed ports
- env vars
- compose files actually used
- image names/tags
- mounted env files
- Hyper-V VM identity, bridge adapter, and LAN IP when available
- SSH/Kubernetes/Argo CD state when available
- whether the live bridge is Docker Compose appliance, Hyper-V VM, K3s/Argo, or another runtime

### 5. Build Drift Matrix

Create a table for PROD/DEV/UAT with:

- app port
- api port
- database
- `STORAGE_PROVIDER`
- `CLOUDINARY_*` present?
- `MINIO_*` present?
- MinIO endpoint from inside API runtime
- public MinIO/base URL
- bucket name
- avatar endpoint behavior
- logo behavior
- build image/tag/source
- runtime owner: compose container, K3s pod/service, Hyper-V VM process, local node, or unknown
- whether repo source, built image, and bridge runtime match
- exact rebuild/restart/sync command needed to propagate source changes to bridge

Also create an architecture drift section listing contradictions between:

- docs
- appliance compose files
- terraform/gitops manifests
- live listening ports/processes
- bridge browser behavior

### 6. Locate All Storage Code Paths

Search repo for:

- `Cloudinary`
- `cloudinary`
- `STORAGE_PROVIDER`
- `MINIO`
- `avatar`
- `logo`
- `upload`
- `object storage`
- `bucket`

Identify exact owner files for:

- avatar upload
- avatar read
- organization logo upload/read
- generic upload service
- storage provider selection
- env validation

### 7. Hard Cutover Config To MinIO

For PROD, DEV, and UAT runtime configuration, set:

```text
STORAGE_PROVIDER=minio
MINIO_ENDPOINT=<runtime-valid endpoint>
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=<actual configured value>
MINIO_SECRET_KEY=<actual configured value>
MINIO_BUCKET=hris-images
MINIO_PUBLIC_BASE_URL=http://192.168.110.204:9000
```

If each env needs separate buckets, use:

```text
hris-images-prod
hris-images-dev
hris-images-uat
```

Prefer one clear documented decision and apply consistently.

### 8. Start Or Repair MinIO

Ensure MinIO is actually running.

Verify:

- Host health: `http://192.168.110.204:9000/minio/health/live`
- Console if exposed: `http://192.168.110.204:9001`
- Inside API runtime: `http://minio:9000/minio/health/live` or correct internal endpoint

Ensure bucket exists.

Ensure browser can retrieve uploaded image objects either through:

- public bucket read, or
- API proxy route.

### 9. Patch Code If Config Alone Is Not Enough

Requirements:

- Avatar endpoint must use selected storage provider.
- Cloudinary must not be called when `STORAGE_PROVIDER=minio`.
- Missing Cloudinary config must not break MinIO mode.
- Legacy logo values like `/app/assets/bandai_logo.png` must resolve to bundled/public Bandai logo.
- Broken remote logo/avatar URLs must fail gracefully to local fallback.
- Do not hide true upload failures behind fake success.

### 10. Rebuild/Restart All Affected Services

For each env:

- rebuild API if backend storage code changed
- rebuild app if logo/avatar frontend code changed
- restart app/API/MinIO
- wait for health
- capture logs after restart
- prove the bridge is serving the new build, not stale assets, by recording changed asset hash/image id/container id/pod restart time or equivalent evidence

### 11. Authenticated API Proof

Use known seeded credentials where valid:

```text
admin@bandai.local / password123
hr-manager@seed.local / Password123!
```

For PROD/DEV/UAT:

- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/auth/me/avatar`
- perform avatar upload endpoint if available
- fetch returned avatar URL
- confirm no Cloudinary 500

### 12. Browser Proof

With Playwright, for PROD/DEV/UAT:

- open `/auth/login`
- login
- visit `/settings`
- visit `/admin/dashboard` for admin account
- inspect console errors
- inspect failed network requests
- verify logo image `naturalWidth > 0`
- verify avatar image request is not Cloudinary 500
- screenshot settings/dashboard

Required bridged witness proof:

- Open `http://192.168.110.204:3100/settings`.
- Use the affected HR user/session when possible; otherwise use a valid seeded user and document the account.
- Capture Network/API evidence for all `avatar` requests on the page.
- The proof fails if any `avatar` request returns `Cloudinary is not configured`.
- Save a screenshot showing the settings page and a text/JSON evidence file listing failed requests, response status, and response body snippets.

### 13. Drift Cleanup

After proof, update docs/config so repo matches runtime:

- document MinIO as hard-cutover storage provider
- remove stale Cloudinary default assumptions where misleading
- update any env examples that would recreate the drift
- ensure appliance compose/env files consistently include MinIO for PROD/DEV/UAT

### 14. Self-Repair Loop

Repeat until PASS or real blocker:

- choose one failing env/check
- inspect logs/code/env
- patch or configure
- rebuild/restart only what is needed
- rerun API proof
- rerun browser proof

Maximum 10 loops before declaring BLOCKED.

### 15. Final Report

Write:

```text
.runtime/overnight-hardcutover-minio-drift/<timestamp>/FINAL_REPORT.md
```

Include:

- PASS / PARTIAL / BLOCKED
- drift matrix before/after
- MinIO proof
- storage provider proof per env
- avatar endpoint proof per env
- logo proof per env
- screenshots list
- changed files
- commands run
- remaining risks

Final success sentence must be exactly one of:

- `PROVEN: Project Truth PROD/DEV/UAT are hard-cutover to MinIO, drift-free for avatar/logo storage, and browser/API proof passed.`
- `PARTIAL: Project Truth hard-cutover is incomplete; see blockers.`
- `BLOCKED: Project Truth hard-cutover could not proceed because <specific blocker>.`
