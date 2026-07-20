# Benefit Payroll Schedule Modes

Status: ACTIVE
Last reviewed: 2026-07-17
Paired design: `docs/superpowers/specs/2026-07-13-benefit-schedule-design.md`
Paired plan: `docs/superpowers/plans/2026-07-13-benefit-schedule-modes.md`
Backend authority: `../hris-api/docs/BENEFIT_SCHEDULE_MODES.md`

## Purpose

HR benefit enrollments use an explicit schedule type instead of combining a date range with a hidden default of six installments. The frontend owns field visibility and informational previews; the API remains authoritative for validation, persistence, and installment generation.

## Schedule modes

| Mode | UI label | Required fields | How installments are formed |
|---|---|---|---|
| `TIME_BOUND` | Time-bound | Start date, end date, **total** amount | API selects organization payroll periods that overlap the inclusive date range and generates one `SCHEDULED` installment per period |
| `FIXED_INSTALLMENTS` | Fixed installments | Start date, positive whole-number installment count, **total** amount | API generates exactly that many installments on the existing cadence; total amount is divided across rows |
| `RECURRING` | Recurring | Start date, **per-period** amount; end date optional | No bulk schedule at create. Payroll lazily ensures one installment per period while active and in range |

### Shared rules

- New create payloads must send an explicit `scheduleMode`.
- Do not silently default new records to six installments.
- Mode-specific fields only: time-bound payloads send end date; fixed payloads send `totalInstallments`; recurring payloads send optional end date and no installment count.
- Switching modes in the modal clears irrelevant values before submit.
- The modal schedule preview is informational only. Final installment count, amounts, and dates come from the API (except recurring, which is always one full per-period amount).
- Centavo remainder, if any, is applied to the final installment for finite modes.
- Payroll direction (compensation vs deduction) still comes from the selected benefit type.
- Existing records without `scheduleMode` remain editable; the UI treats them as time-bound for form defaults while the API continues to use their already-generated installments.

### Recurring amount & stop rules

- Amount label in UI: **Amount per payroll period**.
- Optional end date: leave empty for open-ended; when set, periods after the end date no longer receive installments.
- Also stops when status is not ACTIVE/APPROVED or `isActive` is false.
- Prefer leaving **Payroll period** as None so the benefit applies to every eligible period (pinning to one period restricts apply via existing payroll resolve rules).

### Attendance-based amount (optional toggle)

Create/edit modal includes **Compute from attendance** (default off).

| Amount basis | Amount field label | Payslip computation (API) |
|---|---|---|
| `PER_DAY` | Rate per present day | `rate × present_days` |
| `PER_CUTOFF` | Full amount for cut-off | `full × (present / scheduled)`; ABSENT only reduces |

- Works with all schedule modes; schedule still controls **when** the benefit applies.
- Final amount is always computed at payroll from the employee timesheet for the cut-off (preview text is informational).
- Payload fields: `attendanceBased`, `attendanceAmountBasis` (`PER_DAY` | `PER_CUTOFF` | null when off).
- Detail view shows an Attendance row so enrolled rate/full cut-off is not mistaken for the last payslip amount.

## Payroll lifecycle

1. HR creates or updates an active/approved employee benefit with an explicit schedule mode.
2. For `TIME_BOUND` / `FIXED_INSTALLMENTS`, the API generates `EmployeeBenefitInstallment` rows with status `SCHEDULED` when the active/approved gate is met.
3. For `RECURRING`, create/update stores the benefit without bulk installments; payroll ensures one row for the current period when eligible.
4. Pending or cancelled benefits do not create scheduled rows.
5. Later payroll processing resolves due installments inside the payroll period, applies them, and marks those rows `DEDUCTED` for that payroll cutoff.
6. Compensation/deduction aggregation and reconciliation buckets are unchanged by schedule mode.

### Enrollment name vs benefit type (display)

Create form defaults **enrollment name** from the selected benefit type, but HR may override it (e.g. type **De Minimis Allowance**, enrollments **Rice Subsidy** and **Travel Allowance**).

