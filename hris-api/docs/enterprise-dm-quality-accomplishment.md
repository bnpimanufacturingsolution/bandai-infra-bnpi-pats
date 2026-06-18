# Enterprise DM Quality Accomplishment

Status: ACTIVE_DRAFT
Last reviewed: 2026-05-26

## Purpose

Record the current enterprise data migration quality accomplishment: what is now mapped, what is now tested, what is now enforced, and what remains pending.

This is an accomplishment report, not a presentation-only pack. Every completed item below points back to repo artifacts, tests, or commands.

## Audience

This document is for the project owner, migration implementers, QA reviewers, and agents working on HRIS enterprise data migration quality.

## Summary

The enterprise migration work now has a tested foundation for DM quality:

- An executable DM0-DM7 masterlist exists.
- Every recognized enterprise CSV dataset is mapped to a DM code, business name, target model, key fields, dependencies, and quality gates.
- Migration quality tests now run through `npm run test:migration:quality`.
- The migration quality gate now includes actual `enterpriseMigrationService.executeEnterpriseMigration(...)` dry-run execution against the sample pack, not only mapping/report assertions.
- `npm run test:migration:quality` now prints DM mapping, evidence mapping, per-DM-scope elapsed time, per-file elapsed time, and per-test elapsed time in the terminal.
- The fast source-truth CI gate now includes migration quality through `npm run test:ci:source-truth`.
- High-risk migration/backfill utilities now have focused safety, target-guard, idempotency, dry-run/no-write, parity, and source-truth helper coverage.
- Timesheet migration now has focused tests for effective line backing, attendance ledger linkage, paid payroll reconciliation, and payroll snapshot source selection.
- DM reports now include timing evidence: count, start time, end time, elapsed time, and rows/sec in report metadata.

No production or shared migration execution was performed.

## How It Works

The technical migration taxonomy remains the current executable DM0-DM7 map. Business-facing workstreams can group these rows differently, but tests and reports use the technical DM codes unless the taxonomy is deliberately changed.

The central implementation is:

- `scripts/migration/migration-dm-masterlist.ts`
- `scripts/migration/migration-dm-report.ts`
- `tests/enterprise-migration.service.spec.ts`
- `tests/enterprise-migration-dm-masterlist.spec.ts`
- `tests/enterprise-migration-dm-report.spec.ts`
- `tests/enterprise-migration-timesheet-quality.spec.ts`
- `tests/enterprise-csv-sample-pack.spec.ts`
- `tests/migration-script-safety.spec.ts`
- `tests/mongo-postgres-migration.spec.ts`
- `tests/timesheet-backfill-source-truth.spec.ts`
- `tests/attendance-status-migration.spec.ts`
- `tests/import-service-contracts.spec.ts`
- `tests/migration-service-dry-run.spec.ts`
- `tests/seed-and-qa-script-safety.spec.ts`
- `scripts/migration/run-dm-quality-tests.ts`

The retained run artifacts are written to:

- `output/reports/migration-quality-test-breakdown.json`
- `output/reports/migration-quality-test-breakdown.md`

## Business Workstream Mapping

| Business workstream | Technical DM rows | Current accomplishment |
|---|---|---|
| Setup / company foundation | DM0.1-DM0.3, DM1.1-DM1.9 | Mapped, sample-pack covered, quality gates assigned |
| Organization structure | DM3.1-DM3.5 | Mapped, referential quality gates assigned, sample-pack cross-file checks covered, missing-prerequisite dry-run failure path tested |
| Employees | DM4.1-DM4.6, plus DM4.7 for terminations | Mapped to Person, Employee/User, reporting lines, managers, schedule history, and terminations; identity/account dry-run behavior tested |
| Employee documents / 201 / openings | DM5.1-DM5.6 | Mapped to folders, documents, opening leave balances, benefits, installments, and loans |
| Attendance history | DM6.1 | Mapped to Attendance as raw/effective clock ledger truth |
| Timesheets | DM6.2-DM6.3 | Focused quality tests added for headers, effective lines, attendance linkage, and line totals |
| Payroll history | DM6.4-DM6.6 | Mapped to EmployeePayroll, SOA, and remittances; payroll snapshot boundary tested for paid payroll |
| Requests / approval history | DM6.7-DM6.10 | Mapped to workflow instances, requests, steps, and request transactions |
| Final reconciliation | DM7.1 | Mapped to post-migration go/no-go reconciliation |

## Accomplished Quality Gates

The following gates are now represented in the executable masterlist for every DM row:

- Mapping coverage
- Schema validation
- Dry-run expectation
- Idempotency expectation
- Count reconciliation
- Timing capture
- Go/no-go reporting
- Actual migration service dry-run execution
- No-write safety

Rows with dependencies also require referential-integrity gates.

Timesheet-related rows additionally require:

- Source-truth split
- Effective timesheet line totals
- Approved OT from `Timesheetline`
- Paid payroll snapshot boundary
- Correction immutability
- Historical ledger preservation

## Accomplished Automated Tests

Current migration quality command:

```bash
npm run test:migration:quality
```

Current source-truth command:

```bash
npm run test:ci:source-truth
```

Validated results from this implementation pass:

| Command | Result |
|---|---|
| `npm run test:migration:quality` | Passed, 68 tests; terminal shows DM mapping, evidence mapping, and elapsed-time breakdowns |
| `npm run test:ci:source-truth` | Passed; component gates reported 24 API source-truth tests, 24 DB source-truth tests, and 68 migration quality tests |
| `npm run wwg:task:end` | Passed with warnings only; no critical, high, or medium findings |

The latest migration quality run reported:

- 68 passing tests.
- Mocha elapsed time: `00:00:00.998`.
- Command elapsed time: `00:00:04.388`.
- Artifacts: `output/reports/migration-quality-test-breakdown.json` and `output/reports/migration-quality-test-breakdown.md`.

## Smoke Testing Status

Current smoke coverage is foundation-level only:

- The sample pack loads every recognized dataset.
- Every DM sheet group is exercised by the sample pack or reconciliation stage.
- The actual enterprise migration service executes the full sample pack in dry-run mode and returns `GO`.
- The dry-run path verifies no-write execution with mocked persistence.
- Cross-file references are checked for employees, departments, positions, schedules, documents, benefits, loans, attendances, timesheets, payroll, workflow, and requests.
- Script safety smoke coverage blocks execute-mode runs against unsafe targets and keeps high-risk script registrations visible.

Pending smoke-test hardening:

- Add minimal per-DM fixture smoke tests.
- Add additional edge-case dry-run smoke tests per migration stage.
- Add isolated DB smoke tests once the local disposable `hris_fault_test` service is reachable.

## Regression Testing Status

Current regression coverage includes:

- Timesheet headers must be backed by effective line rows.
- Timesheet lines must link to imported attendance rows by employee/date when an attendance date is present.
- Paid payroll history must reconcile to effective timesheet line totals.
- Paid payroll snapshots prefer preserved timesheet totals over imported payroll hour fallbacks.
- Paid payroll snapshot rewrites remain blocked by existing source-truth tests.
- Migration report rows must preserve canonical DM definitions and timing metadata.
- Mongo/Postgres backfill helpers must sanitize source rows, retry nullable missing FKs safely, and treat duplicate target rows as idempotent skips.
- Mongo/Postgres parity must report both count mismatches and representative row-signature mismatches.
- Timesheet line backfill planning must materialize from `AttendanceObligation` into effective `Timesheetline` rows without rewriting paid payroll snapshots.
- Attendance status/flag migration helpers must derive deterministic `Attendance` ledger statuses and behavior flags.
- Import service dry-run and helper contracts must avoid unintended Prisma writes.

Pending regression hardening:

- Duplicate employee IDs.
- Employee rows with unresolved department, position, or level.
- Timesheets without parent payroll periods.
- Timesheet lines without parent timesheets.
- Paid payroll rows without `timesheetSnapshot`.
- Approved OT sourced from attendance instead of effective `Timesheetline`.
- In-flight approval rows without current workflow step.

## WWG Enforcement Status

The repo now has explicit WWG test-enforcement rules requiring migration/backfill/repair changes to include matching smoke or quality-gate evidence. Attendance, timesheet, approved OT, payroll tally, or paid payroll history changes without source-truth regression evidence are stop-level findings unless explicitly waived by the project owner.

This implementation also wires migration quality into the source-truth gate:

```bash
npm run test:ci:source-truth
```

## Related Commands or Files

- `docs/migration-dm-quality-masterlist.md`
- `scripts/migration/migration-dm-masterlist.ts`
- `scripts/migration/migration-dm-report.ts`
- `scripts/migration/run-dm-quality-tests.ts`
- `tests/enterprise-migration-dm-masterlist.spec.ts`
- `tests/enterprise-migration-dm-report.spec.ts`
- `tests/enterprise-migration-timesheet-quality.spec.ts`
- `tests/enterprise-csv-sample-pack.spec.ts`
- `tests/migration-script-safety.spec.ts`
- `tests/mongo-postgres-migration.spec.ts`
- `tests/timesheet-backfill-source-truth.spec.ts`
- `tests/attendance-status-migration.spec.ts`
- `tests/import-service-contracts.spec.ts`
- `tests/migration-service-dry-run.spec.ts`
- `tests/seed-and-qa-script-safety.spec.ts`
- `docs/testing-strategy.md`
- `docs/testing-maturity-audit.md`

## References

- `../docs/attendance-timesheet-payroll-tally-prd.md`
- `.wwg/wiki/project-truth.md`
- `.wwg/wiki/terminology.md`
- `.wwg/governance/test-enforcement.md`
