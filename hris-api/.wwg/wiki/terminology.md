<!-- docs-union: careful merge of standalone snapshot + bandai-infra develop (hris-api/.wwg/wiki/terminology.md) -->
# Terminology

This file defines canonical and observed project language.

Adoption status: INFERRED_FROM_EXISTING_PROJECT
Status: Reconciled from repository evidence on 2026-05-25. Core HRIS/API terms are accepted where backed by README/package/source evidence; policy terms remain inferred until reviewed.
Update 2026-06-26: `../docs/attendance-timesheet-payroll-tally-prd.md` was never committed to either repo's git history (confirmed via `git log --all --diff-filter=A/D` and `git fsck --unreachable` in both `hris-api` and `hris-app`) and is treated as permanently unrecoverable. The four HR Attendance/Timesheet/Payroll source terms below were re-grounded directly against Prisma schemas and service code instead of that doc; see evidence columns.

Update 2026-07-14: Employee benefit payroll schedule terms expanded to include `RECURRING` (per-period amount, optional end date, lazy installment ensure). See section **Employee Benefit Payroll Schedule Terms**.
Update 2026-07-14: Attendance-based benefit amount terms (`attendanceBased`, `PER_DAY`, `PER_CUTOFF`) added.
Update 2026-07-17: Perfect Attendance payroll benefit (`PFA` / `perfectAttendance`) vs perfect attendance metrics report documented; seed name conflict recorded.

## Canonical Terms

| Term | Meaning | Status | Evidence |
|---|---|---|---|
| HRIS API | The backend API repository, `hris-api`. | CONFIRMED | README and package metadata. |
| HRIS app / frontend | The paired React frontend repository at `../hris-app`. | CONFIRMED | sibling repository and app WWG truth. |
| Backend API | TypeScript/Express service layer that owns server-side contracts, authorization enforcement, persistence behavior, and API responses. | CONFIRMED | README, `app/*` routers/controllers, package scripts. |
| API contract | The server-observable request/response, auth, status, validation, and error behavior exposed to clients. | CONFIRMED | Express routers/controllers and generated docs scripts. |
| Prisma schema | The model/schema source under `prisma/schema` and `prisma/schema-postgres`. | CONFIRMED | Prisma folders and package scripts. |
| Database invariant | A server-side persistence rule that must stay true even when bad or conflicting data is seeded in an isolated test database. | INFERRED | testing task context and persistence boundaries. |
| Isolated test database | A disposable local or approved non-production database used for DB fault-injection, integration, load, and soak tests. | CONFIRMED_AS_REQUIRED_BOUNDARY | WWG safety gates and testing task context. |
| Dedicated local DB fault database | The exact local Postgres database `hris_fault_test`, reachable only through `localhost:55432` or `127.0.0.1:55432`, used for the current destructive DB fault-test harness. | CONFIRMED_FOR_LOCAL_TEST_TARGET | user-approved implementation plan on 2026-05-25; testing docs and guard tests. |
| Load test | A bounded performance test using synthetic/local or explicitly approved non-production data. | CONFIRMED_AS_REQUIRED_BOUNDARY | testing task context. |
| Soak test | A longer stability test using synthetic/local or explicitly approved non-production data. | CONFIRMED_AS_REQUIRED_BOUNDARY | testing task context. |
| Router | Express route registration module for one API domain. | CONFIRMED | `app/*/*.router.ts`. |
| Controller | API request handler module for one API domain. | CONFIRMED | `app/*/*.controller.ts`. |
| Service | Domain or support module that performs reusable backend behavior outside direct route registration. | INFERRED | import, migration, payroll generation, and cron service files. |
| Migration | Database/schema/data migration behavior; high-risk when it touches real data. | CONFIRMED | migration scripts, migration module, Postgres migration docs. |
| Enterprise DM masterlist | Executable DM0-DM7 mapping of source files/stages to business names, target models, key fields, dependencies, and quality gates. | CONFIRMED_FOR_TEST_INFRASTRUCTURE | `scripts/migration/migration-dm-masterlist.ts`; `docs/migration-dm-quality-masterlist.md`; migration masterlist tests. |
| Migration DM report | Excel report artifact for migration count, start time, end time, elapsed time, rows/sec, warning/error, and GO/NO-GO evidence. | CONFIRMED_FOR_TEST_INFRASTRUCTURE | `scripts/migration/migration-dm-report.ts`; `tests/enterprise-migration-dm-report.spec.ts`. |
| Backfill | Scripted data population or recalculation for existing records; high-risk when it touches shared data. | CONFIRMED | package backfill scripts. |
| Repair script | Scripted corrective mutation for existing data; high-risk when it touches shared data. | CONFIRMED | package repair scripts. |
| Seed | Scripted fixture/default/demo data creation. | CONFIRMED | package seed scripts and Prisma seeds. |

