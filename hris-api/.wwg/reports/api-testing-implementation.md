# API Testing Implementation Report

Status: TDD_GATE_FOUNDATION
Last updated: 2026-05-25

## Task Classification

- Task mode: high-risk regression/test infrastructure.
- Delivery mode: AI-agent.
- Risk: high-risk quality work around auth, authorization, persistence, employee data, attendance, timesheets, payroll snapshots, load testing, and soak testing.
- Implementation boundary: non-destructive mocked/synthetic tests, static schema contract tests, guarded DB fault-test configuration, opt-in local isolated DB harness, and dry-run load/soak configuration only.

## Implementation

- Expanded `tests/attendance-obligation.helper.spec.ts` from 2 to 9 tests.
- Expanded `tests/timesheet-line-version.helper.spec.ts` from 1 to 9 tests.
- Added `tests/employeepayroll.snapshot-lock.contract.spec.ts` with 6 mocked API contract tests.
- Added `tests/load/hris-api-load.mjs` as a local-first load/soak harness with shared-environment guardrails.
- Added `tests/db/schema-source-truth.contract.spec.ts` with source-of-truth Prisma schema contract coverage for both Postgres and MongoDB schema surfaces.
- Added `tests/support/isolated-db-fault.guard.ts` and `tests/db/isolated-db-fault.guard.spec.ts` so future destructive DB fault tests are blocked unless an isolated test DB is explicitly configured.
- Added package scripts:
  - `test:api:source-truth`
  - `test:db:source-truth`
  - `test:db:smoke`
  - `test:db:prepare`
  - `test:db:integration`
  - `test:db:faults`
  - `test:regression:payroll-source-truth`
  - `test:ci:source-truth`
  - `test:load`
  - `test:soak`
- Added `docs/testing-strategy.md`.
- Added `docs/testing-maturity-audit.md` with backend maturity assessment, risk matrix, testing pyramid, CI strategy, and backlog.
- Updated `.github/workflows/api-ci.yml` so `npm run test:ci:source-truth` is a blocking PR gate.

## Coverage Added

- `AttendanceObligation`:
  - today `EXPECTED` displays as `NOT_CLOCKED_IN`
  - past `EXPECTED` displays as `ABSENT`
  - future `EXPECTED` displays as `SCHEDULED`
  - non-`EXPECTED` stored statuses are preserved
  - deleted obligations are excluded
  - active obligations sort by business date
  - snapshot metadata records `ATTENDANCE_OBLIGATION`
  - break metadata is preserved
  - non-work statuses become primary markers
- `Timesheetline`:
  - snapshot metadata records source identity
  - leave and holiday metadata are derived from legacy entries
  - correction revision metadata is preserved
  - new effective lines start at revision 1
  - existing effective lines update in place by default
  - version mode creates a correction revision and supersedes the old row
  - stale unique-index collisions update the colliding row only in safe update mode
  - version mode rethrows unique constraint errors instead of overwriting history
- `EmployeePayroll` API:
  - paid payroll rejects earnings edits
  - paid payroll rejects `timesheetSnapshot` rewrites
  - paid payroll allows payment reference fields
  - unpaid payroll marked paid receives paid/lock metadata
  - explicit lock metadata is preserved
  - missing payroll returns 404 without mutation
- Prisma schema contracts:
  - `AttendanceObligation` remains the operational attendance truth model
  - `Attendance` remains the raw/effective clock ledger model
  - `Timesheetline` remains the effective historical totals and approved OT model
  - `EmployeePayroll` remains pinned to paid snapshot and lock fields
  - Postgres and MongoDB schema surfaces keep the four source-of-truth models physically separated
- Isolated DB fault-test guard:
  - blocks missing opt-in
  - blocks missing, invalid, or nameless database URLs
  - allows local disposable DB URLs after explicit opt-in
  - blocks shared/production-like database names
  - blocks shared/production-like schema names from env or database URL query
  - blocks remote DB URLs unless remote isolation and approval are explicit

## Validation

