# Benefit Payroll Schedule Modes

Status: ACTIVE
Last reviewed: 2026-07-17
Paired app docs: `../hris-app/docs/BENEFIT_SCHEDULE_MODES.md`
Paired design: `../hris-app/docs/superpowers/specs/2026-07-13-benefit-schedule-design.md`

## Purpose

Employee benefits persist an explicit `scheduleMode` so payroll can consume generated installment rows without relying on an ambiguous date-range plus implicit six-installment default.

## Persisted contract

| Field | Meaning |
|---|---|
| `scheduleMode` | Optional enum: `TIME_BOUND`, `FIXED_INSTALLMENTS`, or `RECURRING`. Null/absent means legacy compatibility. |
| `totalInstallments` | Requested fixed count, selected time-bound period count after active scheduling, or `0` for recurring (unbounded). Schema default `6` remains for legacy rows only. |
| `EmployeeBenefitInstallment` | Payroll execution source. Rows carry `installmentNumber`, `amount`, `scheduledDate`, and `status` (`SCHEDULED` / `DEDUCTED` / ...). |

Prisma surfaces:

- `prisma/schema/employeebenefit.prisma`
- `prisma/schema-postgres/employeebenefit.prisma`

### Validation (`zod/employeebenefit.zod.ts`)

- `FIXED_INSTALLMENTS` requires a positive integer `totalInstallments`.
- `TIME_BOUND` requires `endDate` on or after `startDate`.
- `RECURRING` does not require `endDate` or `totalInstallments`. If `endDate` is provided it must be on or after `startDate`.
- Mode-less legacy create/update payloads remain parseable.
- Explicit modes do not receive the legacy six-installment create default.
- Recurring creates persist `totalInstallments: 0` (not the silent six default).

### Schedule generation (`helper/employee-benefit-program.helper.ts`)

- `buildBenefitInstallments(benefitId, benefit, periods?)` builds `SCHEDULED` rows for finite modes.
- Fixed mode: requested count, existing 15-day cadence from start date, final-row centavo remainder.
- Time-bound mode: one row per supplied overlapping organization payroll period; final-row remainder.
- Recurring mode: bulk generation returns `[]`. Use `planRecurringInstallmentForPeriod` / `ensureRecurringBenefitInstallmentForPeriod` instead.
- Mode-less legacy payloads keep the previous six-installment compatibility path.

### Amount semantics

| Mode | Amount meaning (attendance off) |
|---|---|
| `TIME_BOUND` / `FIXED_INSTALLMENTS` | Program **total** split across generated installments |
| `RECURRING` | **Per payment event** amount (`installmentAmount` mirrors amount; not a lifetime total). Cadence is controlled by `recurrenceFrequency` (see below). |

### Recurrence frequency (`RECURRING` only)

Optional field `recurrenceFrequency` on `EmployeeBenefit`:

| Value | When payroll ensures an installment |
|---|---|
| `EVERY_CUTOFF` (default when null/missing) | Every eligible payroll period (current behavior) |
| `MONTHLY` | `periodNumber === 2`, or the **only** period in that UTC calendar month (monthly orgs) |
| `YEARLY` | Last period of the **fiscal-year-end month**: fiscal start from org `PayrollCycleConfig.cycleRules.ANNUALLY.startMonth` (default `1` = January → end December); last period = `periodNumber === 2` or sole period in that month |

Rules:

- Amount is **per payment event** (not annualized or monthlyized).
- Non-`RECURRING` modes clear/ignore `recurrenceFrequency`.
- Pure helper: `helper/benefit-recurrence.helper.ts`. Gate: `planRecurringInstallmentForPeriod` / attendance ensure when `scheduleMode === RECURRING` (skip reason `recurrence_frequency`).
- Payroll loads `periodNumber`, sole-period-in-month count, and fiscal start once in `buildPayrollSourceAmountsByEmployeeId`.
- Custom every-N / free-form cadence is out of scope for v1.