## HR Attendance / Timesheet / Payroll Source Terms

| Term | Meaning | Status | Evidence |
|---|---|---|---|
| AttendanceObligation | Live/current/future operational attendance truth; computed per `date`/`businessDate`, defaults `status: EXPECTED`, `phase: PLANNED`, recomputed on leave approval. | CONFIRMED_FROM_IMPLEMENTATION | `prisma/schema-postgres/attendanceobligation.prisma`; `generated/prisma/schema.prisma:299-364`; `helper/attendance-obligation.helper.ts` (`recomputeAttendanceObligationsForRange`); `app/request/leave-attendance-reconciliation.service.ts`. |
| Attendance | Biometric/raw/effective clock ledger truth; `ledgerType` (`RAW`/`CORRECTION`), `isEffective`, and `supersedesAttendanceId` form the ledger/supersession chain. | CONFIRMED_FROM_IMPLEMENTATION | `prisma/schema-postgres/attendance.prisma`; `generated/prisma/schema.prisma:216-297`; `app/attendance/attendance.controller.ts`; `app/attendance/attendance-correction.service.ts`. |
| Timesheetline | Effective submitted/approved/payroll-ready rows used for past totals and approved OT tally; `ledgerType: SNAPSHOT`, `revisionNo`/`isEffective`/`supersedesLineId` chain revisions, and parent `Timesheet.status` of `SUBMITTED`/`APPROVED` locks the line against refresh. | CONFIRMED_FROM_IMPLEMENTATION | `prisma/schema-postgres/timesheetline.prisma`; `generated/prisma/schema.prisma:3073-3148`; `helper/timesheet.helper.ts` (`ATTENDANCE_REFRESHABLE_TIMESHEET_STATUSES`, `isTimesheetAttendanceRefreshAllowed`, `TIMESHEET_SNAPSHOT_LOCKED`). |
| EmployeePayroll.timesheetSnapshot | Paid payroll history source once payroll has been paid; frozen `Json` hours/attendance tally written at payroll generation, locked via `isPaid`/`paidAt`/`snapshotLockedAt`/`snapshotLockedBy`. | CONFIRMED_FROM_IMPLEMENTATION | `prisma/schema-postgres/employeepayroll.prisma:124-146,246-251`; `helper/payroll-period.helper.ts`; `app/employeepayroll/employeepayroll.controller.ts`. |
| Payroll period | Payroll grouping/cycle domain served by payroll period APIs and schemas. | INFERRED | `app/payrollperiod`, Prisma payroll period schemas. |
| Payroll snapshot | Immutable history used for paid payroll reads; confirm exact schema field semantics before test hardening. | INFERRED | `prisma/schema-postgres/employeepayroll.prisma:124-146,246-251`; employee payroll module. |
| OT Candidate | Detected post-shift, rest-day, or holiday excess stored on line/obligation metadata while effective `overtimeHours` stays `0:00` until manager approval. | CONFIRMED_FROM_IMPLEMENTATION | `helper/overtime-approval.helper.ts`; `docs/OVERTIME_APPROVAL_WORKFLOW_PLAN.md`. |
| Pending OT | Candidate minutes (`pendingOvertimeMinutes` / `pendingOvertimeHours`) visible in timesheet UI before an `OVERTIME` request is approved. | CONFIRMED_FROM_IMPLEMENTATION | `helper/overtime-approval.helper.ts`; `hris-app/app/lib/utils/overtime-candidate.ts`. |
| OVERTIME Request | `Request.type = OVERTIME` filed from a timesheet candidate day; routed via `WF-OVERTIME-DEFAULT` to the line manager. | CONFIRMED_FROM_IMPLEMENTATION | `app/timesheet/overtime-request.service.ts`; `prisma/seeds/requestWorkflowCatalog.ts`. |
| Approved OT | Payable overtime written to effective `Timesheetline` rows only after manager approves an `OVERTIME` request (or DM4 pre-approved import evidence bypasses the candidate gate). | CONFIRMED_FROM_IMPLEMENTATION | `app/timesheet/overtime-request.service.ts`; `app/timesheet/approved-overtime-comp-leave.service.ts`; `docs/OVERTIME_APPROVAL_WORKFLOW_PLAN.md`. |
| Time adjustment reconciliation | The approval-side effect for `TIME_ADJUSTMENT` requests: recompute `AttendanceObligation` for the request's single target date and refresh the mutable timesheet snapshot from current source truth, surfacing locked snapshots as `adjustment_required` follow-up instead of mutating raw punches. Stored at `Request.metadata.timeAdjustmentReconciliation` as `{ attendanceResults, timesheetResults, reconciledAt }`; timesheet action vocabulary is exactly `refreshed` \| `adjustment_required` with locked reason `TIMESHEET_SNAPSHOT_LOCKED`. Unresolved `adjustment_required` is not next-payroll money apply; use `PAYROLL_CORRECTION` for payable post-lock deltas. | CONFIRMED_FROM_IMPLEMENTATION | `app/request/time-adjustment-reconciliation.service.ts`; `app/request/request.controller.ts` (`applyTimeAdjustmentApprovalSideEffects`); `tests/time-adjustment-reconciliation.service.spec.ts`. |
| PayrollCorrection | First-class durable ledger for post-payroll-lock timesheet corrections. Linked to source timesheet/period and optional request; statuses: `REQUESTED`, `READY`, `APPLIED`, `REJECTED`, `VOID`, `APPROVED_HOLD`. Applied as explicit retro lines on next open payroll generate — never by rewriting locked timesheet days or Period A `timesheetSnapshot`. | ACCEPTED_TRUTH / CONFIRMED_FROM_IMPLEMENTATION | `prisma/schema-postgres/payrollCorrection.prisma`; `app/payrollCorrection/payroll-correction.service.ts`; `helper/payroll-period.helper.ts`; `docs/PAYROLL_CORRECTION_NEXT_PERIOD_PRD.md`. |
| PAYROLL_CORRECTION request | `Request.type = PAYROLL_CORRECTION` routed via `WF-PAYROLL-CORRECTION-DEFAULT` (manager approval). Creates/links a `PayrollCorrection` row; approval side effects set READY or APPROVED_HOLD (negative). | ACCEPTED_TRUTH / CONFIRMED_FROM_IMPLEMENTATION | `prisma/seeds/requestWorkflowCatalog.ts`; `app/timesheet/timesheet.controller.ts`; `app/request/request.controller.ts`. |
| dayDeltas (payroll correction) | Per-day settlement shape on create/apply: `date`, `hoursType`, `beforeMinutes`, `afterMinutes`, `deltaMinutes` (optional `timeIn`/`timeOut` audit). Money uses minute deltas × rate for hours type — not punch rewrite. | ACCEPTED_TRUTH / CONFIRMED_FROM_IMPLEMENTATION | `helper/payroll-correction.helper.ts` (`parsePayrollCorrectionDayDeltas`); create body in `docs/PAYROLL_CORRECTION_NEXT_PERIOD_PRD.md`; UI derives minutes from Time In/Out in `payroll-correction-form.ts`. |
| Retro / payroll correction line | Explicit payslip/register earning line under `EmployeePayroll.metadata.payrollCorrections[]` with source period + request linkage + `dayDeltas`; amount also reflected in `otherCompensation` / gross / net / totalReceivable for the **applying** (later) period. Label formula: `Retro {typeLabel} ({sourcePeriodName} correction)` via `buildRetroPayslipLabel` — e.g. `Retro OT`, `Retro ND`, `Retro hours` (REGULAR), or `Retro adjustment` when mixed/unknown types. | ACCEPTED_TRUTH / CONFIRMED_FROM_IMPLEMENTATION | `helper/payroll-correction.helper.ts` (`buildRetroPayslipLabel`); `buildEmployeePayrollComputationView` gross rows; payslip PDF; emp-app + hris-app `payslip-detail-template.tsx`; HR summary `payroll-management-template.tsx`. |
| Source period vs apply period | **Source** = locked timesheet/period being corrected. **Apply** = later open payroll where READY corrections become APPLIED retro lines. “Retro” always means money for the source period paid on the apply period. | ACCEPTED_TRUTH / CONFIRMED_FROM_IMPLEMENTATION | `PayrollCorrection.sourcePayrollPeriodId` / `appliedPayrollPeriodId`; generate path in `helper/payroll-period.helper.ts`. |