| UI surface | Primary label | Category / secondary |
|---|---|---|
| Benefits management | Type or enrollment per existing list/detail patterns | Type on detail |
| Run payroll — **Payroll Adjustments** list | Enrollment name (`EmployeeBenefit.name`) | Type name · code · generated status |
| Run payroll — **employee payroll summary** | Each `metadata.payrollSourceDetails[].name` | `benefitTypeName` · code · period |
| Employee **payslip HTML** detail | Source detail enrollment names when present | Type under the line; lumped Allowances & Bonuses only as fallback |
| HR payroll table **View payslip** | Opens live PDF from `GET /api/employeePayroll/:id/payslip` (server expands enrollment breakdown) | Same as API payslip contract |

Authoritative rules and Bandai register matching: `../hris-api/docs/BENEFIT_SCHEDULE_MODES.md` (sections **Display names**, **Named Bandai register benefit codes**, and **Payslip and payroll summary surfaces**).

### Recurrence frequency (Recurring schedule only)

On create/edit, when **Schedule mode = Recurring**, show **Recurrence**:

| Value | UI label |
|---|---|
| `EVERY_CUTOFF` | Every payroll period (cutoff) — default |
| `MONTHLY` | Monthly (2nd cutoff) |
| `YEARLY` | Yearly (end of fiscal year) |

Hints explain period-2 / sole monthly period and fiscal year-end last period. Schedule preview reflects cadence. Payload includes `recurrenceFrequency` only for Recurring (null for other modes). Domain rules: `../hris-api/docs/BENEFIT_SCHEDULE_MODES.md`.

### Perfect Attendance (PFA) UI notes

- Benefit type code **`PFA`** is grouped under payroll adjustment filter **attendance** and benefits preset `attendance: ["PFA"]` (not the allowance preset list).
- Product label in run-payroll / register language: **Perfect Attendance** → field `perfectAttendance`.
- Seeded API catalog name may still be **Performance Bonus** — display should prefer enrollment/register product labels; do not invent auto-award from the Perfect Attendance **metrics report** tab.
- **Attendance-based vs fixed PFA (product semantics):**
  - **`attendanceBased` off** → fixed enrolled amount when due (all-or-nothing enrollment pay; no pro-rate).
  - **`attendanceBased` on** → ABSENT-only pro-rate; employee can still receive PFA money when absences exist. Late / undertime / leave do not zero the amount. **Not** the metrics report and not auto-eligibility.
  - HR enrollment form shows a **warning banner** (`data-testid="pfa-attendance-based-warning"`) when type code is `PFA` and Compute from attendance is on. Warn only — save is not blocked.
  - Helpers: `shouldShowPfaAttendanceBasedWarning` / `isPerfectAttendanceBenefitTypeCode` in `employee-benefit-form.tsx`.
- Domain SOT: `../hris-api/.wwg/wiki/project-truth.md` and `../hris-api/.wwg/wiki/terminology.md`.

Types: `TimesheetPayrollSourceDetail` includes optional `benefitTypeName` (`app/services/payroll-periods.service.ts`).

## Frontend ownership

| Surface | Responsibility |
|---|---|
| `app/components/templates/hr/benefits-management-template.tsx` | Schedule selector (including Recurring), attendance toggle + amount basis, conditional fields, mode-switch cleanup, preview, create/update payload shaping; enrollment `name` defaults from type |
| `app/components/templates/common/run-payroll-template.tsx` | Payroll Adjustments list + employee summary source lines (enrollment primary, type category) |
| `app/components/templates/employee/payslip-detail-template.tsx` | Payslip earnings/deduction lines from `metadata.payrollSourceDetails` when present |
| `app/components/templates/common/payroll-management-template.tsx` | Past payroll table **View payslip** → live PDF via employee payroll service |
| `app/zod/employee-benefit.zod.ts` | Client-side mode, attendance, and field validation |
| `app/services/employee-benefit.service.ts` | Typed request/response projection for schedule and attendance fields |
| `app/services/payroll-periods.service.ts` | `TimesheetPayrollSourceDetail` includes `benefitTypeName` |

Frontend visibility is not authorization. API validation and persistence tests live in `../hris-api`.

## Focused test commands

```bash
# App schedule UI, Zod, and service projection
npx vitest run app/zod/employee-benefit.zod.test.ts app/services/employee-benefit.service.test.ts app/components/templates/hr/benefits-management-template.test.tsx

# Same-feature test evidence for changed behavior files
npm run test:obligations
```

Backend focused commands and source-truth payroll coverage are documented in `../hris-api/docs/BENEFIT_SCHEDULE_MODES.md` and `../hris-api/docs/testing-strategy.md`.
