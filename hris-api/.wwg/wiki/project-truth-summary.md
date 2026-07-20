<!-- docs-union: careful merge of standalone snapshot + bandai-infra develop (hris-api/.wwg/wiki/project-truth-summary.md) -->
# Project Truth Summary

Status: RECONCILED_FROM_EXISTING_PROJECT
Last reviewed: 2026-07-17

## Accepted With Evidence

- Product identity: `hris-api`.
- Product category: Backend API for an HRIS / workforce management system.
- Delivery surface: TypeScript Express API with Prisma schemas, routers/controllers, OpenAPI/Postman export, and migration/backfill tooling.
- Paired frontend repository: `../hris-app`.
- Major domains: auth/users, employee/person records, attendance, attendance obligations, timesheets, timesheet lines, payroll periods, employee payroll, leave, requests/workflows, recruitment/applicants, onboarding/offboarding, documents, reports, metrics, audit/activity logging, devices/Hikvision, admin configuration, and migrations.
- High-risk areas: auth, authorization, employee data, attendance/timesheets, payroll/billing, public applicant data, persistence, migrations/backfills/repairs, secrets, deployment, deletion scripts, load testing, soak testing, and DB fault injection.
- Binding attendance/timesheet/payroll source split: `AttendanceObligation` for live/current/future operational attendance, `Attendance` for biometric/raw/effective clock ledger, effective `Timesheetline` rows for past submitted/approved/payroll-ready totals and approved OT, and `EmployeePayroll.timesheetSnapshot` for paid payroll history.
- Post-lock payable corrections use durable `PayrollCorrection` + `PAYROLL_CORRECTION` request workflow; applied as explicit retro lines on next open payroll generate without rewriting locked timesheet or Period A snapshot. Request UI (emp + hris-app) uses Time In/Time Out; settlement is minute dayDeltas. Apply-period surfaces: `metadata.payrollCorrections[]`, computation-view gross rows, payslip PDF, HR Payroll summary prior-period accordion + daily detail category, employee payslip Adjustments/Retro.
- Employee benefit payroll adjustments use explicit `scheduleMode`: `TIME_BOUND` and `FIXED_INSTALLMENTS` bulk-generate installments from total amount; `RECURRING` applies a per-payment-event amount with optional end date, lazy installment ensure, and optional `recurrenceFrequency` (`EVERY_CUTOFF` default / `MONTHLY` period 2 / `YEARLY` fiscal year-end). Optional `attendanceBased` + `PER_DAY`/`PER_CUTOFF` recomputes amounts (ABSENT-only) at payroll. See `docs/BENEFIT_SCHEDULE_MODES.md`.
- Perfect Attendance **payroll** money: benefit type code **`PFA`** → `EmployeePayroll.perfectAttendance` (Bandai CT, post-net receivable with MLA/LLA). Driven by **EmployeeBenefit enrollment**, not by the perfect-attendance **metrics report**. Seed catalog currently names PFA **Performance Bonus** (`BONUS`) — **CONFLICTING** with product label Perfect Attendance; prefer code `PFA` + product label in agent language. No auto-award from analytics. PFA + `attendanceBased` off = fixed amount when due; on = ABSENT-only pro-rate (still pays with absences). HR form warn-only banner for the combo.
- Approved leave is a governed attendance event: leave approval may create or supersede `Attendance` rows, recompute `AttendanceObligation`, refresh mutable timesheet snapshots from obligations, and preserve locked submitted/approved snapshots as explicit adjustment-required follow-up instead of rewriting them.
- Approved overtime now has a governed post-approval side effect: when a timesheet becomes `APPROVED`, effective overtime lines remain the tally source and the backend may credit `COMPENSATORY` leave through `Timesheet.metadata.compensatoryLeaveCredit` plus `Employee.leaveBalances`.
- Current fast API CI gate: `.github/workflows/api-ci.yml` blocks PR/push verification on `npm run test:ci:source-truth`.
- Confirmed local DB fault-test target for the next implementation slice: Postgres database name `hris_fault_test`, reachable only through `localhost:55432` or `127.0.0.1:55432`, with explicit `ALLOW_DB_FAULT_TESTS=true` and `ISOLATED_TEST_DATABASE_URL`.
- Enterprise CSV/data migration quality now has an executable DM0-DM7 masterlist, migration report timing checks, sample-pack integrity coverage, focused timesheet migration quality tests, actual enterprise migration service dry-run execution, script safety/target guard coverage, Mongo/Postgres helper parity coverage, source-truth backfill coverage, import dry-run/no-write contracts, and seed/QA safety tests in the migration quality gate.

## Needs Confirmation

- Canonical role labels and permission matrix across app/API/Prisma.
- Current primary persistence mode and migration status between MongoDB and Postgres.
- Finance edge cases for payroll corrections only (tax treatment of retro lines, negative recovery automation, termination/final-pay timing, auto-bridge from leave/`TIME_ADJUSTMENT`). Core lock + PayrollCorrection next-period apply path is ACCEPTED_TRUTH in full project-truth.
- Perfect Attendance `PFA` catalog identity: seed name (Performance Bonus vs Perfect Attendance), category, default `reconciliationAction` (`KEEP_AS_BENEFIT` vs Bandai post-net `RECEIVABLE_ONLY`), and whether metrics eligibility should ever auto-enroll money.
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
- Do not mix the attendance/timesheet/payroll source-of-truth models, now re-grounded directly in `prisma/schema-postgres/attendanceobligation.prisma`, `attendance.prisma`, `timesheetline.prisma`, `employeepayroll.prisma`, and `helper/timesheet.helper.ts` after `../docs/attendance-timesheet-payroll-tally-prd.md` was confirmed permanently unrecoverable on 2026-06-26.
- Do not treat benefit `amount` as the same semantic for all schedule modes: finite modes use **program total**; `RECURRING` uses **per payroll period**. Do not bulk-pregenerate infinite recurring installments; payroll lazy-ensure is the accepted path.
- Do not equate perfect attendance **metrics** with PFA **payroll money**, or invent auto-award of Perfect Attendance from the report.
- Do not mutate `.vorter/`.

## Load Full Truth When

- A task touches API behavior, persistence, Prisma schemas, authorization, attendance, timesheets, payroll, employee benefits schedule modes, migrations, deployment, tests, load/soak infrastructure, or cross-repo app/API responsibilities.
- This summary appears to conflict with `.wwg/wiki/project-truth.md`.

### bandai-infra develop notes (same section: Load Full Truth When)

- A task touches API behavior, persistence, Prisma schemas, authorization, attendance, timesheets, payroll, migrations, deployment, tests, load/soak infrastructure, or cross-repo app/API responsibilities.
## References

- `.wwg/wiki/project-truth.md`
- `.wwg/wiki/terminology.md`
- `docs/BENEFIT_SCHEDULE_MODES.md`
- `AGENTS.md`
- `README.md`
- `package.json`
- `CHANGELOG.md`
- `../docs/attendance-timesheet-payroll-tally-prd.md` — confirmed permanently unrecoverable as of 2026-06-26; see `.wwg/wiki/project-truth.md` Open Questions and `.wwg/wiki/terminology.md` for re-grounded evidence.
- `../hris-app/.wwg/wiki/project-truth.md`
