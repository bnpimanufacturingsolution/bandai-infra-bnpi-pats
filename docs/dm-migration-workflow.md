# HRIS DM Migration Workflow Source Of Truth

This document is the canonical planning map for setup and data migration workbooks.
Use it before changing `/setup`, `/admin/configuration/migration`, migration import
controllers, workbook generator scripts, or migration documentation.

## Current Principle

The migration sequence is organized by setup stage and DM workbook, not by the
older generic categories such as Rules & Policies, Work Patterns, People, and
Operational History.

The single planning order is:

1. `DM0 / /setup`
2. `DM1`
3. `DM2`
4. `DM3`
5. `DM4`
6. `DM5`
7. `DM6`
8. `FINAL`

## Durable Run Source Of Truth

The canonical migration lifecycle is now a durable run/event model instead of
DM-specific controller-local state. A migration run must preserve the business
facts first, then let helpers/controllers change or disappear around that truth.

### Canonical Dependency Graph

- `DM1 Departments -> Sections -> Positions`
- `DM1 Levels -> Positions` and later employee role derivation
- `DM1` and `DM2` prerequisites before `DM3 Employees`
- `DM3 Employees -> schedules, documents, benefits/loans, reporting lines, opening balances`
- `DM3 Employee Schedule Assignments -> DM4 attendance/timesheet materialization`
- `DM4 Timesheets + Approved Overtime Details -> DM5 payroll history/payroll proof`
- `DM0 Workflow Templates + DM3 Employees -> DM6 request/workflow history`
- `DM5 + DM6 -> FINAL reconciliation/sign-off`

The dependency graph is represented in
`hris-api/app/migration/migration-step-registry.ts`; controllers should not own
DM3/DM4 sequence branching.

### Required Run State

Every migration run must keep:

- run id, organization id, workbook/stage, idempotency key, actor user
- source file names plus source workbook/sheet/row metadata when available
- dry-run status, run status, step status, current phase, progress, counts
- blockers, warnings, errors, dry-run result, DB proof, UI proof link/state
- recovery/rerun metadata and append-only events

The durable PostgreSQL models are `MigrationRun`, `MigrationRunStep`, and
`MigrationRunEvent`. `AuditLogging` workbook snapshots may still support the
legacy modal, but they are not the canonical run lifecycle.

### Event Lifecycle

Durable events should use the shared lifecycle vocabulary:
`RUN_CREATED`, `GRAPH_BUILT`, `DEPENDENCY_BLOCKED`, `DRY_RUN_STARTED`,
`DRY_RUN_STEP_COMPLETED`, `DRY_RUN_COMPLETED`, `STEP_STARTED`,
`STEP_PROGRESS`, `STEP_COMPLETED`, `STEP_FAILED`, `SIDE_EFFECT_STARTED`,
`SIDE_EFFECT_COMPLETED`, `MATERIALIZATION_STARTED`,
`MATERIALIZATION_COMPLETED`, `VERIFICATION_STARTED`,
`VERIFICATION_COMPLETED`, `RUN_COMPLETED`, `RUN_FAILED`, `RUN_STALE`,
`RECOVERY_STARTED`, and `RECOVERY_COMPLETED`.

### Business Facts That Must Not Be Lost

DM3 must preserve employee master data, `BASIC_SALARY -> Employee.basicSalary`,
TIN/SSS/PHILHEALTH/PAGIBIG statutory IDs, real source emails only, hierarchy
consistency, schedule assignments, 201 documents, benefits/loans, and visible
employee post-action side effects. Reporting lines and opening balances must be
shown honestly as Not Wired until implemented.

DM4 must preserve explicit source workbook files, employee matching against DM3,
attendance evidence with workbook/sheet/row provenance, timesheet
materialization, DB proof, HR Timesheet UI proof, and the rule that DM4 does not
mutate recurring `Employee.embeddedSchedule`.

### Deletable Implementation Clutter

Helpers, controller job maps, duplicated event/report normalization, fake generic
DM4 upload paths, hidden proof blocks, template-only import claims, and local UI
state may be deleted once the shared run/event lifecycle replaces them cleanly.

## Source Of Truth Table

