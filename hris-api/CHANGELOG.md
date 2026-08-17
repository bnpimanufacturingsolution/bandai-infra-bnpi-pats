# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

- **BNPI multi-cutoff loan horizon (2026-08-17):** Mass-upload and workbook loan
  enrollments no longer expire after one cutoff when `maxTermMonths` was 1.
  Term floor 24 months (from principal/payment when longer); re-import never
  shrinks `endDate`. Repair script extends ACTIVE loans for local clone tally.
  Helpers: `resolveBandaiMassUploadLoanTermMonths`, `resolveBandaiLoanEndDate`.
- **FILE_DUAL OT + Basic Path A (2026-08-13 / 2026-08-17):** When
  `Employee.dailyRate > 0` (register Daily Salary), OT/premium hourly =
  `dailyRate/8` and register Basic = `paidRegularDays × dailyRate` (paid days
  from Bandai `approvedBuckets.regularDays`). Path A suppresses full-day
  Absent-Amt (already out of paid days). Otherwise Path B: BNPI
  `periodBasic×24/313/8` hourly and period basic. Import maps Daily Salary →
  `dailyRate`. Local re-tally Jun 26–Jul 10: OT pay fails 482→1, basicPay
  481→1. VM backfill still pending. Helpers:
  `resolveBandaiApprovedBucketRateBasis`, `resolveBandaiRegisterBasicPay`.
- **Payroll Preview non-submitted timesheets (2026-08-12):**
  `GET /api/payrollPeriod/:id/generate-timesheet/preview` dry-run may include
  `DRAFT` / `SUBMITTED` / `REJECTED` / `REVISED` timesheets (with salary +
  schedule) as estimate-only rows. Money uses timesheet lines + benefits;
  workflow status alone does not change pay. Summary adds
  `previewComputableEmployeesCount` and `estimatedIncludesNonApproved`;
  `includedEmployeesCount` remains APPROVED payroll-ready for Start Payroll.
  Rows expose `timesheetStatus`, `isPayrollReady`, `readinessKey`,
  `readinessLabel`. Generate/Start Payroll path unchanged (APPROVED only).
- **Special Payroll HR auth fix**: `POST /api/special-payroll/import/preview` (and other HR Special Payroll routes) no longer always return `403 HR access required`. Controllers now read `req.role` / `req.userId` / `req.organizationId` / `req.metadata.employee` as set by `verifyToken` (previously only looked at missing `req.user`).
- **Bulk benefit enrollment import** (`POST /api/employeeBenefit/import`): accepts Excel/CSV with per-row benefit code/amount; sample aliases `COMCODE` / `EmployeeID` / `StartPayDate`; creates `RECURRING` + `EVERY_CUTOFF` + `ACTIVE` enrollments (same defaults as HR create form); **fails** rows that already have an enrollment for the same benefit type (no upsert). Helper: `helper/employee-benefit-import.helper.ts`.
- Benefit **attendance eligibility** configuration: `eligibilityMode` (`ENROLLED_ALWAYS` \| `ATTENDANCE_QUALIFIED`) plus disqualify flags (absent/late/undertime/leave) on `EmployeeBenefit`, independent of amount pro-rate. Payroll zeros the period when qualification fails. `BenefitType` policy defaults + PFA seed classic Perfect Attendance defaults. See `docs/BENEFIT_SCHEDULE_MODES.md`.
- Payroll benefit **tax grouping** on details and payslip: freeze `isTaxable` on `metadata.payrollSourceDetails`; group applied benefits under **Benefits applied → Non-taxable / Taxable** on PDF payslip, computation view flags, and live enrich on GET/payslip for older rows. See `docs/BENEFIT_SCHEDULE_MODES.md`.
- Payroll adjustment **display names**: source details and payslips use enrollment/`EmployeeBenefit.name` as the primary label and `BenefitType.name` as category (`benefitTypeName`). Multiple enrollments under one type (e.g. Rice Subsidy + Travel Allowance under De Minimis) appear as separate lines. Bandai register still matches by code, enrollment name, or type name. See `docs/BENEFIT_SCHEDULE_MODES.md`.
- **Payslip view/download** (`GET /api/employeePayroll/:id/payslip`) regenerates PDF live from payroll + source details (with live enrollment label enrichment; rebuilds benefit lines when frozen details are empty). Payroll-run PDF generation passes `metadata.payrollSourceDetails`. Period generate-payslips supports `force=true` to overwrite stored PDFs.
- Attendance-based payroll source path: timesheet line select uses `hoursWorked` / `status` (not invalid `hours` / `isRestDay`) so attendance-based benefits resolve during payroll generation.
- Attendance-based employee benefit amounts: optional `attendanceBased` + `attendanceAmountBasis` (`PER_DAY` | `PER_CUTOFF`) on `EmployeeBenefit`. When enabled, payroll recomputes the period installment from timesheet attendance (ABSENT-only reduction; leave does not reduce in v1). `PER_DAY` = rate × present days; `PER_CUTOFF` = full cut-off pro-rated by present/scheduled. Works with all schedule modes. See `docs/BENEFIT_SCHEDULE_MODES.md`.
- Employee benefit payroll schedule modes: explicit `TIME_BOUND`, `FIXED_INSTALLMENTS`, and `RECURRING` on `EmployeeBenefit`. Finite modes generate `SCHEDULED` installments at create/update (overlapping payroll periods or fixed counts). Recurring benefits use a **per-period amount**, optional end date (open-ended when omitted), no bulk schedule at create, and **lazy installment ensure** during payroll generation for the current period; due installments still mark `DEDUCTED` per cutoff. See `docs/BENEFIT_SCHEDULE_MODES.md`.
- Manager-approved overtime workflow: `OVERTIME` request type, `WF-OVERTIME-DEFAULT` workflow seeder, `TimesheetConfig.requireManagerApprovedOvertime`, OT candidate detection with payable `overtimeHours` held at `0:00` until approval, timesheet submit gate (`OVERTIME_REQUEST_REQUIRED`), and `POST /api/timesheet/:id/overtime-requests`.
- Governance and WWG adoption scaffolding added for project readiness.
- Validation and audit reports generated and synchronized.
- Controller logging contract documentation was synchronized with the current `logActivity()` / `logAudit()` rollout.

