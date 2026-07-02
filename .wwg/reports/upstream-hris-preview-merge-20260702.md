# Upstream HRIS Preview and Merge Gate - 2026-07-02

## Task Mode

Mixed source sync, runtime preview, and merge-gate validation.

## Goal

Preview the `sync/upstream-hris-dryrun-20260702` upstream HRIS sync branch on
the active VM without replacing DEV `3100/3101`, then use the evidence as the
gate for merging to `develop`.

## Current-State Report

- Windows branch before merge: `sync/upstream-hris-dryrun-20260702`.
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
preview-upstream-hris
```

Preview images:

```text
hris-api-local:preview-upstream-20260702
hris-api-db-init:preview-upstream-20260702
hris-app-local:preview-upstream-20260702
```

Preview image IDs after successful build/import:

```text
hris-api-local:preview-upstream-20260702 -> sha256:29d5559d4e48f19bf015c1f8a7128361e24576def85206e79d19b71cf41ebb90
hris-api-db-init:preview-upstream-20260702 -> sha256:44c9062462ec471bc5256d7317a5634e4112f2193073429620fe3b7169e27393
hris-app-local:preview-upstream-20260702 -> rebuilt for same-origin /api preview and rolled out successfully
```

Preview K3s state:

```text
hris-api-preview   READY 1/1 Running
hris-app-preview   READY 1/1 Running
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
- Seeded admin login succeeded with `admin@bandai.local` as `hris-admin`.
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
  in `hris-app`: PASS, 55 tests.
- `npx tsx node_modules/mocha/bin/mocha --no-config tests/attendance-backfill.service.spec.ts tests/attendance-correction.service.spec.ts tests/hikvision-event-contract.helper.spec.ts`
  in `hris-api`: PASS, 34 tests.
- `npm run typecheck:test -- --pretty false` in `hris-app`: PASS.
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
- `hris-app/package-lock.json` needed npm 10-compatible optional peer metadata
  so Docker `npm ci` could build reproducibly.

## Acceptance Review

The preview goal was met: the upstream sync branch was visible on
`http://10.184.38.138:5000`, the preview API was available on `5001`, the
browser used same-origin `/api`, and DEV `3100/3101` stayed healthy.

## Recommended Next Step

Merge the safety branch into `develop`, push `develop`, watch CI, then rebuild
and import the normal `develop` K3s images for DEV `3100/3101`.