## Employee Benefit Payroll Schedule Terms

| Term | Meaning | Status | Evidence |
|---|---|---|---|
| Benefit schedule mode | Persisted `EmployeeBenefit.scheduleMode`: `TIME_BOUND`, `FIXED_INSTALLMENTS`, or `RECURRING`. Null/absent is legacy compatibility only. | CONFIRMED_FROM_IMPLEMENTATION | `prisma/schema-postgres/employeebenefit.prisma`; `zod/employeebenefit.zod.ts`; `docs/BENEFIT_SCHEDULE_MODES.md`. |
| TIME_BOUND | Finite schedule: start + required end + **total** amount; one installment per overlapping org payroll period; total split with final-row remainder. | CONFIRMED_FROM_IMPLEMENTATION | `helper/employee-benefit-program.helper.ts` (`buildBenefitInstallments`); employee benefit controller. |
| FIXED_INSTALLMENTS | Finite schedule: start + positive installment count + **total** amount; N installments on cadence; total split with final-row remainder. | CONFIRMED_FROM_IMPLEMENTATION | `helper/employee-benefit-program.helper.ts`; employee benefit controller. |
| RECURRING | Open-ended-capable schedule: start + **per-period** amount; end date optional; no bulk installments at create; payroll lazy-ensures one installment per period while active and in range. | CONFIRMED_FROM_IMPLEMENTATION | `planRecurringInstallmentForPeriod` / `ensureRecurringBenefitInstallmentForPeriod`; `helper/payroll-period.helper.ts`; owner decisions 2026-07-14. |
| EmployeeBenefitInstallment | Payroll execution row (`SCHEDULED` → `DEDUCTED` with payroll cutoff linkage). Authoritative apply source when present. | CONFIRMED_FROM_IMPLEMENTATION | Prisma installment model; `resolvePayrollBenefitSource`; `markPayrollBenefitInstallmentsDeducted`. |
| Lazy recurring ensure | At payroll source build, for each in-range `RECURRING` benefit, find-or-create the period installment before resolve. | CONFIRMED_FROM_IMPLEMENTATION | `helper/payroll-period.helper.ts`; `tests/payroll-benefit-integration.spec.ts`. |
| attendanceBased | When true on `EmployeeBenefit`, the period installment amount is computed from timesheet attendance at payroll (not a fixed enrolled payslip amount). | CONFIRMED_FROM_IMPLEMENTATION | `prisma/.../employeebenefit.prisma`; `helper/attendance-benefit-amount.helper.ts`; `docs/BENEFIT_SCHEDULE_MODES.md`. |
| recurrenceFrequency | RECURRING-only cadence: `EVERY_CUTOFF` (default), `MONTHLY` (period 2 / sole monthly period), `YEARLY` (fiscal year-end last period). | CONFIRMED_FROM_IMPLEMENTATION | `helper/benefit-recurrence.helper.ts`; `docs/BENEFIT_SCHEDULE_MODES.md`. |
| EVERY_CUTOFF | Recurrence: ensure installment every eligible payroll period. | CONFIRMED_FROM_IMPLEMENTATION | default when recurrenceFrequency null. |
| MONTHLY (benefit recurrence) | Recurrence: pay on 2nd cutoff (`periodNumber === 2`) or sole period in calendar month. | CONFIRMED_FROM_IMPLEMENTATION | Bandai semi-monthly period 2. |
| YEARLY (benefit recurrence) | Recurrence: pay on last period of fiscal-year-end month (`ANNUALLY.startMonth`). | CONFIRMED_FROM_IMPLEMENTATION | `getMergedCycleRules`. |
| PER_DAY | Attendance amount basis: enrolled amount is a **rate per present day**; paid = rate × present_days. | CONFIRMED_FROM_IMPLEMENTATION | `computeAttendanceBenefitAmount`; owner decisions 2026-07-14. |
| PER_CUTOFF | Attendance amount basis: enrolled amount is **full cut-off** if zero absences; paid = full × (present/scheduled). | CONFIRMED_FROM_IMPLEMENTATION | `computeAttendanceBenefitAmount`; owner decisions 2026-07-14. |
| present days (benefit attendance v1) | scheduled non-`REST_DAY` days minus days with status `ABSENT` only. Leave does not reduce. | CONFIRMED_FROM_IMPLEMENTATION | `countAttendanceBenefitDaysFromBreakdown`; payroll basic-pay absence alignment. |
| PFA | Benefit type **code** for Perfect Attendance compensation. Payroll maps `PFA` → `EmployeePayroll.perfectAttendance`. | CONFIRMED_FROM_IMPLEMENTATION | `helper/payroll-source-display.helper.ts`; `helper/payroll-period.helper.ts`; import map `"Perfect Attendance": "PFA"`. |
| Perfect Attendance (payroll) | Product / Bandai register label for the PFA compensation field (column CT). Post-net receivable on computation view when treated as receivable-only / saved post-net field. **Not** Prisma `BenefitCategory.ALLOWANCE` by seed (seed category is `BONUS`). With `attendanceBased` off: fixed enrolled amount when due. With `attendanceBased` on: ABSENT-only pro-rate (still pays with absences); HR form warns only. | CONFIRMED_FROM_IMPLEMENTATION | register CT; payslip “Perfect Attendance”; `EmployeePayroll.perfectAttendance`; hris-app `shouldShowPfaAttendanceBasedWarning`. |
| Performance Bonus (PFA seed name) | Default seeded `BenefitType.name` for code `PFA`. Conflicts with product label “Perfect Attendance”; money path still keys on code. | CONFLICTING | `prisma/seeds/benefitTypeSeeder.ts` vs payroll/UI labels. |
| EmployeePayroll.perfectAttendance | Named payroll register amount for Perfect Attendance compensation. | CONFIRMED_FROM_IMPLEMENTATION | `prisma/schema/employeepayroll.prisma`; employee payroll computation view. |
| perfectAttendanceMetrics | Metrics API key / report for employees with no late, no undertime, and no `LEAVE` attendance rows in range (≥1 attendance). Analytics only; does not award PFA. | CONFIRMED_FROM_IMPLEMENTATION | `helper/perfect-attendance-metrics.helper.ts`; `zod/metrics.zod.ts`; HR reports Perfect Attendance tab. |
| RECEIVABLE_ONLY (benefit reconciliation) | Benefit reconciliation action that places compensation on post-net / total receivable (not gross). Bandai PFA examples use this for display grouping; seed default for PFA is `KEEP_AS_BENEFIT` until org data overrides. | CONFIRMED_FROM_IMPLEMENTATION (action); NEEDS_CONFIRMATION (whether PFA must always be RECEIVABLE_ONLY) | `helper/payroll-source-display.helper.ts`; `payroll-period.helper.ts` receivableOnlyBenefits; seeder `KEEP_AS_BENEFIT`. |

