<!-- docs-union: careful merge of standalone snapshot + bandai-infra develop (hris-api/.wwg/wiki/terminology-summary.md) -->
# Terminology Summary

Status: RECONCILED_FROM_EXISTING_PROJECT
Last reviewed: 2026-07-17

## High-Priority Terms

- HRIS API: this backend repository, `hris-api`.
- HRIS app / frontend: paired React app repository at `../hris-app`.
- Backend API: TypeScript/Express service that owns server-side contracts, authorization enforcement, persistence behavior, and API responses.
- API contract: observable request/response, auth, status, validation, and error behavior exposed to clients.
- Prisma schema: model/schema source under `prisma/schema` and `prisma/schema-postgres`.
- Database invariant: persistence rule that must remain true even when bad data is seeded in an isolated test database.
- Isolated test database: disposable local or approved non-production database for DB fault-injection, integration, load, and soak tests.
- Dedicated local DB fault database: `hris_fault_test`, the only approved local Postgres database name for destructive DB fault tests in the current implementation slice.
- Enterprise DM masterlist: executable DM0-DM7 source-to-target mapping and quality-gate catalog for enterprise CSV migration.
- Migration DM report: Excel evidence artifact with count, start time, end time, elapsed time, rows/sec, warnings, errors, and GO/NO-GO context.

## HR Attendance / Timesheet / Payroll Terms

- `AttendanceObligation`: live/current/future operational attendance truth.
- `Attendance`: biometric/raw/effective clock ledger truth.
- `Timesheetline`: effective submitted/approved/payroll-ready rows used for past totals and approved OT tally.
- `Approved OT`: approved overtime remains sourced from effective `Timesheetline` rows; approver notes are the visible approval reason on the day record, and approved totals can credit `COMPENSATORY` leave.
- `EmployeePayroll.timesheetSnapshot`: paid payroll history source once payroll has been paid.
- `PayrollCorrection`: post-lock payable delta ledger (`READY` → next-period apply as retro payslip lines).
- `PAYROLL_CORRECTION` request: manager-approved correction request (`WF-PAYROLL-CORRECTION-DEFAULT`).
- `dayDeltas`: settlement is before/after/delta **minutes** by hours type; request UI collects **Time In / Time Out** and derives minutes (type auto).
- Retro line label: `Retro {OT\|ND\|hours\|…} ({source period} correction)` on apply-period payslip/computation/PDF — not source-period day rewrite.
- Source period vs apply period: correction is for a locked **source** period; money appears on a later **apply** period.
- Benefit schedule modes: `TIME_BOUND` and `FIXED_INSTALLMENTS` (finite totals + bulk installments); `RECURRING` (per-payment amount, optional end date, lazy ensure; `recurrenceFrequency` EVERY_CUTOFF/MONTHLY/YEARLY).
- Attendance-based benefit amounts: `attendanceBased` with basis `PER_DAY` (rate × present) or `PER_CUTOFF` (full cut-off pro-rated); present = scheduled non-rest minus ABSENT only.
- `EmployeeBenefitInstallment`: payroll execution rows (`SCHEDULED` / `DEDUCTED`); preferred apply source over raw benefit totals when present.
- `PFA` / Perfect Attendance (payroll): benefit code → `EmployeePayroll.perfectAttendance` (register CT). Seed type name **Performance Bonus** is CONFLICTING; prefer product label Perfect Attendance + code PFA. Fixed when attendanceBased off; ABSENT pro-rate when on (HR warns).
- `perfectAttendanceMetrics`: analytics report only (not payroll award).

## Preferred Language

- Use HRIS/workforce/backend API language for this repository.
- Use app/API boundary language when discussing tests:
  - `../hris-app` owns frontend routes, presentation, browser E2E, and client payload tests.
  - `hris-api` owns backend authorization, persistence, schema/model constraints, DB invariants, API contract tests, API load tests, and API soak tests.
- Use `isolated test database` for intentional bad-data or fault-injection scenarios.
- For the current local DB fault harness, use `hris_fault_test` exactly; do not use `hris`, `hris-new`, dev, UAT, staging, production, or shared databases.

## Avoided / Incorrect Language

- Do not call this repository Web3, eCommerce, cart, checkout, or wallet software unless new accepted truth explicitly changes the product.
- Do not treat frontend visibility as authorization.
- Do not describe shared dev, UAT, staging, or production DB fault tests as acceptable without explicit approval.
- Do not claim WWG activates, loads, injects, mounts, routes, or executes runtime skills.

## Needs Confirmation

- Canonical role labels and permission matrix.
- Active persistence mode and migration state.
- Payroll lock/reopen/correction terminology.
- Canonical PFA catalog display name / category / default reconciliation action vs Bandai post-net Perfect Attendance.
- Exact labels for device/integration actors.

## Load Full Terminology When

- A task changes naming, layer boundaries, governance terms, source-of-truth terms, benefit schedule modes, test ownership, or cross-repo handoff language.
- This summary appears to conflict with `.wwg/wiki/terminology.md`.

### bandai-infra develop notes (same section: Load Full Terminology When)

- A task changes naming, layer boundaries, governance terms, source-of-truth terms, test ownership, or cross-repo handoff language.
## References

- `.wwg/wiki/terminology.md`
- `.wwg/wiki/project-truth.md`
- `AGENTS.md`
- `../docs/attendance-timesheet-payroll-tally-prd.md` — confirmed permanently unrecoverable as of 2026-06-26 (never committed in either repo's git history); the four HR Attendance/Timesheet/Payroll terms above are re-grounded in `.wwg/wiki/terminology.md` against Prisma schemas and service code instead.