| Stage | Workbook | Step Code | Sheet / Step | Purpose | Status In App |
| --- | --- | --- | --- | --- | --- |
| 0 | `DM0 / /setup` | `DM0.1` | Company Profile | Company identity, timezone, logo, colors | Already in `/setup` |
| 0 | `DM0 / /setup` | `DM0.2` | Timesheet Rules | Rounding, OT qualification, edit/approve rules | Already in `/setup` |
| 0 | `DM0 / /setup` | `DM0.3` | Payroll Rules / Cycle | Payroll frequency, cutoffs, calculator, rates | Already in `/setup` |
| 0 | `DM0 / /setup` | `DM0.4` | Workflow Templates | Default approval workflows | Already in `/setup` |
| 0 | `DM0 / /setup` | `DM0.5` | 201 Document Types | Mandated default 201 document types | Seeded during setup; also has a config page |
| 1 | `DM1` | `DM1.1` | Departments | Company structure | Already in migration |
| 1 | `DM1` | `DM1.2` | Sections | Department child units | Already in migration |
| 1 | `DM1` | `DM1.3` | Levels | Rank / level / manager flag | Already in migration |
| 1 | `DM1` | `DM1.4` | Positions | Job titles, department/section links, salary range, levels | Already in migration |
| 1 | `DM1` | `DM1.5` | Shift Types / Schedules | Shift codes, time slots, off/overnight flag | Already in migration |
| 1 | `DM1` | `DM1.6` | Agencies | Agency/vendor workforce source | Importable from the DM1 workbook |
| 2 | `DM2` | `DM2.1` | Holidays | Calendar / holiday master | Already in migration |
| 2 | `DM2` | `DM2.2` | Leave Types | Leave catalog | Already in migration |
| 2 | `DM2` | `DM2.3` | Benefit Types | Benefit/allowance/deduction type catalog | Already in migration |
| 2 | `DM2` | `DM2.4` | Loan Types | Loan/deduction catalog | Template-only in migration workbook; config page exists |
| 2 | `DM2` | `DM2.5` | 201 Document Types | Client-specific 201 document requirements | Template-only in migration workbook; setup can seed defaults |
| 3 | `DM3` | `DM3.1` | Employees | Employee master data, statutory IDs, and payroll-approved period `BASIC_SALARY` | Importable from the DM3 workbook |
| 3 | `DM3` | `DM3.2` | Employee Schedule Assignments | Employee-to-shift/schedule mapping | Importable from the DM3 workbook after employees + shift types |
| 3 | `DM3` | `DM3.3` | Reporting Lines | Manager/supervisor relationships | Importable from the DM3 workbook after employees |
| 3 | `DM3` | `DM3.4` | Employee Documents / 201 Files | Document compliance per employee | Importable from the DM3 workbook after employees + document types |
| 3 | `DM3` | `DM3.5` | Opening Leave Balances | Initial employee leave credits | Importable from the DM3 workbook after employees + leave types |
| 3 | `DM3` | `DM3.6` | Employee Benefits / Loans | Employee-level assigned benefits and loan openings | Importable from the DM3 workbook after employees + benefit/loan types |
| 4 | `DM4` | `DM4.1` | Attendance History | Legacy attendance/DTR and clock ledger | Template-only after employees + schedules |
| 4 | `DM4` | `DM4.2` | Timesheets | Legacy timesheet headers and effective line snapshots | Template-only after attendance + payroll periods |
| 4 | `DM4` | `DM4.3` | Approved Overtime Details | Payroll-approved overtime/rest-day/holiday detail updates to effective timesheet lines | Durable DM4 run path when the 2026 approved OT workbook is supplied |
| 5 | `DM5` | `DM5.1` | Payroll History | Legacy payroll records, payslip history, generated payroll snapshots | After payroll setup + employees + DM4 timesheet/approved-OT proof |
| 6 | `DM6` | `DM6.1` | Requests / Approval History | Legacy request history, workflow movement, approval outcomes | After workflows + employees |
| 7 | `FINAL` | `FINAL.1` | Reconciliation / Sign-off | Counts, spot checks, payroll/attendance/request validation | Manual QA |

## Currently Wired Workbook Imports

The current `/admin/configuration/migration` implementation downloads `.xlsx`
templates for DM1-DM3. DM4 no longer exposes a template download in the UI; HR
supplies source biometric workbooks and the approved overtime workbook through
the durable run file-path proof flow instead. The workflow directly imports
only the wired sheets below:

| Workbook | Current sheets |
| --- | --- |
| `DM1 - Master Data Workbook` | Departments, Sections, Positions, Levels, Shift Types Schedules, Agencies |
| `DM2 - Policy Data Workbook` | Holidays, Leave Types, Benefit Types; Loan Types and 201 Document Types are template-only |
| `DM3 - Employee Data Workbook` | Employees, Employee Schedule Assignments, Reporting Lines, Employee Documents / 201 Files, Opening Leave Balances, and Employee Benefits / Loans are importable |
| `DM4 - Attendance & Timesheet Workbook` | Attendance History, Timesheets, and Approved Overtime Details are visible in the modal; source biometric workbooks and the 2026 approved overtime details workbook import through the durable migration run path |

The BNPI DM4 proof path in `/admin/configuration/migration?workbook=dm4`
loads source biometric workbooks and the 2026 approved overtime details workbook
through `POST /api/migration/runs` with `workbookId = "dm4"` and polls
`GET /api/migration/runs/:runId/progress`.
That proof path is one materialization lifecycle. Source workbook rows are
parsed and normalized in Node, selected `PRESENT` evidence is written, and the
period timesheet-day snapshot is completed with one set-based PostgreSQL
CTE/upsert from `AttendanceObligation`, matching `Attendance` rows, schedules,
holidays, and payroll-period date series. The live API/UI contract uses
`phase2Materialization` / `timesheetMaterialization`; DM4.3 then applies
`docs/Bandai Payroll/2026 rptOvertimeDetails.xlsx` to effective
`Timesheetline` approved overtime/rest-day/holiday buckets when that source
workbook is supplied. This must stay inside the durable DM4 run rather than a
separate UI repair endpoint or a manually remembered payroll repair command.
For BNPI April 26-May 10, 2026 payroll parity, the proof run must validate this
same source layer before DM5/run payroll: run
`npm run dry-run:bandai-payroll-timesheet-lines`, apply
`npm run repair:bandai-payroll-timesheet-lines` when it plans effective-line
updates, then re-run `npm run dry-run:bandai-payroll-comparison`. The durable
DM4 adapter enforces this convergence for supplied approved-overtime workbooks:
after applying DM4.3 it immediately runs the approved-overtime pass again in
dry-run mode and blocks the run if `plannedLineUpdates` is not `0`. Generated
unpaid `EmployeePayroll` rows for the target payroll period must be cleared and
the period reopened before invoking the scoped run-payroll contract, otherwise
the HR payroll UI can show stale net-pay rows from the pre-repair snapshot. The
run-payroll preview/job counts must come from the selected department/section
scope and the generated row must match the refreshed comparison for sampled
employees before treating DM5 payroll proof as complete.

DM3 employee workbook imports from `/admin/configuration/migration` use the employee
import endpoint in full provisioning mode but defer shared employee post-actions
until the workbook-level dependent sheets have run. The sequence is:

1. `Employees` creates or updates `Person` + `Employee` rows, links `User`
   accounts for rows with a real source email, and stores statutory IDs such as
   `TIN`, `SSS`, `PHILHEALTH`, and `PAGIBIG` on `Person.identification` /
   `Person.metadata`. `WORKFORCE_SOURCE = AGENCY` plus `AGENCY_CODE` resolves to
   the DM1 `Agencies` sheet and sets `Employee.agencyId` / agency employer
   metadata; agency rows must not be downgraded to direct employees because the
   DM1 agency prerequisite was skipped. `BASIC_SALARY` is imported here as `Employee.basicSalary`
   because payroll previews and generated payroll rows read employee master pay
   basis, not a separate payroll-history workbook.
2. `Employee Schedule Assignments` updates `Employee.embeddedSchedule` and writes
   `EmployeeScheduleHistory` source evidence.
3. `Reporting Lines` updates `Employee.reportToId` from flat
   `EMP_ID -> REPORT_TO_EMP_ID` rows after both employee IDs exist in DM3. The
   import validates missing employees, duplicate employee rows, self-reporting,
   and reporting cycles before set-based PostgreSQL application. For BNPI, the
   visual org chart source must first be transformed into this flat sheet and
   must not apply if the extracted employee-ID count is materially below the
   workbook's visible total manpower.
4. `Employee Documents / 201 Files` writes visible employee compliance records to
   `Document` with `reviewSource = MIGRATION`.
