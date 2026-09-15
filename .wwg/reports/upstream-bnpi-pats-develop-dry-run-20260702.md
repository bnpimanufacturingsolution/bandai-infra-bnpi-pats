# Upstream BNPI PATS Develop Sync Dry Run - 2026-07-02

## Task Mode

Mixed source/runtime drift dry run and conflict-resolution planning.

## Goal

Compare the latest friend-owned upstream `develop` branches for `bnpi-pats-app` and
`bnpi-pats-api` against the embedded local directories, keep Project Truth
runtime/device work, exclude unsafe material, and define an implementation
sequence that can be applied on a safety branch.

## Current State

- Working branch after safety branch creation:
  `sync/upstream-bnpi-pats-dryrun-20260702`.
- Base branch before branching: `develop`.
- Remote app tip:
  `bnpi-pats-app@0a0332523da8f178ba8f5a1da3c3f7fb434916db`.
- Remote API tip:
  `bnpi-pats-api@d12d67e897fcd4d33ea4342a1aa2b8cfcfa3e48a`.
- The embedded `bnpi-pats-app/` and `bnpi-pats-api/` folders are normal directories in
  this infra repo, not submodules.
- Existing local dirty work must be preserved:
  - `gitops/runtime-k8s/overlays/dev/runtime.yaml`
  - `bnpi-pats-api/helper/hikvision-event-contract.helper.ts`
  - `bnpi-pats-api/scripts/audit-hikvision-device-events.ts`
  - `bnpi-pats-api/tests/hikvision-event-contract.helper.spec.ts`

## Discovery Evidence

- `git ls-remote` confirmed the upstream `develop` tips above.
- Existing local refs for `refs/remotes/bnpi-pats-app/develop` and
  `refs/remotes/bnpi-pats-api/develop` match those tips.
- App diff used local Git tree comparison:
  `git diff --name-status HEAD:bnpi-pats-app refs/remotes/bnpi-pats-app/develop`.
- API diff recovered around filtered-fetch object gaps by using the GitHub tree
  API plus local `git hash-object` comparisons.
- API GitHub tree was not truncated.

## App Dry-Run Classification

Total app changed paths: `354`.

| Bucket | Count | Dry-run decision |
|---|---:|---|
| Review general app source | 128 | Review in small batches; do not bulk copy. |
| Merge product attendance/timesheet | 72 | First implementation batch. |
| Merge product HR workflow | 41 | Second product batch after attendance is stable. |
| Exclude generated/build/cache | 40 | Do not import. |
| Merge tests | 32 | Merge with the feature files they verify. |
| Exclude secret/env/generated-risk | 10 | Do not import. |
| Review auth/authorization | 8 | Manual conflict review only. |
| Merge/review payroll/billing | 7 | Later batch; billing/payment-sensitive review. |
| Review config/dependencies | 7 | Only merge dependency/config lines needed by accepted code. |
| Merge theme/brand/UI | 7 | First implementation batch with attendance UI. |
| Review runtime/API integration | 2 | Manual runtime/public-origin review. |

High-signal app merge candidates:

- Attendance/timesheet UI and tests, including `AttendanceFixModal`,
  attendance date/scope popovers, timesheet calendar/card changes, attendance
  management template changes, attendance service/hook changes, and related
  tests.
- Theme/brand UI, including `app/styles/tokens.css`, `app/app.css`,
  `app/lib/config/theme.ts`, `app/lib/chart-colors.ts`, and package dependency
  support for the font/token work.
- HR workflow changes may be useful, but should be separate from the first
  visible UI sync pass.

App exclusions:

- `.env*`
- Firebase admin JSON
- `.firebase/*`
- build/generated/cache outputs
- upstream `.wwg` folders and report backups inside the app repo

## API Dry-Run Classification

Total API changed paths by remote-tree/local-hash dry run: `451`.

| Bucket | Count | Dry-run decision |
|---|---:|---|
| Exclude generated/build/cache | 149 | Do not import. |
| Review general API source | 67 | Review in controlled batches. |
| Keep/reconcile Project Truth observability | 63 | Preserve local infra evidence unless intentionally reconciled. |
| Merge product HR workflow API | 31 | Later product batch after attendance. |
| Keep/reconcile Project Truth device runtime | 26 | Preserve local Hikvision/ZKTeco runtime truth. |
| Merge tests | 23 | Merge with accepted feature batches. |
| Exclude secret/env/generated-risk | 22 | Do not import. |
| Merge product attendance/timesheet API | 22 | First backend feature batch after UI compiles. |
| Review config/schema/dependencies | 19 | Manual review; no root replacement. |
| Merge/review payroll/tax | 15 | Later payroll-sensitive batch. |
| Review auth/authorization | 9 | Manual security review only. |
| Keep/reconcile backup/rollback | 5 | Preserve local backup/rollback truth. |

