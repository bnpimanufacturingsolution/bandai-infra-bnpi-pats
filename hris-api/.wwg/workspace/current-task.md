# Current Task

## Status
done

## Summary
RECURRING benefit `recurrenceFrequency` v1: EVERY_CUTOFF (default), MONTHLY (period 2 / sole month), YEARLY (fiscal year-end last period). Schema, pure helper, plan/ensure, payroll context, docs, tests.

## Category
feature / data-model

## Packages
- hris-api
- hris-app
- Dual-app: HR/emp-only

## Truth synchronization
- New truth detected: YES — recurrenceFrequency rules
- Drift: NONE after sync

---

## Also from bandai-infra develop (at recombine)

Status: Existing Project Adoption continuity with active governance, test-enforcement hardening, and cross-repo context reconciliation.

## Active Enterprise DM Quality Addendum

- Status: IMPLEMENTED_EXPANDED_BY_DATA_MIGRATION_GAP_CHAIN
- Task mode: mixed / high-risk data migration quality infrastructure.
- Delivery mode: AI-agent.
- User request:
  - Proceed with senior-level DM quality/testing plan.
  - Add quality testing across DM0, DM1, and later stages.
  - Add focused quality testing for timesheets with timing evidence.
  - Provide a masterlist/overall mapping for every DM.
- Safety boundary:
  - No write-mode migration, backfill, repair, deletion, production/shared DB mutation, live load, or live soak action is approved by this addendum.
  - Migration quality tests must remain sample-pack, mocked, dry-run, or isolated DB only.
- Work completed in this addendum:
  - Added executable DM0-DM7 masterlist in `scripts/migration/migration-dm-masterlist.ts`.
  - Added human-readable masterlist in `docs/migration-dm-quality-masterlist.md`.
  - Added accomplishment report in `docs/enterprise-dm-quality-accomplishment.md`.
  - Updated `.wwg/governance/test-enforcement.md` so migration/backfill/repair changes require smoke or quality-gate evidence, and attendance/timesheet/payroll-history source-truth changes require regression evidence.
  - Added migration masterlist regression tests in `tests/enterprise-migration-dm-masterlist.spec.ts`.
  - Added focused timesheet migration quality tests in `tests/enterprise-migration-timesheet-quality.spec.ts`.
  - Extended migration DM report metadata with rows/sec, failed, warnings, and errors columns.
  - Added `npm run test:migration:quality` and included it in `npm run test:ci:source-truth`.
  - Upgraded `npm run test:migration:quality` to print DM mapping, evidence mapping, per-DM-scope elapsed time, per-file elapsed time, and per-test elapsed time in the terminal.
  - Added actual `enterpriseMigrationService.executeEnterpriseMigration(...)` dry-run execution to the migration quality gate through `tests/enterprise-migration.service.spec.ts`.
  - Added retained migration quality artifacts at `output/reports/migration-quality-test-breakdown.json` and `output/reports/migration-quality-test-breakdown.md`.
  - Updated Project Truth, Terminology, testing strategy, and testing maturity audit.
  - Added migration script safety guard coverage for dry-run/execute mode, unsafe target rejection, isolated local target acceptance, registry coverage, and idempotency summaries.
  - Added Mongo/Postgres backfill and parity helper coverage for high-risk DM0-DM7 model scope, field sanitization, FK retry behavior, duplicate idempotency, count parity, and row-signature parity.
  - Added timesheet line backfill and attendance status/flag migration source-truth tests.
  - Added attendance import, employee import report-to backfill, legacy migration dry-run, and seed/QA safety tests.
  - Wired the expanded migration quality suite into `npm run test:migration:quality` and `npm run test:ci:source-truth`.
- Validation:
  - Passed: `npm run test:migration:quality` (68 passing tests).
  - Passed: `npm run test:ci:source-truth` (24 API source-truth tests, 24 DB source-truth tests, and 68 migration quality tests).

## Data Migration Testing Gap Chain Addendum

- Status: COMPLETE
- Task mode: mixed / high-risk data migration testing implementation.
- Delivery mode: AI-agent.
- User request:
  - Execute the cross-repo chain-prompt plan created in `../hris-app/.wwg/workspace/testing/data-migration-testing-gap-chain-plan.md`.
- Safety boundary:
  - No production/shared DB, migration, backfill, repair, seed, delete, deployment, credential, live load, or live soak command was approved or executed.
  - Coverage must remain pure/helper, mocked, sample-pack, dry-run, or isolated-test only.