### Attendance eligibility (all-or-nothing) vs amount pro-rate

Two **independent** knobs on `EmployeeBenefit` (and optional defaults on `BenefitType`):

| Concern | Fields | Role |
|---|---|---|
| **Eligibility** | `eligibilityMode` + disqualify flags | Whether the period installment may pay |
| **Amount** | `attendanceBased` + `attendanceAmountBasis` | How much if eligible |

#### Eligibility modes

| `eligibilityMode` | Behavior |
|---|---|
| `ENROLLED_ALWAYS` (default; legacy-safe) | Schedule/installment due → pay (no attendance quality gate) |
| `ATTENDANCE_QUALIFIED` | Evaluate period timesheet; any enabled disqualify rule fails → **amount 0** for the period |

Disqualify flags (meaningful only when `ATTENDANCE_QUALIFIED`):

| Field | Default | Fail when |
|---|---|---|
| `eligibilityDisqualifyOnAbsent` | `true` | Any non-rest day with `status === ABSENT` |
| `eligibilityDisqualifyOnLate` | `false` | Any day with positive late duration |
| `eligibilityDisqualifyOnUndertime` | `false` | Any day with positive undertime |
| `eligibilityDisqualifyOnLeave` | `false` | Any day with `status === LEAVE` |

- Pure helper: `helper/benefit-attendance-eligibility.helper.ts`
- Period scope v1: current payroll period timesheet reporting breakdown only
- **Not** the analytics metrics report (`perfectAttendanceMetrics`); no auto-enroll from metrics

#### BenefitType policy defaults

Optional catalog fields for enrollment prefill:

- `defaultEligibilityMode`
- `defaultEligibilityDisqualifyOnAbsent` / `Late` / `Undertime` / `Leave`

Create/bulk API merges type defaults when request omits eligibility keys. Seeded **PFA** sets `ATTENDANCE_QUALIFIED` + all four disqualify flags true (classic Perfect Attendance). Existing enrollments stay `ENROLLED_ALWAYS` (no silent backfill).

### Attendance-based amount computation

Optional enrollment flags on `EmployeeBenefit`:

| Field | Values | Meaning |
|---|---|---|
| `attendanceBased` | `boolean` (default `false`) | When true, payroll **recomputes** the period installment from timesheet attendance |
| `attendanceAmountBasis` | `PER_DAY` \| `PER_CUTOFF` \| null | Required when `attendanceBased` is true |

Formulas (v1):

```text
scheduled_work_days = count(days where status !== REST_DAY)
absent_days         = count(days where status === ABSENT)
present_days        = scheduled_work_days - absent_days

PER_DAY:    paid = rate × present_days
PER_CUTOFF: paid = full_cutoff × (present_days / scheduled_work_days)  // 0 if scheduled is 0
```

Rules:

- **ABSENT only** reduces the amount in v1. Leave / half-day / tardy do not reduce (unless eligibility disqualify flags are on).
- When attendance is ON, enrolled `amount` is **rate** (`PER_DAY`) or **full cut-off amount** (`PER_CUTOFF`) — not a multi-period program total. Finite modes do **not** equal-split that enrolled amount across installments at create; shells use the enrolled amount as a placeholder and payroll overwrites the due installment.
- Applies to **all** schedule modes. `FIXED_INSTALLMENTS` only updates an installment already due in the period; `TIME_BOUND` / `RECURRING` may lazy-create a period installment.
- Metrics are loaded from the period timesheet inside `buildPayrollSourceAmountsByEmployeeId` (before resolve), so preview and generation share the same path.
- Pure helper: `helper/attendance-benefit-amount.helper.ts`. Ensure/update: `ensureAttendanceBenefitInstallmentForPeriod` (also used for eligibility recompute; supports amount 0).

### Payroll evaluation order