## HRIS Domain Terms

| Term | Meaning | Status | Evidence |
|---|---|---|---|
| Sick leave advance-notice exemption | `validateLeaveRequestPolicy` skips `minAdvanceNoticeDays` enforcement when leave type normalizes to `SICK`, allowing backdated sick leave from timesheet flows. | IMPLEMENTED_FROM_USER_REQUEST | `helper/leave-policy.helper.ts`; `tests/leave-policy.helper.spec.ts` |
| Employee | HRIS worker record/domain. | CONFIRMED | employee modules and Prisma schemas. |
| Person | Person-level identity record associated with employees/users/applicants. | INFERRED | Prisma person schema. |
| User | Auth/user account domain. | INFERRED | auth module and user schema. |
| Applicant | Public or recruitment applicant domain. | CONFIRMED | applicant module/schema and paired app public applicant routes. |
| Request | Employee/HR request domain routed through workflows. | INFERRED | request and requestTransaction modules/schemas. |
| Workflow | Configurable routing/approval behavior for requests/processes. | INFERRED | workflowConfig and workflowEngine modules/schemas. |
| Boarding | Onboarding/offboarding process and template domains. | INFERRED | boardingProcess and boardingTemplate modules/schemas. |
| Device / Hikvision | Device/access-control integration surface. | INFERRED | device and hikvision modules. |
| Activity logging | User-facing trail of all successful API actions (reads and mutations) via `logActivity()` → `ActivityLogging`. | CONFIRMED | `utils/activityLogger.ts`, `docs/LOGGING_STANDARDS.md`. |
| Audit logging | Compliance trail for CUD mutations only via `logAudit()` → `AuditLogging`. Reads are excluded. | CONFIRMED | `utils/auditLogger.ts`, `shouldSkipAuditLog()`, `docs/LOGGING_STANDARDS.md`. |
| Metrics / reports | Backend reporting and aggregate API surface. | CONFIRMED | metrics and report modules. |