5. `Opening Leave Balances` writes employee leave credits to
   `EmployeeLeaveBalance` and the embedded `Employee.leaveBalances` profile
   payload used by leave request and balance readers. The normalized
   `EmployeeLeaveBalance` uniqueness key and the embedded profile mirror use
   the same replacement boundary: employee, leave type, period start, and period
   end. A newer DM3.5 source row for the same annual leave period replaces older
   embedded rows for that leave type instead of appending a second `SL`, `VL`, or
   `ACL` row.
6. `Employee Benefits / Loans` writes employee-level openings to
   `EmployeeBenefit` or `EmployeeLoan`.
   For BNPI April 26-May 10, 2026 payroll parity proof, workbook allowance
   facts must flow through this step after DM2 `Benefit Types`: `MLA` Meal
   Allowance, `PFA` Perfect Attendance, `LLA` Line Leader Allowance, `DMA` De
   Minimis Allowance, `HYS` HYS Meal Allowance, `OBA` OB Allowance, and `OTM`
   OT Meal Allowance. Fixed catalog amounts such as Perfect Attendance 200,
   Meal Allowance 500, and Line Leader Allowance 250 belong in the DM2 catalog;
   employee-specific or variable amounts belong in the DM3 employee benefit
   rows for the payroll period. Period-specific rows should carry
   `PAYROLL_PERIOD_CODE` when the payroll period is known; otherwise the DM3.6
   importer may resolve `EmployeeBenefit.payrollPeriodId` from an exact
   `START_DATE` / `END_DATE` match. Do not add payroll-period/date-range facts
   to the reusable `BenefitType` catalog and do not hardcode these amounts in
   payroll period generation helpers.
7. `Employee Post Actions` runs the shared metadata, onboarding/document
   reconciliation, and calendar steps after schedules and documents are already
   available, then runs the DM3 schedule-backed `AttendanceObligation` batch
   repair once for the imported employee set. Current-period `DRAFT` timesheet
   headers are prepared for all eligible imported employees, including employees
   that still have no schedule assignment; missing schedules remain attendance
   coverage gaps rather than a reason to omit the draft shell. DM3 finalization
   and recovery do not use the slower per-employee attendance post-action loop.

The import must not synthesize placeholder emails. Rows without a verified
source email remain employee master records and are reported with an
account-provisioning warning until HR supplies a verified email or a later
employee-ID-only account strategy is implemented.

### DM3 Frontend Proof Path

The HR-facing journey for the wired DM3 workbook is:

1. HR opens `/admin/configuration/migration?workbook=dm3`.
2. HR uploads or drags `DM3-employee-data-migration.xlsx`.
3. The modal reads the workbook sheets and imports `Employees`, then
   `Employee Schedule Assignments`, then `Reporting Lines`, then
   `Employee Documents / 201 Files`, then `Opening Leave Balances`, then
   `Employee Benefits / Loans`.
4. The workbook finalizer runs `Employee Post Actions` last, after schedule and
   document data exists.
5. HR verifies a sampled employee in the employee profile/compliance surfaces:
   `Person.identification.statutoryIds.pagibig`, `Employee.basicSalary`,
   `Employee.embeddedSchedule`, `EmployeeScheduleHistory`, `Employee.reportToId`,
   `Employee.reportTo`, `Document`, `EmployeeLeaveBalance`,
   `Employee.leaveBalances`, `EmployeeBenefit`, and `EmployeeLoan` should exist for the same
   `Employee.employeeId` when the source workbook contained those rows.

Employee compliance files must be visible as `Document` records linked by
`Document.employeeId`; they must not be stored only in `Employee.metadata` or
`Person.metadata`, because the employee profile compliance/document tabs and HR
employee document views read the document model.

Statutory IDs from the `Employees` sheet also materialize compliance documents:
`TIN`, `SSS`, `PHILHEALTH`, and `PAGIBIG` create or update matching `Document`
rows when those source columns contain values. This is why an imported Pag-IBIG
MID should mark the employee profile Compliance step's `Pag-IBIG Fund` item as
included instead of leaving it as a skipped onboarding task.

### DM3 Resume Contract

The workbook modal is deep-linkable and resumable:

- Opening a workbook modal writes `/admin/configuration/migration?workbook=dm3`.
- Starting the async employee sheet job appends `importJobId=<jobId>`.
- Navigating away and returning to the URL reopens the workbook modal and polls
  `/api/employee/import/progress/:jobId`.
- If a running workbook audit exists without the user on the modal, the workbook
  card shows a `Resume` action that restores the same workbook/job deep link.
- If the backend no longer has the in-memory job status, the UI marks the sheet
  blocked with a job-status-unavailable message and keeps the latest durable
  audit report for review/rerun.