High-signal API merge candidates:

- Attendance correction/backfill services:
  - `app/attendance/attendance-backfill.service.ts`
  - `app/attendance/attendance-correction.service.ts`
  - router/controller wiring needed by frontend correction flows
  - request reconciliation services
  - attendance correction/backfill tests
- Product HR workflow API changes may be useful after attendance is stable.

API keep/reconcile areas:

- Hikvision and ZKTeco device runtime files and tests.
- Project Truth observability files and dashboards.
- Backup/rollback helpers and tests.
- Local GitOps/runtime integration and appliance proof paths.

API exclusions:

- `.env*`, `.neon`, local infra env examples containing secret shape risk.
- seed credential exports.
- upstream `.wwg` generated content.
- generated output/report artifacts unless explicitly needed as test fixtures.

## Conflict-Resolution Plan Review

Plan accepted with constraints:

- Do not bulk replace either embedded repo directory.
- Do not import secrets or generated credential files.
- Do not delete local-only Project Truth runtime/device/observability files.
- Apply fixes on `sync/upstream-bnpi-pats-dryrun-20260702`, not directly on
  `develop`.
- Use AI-assisted conflict resolution file-by-file, but require local tests and
  browser/runtime evidence before claiming the sync is working.

## Recommended Implementation Passes

### Pass 1 - App Attendance + Theme Visible Sync

Objective: make the local HR attendance screen visually match the upstream
redesign enough to screenshot.

Actions:

- Merge upstream attendance/timesheet UI files and tests that are required for
  `AttendanceFixModal`, date/scope filters, daily trend, and row action flow.
- Merge upstream theme/token/font files and the minimal package dependency
  changes needed for them.
- Resolve component/type conflicts against the local app, not by deleting local
  runtime API behavior.
- Validate with focused Vitest tests, typecheck if practical, and
  `agent-browser` screenshot evidence.

Acceptance:

- `/hr/attendance` renders locally with `bnpi-pats-admin` E2E auth.
- Browser text or DOM proves upstream signals are present:
  `Fix Attendance`, updated date/scope controls, and daily trend where data
  allows.
- No secret/generated paths are added.

### Pass 2 - API Attendance Ledger Batch

Objective: support the UI correction/backfill behavior without weakening
device runtime.

Actions:

- Merge attendance correction/backfill services, controller/router wiring,
  request reconciliation services, and tests.
- Reconcile Prisma/schema or zod changes explicitly.
- Preserve local Hikvision biometric visibility behavior and ZKTeco runtime
  files unless a test-proven replacement exists.

Acceptance:

- Attendance correction/backfill tests pass.
- Local Hikvision event contract test still passes.
- Existing Project Truth self-heal contract still passes.

### Pass 3 - Product Workflow Batches

Objective: pick up non-attendance upstream product fixes after the core visible
sync is stable.

Actions:

- Merge HR workflow, employee/request/leave, payroll/tax, and auth changes in
  separate batches.
- Treat auth and payroll as review-sensitive.
- Merge tests alongside each batch.

Acceptance:

- Focused tests pass per batch.
- No Project Truth runtime files regress.

### Pass 4 - Runtime Verification

Objective: prove the merged app/API on the actual Project Truth path.

Actions:

- Recover VM reachability.
- Prove SSH to the VM.
- Verify GitOps render and VM/LAN app/API ports.
- Verify public `bnpi-pats.tech`/DEV routes and browser network behavior.

Acceptance:

- Evidence covers host repo, GitHub branch, GitOps/VM, LAN app/API, and public
  Cloudflare paths.

## Dry-Run Decision

Proceed with implementation only as a staged conflict-resolution merge. The
first implementation pass should be app attendance + theme, because that is the
fastest path to visible proof while keeping the API/device/runtime blast radius
small.

## Validation Notes

No source sync was applied by this dry-run report. Validation after this report
should confirm formatting/governance only. Feature validation belongs to the
implementation passes above.

## WWG Truth Synchronization

- Task mode: mixed source/runtime drift dry run.
- New truth detected: yes, upstream drift is broader than attendance and must
  be staged by product/runtime risk.
- Wiki updated: no.
- Workspace updated: no.
- Governance review completed: yes.
- Drift status: HIGH.
- Canonical files changed:
  - `.wwg/reports/upstream-bnpi-pats-develop-dry-run-20260702.md`
- Implementation discoveries synced:
  - latest upstream refs, app/API dry-run classifications, keep/merge/exclude
    decisions, safety branch name.
- Remaining stale context:
  - no source sync has been applied yet from this dry run.
  - VM/public runtime is currently not proven for this branch.

## Recommendation Capture

No new recommendations were identified beyond
`REC-20260702-REMOTE-BNPI-PATS-SYNC-GUARD`.