### bandai-infra develop notes (same section: HRIS Domain Terms)

| Audit logging | Server-side audit trail behavior for sensitive actions. | INFERRED | auditLogging and activityLogging modules/schemas. |
## Incorrect Or Stale Language

| Term | Status | Rule | Evidence |
|---|---|---|---|
| Web3 eCommerce prototype | STALE | Do not use for this repository unless new accepted truth explicitly changes the product. | Previous adoption audit conflicted with README/package/source evidence. |
| Cart / checkout / wallet | STALE_UNLESS_NEW_EVIDENCE | Do not infer these as product scope from generic dependency or source hits. | Current canonical evidence identifies HRIS API. |
| Frontend visibility as authorization | INCORRECT | Do not treat hidden UI routes/actions as server authorization. API enforcement belongs in this repo or approved API harness. | WWG test task and high-risk authorization boundary. |

## Observed Terms

| Observed Term | Where Found | Inferred Meaning | Status |
|---|---|---|---|
| router | `app/Rule/rule.router.ts`, `app/activityLogging/activityLogging.router.ts`, `app/agency/agency.router.ts`, `app/applicant/applicant.router.ts` | Express route registration module. | CONFIRMED |
| controller | `app/Rule/rule.controller.ts`, `app/activityLogging/activityLogging.controller.ts`, `app/agency/agency.controller.ts`, `app/applicant/applicant.controller.ts` | API request handler module. | CONFIRMED |
| employee | `app/employee/employee-import.service.ts`, `app/employee/employee.controller.ts`, `app/employee/employee.router.ts`, `app/employeeBenefit/employeeBenefit.controller.ts` | HRIS employee domain. | CONFIRMED |
| attendance | `app/attendance/attendance-import.service.ts`, `app/attendance/attendance.controller.ts`, `app/attendance/attendance.router.ts` | Attendance clock/ledger and attendance behavior. | CONFIRMED |
| migration | README heading, `app/migration/migration.controller.ts`, `app/migration/migration.router.ts`, `app/migration/migration.service.ts` | Database/data migration API and scripts. | CONFIRMED |
| service | `app/attendance/attendance-import.service.ts`, `app/cron/cron.service.ts`, `app/employee/employee-import.service.ts`, `app/migration/migration.service.ts` | Backend support/domain service module. | INFERRED |
| access | `app/hikvision/controller/access.control.controller.ts`, `app/hikvision/routes/access.control.router.ts` | Device/access-control integration term. | INFERRED |