```text
1. Installment/schedule due for period
2. If eligibilityMode = ATTENDANCE_QUALIFIED → evaluate flags; fail → period amount 0
3. Else if attendanceBased → ABSENT-only pro-rate
4. Else if ATTENDANCE_QUALIFIED pass → fixed enrolled amount
5. Else RECURRING ensure / existing installments
6. Resolve sources; code PFA → EmployeePayroll.perfectAttendance (register mapping only)
```

### API create/update (`app/employeeBenefit/employeeBenefit.controller.ts`)

- Active/approved create and update query non-deleted organization payroll periods overlapping a time-bound range, then pass them into schedule generation.
- Active time-bound flows persist `totalInstallments` as the selected usable period count (including zero when none overlap).
- Recurring create/update **does not** bulk-create installments; rows are ensured lazily during payroll.
- Inactive/pending/cancelled explicit time-bound flows do not create installment rows and avoid the silent six-default for the persisted count.
- Updates do not duplicate installments when rows already exist (finite modes).
- Partial updates re-validate the merged schedule candidate before persistence.

## Payroll consumption

- Before resolve, `buildPayrollSourceAmountsByEmployeeId`:
  - loads period timesheets (`status`, `lateHours`, `undertimeHours`, `hoursWorked`);
  - evaluates **eligibility** then **amount** (see evaluation order above);
  - for eligibility and/or attendance-based amount, ensures/updates the period installment (zero allowed when disqualified);
  - for non-attendance `RECURRING` benefits with `ENROLLED_ALWAYS`, ensures one installment (`ensureRecurringBenefitInstallmentForPeriod`).
- `resolvePayrollBenefitSource` continues to prefer due generated installments over a raw total amount.
- A `SCHEDULED` installment is eligible only when it has no `payrollCutOffId` or the cutoff matches the payroll period being processed.
- A `DEDUCTED` installment is reusable only for the same payroll period (rerun safety).
- Successful payroll processing marks applied installments `DEDUCTED` with payroll-period linkage and remains idempotent for the same cutoff.
- Recurring stops when `endDate` precedes the period, or when the benefit is inactive / not ACTIVE|APPROVED.
- Compensation/deduction direction and reconciliation behavior are unchanged.

### Display names: enrollment vs benefit type

Multiple payroll adjustments can share one **benefit type** (e.g. type `De Minimis Allowance` / code `DMA`) with different enrollment names (e.g. Rice Subsidy, Travel Allowance). Display and payslip lines must not collapse those enrollments into a single type total.

| Field on source detail | Source | Purpose |
|---|---|---|
| `name` | `EmployeeBenefit.name`, else type name, else `"Employee benefit"` | **Primary label** (payroll adjustment / enrollment name) |
| `benefitTypeName` | `BenefitType.name` | **Category** (UI secondary line; Bandai register name match) |
| `code` | `BenefitType.code` | Register code match (e.g. `DMA`) |

Implementation:

- `helper/payroll-benefit-source.helper.ts` — `resolvePayrollBenefitSource` sets `name` and `benefitTypeName` (select must include enrollment `name`).
- `helper/payroll-period.helper.ts` — persists both on `metadata.payrollSourceDetails`; Bandai register `sumPayrollSourceDetails` matches **code OR name OR benefitTypeName** so register columns (e.g. `deMinimisAllowance`) still roll up all DMA enrollments while display stays per enrollment.
- `helper/payroll-source-display.helper.ts` — shared role grouping (gross / post-net / deduction), register-field coverage (suppress aggregate register lines when source details cover them), and label helpers.

### Named Bandai register benefit codes (selected)

These codes roll up into dedicated `EmployeePayroll` fields when present on payroll source details. This is **enrollment-driven compensation**, not automatic award from analytics.

