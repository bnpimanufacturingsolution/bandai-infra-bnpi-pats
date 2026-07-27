# HRIS API Testing Strategy

Status: ACTIVE_DRAFT
Last reviewed: 2026-07-13

## Scope

This strategy covers backend API tests in `hris-api`. The paired frontend repository `../hris-app` owns UI/client/browser tests; this repository owns backend authorization, persistence, Prisma/schema constraints, API contracts, source-of-truth invariants, load tests, and soak tests.

See `docs/testing-maturity-audit.md` for the backend maturity assessment, risk matrix, and rollout backlog.

## Safety Contract

- Do not test against production data.
- Do not intentionally corrupt shared dev, UAT, staging, or production databases.
- DB fault tests must use synthetic fixtures, disposable local databases, or explicitly approved isolated test databases.
- Load and soak tests are blocked from known shared Cloud Run API URLs unless `ALLOW_SHARED_ENV_LOAD_TESTS=true` is set after approval.
- Attendance, timesheet, approved OT, and payroll-history tests must preserve `../docs/attendance-timesheet-payroll-tally-prd.md`.

## Executable API Source-Truth Slice

Run the isolated source-truth regression slice:

```bash
npm run test:api:source-truth
npm run test:db:source-truth
npm run test:migration:quality
npm run test:ci:source-truth
```

This covers:

- `AttendanceObligation` display/snapshot behavior for today, past, future, deleted, non-work, and break metadata cases
- `Timesheetline` snapshot metadata and effective-line versioning
- paid `EmployeePayroll` snapshot lock API behavior through a mocked Express/Supertest controller contract
- Prisma schema contracts for `AttendanceObligation`, `Attendance`, `Timesheetline`, and `EmployeePayroll` across both `prisma/schema-postgres` and `prisma/schema`
- isolated DB fault-test guardrails that block destructive DB tests unless a disposable local or approved remote isolated database/schema is explicitly configured
- migration script safety guards for dry-run/execute parsing, unsafe target rejection, isolated local target acceptance, safety registry coverage, and idempotency summaries
- Mongo/Postgres migration helper coverage for high-risk DM0-DM7 model scope, field sanitization, FK retry behavior, duplicate idempotency, count parity, and row-signature parity
- enterprise DM0-DM7 masterlist coverage, source file to target model mappings, required quality gates, actual enterprise migration service dry-run execution, runner parsing, DM report timing metadata, and focused timesheet migration reconciliation
- timesheet line backfill and attendance status/flag migration helper coverage aligned to the attendance/timesheet/payroll source-of-truth split
- attendance import, employee import report-to backfill, legacy migration dry-run no-write, and seed/QA safety contracts

`npm run test:migration:quality` is the evidence-oriented migration command. It prints DM mapping, evidence mapping, per-DM-scope elapsed time, per-file elapsed time, and per-test elapsed time in the terminal, then writes:

- `output/reports/migration-quality-test-breakdown.json`
- `output/reports/migration-quality-test-breakdown.md`

Latest focused result: 68 passing tests.

## DB Fault-Test Guardrails

Destructive or seeded bad-data tests must stay opt-in. The only approved local target for the current implementation slice is:

- database name: `hris_fault_test`
- host: `localhost` or `127.0.0.1`
- port: `55432`

Do not use `.env` `PG_DATABASE_URL` values such as `hris-new` for fault tests. Remote DB fault testing is out of scope until a separate remote approval policy exists.

Required for any future DB fault run:

```bash
ALLOW_DB_FAULT_TESTS=true
ISOLATED_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55432/hris_fault_test
```

Optional for per-run schema isolation:

```bash
DB_FAULT_TEST_SCHEMA=fault_test_run_1
```

Remote isolated databases are blocked for this implementation slice. A future remote policy must be documented before enabling remote DB fault tests.

### Opt-In DB Commands

```bash
npm run test:db:smoke
npm run test:db:prepare
npm run test:db:integration
npm run test:db:faults
```

These commands are intentionally not part of `npm run test:ci:source-truth` until CI defines an ephemeral Postgres service.

The isolated Prisma client must be constructed explicitly with the isolated URL:

```ts
new PrismaClient({ datasources: { db: { url: isolatedUrl } } })
```

Do not import or reuse an ambient/shared Prisma singleton for DB fault tests.

## Load And Soak