- Passed after second API slice: `npm run test:db:source-truth` (21 tests).
- Passed after second API slice: `npm run test:ci:source-truth` (45 tests total: 24 API/helper tests and 21 DB/schema/guard tests).
- Passed after TDD foundation CI update: `npm run test:ci:source-truth` (45 tests).
- Passed after dedicated local DB guard update: `npm run test:db:source-truth` (24 tests).
- Passed after dedicated local DB guard update: `npm run test:ci:source-truth` (48 tests).
- Passed dry-load: `npx tsx node_modules/mocha/bin/mocha --no-config --dry-run tests/db/isolated-prisma.integration.spec.ts tests/db/isolated-db-faults.spec.ts` (8 guarded live-DB tests registered without DB mutation).
- Checked local DB port: `Test-NetConnection -ComputerName 127.0.0.1 -Port 55432 -InformationLevel Quiet` returned `False`.
- Passed: `npm run test:api:source-truth` (24 tests).
- Passed dry-run: `npm run test:load -- --dry-run`.
- Passed dry-run: `npm run test:soak -- --dry-run`.
- Not run: real load/soak tests because no approved non-production API target was provided.
- Not run live: `test:db:prepare`, `test:db:smoke`, `test:db:integration`, and `test:db:faults` require explicit isolated DB env and reachable local `hris_fault_test`.

## Remaining Risks

- The primary `npm test` command still uses the repo's pre-existing Mocha/ts-node path, which currently hits TypeScript/ESM and unrelated legacy spec type issues. The new source-truth slice uses `tsx` with explicit specs to avoid expanding into unrelated debt.
- DB invariant tests now include static schema contracts, an isolated DB guard, and guarded local Prisma fault specs. Live execution evidence still requires local `hris_fault_test` env.
- Authorization matrix tests need confirmed role and permission rules before hardening.

## Recommendations

- New recommendation added: keep `test:api:source-truth` as the safe API regression slice while the broader legacy test harness is cleaned up.
- New recommendation added: create an approved disposable DB profile before adding destructive bad-data invariant tests.
- New recommendation added: keep DB fault tests behind `ALLOW_DB_FAULT_TESTS=true` and `ISOLATED_TEST_DATABASE_URL` so intentional corruption cannot run against shared data by accident.
- New recommendation added: confirm role/permission matrix before expanding API endpoint authorization tests.
- New recommendation added: add shared Supertest app builders and auth principal factories before broad controller expansion.
- New recommendation added: repair broad legacy `npm test` and full `npm run typecheck` before making them blocking gates.

## Dedicated Local DB Fault Harness Decision

- Decision status: APPROVED_FOR_LOCAL_TEST_IMPLEMENTATION.
- Approved local database name: `hris_fault_test`.
- Approved local hosts: `localhost` and `127.0.0.1`.
- Approved local port: `55432`.
- Explicitly blocked for this slice: `.env` `PG_DATABASE_URL` targets such as `hris-new`, shared dev, UAT, staging, production, and all remote hosts.
- Implementation sequencing: WWG/docs first, then guard, explicit Prisma client, fixture teardown, smoke, integration, and fault tests.

## Dedicated Local DB Fault Harness Implementation

- Tightened the DB fault guard to allow only `hris_fault_test` through `localhost:55432` or `127.0.0.1:55432`.
- Added explicit isolated Prisma client construction using `new PrismaClient({ datasources: { db: { url } } })`.
- Added centralized minimal HRIS fixture seed/teardown helpers with FK-safe cleanup order.
- Added opt-in smoke, prepare, integration, and fault scripts without adding them to `test:ci:source-truth`.
- Added guarded live-DB specs for isolated DB connection, fixture seed/teardown, duplicate `AttendanceObligation`, duplicate `Timesheetline` revisions, multiple effective `Timesheetline` rows, paid payroll missing snapshot, and paid payroll missing lock metadata.

## WWG Truth Synchronization

- Task mode: high-risk regression/test infrastructure.
- New truth detected: YES.
- Wiki updated: NO / N/A.
- Workspace updated: YES.
- Governance review completed: YES.
- Drift status: YELLOW.
- Canonical files changed:
  - `.wwg/workspace/current-task.md`
  - `.wwg/reports/api-testing-implementation.md`
  - `.wwg/wiki/project-truth.md`
  - `.wwg/wiki/project-truth-summary.md`
  - `docs/testing-strategy.md`
  - `docs/testing-maturity-audit.md`
  - `.github/workflows/api-ci.yml`
  - `package.json`
- Implementation discoveries synced:
  - API source-truth regression slice is executable through `npm run test:api:source-truth`.
  - DB/schema/guard source-truth slice is executable through `npm run test:db:source-truth`.
  - Dedicated local DB fault harness is available through opt-in scripts for `hris_fault_test`.
  - API load/soak harness is executable in dry-run mode and guarded against shared Cloud Run environments.
  - API CI now blocks on the focused source-truth test slice.
  - Existing broad `npm test` path has unrelated harness/type debt.
- Remaining stale context:
  - Remote/shared DB fault target, role/permission matrix, and real load/soak environment remain unconfirmed.
