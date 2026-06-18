# Cross-Repo Context Reconciliation Report

Status: COMPLETE
Last updated: 2026-05-25

## Task Classification

- Task mode: docs-only / governance context repair.
- Delivery mode: AI-agent.
- Risk: high-risk context because the next testing work touches API authorization, persistence, employee data, attendance, timesheets, payroll, load testing, soak testing, and DB fault injection.
- Implementation boundary: no runtime code, database, migration, deployment, secret, credential, deletion, load, or soak action was performed.

## Trigger

The app-side testing task had only updated `hris-app`, and the user correctly flagged that `hris-api` was missing from active WWG context.

## Findings

- `hris-api` exists as sibling repo `../hris-api`.
- `../hris-api/README.md` and `../hris-api/package.json` confirm it is the backend API for HRIS.
- The API repo's prior Project Truth incorrectly identified the repo as a Web3/eCommerce prototype; that was stale and has been reconciled in the API repo.
- This app repo remains the frontend owner, but backend data/model/authorization truth belongs in `../hris-api`.

## Context Changes

- Updated `.wwg/wiki/project-truth.md` with the paired backend API repo and app/API ownership split.
- Updated `.wwg/wiki/project-truth-summary.md` so future agents see `../hris-api` in the first required reading surface.
- Updated `.wwg/wiki/terminology.md` and `.wwg/wiki/terminology-summary.md` with HRIS API, API contract, and isolated test database terms.
- Updated `docs/testing-strategy.md`, `docs/testing-coverage-matrix.md`, `.wwg/reports/testing-program-implementation.md`, and `.wwg/workspace/current-task.md` to route backend tests to `../hris-api`.
- Updated maintenance/context wiki notes so generated context can carry the corrected app/API boundary.

## Test Ownership Split

- `hris-app` owns frontend routes, UI, role-based display behavior, client-side payload construction, browser E2E, and app-side regression tests.
- `../hris-api` owns backend authorization enforcement, persistence rules, Prisma schema/model constraints, API contracts, transactions/concurrency, payroll/attendance/timesheet source-of-truth invariants, migrations/backfills, API load tests, and API soak tests.
- Frontend visibility is not authorization.

## Remaining Risks

- Canonical role/permission matrix still needs confirmation across app and API.
- API active persistence mode and MongoDB/Postgres migration state need confirmation before DB invariant tests are finalized.
- Approved isolated database target is still needed for destructive/fault-injection and realistic load/soak tests.

## Validation

- Passed with warnings: `npx @homedesk/wwg refresh-context` (6 generated context files updated, no warnings).
- Passed with warnings: `npx @homedesk/wwg validate` (0 high findings; low advisory skill-candidate findings remain).
- Passed: `npx @homedesk/wwg brief generic`.
- Passed: `npm run test:ci` (15 test files, 140 passing tests, 1 skipped opt-in API contract).

## Recommendations

- New recommendation added: continue the testing task in `../hris-api` next, starting with isolated API unit/integration/DB invariant specs.
- New recommendation added: maintain a cross-repo CI/test map so app and API coverage are visible together.
- New recommendation added: require explicit approval before any shared-environment load/soak or DB fault-injection run.

## WWG Truth Synchronization

- Task mode: docs-only / governance context repair.
- New truth detected: YES.
- Wiki updated: YES.
- Workspace updated: YES.
- Governance review completed: YES.
- Drift status: YELLOW.
- Canonical files changed:
  - `.wwg/wiki/project-truth.md`
  - `.wwg/wiki/project-truth-summary.md`
  - `.wwg/wiki/terminology.md`
  - `.wwg/wiki/terminology-summary.md`
  - `.wwg/wiki/12-maintenance/drift-policy.md`
  - `.wwg/wiki/11-synthesis/context-completeness-review.md`
- Implementation discoveries synced:
  - Paired backend API repository exists at `../hris-api`.
  - API repo owns backend authorization, persistence, DB invariants, API contracts, load tests, and soak tests.
  - App repo owns frontend routes, UI, client payloads, browser E2E, and app-side regressions.
- Remaining stale context:
  - Canonical role/permission matrix, API active persistence mode, and approved isolated test DB target remain unconfirmed.