Validate configuration without network traffic:

```bash
npm run test:load -- --dry-run
npm run test:soak -- --dry-run
```

Default paths are local and read-only:

```bash
LOAD_TEST_BASE_URL=http://localhost:3000
LOAD_TEST_PATHS=/health,/api/status
LOAD_TEST_DURATION_SECONDS=15
LOAD_TEST_CONCURRENCY=5
LOAD_TEST_REQUEST_TIMEOUT_MS=10000
LOAD_TEST_MAX_ERROR_RATE=0.01
LOAD_TEST_MAX_P95_MS=1000
LOAD_TEST_BEARER_TOKEN=optional-test-token
```

Use shared non-production environments only after approval:

```powershell
$env:ALLOW_SHARED_ENV_LOAD_TESTS = "true"
$env:LOAD_TEST_BASE_URL = "https://..."
npm run test:load
```

## Employee Benefit Schedule Modes

Product and migration notes: `docs/BENEFIT_SCHEDULE_MODES.md`.

Backend ownership for schedule modes:

- Zod contract and legacy compatibility (including `RECURRING` and attendance-based fields): `tests/employee-benefit-schedule.contract.spec.ts`
- Payroll source display labels (enrollment vs benefit type) and payslip DMA breakdown: `tests/payroll-source-display.helper.spec.ts`, `tests/payroll-benefit-source.helper.spec.ts`, `tests/payslip-pdf.helper.spec.ts` (see `docs/BENEFIT_SCHEDULE_MODES.md`)
- Installment generation helper, recurring plan, and attendance ensure plan: `tests/employee-benefit-schedule.helper.spec.ts`
- Attendance amount pure formulas: `tests/attendance-benefit-amount.helper.spec.ts`
- Create/update controller wiring, partial-update validation, recurring no bulk-create: `tests/employee-benefit-schedule.controller.spec.ts`
- Payroll installment selection, lazy recurring ensure, cutoff mismatch exclusion, aggregation, deducted state, and idempotency: `tests/payroll-benefit-source.helper.spec.ts`, `tests/payroll-benefit-integration.spec.ts`

Focused schedule + payroll benefit command:

```bash
npx tsx node_modules/mocha/bin/mocha --no-config tests/attendance-benefit-amount.helper.spec.ts tests/employee-benefit-schedule.contract.spec.ts tests/employee-benefit-schedule.helper.spec.ts tests/employee-benefit-schedule.controller.spec.ts tests/payroll-benefit-source.helper.spec.ts tests/payroll-benefit-integration.spec.ts
```

Broader payroll source-truth regression slice that includes benefit installment consumption:

```bash
npm run test:regression:payroll-source-truth
```

Frontend schedule UI/evidence ownership remains in `../hris-app` (`docs/BENEFIT_SCHEDULE_MODES.md`, `docs/testing-strategy.md`).

## Next Coverage Targets

- expand selected migration quality tests from mocked/helper/sample dry-run execution into isolated DB integration after a disposable DB is available
- run `test:db:prepare`, `test:db:smoke`, `test:db:integration`, and `test:db:faults` against local `hris_fault_test`
- expand seeded bad-data invariant tests for orphaned links, draft lines in payroll, stale mutable paid-history reads, and orphan approvals
- endpoint-level authorization tests for employee, manager, HR, admin, and super admin
- transaction/concurrency tests for clock events, timesheet approval, payroll generation, and payslip release
- CI orchestration with `../hris-app` so app and API coverage are reported together

## Current CI Gate

API PR CI now blocks on:

```bash
npm run test:ci:source-truth
```

The broad legacy `npm test`, full `npm run typecheck`, and lint remain visible but non-blocking until existing unrelated harness/type/config debt is repaired.

Latest confidence audit result on 2026-06-01: `npm run test:ci:source-truth` failed because `npm run test:migration:quality` failed one DM3 provenance test: `enterprise migration dry-run prerequisite overlay reports CSV provenance for true missing prerequisites`. The focused API source-truth and DB source-truth sub-suites passed before the migration quality failure. Safe dry-runs for `npm run test:load -- --dry-run` and `npm run test:soak -- --dry-run` passed, but they did not execute traffic. `npm run lint`, `npm run typecheck`, `npm test`, and `npm run test:function-coverage` failed; `npm run build` passed with warnings. Treat this as current red gate evidence until repaired.