- For DM3 specifically, a blocked/stale employee job can be followed by
  `Recover`, which calls `/api/migration/dm3/recover-employee-post-actions`
  without requiring the original upload. This endpoint rebuilds the employee
  target list from persisted DM3 employee metadata and reruns shared post-actions,
  including onboarding/document reconciliation and the schedule-backed
  `AttendanceObligation` batch repair. It cannot recreate rows that never
  reached the database; those still require re-uploading the workbook.

The modal uses a single workbook lifecycle state so the report table, footer,
deep link, and card action do not disagree:

| Lifecycle | Trigger | UI must show |
| --- | --- | --- |
| `IDLE` | No selected workbook and no report | Pending rows and no running footer |
| `OPEN` | Workbook modal is open with a selected file | Ready footer, import button enabled |
| `CHECKING` | The browser is reading workbook sheets | Checking badge and sheet-read events |
| `UPLOADING` | A sheet import was submitted from this modal | Importing badge, current sheet row counts |
| `POLLING` | URL/report has `importJobId` for an async job | Resume/importing badge and polling events from `/api/employee/import/progress/:jobId` |
| `FINALIZING` | DM3 post-actions are running | Finalizing badge; attendance refresh is not treated as complete yet |
| `COMPLETED` | All importable sheets reached terminal success | Imported badge and final counts |
| `FAILED` | Any sheet failed | Failed badge with row issues |
| `BLOCKED` | Required sheet/job/status is unavailable | Blocked badge with rerun/review reason |
| `STALE` | A resume target exists but the backend job can no longer be polled | Blocked badge; durable audit remains visible |

Active browser progress wins over older persisted audit snapshots. A cached
`completed` report must not hide a newer running job, and the polling result
for the same run must be allowed to replace running state with the final
terminal report. This follows the async-job contract where `202 Accepted`
returns a monitor location and the client treats the monitor endpoint as the
source of current progress.

## BNPI DM3 Source Workbooks

These client workbooks are source-of-truth inputs for the BNPI DM3 employee
migration. They are not DM4 attendance-history evidence:

| Source file | DM target | Source-of-truth use | Import method |
| --- | --- | --- | --- |
| `docs/Breaktime Schedule.xlsx` | `DM3.2 / Employee Schedule Assignments` | Employee shift/schedule assignment evidence by employee id, section sheet, work schedule, lunch break, and source row. This is the only active BNPI DM3.2 recurring schedule source for now. Rows missing from this workbook stay visible schedule gaps instead of being backfilled from older schedule workbooks. | Transform to the `Employee Schedule Assignments` sheet shape: `EMP_ID`, `SCHEDULE_CODE`, `EFFECTIVE_FROM`, `EFFECTIVE_TO`, `NOTES`, with `EFFECTIVE_FROM` sourced from the matched DM3 employee master `HIRE_DATE`, then import through the DM3 workbook modal. Do not assign default schedules to agency employees without schedule source evidence. |
| `docs/FY2025_BNPI Organization Chart - as of March 31, 2026.xlsx` sheet `Updated Org Chart` | `DM3.3 / Reporting Lines` | BNPI visual organization chart source for typed employee-ID reporting relationships. The sheet also contains total manpower and executive/leadership labels. Current evidence found `TOTAL MANPOWER = 1347` but only 823 unique typed numeric employee IDs in cells. A user-reviewed partial apply on June 3, 2026 wrote 789 validated typed reporting-line relationships to `Employee.reportToId`; 10 employee IDs remain missing from the current DM3 employee DB and the non-typed manpower gap remains open source evidence, not applied data. | Transform only source-backed numeric employee IDs into `Reporting Lines`: `EMP_ID`, `REPORT_TO_EMP_ID`, `EFFECTIVE_FROM`, `NOTES`. Run `npm run dry-run:bnpi-dm3-reporting-lines` first. The default `npm run repair:bnpi-dm3-reporting-lines` remains blocked when total-manpower evidence does not reconcile; the explicit reviewed partial command is `npm run repair:bnpi-dm3-reporting-lines:reviewed-partial`. Do not use it unless the partial source gap is accepted and documented. |
| `docs/rptLeaveBalance as of June 4, 2026.xlsx` sheet `rptLeaveBalance` | `DM3.5 / Opening Leave Balances` | BNPI leave balance source for employee leave assignments by employee id and remaining-balance columns `VL`, `SL`, and `ACL` as of June 4, 2026. | Transform positive employee-master-matched remaining balances into `Opening Leave Balances`: `EMP_ID`, `LEAVE_TYPE_CODE`, `BALANCE`, `AS_OF_DATE=2026-06-04`, `NOTES`, then import through the DM3 workbook modal after employee documents and before benefits/loans. |
| `docs/BNPI_MASTERLIST.xlsx` sheet `Manpower Databank` | `DM3.1 / Employees` and `DM1.2 / Sections` | BNPI employee master source of truth. The active filtered view contains 857 active employee rows and is the basis for `data/import/employees-import.csv`; the sheet also supplies Manpower Databank section wording for section import parity. | Generate the DM3 Employees sheet from active rows only. Preserve source fields such as `EMAIL`, `PHONE`, statutory IDs, workforce source, resignation date, source status, and source row metadata; map `EMAIL` from `Official Email Address` first, falling back to `Email Address`; do not synthesize missing email addresses during mapping/import. |
| `docs/AGENCY/Avance.xlsx`, `docs/AGENCY/Cepol.xlsx`, `docs/AGENCY/CGSI.xlsx`, `docs/AGENCY/Kohsai.xlsx`, `docs/AGENCY/Natcorp.xlsx` | `DM1.6 / Agencies` and `DM3.1 / Employees` | Agency workforce master sources. The DM1 agency master list is `AVANCE = Avance Pilipinas, Inc.`, `CGSI = Cebu General Services, Inc.`, `CEPOL = Cepol Services`, `KOHSAI = Kohsai Contracting System Services, Inc.`, and `NATCORP = NatCorp Career Growth and Manpower Services, Inc`. The keyed employee rows are 433 Avance, 130 Cepol, 496 CGSI, 120 Kohsai, and 176 Natcorp. | Generate `agencies-import.csv` with codes `AVANCE`, `CGSI`, `CEPOL`, `KOHSAI`, `NATCORP`, append workbook-backed agency employees to `employees-import.csv` with `WORKFORCE_SOURCE = AGENCY`, `AGENCY_CODE`, and `SOURCE_WORKBOOK`, then regenerate the DM1/DM3 workbooks. Agency source workbooks do not contain salary amounts, so agency `BASIC_SALARY` is `0` for master-data import unless a payroll-approved agency pay source is supplied. |
| `docs/HRIS Payroll Computation April 26 - May 10, 2026.xlsx` | `DM3.1 / Employees` | Payroll-approved period `Basic Salary` source for `BASIC_SALARY`. | Use Sheet2 `Basic Salary`, not `Monthly Salary`, to populate the `Employees` sheet `BASIC_SALARY` column for this semi-monthly payroll proof. The workbook is password-protected in this repo copy; the client-provided workbook password is `9090`. Treat the password as sensitive payroll migration handling data. The current Node `xlsx` reader still reports the file as protected, so extraction should use Excel/LibreOffice to save an unlocked export or a decryption-capable reader before code maps salary values. |

`BASIC_SALARY` belongs to DM3 employee master data because payroll previews,
statutory reporting, PAN salary changes, and employee compensation views read
`Employee.basicSalary`. For this BNPI semi-monthly proof, `Employee.basicSalary`
must carry the payroll-register Sheet2 `Basic Salary` period amount so payroll
preview and generated payroll rows do not double the period pay. DM5 payroll
history must not be used to backfill salary unless the same payroll-approved
value is explicitly written back into DM3 employee master data.

BNPI employee email is also DM3 employee master/contact data when it exists in
the Manpower Databank or another approved HR/IT source. Migration mappers and
DM3 imports must not create placeholder/generated emails from employee names.
Rows without a real source email should remain blank in `Person.contactInfo.email`
and must not be account-provisioned until a later explicit provisioning step has
a verified email or an employee-ID login account strategy.

### BNPI Org Chart Executive Role Handling

`President`, `General Manager`, `Deputy General Manager`, `Senior Expert`, and
other executive header roles in the BNPI org chart are not automatically
written into `Employee.reportToId` unless the source cell contains a real
numeric employee ID that exists in DM3 employee master data. Non-employee or
aggregate leadership labels should be documented as future organization
ownership metadata candidates instead, such as organization executive,
department head, section owner, or section manager fields on the appropriate
master-data model. This avoids inventing supervisor relationships from chart
layout, especially where the workbook is a visual manpower chart rather than a
normalized reporting-line table.

