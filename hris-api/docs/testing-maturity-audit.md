# HRIS API Testing Maturity Audit

Status: ACTIVE_DRAFT
Last reviewed: 2026-06-01

## Scope

This audit covers backend-owned testing in `hris-api`: controllers, services, middleware, validation, authorization, persistence behavior, API contracts, DB invariants, load, soak, and failure injection.

The paired app repo `../hris-app` owns UI, browser E2E, app components, hooks, and client payload tests.

## Maturity Assessment

Current backend maturity: `2 / 5`.

Useful source-truth and helper tests exist, but backend coverage is not yet comprehensive. The current safest CI baseline is the focused source-truth slice, because the broad legacy `npm test` harness has unrelated ts-node/ESM/type debt.

## 2026-06-01 Confidence Audit Addendum

Current gate status: `RED`.

The latest audit did not treat focused source-truth coverage as full backend confidence. `npm run test:ci:source-truth` currently fails because `npm run test:migration:quality` has one failing DM3 provenance test. The source-truth API and DB sub-suites passed before the migration quality failure, and safe load/soak dry-runs passed as configuration checks only. Broader hardening remains red: `npm run lint` fails because ESLint v9 config is missing and the script references missing `lib-entry.ts`; `npm run typecheck` fails on Prisma/schema/controller/helper type errors; legacy `npm test` fails on Mocha/ts-node CJS/ESM and test-global typing issues; `npm run test:function-coverage` reports 37 exported functions below the 5-test minimum.

The backend suite has valuable domain pockets, but it still lacks systematic endpoint authorization contracts, live isolated DB integration/fault run evidence, transaction/concurrency tests, and real load/soak evidence against an approved synthetic/non-production target.

| Area | Current State | Maturity | Main Gap |
|---|---|---:|---|
| Helper/unit tests | Good pockets of coverage | 2.5 | Uneven domain coverage |
| Controller/API contracts | Partial Supertest coverage | 2 | Most endpoints untested |
| Middleware/auth | Some behavior specs | 2 | Role matrix still inferred |
| Prisma/schema contracts | Source-truth contracts added | 2.5 | No live isolated DB mutations yet |
| DB fault injection | Guard and opt-in local harness exist; local target confirmed as `hris_fault_test` | 2 | Needs live local run evidence and broader seeded failures |
| Load/soak | Dry-run harness exists | 1.5 | No approved target or scheduled thresholds |
| CI gates | Source-truth gate is now blocking | 2.5 | Legacy broad tests and full typecheck remain non-blocking |

## Risk Matrix

| Risk | Current Coverage | Required Next Coverage | Priority |
|---|---|---|---|
| Auth token and session behavior | Sparse | Login/me/logout contracts, malformed credentials, deactivated employees | Critical |
| Authorization by role | Inferred role tests only | Employee, manager, HR, admin, super admin matrix | Critical |
| Employee records and documents | Helper tests | CRUD contracts, upload validation, orphan record handling | Critical |
| Attendance clock ledger | Helper/schema tests | Correction contracts, duplicate raw rows, partial writes | Critical |
| Attendance obligations | Helper/schema tests | Endpoint contracts, backfill invariants, duplicate/missing rows | Critical |
| Timesheet submit/approval | Helper tests | Submit/approve/reopen contracts, concurrent approval race tests | Critical |
| EmployeePayroll snapshots | Contract tests | Generation, paid reads, mutation denial, missing snapshot faults | Critical |
| Request/workflow engine | Helper tests | Routing, approval, audit, actor constraints | High |
| Recruitment/applicants | Helper tests | Public validation, privacy-safe reads, upload edge cases | High |
| Migration/backfill/repair scripts | DM0-DM7 masterlist, report timing checks, sample-pack integrity, actual migration service dry-run execution, script safety guards, Mongo/Postgres helper parity, timesheet backfill source-truth tests, attendance migration tests, import service contracts, legacy dry-run no-write tests, and seed/QA safety tests exist | Isolated DB integration, endpoint/controller contracts, per-stage edge-case fixtures | High |

## Backend Testing Pyramid

| Layer | Command | Runtime Target | Purpose |
|---|---|---|---|
| Unit/helper | targeted Mocha specs | Every PR | Pure business rules and helpers |
| API contract | `npm run test:api:source-truth` now, future `test:contracts` | Every PR | HTTP status, payload shape, errors |
| DB/schema contract | `npm run test:db:source-truth` | Every PR | Schema/source split and guardrails |
| Isolated DB integration | Future `test:db:integration` | PR/nightly | Real Prisma behavior with cleanup |
| Fault injection | Future `test:db:faults` | Manual/scheduled non-prod | Bad data, connection drops, partial writes |
| Load/stress/spike | `npm run test:load` with approved target | Scheduled/release | Throughput and thresholds |
| Soak | `npm run test:soak` with approved target | Scheduled | Long-running stability |

## Foundational Architecture

- Use `tsx node_modules/mocha/bin/mocha --no-config` for focused modern test slices.
- Keep broad legacy `npm test` visible until the harness is repaired.
- Use Supertest app builders for controller contracts.
- Use Prisma mock builders for fast contracts and isolated real Prisma clients for DB integration.
- Use only the dedicated local Postgres database `hris_fault_test` for the current destructive fault-test harness.
- Keep fault tests behind `ALLOW_DB_FAULT_TESTS=true` and `ISOLATED_TEST_DATABASE_URL`.
- Construct isolated Prisma clients with `new PrismaClient({ datasources: { db: { url } } })`; do not rely on ambient `.env` resolution.
- Keep migration/backfill command tests in `npm run test:migration:quality` unless they require live isolated DB mutation.

## CI Strategy

API CI now blocks on:

```bash
npm run test:ci:source-truth
```

API CI still reports but does not block on:

```bash
npm run lint
npm run typecheck
npm test
```

Those should become blocking only after existing debt is remediated.

## Next Implementation Backlog

1. Add Supertest contracts for `auth`, `employee`, `attendance`, `timesheet`, `payrollperiod`, `employeepayroll`, `request`, and `applicant`.
2. Add shared fixtures under `tests/fixtures/` for organization, employee, manager, HR user, admin, payroll period, attendance day, timesheet, timesheet line, and paid payroll.
3. Run the isolated Prisma test client and fixture harness against local `hris_fault_test`.
4. Expand seeded bad-data tests for orphan employee references, draft lines in payroll tally, stale mutable paid-history reads, and orphan approvals.
5. Add transaction/concurrency tests for clock corrections, timesheet approval, payroll generation, and payslip release.
6. Add failure-path tests for database timeouts, connection drops, external file upload failures, Redis/cache failures, and audit logger failures.
7. Add reporting artifacts for load/soak runs with p95, p99, error-rate, timeout, and memory thresholds.
8. Promote selected migration dry-run/idempotency checks from mocked/sample/helper coverage into isolated DB execution after the disposable DB service is reachable.