| Code | Product / register label | Payroll field | Notes |
|---|---|---|---|
| `PFA` | Perfect Attendance | `perfectAttendance` | Seeded type name is currently **Performance Bonus** (`BONUS`) — label drift vs product. Post-net with MLA/LLA on computation view. **Not** the `perfectAttendanceMetrics` report. With `attendanceBased` **off**: fixed enrolled amount when due (all-or-nothing enrollment). With `attendanceBased` **on**: ABSENT-only pro-rate (still pays with absences). HR form shows a warn-only banner for the combo. |
| `MLA` | Meal Allowance | `mealAllowance` | Often post-net receivable alongside PFA. |
| `LLA` | Line Leader Allowance | `lineLeaderAllowance` | Often post-net receivable alongside PFA. |
| `DMA` | De Minimis Allowance | `deMinimisAllowance` | Multi-enrollment display by enrollment `name`. |
| `OTM` | OT Meal Allowance | `otMealAllowance` | Also matched as “Overtime Meal Allownce” (workbook spelling). |

Canonical WWG write-up: `.wwg/wiki/project-truth.md` (Perfect Attendance payroll feature) and `.wwg/wiki/terminology.md` (PFA vs metrics).

### Payslip and payroll summary surfaces

| Surface | Behavior |
|---|---|
| Employee payroll summary (HR run payroll view) | Lists each `payrollSourceDetails` line: primary = enrollment `name`, category = `benefitTypeName` |
| Payroll Adjustments list | Primary = enrollment name; employee under it; type/code as meta |
| Computation view (`buildEmployeePayrollComputationView`) | Expands source details; omits aggregate register rows (e.g. De Minimis) when covered by details; source rows carry `isTaxable` / `isBenefitSource` for UI grouping |
| Payslip PDF (generate during payroll + **view/download**) | Same expansion; label may be `Rice Subsidy (De Minimis Allowance)` when names differ; **Benefits applied** section grouped as **Non-taxable** / **Taxable** using frozen or live-enriched `isTaxable` |
| HTML payslip detail template (hris-app + hris-emp-app) | Same tax grouping when `metadata.payrollSourceDetails` is present; otherwise lumped Allowances & Bonuses fallback |
| HR payroll detail (computation accordion) | Base earnings, then **Benefits applied** → Non-taxable / Taxable, then retro/corrections |

`isTaxable` is frozen on each `metadata.payrollSourceDetails` benefit line from `BenefitType.isTaxable` at payroll generation. Payslip GET and employee payroll GET enrich missing flags from live enrollments so older periods still group correctly. Missing/unknown flags display under **Taxable** (safer disclosure).

#### Live payslip view (HR table “View payslip”)

`GET /api/employeePayroll/:id/payslip` **regenerates** the PDF from the current `EmployeePayroll` row (does **not** serve a stale stored Cloudinary PDF as the only view path).

On generate:

1. Prefer frozen `metadata.payrollSourceDetails`.
2. Enrich `name` / `benefitTypeName` / `code` from live `EmployeeBenefit` by detail id when present.
3. If frozen details are empty, rebuild display lines from enrollments active in that payroll period (installment amounts for the cutoff when available).
4. Response uses `Content-Disposition: inline` so browser/new-tab view shows the PDF.

Payroll-run PDF generation also passes `metadata.payrollSourceDetails` into `generatePayslipPdfBuffer` (register totals alone are not enough for multi-enrollment breakdown).

`POST .../payslip-release/generate-payslips?force=true` (or body `{ "force": true }`) regenerates stored payslip PDFs even when already generated.

## Compatibility / migration notes

- Existing rows without `scheduleMode` remain readable and continue using already-generated installments.
- New API/UI payloads must send an explicit mode; do not reintroduce a silent six-installment default for new explicit-mode records.
- The Prisma `totalInstallments @default(6)` default is legacy compatibility only. Explicit `TIME_BOUND` inactive/no-period paths and `RECURRING` force a zero count when appropriate so the schema default does not reappear.
- No destructive data migration is required for this feature. Schema enum/field addition is additive and nullable-compatible.
- Do not run shared/production migrations or backfills as part of schedule-mode rollout without a separate approved change.
- **Display-name / payslip breakdown:** already-generated payroll rows keep frozen `metadata.payrollSourceDetails` until payroll is re-run. Live payslip view still enriches labels from current enrollments and can rebuild lines when details are missing. Stored Cloudinary PDFs used only for archival release packages may lag until regenerate-with-force or re-run payroll.