## BNPI 2026 Default Schedule For Attendance Reconciliation

BNPI 2026 attendance reconciliation uses one reusable generic day schedule when
the source workbook marks a day `PRESENT` and no more specific shift is
available:

- Name: `BNPI Mon-Fri Day 8-5`
- Code: `BNPI_MON_FRI_DAY_8_5`
- Working days: Monday through Friday
- Work pattern: `WORK(8:00AM-12:00PM);BREAK(12:00PM-1:00PM);WORK(1:00PM-5:00PM)`
- Rest days: Saturday and Sunday
- Paid time: 8 regular hours per working day, 40 regular hours per week
- Break: explicit unpaid 12:00 PM to 1:00 PM break

The schedule is available in the migration/template workflow through:

- `DM1 / Shift Types Schedules`: `data/import/shift-types-import.csv` includes
  `BNPI_MON_FRI_DAY_8_5` as an importable shift type row.
- Schedule template import: the schedule-template CSV download includes a
  7-day `BNPI_MON_FRI_DAY_8_5` row using the same weekday work tokens and
  `OFF` on Saturday/Sunday.
- `DM3.2 / Employee Schedule Assignments`: `data/import/employee-schedules-import.csv`
  shows the importable sheet shape. For BNPI, transform employee schedule rows
  from `docs/Breaktime Schedule.xlsx` only. If a row has only shift times such
  as `08:00 to 16:00`, map it to the matching imported schedule template code
  before import; use
  `BNPI_MON_FRI_DAY_8_5` only when the migration has no richer code for that
  daily attendance evidence. Blank DM3 employee master `SCHEDULE` values must
  stay unscheduled until DM3.2 supplies an assignment.

DM4 Attendance History may reference `SHIFT_CODE = BNPI_MON_FRI_DAY_8_5` as
daily import/reconciliation evidence only. It must not assign
`Employee.embeddedSchedule`; recurring schedule ownership remains in DM3.2.

For BNPI FY_2026 rows marked `PRESENT`, normalize the attendance evidence to:

- `STATUS = PRESENT`
- `SHIFT_CODE = BNPI_MON_FRI_DAY_8_5` when no more specific shift is available
- `TIME_IN = 08:00`
- `TIME_BREAK = 12:00-13:00` or `BREAK_MINUTES = 60` depending on the target sheet
- `TIME_OUT = 17:00`
- `REGULAR_HOURS = 8` when materialized into timesheet line evidence
- preserve `SOURCE_WORKBOOK`, `SOURCE_SHEET`, `SOURCE_ROW`, and useful `NOTES`

Saturday and Sunday must remain rest/off under the recurring schedule. DM4
should create/import paid work evidence for weekend dates only when the source
workbook explicitly shows attendance for that employee-day.

DM4 Attendance History may carry daily legacy evidence such as `SHIFT_CODE`,
`LEAVE_TYPE_CODE`, `CATEGORY`, `AWOL`, `SOURCE_WORKBOOK`, `SOURCE_SHEET`, and
`SOURCE_ROW`. These fields are attendance import/reconciliation evidence only;
they must not assign `Employee.embeddedSchedule`. Recurring employee schedule
assignments still belong in DM3.2.

Current wired files:

- `hris-app/app/routes/admin/configuration/migration.tsx`
- `hris-api/scripts/create-dm-migration-workbooks.cjs`
- `hris-api/scripts/generate-migration-workbook-doc.cjs`
- `docs/hris-dm-stage-migration-list.xlsx`
- `docs/dm-source-input-manifest.json`

`docs/dm-source-input-manifest.json` is the safe UI manifest for migration
source traceability. It records allowed metadata only: display names, DM phase,
sheet/step mappings, source filename/path references, descriptions, row counts
when known, confidentiality flags, and whether a configured file may be
downloaded in the local/client environment. Do not commit raw confidential
workbooks to support this manifest; local `.xlsx/.xls/.xlsm` files remain
protected by `.gitignore`.

## Important Gaps To Preserve In Planning

Do not drop these from planning just because they are currently template-only in
`/admin/configuration/migration`:

- `DM1 / Agencies`
- `DM2 / Loan Types`
- `DM2 / 201 Document Types`
- `DM4 / Attendance History`
- `DM4 / Timesheets`
- `DM4 / Approved Overtime Details`
- `DM5 / Payroll History`
- `DM6 / Requests / Approval History`
- `FINAL / Reconciliation / Sign-off`

