# Project Truth Summary

Status: RECONCILED_FROM_EXISTING_PROJECT
Last reviewed: 2026-05-26

## Accepted With Evidence

- Product identity: `hris-api`.
- Product category: Backend API for an HRIS / workforce management system.
- Delivery surface: TypeScript Express API with Prisma schemas, routers/controllers, OpenAPI/Postman export, and migration/backfill tooling.
- Paired frontend repository: `../hris-app`.
- Major domains: auth/users, employee/person records, attendance, attendance obligations, timesheets, timesheet lines, payroll periods, employee payroll, leave, requests/workflows, recruitment/applicants, onboarding/offboarding, documents, reports, metrics, audit/activity logging, devices/Hikvision, admin configuration, and migrations.
- High-risk areas: auth, authorization, employee data, attendance/timesheets, payroll/billing, public applicant data, persistence, migrations/backfills/repairs, secrets, deployment, deletion scripts, load testing, soak testing, and DB fault injection.
- Binding attendance/timesheet/payroll source split: `AttendanceObligation` for live/current/future operational attendance, `Attendance` for biometric/raw/effective clock ledger, effective `Timesheetline` rows for past submitted/approved/payroll-ready totals and approved OT, and `EmployeePayroll.timesheetSnapshot` for paid payroll history.
- Current fast API CI gate: `.github/workflows/api-ci.yml` blocks PR/push verification on `npm run test:ci:source-truth`.
- Confirmed local DB fault-test target for the next implementation slice: Postgres database name `hris_fault_test`, reachable only through `localhost:55432` or `127.0.0.1:55432`, with explicit `ALLOW_DB_FAULT_TESTS=true` and `ISOLATED_TEST_DATABASE_URL`.
- Enterprise CSV/data migration quality now has an executable DM0-DM7 masterlist, migration report timing checks, sample-pack integrity coverage, focused timesheet migration quality tests, actual enterprise migration service dry-run execution, script safety/target guard coverage, Mongo/Postgres helper parity coverage, source-truth backfill coverage, import dry-run/no-write contracts, and seed/QA safety tests in the migration quality gate.

## Needs Confirmation

- Canonical role labels and permission matrix across app/API/Prisma.
- Current primary persistence mode and migration status between MongoDB and Postgres.
- Payroll lock/reopen/correction policy and paid snapshot immutability details.
- Any remote/shared isolated database target for destructive/fault-injection, load, and soak testing.
- Deployment, secret, and credential rotation/removal status.
- Cross-repo CI orchestration between `hris-app` and `hris-api`.

## Current Truth Alignment

Truth alignment is YELLOW.

The repository clearly represents the HRIS backend API and the stale Web3/eCommerce classification has been corrected. Several policy, authorization, persistence, migration, and production-readiness details remain inferred and must not be treated as accepted without review.

## Must Not Drift

- Do not describe this repo as Web3, eCommerce, cart, checkout, or wallet software unless new accepted truth explicitly changes the product.
- Do not treat app-side tests as proof of backend authorization, persistence, DB invariants, payroll snapshot immutability, or migration correctness.
- Do not run destructive DB tests, load tests, soak tests, migrations, backfills, repairs, or deletion scripts against shared environments without explicit approval.
- Do not mix the attendance/timesheet/payroll source-of-truth models defined in `../docs/attendance-timesheet-payroll-tally-prd.md`.
- Do not mutate `.vorter/`.

## Load Full Truth When

- A task touches API behavior, persistence, Prisma schemas, authorization, attendance, timesheets, payroll, migrations, deployment, tests, load/soak infrastructure, or cross-repo app/API responsibilities.
- This summary appears to conflict with `.wwg/wiki/project-truth.md`.

## References

- `.wwg/wiki/project-truth.md`
- `.wwg/wiki/terminology.md`
- `AGENTS.md`
- `README.md`
- `package.json`
- `../docs/attendance-timesheet-payroll-tally-prd.md`
- `../hris-app/.wwg/wiki/project-truth.md`