## Bulk Excel/CSV enrollment import

`POST /api/employeeBenefit/import` (multipart `file`) enrolls many employees with **per-row** benefit code and amount.

| Canonical column | Required | Notes |
|---|---|---|
| `EMPLOYEE_NUMBER` | Yes | HR `Employee.employeeId` (aliases: `EmployeeID`) |
| `BENEFIT_CODE` or `BENEFIT_TYPE` | Yes | Prefer code (aliases: `COMCODE`); name is legacy fallback |
| `AMOUNT` | Yes | Per-period amount (> 0) |
| `START_DATE` | Yes | Aliases: `StartPayDate`; supports `DD/MM/YYYY`, ISO, Excel serial |
| `END_DATE`, `NAME`, `DESCRIPTION`, `NOTES`, `IS_ACTIVE`, `EMPLOYEE_NAME` | No | Name display-only; enrollment name defaults to type name |

**Defaults (not in file):** `scheduleMode=RECURRING`, `recurrenceFrequency=EVERY_CUTOFF`, `status=ACTIVE`, attendance off, eligibility from type policy, open-ended end date.

**Duplicate policy:** if a non-deleted enrollment already exists for the same employee + benefit type, the row **fails** (no upsert). Partial success is allowed.

**Create path:** `createEmployeeBenefitRecord` (not legacy 6-installment). Helper: `helper/employee-benefit-import.helper.ts`.

HR app: Benefits Management **Bulk upload** modal (upload → map columns → verify) builds a mapped CSV before calling import.

## Focused test evidence

| Suite | File(s) | Ownership |
|---|---|---|
| Contract / Zod | `tests/employee-benefit-schedule.contract.spec.ts` | Mode validation, legacy defaults, recurring open-ended, normalization |
| Helper generation | `tests/employee-benefit-schedule.helper.spec.ts` | Fixed/time-bound generation, recurring plan/ensure decisions |
| Controller wiring | `tests/employee-benefit-schedule.controller.spec.ts` | Period query, gates, recurring no bulk create |
| Bulk import | `tests/employee-benefit-import.helper.spec.ts`, `tests/employee-benefit-import.controller.spec.ts` | Column aliases, date parse, fail-on-duplicate, RECURRING defaults |
| Payroll source | `tests/payroll-benefit-source.helper.spec.ts` | Due-row selection, cutoff mismatch exclusion, aggregation, enrollment vs type name |
| Payroll source display | `tests/payroll-source-display.helper.spec.ts` | Primary/category labels, DMA coverage, role grouping |
| Payslip formula | `tests/payslip-pdf.helper.spec.ts` | Enrollment breakdown replaces register De Minimis total |
| Payroll integration | `tests/payroll-benefit-integration.spec.ts` | Lazy ensure, no-dupe, end-date stop, deducted state, rerun |

Focused command:

```bash
npx tsx node_modules/mocha/bin/mocha --no-config \
  tests/employee-benefit-schedule.contract.spec.ts \
  tests/employee-benefit-schedule.helper.spec.ts \
  tests/employee-benefit-schedule.controller.spec.ts \
  tests/payroll-benefit-source.helper.spec.ts \
  tests/payroll-source-display.helper.spec.ts \
  tests/payslip-pdf.helper.spec.ts \
  tests/payroll-benefit-integration.spec.ts
```

Payroll source-truth quality slice (broader):

```bash
npm run test:regression:payroll-source-truth
```

Frontend schedule UI/evidence commands live in `../hris-app/docs/BENEFIT_SCHEDULE_MODES.md` and `../hris-app/docs/testing-strategy.md`.
