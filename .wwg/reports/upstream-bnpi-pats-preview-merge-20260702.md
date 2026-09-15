# Upstream BNPI PATS Preview and Merge Gate - 2026-07-02

## Task Mode

Mixed source sync, runtime preview, and merge-gate validation.

## Goal

Preview the `sync/upstream-bnpi-pats-dryrun-20260702` upstream BNPI PATS sync branch on
the active VM without replacing DEV `3100/3101`, then use the evidence as the
gate for merging to `develop`.

## Current-State Report

- Windows branch before merge: `sync/upstream-bnpi-pats-dryrun-20260702`.
- Safety branch head before this pass: `7a71e77ab01ec2a01721a797506a51eba6b5f9d6`.
- Local `develop` and `origin/develop` before merge:
  `b1a8678e74229e10f5cfd2f1a1e5e658319c69af`.
- VM runtime checkout: `/var/lib/project-truth/ansible-pull` on
  `develop@b1a8678e74229e10f5cfd2f1a1e5e658319c69af`.
- Existing DEV runtime remained K3s `dev` namespace on `3100/3101`.

## Plan Review

Plan accepted with one runtime correction:

- Original preview plan used K3s `5000/5001`, which was correct.
- Browser evidence showed the first app preview build still targeted the
  Cloud Run DEV API for login.
- The app preview image was rebuilt with `VITE_API_BASE_URL=/api` so browser
  calls stayed same-origin on `10.184.38.138:5000/api` and proxied to the
  preview API pod.

## Execution Evidence

Created isolated K3s namespace:

```text
preview-upstream-bnpi-pats
```

Preview images:

```text
bnpi-pats-api-local:preview-upstream-20260702
bnpi-pats-api-db-init:preview-upstream-20260702
bnpi-pats-app-local:preview-upstream-20260702
```

Preview image IDs after successful build/import:

```text
bnpi-pats-api-local:preview-upstream-20260702 -> sha256:29d5559d4e48f19bf015c1f8a7128361e24576def85206e79d19b71cf41ebb90
bnpi-pats-api-db-init:preview-upstream-20260702 -> sha256:44c9062462ec471bc5256d7317a5634e4112f2193073429620fe3b7169e27393
bnpi-pats-app-local:preview-upstream-20260702 -> rebuilt for same-origin /api preview and rolled out successfully
```

Preview K3s state:

```text
bnpi-pats-api-preview   READY 1/1 Running
bnpi-pats-app-preview   READY 1/1 Running
```

HTTP checks:

```text
http://10.184.38.138:5000/health      -> 200
http://10.184.38.138:5000/auth/login  -> 200
http://10.184.38.138:5001/health      -> 200
http://10.184.38.138:3100/health      -> 200
http://10.184.38.138:3101/health      -> 200
```

Browser evidence:

- Login page loaded from `http://10.184.38.138:5000/auth/login`.
- Same-origin login used `POST http://10.184.38.138:5000/api/auth/login`.
- Seeded admin login succeeded with `admin@bandai.local` as `bnpi-pats-admin`.
- Authenticated admin dashboard rendered from preview.
- Saved device events rendered from preview with Source, View action, realtime
  socket status, and Hikvision watcher rows.
- HR attendance rendered from preview with the upstream attendance overview.

Screenshot evidence:

```text
.runtime/browser-evidence/screenshots/preview-5000-login-20260702.png
.runtime/browser-evidence/screenshots/preview-5000-admin-dashboard-20260702.png
.runtime/browser-evidence/screenshots/preview-5000-device-events-auth-20260702.png
.runtime/browser-evidence/screenshots/preview-5000-hr-attendance-auth-20260702.png
```

## Validation Performed

- `npm test -- app/services/attendance.service.test.ts ... app/routes/hr/time-corrections.test.ts --passWithNoTests`
  in `bnpi-pats-app`: PASS, 55 tests.
- `npx tsx node_modules/mocha/bin/mocha --no-config tests/attendance-backfill.service.spec.ts tests/attendance-correction.service.spec.ts tests/hikvision-event-contract.helper.spec.ts`
  in `bnpi-pats-api`: PASS, 34 tests.
- `npm run typecheck:test -- --pretty false` in `bnpi-pats-app`: PASS.
- `git diff --check`: PASS, line-ending warnings only.
- `.\scripts\project-truth.ps1 test-self-heal-contract`: PASS, 184 checks.
- `.\scripts\project-truth.ps1 verify-gitops-state -GuestIp 10.184.38.138 -RequireRuntimeApplications`:
  PASS after loading the VM SSH key into Windows `ssh-agent`.

## Warnings / Risks

- The preview namespace is intentionally not a GitOps-managed environment.
- The preview shares the DEV database through the DEV Postgres service.
- The first preview app image showed why LAN preview builds must use
  `VITE_API_BASE_URL=/api`; without it, browser login targeted Cloud Run.
- Argo/K3s still showed some historical completed or unknown old pods, but the
  active Argo Applications, DEV pods, and preview pods were healthy.
- `bnpi-pats-app/package-lock.json` needed npm 10-compatible optional peer metadata
  so Docker `npm ci` could build reproducibly.

## Acceptance Review

