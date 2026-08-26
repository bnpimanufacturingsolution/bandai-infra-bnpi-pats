# Codebase WWG Alignment Audit + Non-Breaking Drift Repair (2026-08-24)

Task mode: audit + non-breaking drift repair + docs truth sync. Operator asked for a
whole-codebase alignment audit against WWG, executed with 10 parallel sub-agents,
then approved "do all the non-breaking" fixes with documentation.

## Audit method

10 read-only sub-agents, one per surface: (1) API device/Hikvision, (2) API
payroll/timesheet, (3) app HR routes + UX standards, (4) admin routes/role guard,
(5) GitOps/K8s/Ansible/Terraform, (6) workflows/scripts, (7) Hikvision vendor C++,
(8) ZKTeco vendor bridge, (9) docs vs wiki, (10) terminology drift sweep.

## Verdict

~90% ALIGNED. Product surfaces (API models/routes, HR app UX standards, GitOps
overlays, vendor C++ layout, operator docs) match Project Truth. Drift was
concentrated in legacy tooling, stale defaults, and a few labels/comments.

## Fixes applied this pass (all verified non-breaking)

| # | Fix | Files |
|---|---|---|
| 1 | Deleted Windows `AlarmDemo.exe` launcher scripts (no references anywhere; contradicted Linux-first listener canon) | `hris-api/scripts/run-dev-with-hikvision.ps1`, `hris-api/scripts/run-hikvision-alarmdemo.ps1` (deleted) |
| 2 | Stale TEST A `.102` → live `.109` sweep in defaults/fallbacks/tests | `postman/hikvision-isapi-tested.postman_environment.json`, `postman/hikvision-isapi-tested.postman_collection.json`, `scripts/ensure-device-live-path.ps1`, `scripts/verify-hikvision-isapi-postman.ps1`, `hris-api/scripts/resolve-hikvision-vm-bridge-targets.cjs`, `hris-api/scripts/ensure-hikvision-vm-bridge.cjs` (`host-fallback-109`), `hris-api/tests/resolve-hikvision-vm-bridge-targets.spec.cjs` |
| 3 | Terminology hard-cutover leftovers: activity-log title `Device Attendance` → `Device Events`; saved-events Playwright proof waits on `Device events`; key renamed `deviceEvents` | `hris-api/app/device/device.controller.ts:26999`, `hris-app/playwright-saved-events-proof.cjs` |
| 4 | Stale ZKTeco copy: router comment now names Linux bridge; error text `ZKTeco SDK sidecar` → `ZKTeco Linux bridge` ×3 | `hris-api/app/zkteco/zkteco.router.ts`, `hris-api/app/device/device.controller.ts` |
| 5 | Mojibake double-encoded comment blocks cleaned (ASCII tails preserved as clean comments); one orphan garbage comment removed | `hris-api/app/employee/employee.controller.ts` (lines ~3660/3744/3745/3794/3809 pre-edit) |
| 6 | Test fixture stale IP hygiene: `NODE_HOST_IP` fixture `.144` → canonical VM `.19` | `hris-api/tests/device-health-zkteco.spec.ts` |
| 7 | STALE-address banner added to enrollment identity spec (`.102` examples marked historical; live `.109/.110` restated) | `docs/HIKVISION_ENROLLMENT_IDENTITY_FLOW.md` |

One-off DB-query proof scripts under `hris-api/scripts/*` that query
`address: "192.168.254.102"` were left untouched: they are dated evidence tools,
not current-state defaults.

## Audit findings recorded but NOT fixed here (behavior changes / need review)

1. Legacy compose still seeds: `appliance/docker-compose.yml` runs
   `prisma-postgres:push && npm run prisma-seed`, diverging from push-only GitOps
   overlays. Removing seed changes fresh-compose bootstrap behavior → deferred.
   See REC-20260824-COMPOSE-SEED-PUSH-ONLY.
2. `hris-emp-app` restart loop ignores `PROJECT_TRUTH_ROLLOUT_NAMESPACES`
   (`ansible/project-truth-pull.yml` employee loop hardcodes `prod dev uat`,
   no skip-missing). Deploy-path semantics change → deferred.
   See REC-20260824-EMPAPP-NAMESPACES-OVERRIDE.
3. Wiki wording conflations to keep in mind (documented here, not rewritten):
   - "execute=false default" is true at the API layer only
     (`device.controller.ts` `execute === true` gate); the C++ CLI defaults
     `execute_mode = true` (`runtime.cpp:44`, contract-pinned).
   - Hikvision callback resolves Employee-first then DeviceUser stub upsert;
     the DeviceUser-first resolver is proven on the ZKTeco path. Wiki sentence
     describes the general rule; per-path order differs.
   - Observe wait is `wait_sec: 1200` (20 min), older notes said "~10 min".
4. No V7 installer flow exists in-repo despite a summary mention (V6 is the
   latest present). Informational.

## Validation

- `tests/resolve-hikvision-vm-bridge-targets.spec.cjs`: **6 passing** — all `.109`
  fallback/env-override/source-token expectations green after the sweep.
- 1 failure in that spec is PRE-EXISTING: it asserts the API-reverse ownership
  guard inside unmodified `scripts/start-host-hikvision-vm-ssh-bridge.ps1`
  (`$forwardArgs.Add("${ApiRemotePort}:` present = regression already on HEAD;
  candidate follow-up REC).
- `tests/device-health-zkteco.spec.ts`: failures reproduce identically on clean
  HEAD (verified via `git stash` baseline, 500s from spec rot vs newer
  controller mocks). The edited NODE_HOST_IP fixture keeps assertions
  internally consistent.
- App vitest `device-events-page-contract`: 11 passed / 3 failed, all three
  assert source strings in untouched `events.tsx` — matches known full-vitest
  debt (REC-20260819-HRIS-APP-CI-FULL-VITEST).
- No product money/auth/schema paths touched. No DB migrations.

## WWG Auto-Sync

Surfaces updated: workspace addendum, agent handoff entry, recommendation
registry (+2 Proposed), this report. Terminology unchanged (fixes enforce
existing canon). Project Truth unchanged (code now matches it more closely).