## Canonical Term Candidates

| Concept | Recommended Canonical Term | Also Seen As | Confidence | Evidence |
|---|---|---|---|---|
| backend API repository | HRIS API / hris-api | API repo, backend repo | HIGH | README and package metadata. |
| paired frontend repository | HRIS app / hris-app | frontend repo, app repo | HIGH | sibling `../hris-app` repository and app WWG truth. |
| API request routing | Router | route module | HIGH | `app/*/*.router.ts`. |
| API request handling | Controller | handler module | HIGH | `app/*/*.controller.ts`. |
| persistence model source | Prisma schema | schema model | HIGH | `prisma/schema`, `prisma/schema-postgres`. |
| intentional DB-bug detection | DB invariant test | fault-injection test | MEDIUM | testing task context. |
| safe destructive test target | Isolated test database / `hris_fault_test` for local DB fault tests | disposable test DB | HIGH | WWG safety boundary and testing docs. |
| live operational attendance truth | AttendanceObligation | attendance obligation | HIGH | `prisma/schema-postgres/attendanceobligation.prisma`; `helper/attendance-obligation.helper.ts`. |
| clock ledger truth | Attendance | clock ledger | HIGH | `prisma/schema-postgres/attendance.prisma`; `app/attendance/attendance-correction.service.ts`. |
| approved/payroll-ready totals | Timesheetline | timesheet line | HIGH | `prisma/schema-postgres/timesheetline.prisma`; `helper/timesheet.helper.ts`. |
| paid payroll history | EmployeePayroll.timesheetSnapshot | payroll snapshot | HIGH | `prisma/schema-postgres/employeepayroll.prisma:124-146,246-251`. |
| continuous payroll benefit | RECURRING schedule mode | open-ended benefit, forever benefit | HIGH | `docs/BENEFIT_SCHEDULE_MODES.md`; lazy ensure helpers. |
| finite total benefit program | TIME_BOUND / FIXED_INSTALLMENTS | installment plan | HIGH | `docs/BENEFIT_SCHEDULE_MODES.md`. |
| Perfect Attendance payroll money | Perfect Attendance (payroll) / PFA / `EmployeePayroll.perfectAttendance` | Performance Bonus (seed name), attendance incentive, PFA allowance (informal) | HIGH for money path; MEDIUM for catalog label | payroll helpers + seeder conflict table. |
| Perfect attendance analytics | perfectAttendanceMetrics | Perfect Attendance report tab | HIGH | metrics helper + hris-app reports. |