The preview goal was met: the upstream sync branch was visible on
`http://10.184.38.138:5000`, the preview API was available on `5001`, the
browser used same-origin `/api`, and DEV `3100/3101` stayed healthy.

## Recommended Next Step

Merge the safety branch into `develop`, push `develop`, watch CI, then rebuild
and import the normal `develop` K3s images for DEV `3100/3101`.

## Final Develop Runtime Update

Status after the merge gate:

```text
develop/origin/develop -> 418e82fbc02f48b6bbc555c431772343434780ee
VM source checkout     -> /var/lib/project-truth/ansible-pull @ 418e82fbc02f48b6bbc555c431772343434780ee
DEV app image          -> bnpi-pats-app-local:develop, imported image sha256:1f6a67358e96bd8a8de28f1d8c205786a627cb90a956dd02d756a6c36b8981d7
DEV API image          -> bnpi-pats-api-local:develop, imported image sha256:4a909d1ce57f724fc877ee97ff2218dcd9fbfc006fd90179c66d11f2cf2dfd60
DEV watcher image      -> bnpi-pats-api-db-init:develop, imported image sha256:5863cebbbd48c776ff383f5fc0a96aec9302f7353f1c833eac47842a3fcc720b
```

Final DEV rollout:

```text
bnpi-pats-app-65d5458d5f-x4qtt                 READY 1/1 Running
bnpi-pats-api-7dfb5c7d5c-9c4tt                 READY 1/1 Running
bnpi-pats-hikvision-watcher-7484bfb56c-gmc89   READY 1/1 Running
bnpi-pats-postgres-0                           READY 1/1 Running
```

Final DEV HTTP checks:

```text
http://10.184.38.138:3100/health      -> 200
http://10.184.38.138:3100/auth/login  -> 200
http://10.184.38.138:3101/health      -> 200
http://10.184.38.138:5000/health      -> 200 preview still available
```

Final DEV browser evidence:

- `http://10.184.38.138:3100/admin/dashboard` rendered for seeded admin
  `admin@bandai.local` as `bnpi-pats-admin`.
- `http://10.184.38.138:3100/admin/configuration/devices/events?view=saved`
  rendered the newer Device attendance surface with realtime socket state,
  Source column, ZKTeco sidecar and Hikvision watcher rows, and row `View`
  actions.
- Event `View` opened the Punch details modal and showed source, terminal,
  device payload, BNPI PATS event id, and employee profile fields.
- Browser network on reload showed LAN API pairing through
  `http://10.184.38.138:3101/api/auth/me`,
  `http://10.184.38.138:3101/api/device`, and
  `http://10.184.38.138:3101/api/device/events`, all HTTP 200.
- `http://10.184.38.138:3100/hr/attendance` rendered the upstream Attendance
  Overview surface.

Final DEV screenshot evidence:

```text
.runtime/browser-evidence/screenshots/dev-3100-admin-dashboard-after-merge-20260702.png
.runtime/browser-evidence/screenshots/dev-3100-device-events-after-merge-20260702.png
.runtime/browser-evidence/screenshots/dev-3100-device-event-view-modal-after-merge-20260702.png
.runtime/browser-evidence/screenshots/dev-3100-hr-attendance-after-merge-20260702.png
```

Additional unsynced local changes found during final verification:

- Hikvision seed/default truth updated from historical `192.168.254.181` to
  current reachable LAN candidate `10.184.38.215`, with HTTP/ISAPI port `80`
  and SDK/server port `8000` tracked separately.
- LAN socket fallback updated so paired app/API ports such as `3100/3101` keep
  socket connections on the app host proxy.
- Targeted validation passed:
  - `npm test -- app/lib/api-url.helper.test.ts --passWithNoTests`
  - `npx tsx node_modules/mocha/bin/mocha --no-config tests/hikvision-device-seed-default.spec.ts`

Final warnings:

- GitHub Actions did not show a run attached to merge SHA `418e82f` during the
  final check, so CI status for that exact SHA is unavailable.
- The VM build completed with existing API webpack warnings, app sourcemap and
  chunk-size warnings, React Router future-flag warnings, and npm audit
  vulnerability output. These did not block image build or rollout.
- The preview namespace remains running on `5000/5001` and shares the DEV
  database. Remove it after manual review if it is no longer needed.

## WWG Truth Synchronization

- Task mode: mixed source sync, runtime preview, merge-gate validation, and
  runtime truth capture.
- New truth detected: yes.
- Wiki updated: yes.
- Workspace updated: no.
- Governance review completed: yes.
- Drift status: medium.
- Canonical files changed:
  - `.wwg/wiki/project-truth-summary.md`
  - `.wwg/wiki/project-truth.md`
  - `.wwg/reports/upstream-bnpi-pats-preview-merge-20260702.md`
- Implementation discoveries synced:
  - DEV runtime was promoted to `develop@418e82f` with K3s DEV app/API/watcher
    images rebuilt and imported.
  - LAN socket fallback and Hikvision seed/default truth were present in the
    final develop runtime update.
  - Current Hikvision truth distinguishes HTTP/ISAPI port `80` from SDK/server
    port `8000`; port `800` is not supported by current evidence.
- Remaining stale context:
  - GitHub Actions status for merge SHA `418e82f` was unavailable during the
    final check.
  - The preview namespace on `5000/5001` remained running after validation and
    still shared the DEV database.