- Work completed:
  - Added shared script safety helper in `scripts/migration/script-safety.ts`.
  - Added/expanded tests:
    - `tests/migration-script-safety.spec.ts`
    - `tests/mongo-postgres-migration.spec.ts`
    - `tests/timesheet-backfill-source-truth.spec.ts`
    - `tests/attendance-status-migration.spec.ts`
    - `tests/import-service-contracts.spec.ts`
    - `tests/migration-service-dry-run.spec.ts`
    - `tests/seed-and-qa-script-safety.spec.ts`
    - `tests/enterprise-migration-runner-env.spec.ts`
  - Refactored migration/backfill/import runners only enough to expose testable helpers and enforce dry-run/execute boundaries.
  - Updated migration quality evidence mapping and npm test scripts.
- Validation:
  - Passed: `npm run test:migration:quality` (68 tests).
  - Passed: `npm run test:ci:source-truth`.
- Remaining follow-up:
  - Promote selected migration and backfill checks into live isolated DB integration after disposable DB service readiness.
  - Add endpoint-level import authorization and controller contract coverage.

## Active Context Reconciliation Addendum

- Status: COMPLETE
- Task mode: docs/governance context repair before API test implementation.
- User request:
  - Fill the WWG context gap after discovering that API test work was being planned from `hris-app` without the sibling `hris-api` repository being represented in active context.
- Work in this addendum:
  - Reconcile stale API Project Truth that described this repo as a Web3/eCommerce prototype.
  - Confirm `hris-api` as the backend API for the HRIS/workforce system.
  - Record the paired frontend repository at `../hris-app`.
  - Split test ownership before continuing: app/UI/client tests in `../hris-app`; backend authorization, persistence, DB invariants, integration/load/soak tests in this repo or an approved API harness.
  - Refresh generated WWG context. `project-context.md` did not have a generated section, so it was updated directly as a workspace context surface.
- Safety boundary:
  - Do not run destructive DB fault-injection, migration, backfill, repair, deletion, load, or soak tests against shared environments without explicit approval.
- Existing function-level test-enforcement task below remains active after this reconciliation.

## Active API Testing Implementation Addendum

- Status: TDD_GATE_FOUNDATION
- Task mode: high-risk regression/test infrastructure.
- Delivery mode: AI-agent.
- User request:
  - Proceed with the API-side testing work after filling the cross-repo context gap.
- Work completed:
  - Expanded `tests/attendance-obligation.helper.spec.ts` with source-of-truth regression coverage for `AttendanceObligation` display statuses, deleted-row filtering, snapshot metadata, break metadata, and non-work primary markers.
  - Expanded `tests/timesheet-line-version.helper.spec.ts` with snapshot metadata and effective `Timesheetline` create/update/version/collision behavior.
  - Added `tests/employeepayroll.snapshot-lock.contract.spec.ts` for paid payroll snapshot lock API behavior using mocked Prisma and Supertest.
  - Added local API load/soak harness at `tests/load/hris-api-load.mjs`.
  - Added DB/source-truth schema contract coverage for Postgres and MongoDB Prisma schema surfaces.
  - Added isolated DB fault-test guardrails so destructive tests require explicit local/approved isolated DB configuration.
  - Added targeted npm scripts: `test:api:source-truth`, `test:db:source-truth`, `test:regression:payroll-source-truth`, `test:ci:source-truth`, `test:load`, and `test:soak`.
  - Added `docs/testing-strategy.md`.
  - Added backend testing maturity audit at `docs/testing-maturity-audit.md`.
  - Updated API CI so `npm run test:ci:source-truth` is a blocking PR gate while broad legacy `npm test` remains visible but non-blocking.
- Safety boundary:
  - No production/shared database, migration, backfill, repair, deletion, deployment, secret, real load, or real soak action was performed.
- Validation:
  - Passed: `npm run test:api:source-truth` (24 tests).
  - Passed: `npm run test:db:source-truth` (21 tests).
  - Passed: `npm run test:ci:source-truth` (45 tests).
  - Passed dry-run: `npm run test:load -- --dry-run`.
  - Passed dry-run: `npm run test:soak -- --dry-run`.
  - Passed TDD foundation validation: `npm run test:ci:source-truth` (45 tests).
- Remaining follow-up:
  - Implement isolated Prisma/integration database setup/teardown using the confirmed local DB target `hris_fault_test` on `localhost:55432` or `127.0.0.1:55432`.
  - Add seeded bad-data tests for duplicate ledger rows, orphaned links, draft payroll lines, and missing paid snapshots against only `hris_fault_test`.
  - Add endpoint-level authorization tests after confirming the role/permission matrix.
  - Add transaction/concurrency tests for clock, approval, payroll generation, and payslip release flows.

## Active Dedicated Local DB Fault Harness Addendum

- Status: IMPLEMENTED_GUARDED_OPT_IN
- Task mode: high-risk regression/test infrastructure.
- Delivery mode: AI-agent.
- User-approved target:
  - Dedicated local Postgres database name: `hris_fault_test`.
  - Allowed hosts: `localhost` and `127.0.0.1`.
  - Allowed port: `55432`.