## Dependency Rules

- Complete `DM0 / /setup` before DM workbook imports.
- Import `DM1` before employee imports because employees depend on departments,
  sections, positions, levels, shifts/schedules, and agencies.
- Import `DM2` before balances and compliance imports because leave balances,
  benefit/loan assignments, holidays, and documents depend on policy catalogs.
- Import employees before reporting lines, schedule assignments, employee
  documents, opening balances, attendance, timesheets, payroll history, and
  request history.
- DM3 employee master imports normally must not invent employee schedules;
  employee-to-shift mapping belongs in `DM3.2 Employee Schedule Assignments` or
  an explicit schedule column in the source row. Blank employee `SCHEDULE`
  values remain unscheduled; recurring schedule truth must come from DM3.2, not
  the BNPI attendance reconciliation default.
- BNPI period basic salary belongs in `DM3.1 Employees.BASIC_SALARY` and should
  be sourced from `docs/HRIS Payroll Computation April 26 - May 10, 2026.xlsx`
  Sheet2 `Basic Salary` or an unlocked/exported derivative of that workbook. Do
  not leave imported active employees at `BASIC_SALARY = 0` for payroll-ready
  migration, and do not use Sheet2 `Monthly Salary` for the April 26-May 10
  semi-monthly payroll proof.
- Keep opening leave balances and employee benefit/loan openings in `DM3`
  because they are employee-level starting facts and are edited/imported around
  employee profile and employee import surfaces.
- Keep payroll-period allowance proof data out of `payroll-period.helper.ts`.
  BNPI April 26-May 10, 2026 source rows are generated into
  `data/import/employee-benefits-loans-import.csv` from the payroll workbook and
  carried through DM3.6 as `EmployeeBenefit` rows with date ranges and, when
  available, `PAYROLL_PERIOD_CODE` / `EmployeeBenefit.payrollPeriodId`; the
  catalog types and default fixed amounts are carried through DM2.3
  `Benefit Types`.
- Import `DM4` attendance and timesheet history only after employee schedules
  and payroll period rules are stable. `Attendance` is the clock ledger, while
  submitted/approved/payroll-ready timesheet totals must come from effective
  `Timesheetline` snapshots.
- Import `DM5` payroll history only after payroll rules, payroll cycle config,
  employees, DM4 timesheet history, and DM4 approved overtime detail proof are
  stable. Paid `EmployeePayroll` records are immutable payroll-history
  snapshots.
- Import `DM6` request and approval history after workflow templates and
  employees are stable. Request lifecycle history belongs to `Request`,
  `RequestTransaction`, `WorkflowInstance`, and workflow step execution state.

## Model And Page Anchors

- Employee master, leave balances, employee documents, benefits, and loans:
  `Employee`, `EmployeeLeaveBalance`, `EmployeeBenefit`, `EmployeeLoan`,
  `Document`; employee import/profile pages and employee detail tabs.
- Attendance and timesheets: `Attendance`, `Timesheet`, `Timesheetline`; HR
  attendance, HR timesheets, manager approval, and attendance report pages.
- Payroll history: `PayrollPeriod`, `EmployeePayroll`; payroll periods, run
  payroll, employee payroll, payroll management, and payslip pages.
- Request and approval history: `Request`, `RequestTransaction`,
  `WorkflowInstance`, workflow step execution state; HR tickets, HR approvals,
  employee approvals, and request detail pages.
- For attendance/timesheet/payroll source-of-truth behavior, read
  `docs/attendance-timesheet-payroll-tally-prd.md` before changing DM4 or DM5.

## Maintenance Rules For Future Agents

When changing the migration sequence, update this document first or in the same
change as the code. Then align the related surfaces:

1. `hris-app/app/routes/admin/configuration/migration.tsx`
2. `hris-api/app/migration/migration.controller.ts`
3. `hris-api/app/migration/migration.router.ts`
4. `hris-api/scripts/create-dm-migration-workbooks.cjs`
5. `hris-api/scripts/generate-migration-workbook-doc.cjs`
6. `docs/hris-dm-stage-migration-list.xlsx`
7. `docs/dm-source-input-manifest.json`

Do not reintroduce the older category-only checklist as the source of truth.
Those labels can be used as explanatory group names, but the canonical workflow
is the stage/workbook sequence in this file.