## Terminology Conflicts

| Conflict | Evidence | Recommendation |
|---|---|---|
| Previous Product Truth described the repo as Web3/eCommerce while README/package/source describe HRIS API. | stale `.wwg/wiki/project-truth.md` content before 2026-05-25 reconciliation. | Use HRIS API language and keep stale terms only as drift warnings. |
| Generic role labels (`admin`, `user`, `agent`) are too broad for HRIS authorization work. | previous adoption audit vs app/API route and domain evidence. | Use inferred HRIS role labels until the canonical permission matrix is confirmed. |
| Benefit type code `PFA` is seeded as **Performance Bonus** (`BONUS`) but payroll register, payslip, Bandai import, and HR UI call it **Perfect Attendance** (often informal “allowance” / post-net receivable). | `prisma/seeds/benefitTypeSeeder.ts` vs `payroll-period.helper.ts` CT / `sourceBy(PFA)`; HR run-payroll + benefits filters. | Prefer product label **Perfect Attendance** and code **PFA** in payroll/agent language. Do not rename seed without owner decision. Do not confuse with `perfectAttendanceMetrics` report. |
| “Perfect attendance” report eligibility vs PFA money. | Metrics: no late/undertime/LEAVE. Attendance-based benefits: ABSENT-only pro-rate. PFA money: enrollment-driven; fixed when attendanceBased off, pro-rated when on. | Keep three concepts separate. HR form warns on PFA+attendanceBased (warn only). |

## Rules

- Do not rename core concepts casually.
- If a prompt introduces a synonym, decide whether it is canonical before using it broadly.
- If terminology changes, update this file and reconcile code/docs.
- If terminology changes, reconcile reports, tests, governance files, and generated context too.
- For adopted projects, confirm inferred canonical terms before large renames.
- Keep app/API ownership language explicit: UI behavior belongs in `../hris-app`; server authorization, persistence, schema, and DB invariant behavior belong here.