- Safety boundary:
  - Do not use `.env` `PG_DATABASE_URL` values such as `hris-new`.
  - Do not use `hris`, dev, UAT, staging, production, shared, or remote hosts.
  - Do not add DB fault scripts to `test:ci:source-truth` until CI defines an ephemeral Postgres service.
- Implementation requirements:
  - Document the WWG decision before code.
  - Use explicit Prisma client construction with `ISOLATED_TEST_DATABASE_URL`.
  - Centralize fixture teardown in FK-safe reverse dependency order.
- Work completed:
  - Tightened the guard so only `hris_fault_test` on `localhost:55432` or `127.0.0.1:55432` is allowed.
  - Added explicit isolated Prisma client helper using `new PrismaClient({ datasources: { db: { url } } })`.
  - Added `test:db:smoke`, `test:db:prepare`, `test:db:integration`, and `test:db:faults` scripts.
  - Added centralized minimal HRIS fixture seed/teardown helpers.
  - Added DB-level rejection specs for duplicate `AttendanceObligation` and duplicate `Timesheetline` revisions.
  - Added application-level detection specs for multiple effective `Timesheetline` rows, paid payroll without `timesheetSnapshot`, and paid payroll missing lock metadata.
- Validation:
  - Passed: `npm run test:db:source-truth` (24 tests).
  - Passed: `npm run test:ci:source-truth` (48 tests).
  - Passed dry-load: `npx tsx node_modules/mocha/bin/mocha --no-config --dry-run tests/db/isolated-prisma.integration.spec.ts tests/db/isolated-db-faults.spec.ts` (8 tests registered without DB mutation).
  - Local port check: `127.0.0.1:55432` was not reachable in the current workspace session.
  - Not run live: `test:db:prepare`, `test:db:smoke`, `test:db:integration`, and `test:db:faults` require explicit isolated DB env and reachable local `hris_fault_test`.

## Test Suite Confidence Audit Follow-Up

- Status: COMPLETE_FOR_REPORTING.
- Task mode: docs/reporting audit with high-risk quality and release-readiness implications.
- Delivery mode: AI-agent prompt chain from paired `../hris-app`.
- User request:
  - Determine whether the current test suite provides genuine confidence in the application and API.
  - Audit, document, and report findings as-is without fixing, modifying product behavior, or suppressing failures.
- API audit findings:
  - `npm run test:ci:source-truth` failed because `npm run test:migration:quality` failed one DM3 provenance test: `enterprise migration dry-run prerequisite overlay reports CSV provenance for true missing prerequisites`.
  - `npm run test:api:source-truth` passed 25 tests before the migration quality failure.
  - `npm run test:db:source-truth` passed 24 tests before the migration quality failure.
  - `npm run test:load -- --dry-run` and `npm run test:soak -- --dry-run` passed as configuration-only checks; no traffic was executed.
  - `npm run lint`, `npm run typecheck`, `npm test`, and `npm run test:function-coverage` failed.
  - `npm run build` passed with warnings.
- Safety boundary:
  - No production/shared database, migration execute, backfill, repair, seed write, deletion, deployment, credential change, live load, or live soak command was executed.
  - DB fault/integration commands were not run because they require explicit isolated database configuration.
- Cross-repo report artifact:
  - `../hris-app/output/reports/test-suite-confidence-audit-2026-06-01.md`.

## Task Summary

- Status: IN_PROGRESS
- Task mode: Existing Project Adoption (continuity) + Governance/Test Standard Update
- User request:
  - Enforce WWG compliance and add a rule: each function should have at least 5 test cases.

## Goal

- Preserve Existing Project Adoption evidence context and WWG contract requirements.
- Keep WWG validate/audit clean.
- Make the function-level test minimum enforceable and auditable.
- Remove stale workspace context signals that trigger regression drift warnings.

## Existing Project Adoption Continuity

- Adoption context remains active for this repository type (`existing-adopted-project`).
- Adoption evidence and inferred-truth review requirements remain in force.
- Any governance/test rule change must still reconcile with Project Truth and adoption guardrails.

## Work Completed In This Task

- Updated `.wwg/governance/test-enforcement.md` to require >= 5 test cases for new/modified functions.
- Updated `.wwg/workspace/context/project-context.md` from a placeholder into an actionable context contract.
- Started implementation of an automated function-level test coverage check script.

## Follow-Up Needed

- Finalize and run automated function-level test case checker.
- Identify functions below threshold and add/expand tests.
- Re-run `wwg:regression-check`, `wwg:test-check`, `wwg:validate`, and `wwg:audit`.

## Close-Out Criteria

- Function-level test checker is present and documented.
- No new WWG validate/audit failures.
- Test coverage gap report is generated and actionable.

