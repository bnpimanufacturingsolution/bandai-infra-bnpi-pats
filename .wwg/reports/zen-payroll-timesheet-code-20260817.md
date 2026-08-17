# Zen 00010 payroll + timesheet code (2026-08-17)

Timezone for operator dates: **Asia/Manila (UTC+8)**.

## Status

| Pack | Git | Live DEV |
|---|---|---|
| Encoding / `set-active` recompute | **Pushed** `7b5030b` | Titles patched; schedule recompute is in that SHA |
| Device event details SHE | **Pushed** `b767562` | UI only after that SHA serves |
| Timesheet `employeeIds` + `sync-obligation-lines` | **This push** | Zen lines already on DEV via 55435 script; HTTP is for the next time |
| Zen salary / timesheet / preview math | Data on DEV | Confirmed |

## Code (this push)

### `POST /api/timesheet/:id/sync-obligation-lines`

Fills **missing** `Timesheetline` rows from `AttendanceObligation` for one timesheet.

| Item | Value |
|---|---|
| Auth | Same as prepare drafts (`isTimesheetPolicyManager`) |
| Body | `{}` |
| Range | Hire (or period start) through period end |
| APPROVED | Allowed. Existing SUBMITTED/APPROVED lines are kept. Missing dates are written. |
| Response | `{ timesheetId, lineCount }` |

Files:

- `hris-api/app/timesheet/timesheet.controller.ts` — `syncObligationLines`
- `hris-api/app/timesheet/timesheet.router.ts`
- `hris-app/app/services/timesheet.service.ts` — `syncObligationLines(timesheetId)`
- `hris-api/tests/timesheet-sync-obligation-lines.contract.spec.ts`

Why: payroll generate reads **saved lines**, not the GET overlay. Empty lines → daily rate ₱0 → late/absent do not deduct.

### `POST /api/timesheet/ensure-period-drafts`

Now accepts optional `employeeIds: string[]` (already supported in the helper). Client: `ensurePeriodDrafts(periodId, { employeeIds })`.

Public DEV has this after GitOps rolls this SHA.

## Live DEV data (not git)

| Item | Value |
|---|---|
| Salary | `basicSalary` ₱11,000 SEMI_MONTHLY (Technician catalog floor ₱22,000 monthly ÷ 2). **Not** a register Sheet2 amount. |
| Timesheet | `cmswwobaz05mxlp01e8p71f9q` APPROVED for `PP-20260811-20260826` |
| Lines | 14 materialized 17 Aug 2026 (Manila) via local Prisma → `127.0.0.1:55435` |
| Preview after lines | Gross ₱6,631.10 · Net ₱5,424.54 |

Math (Manila clocks): `.wwg/reports/zen-00010-payroll-preview-math-20260817.md`

## Already pushed this thread

| SHA | What |
|---|---|
| `7b5030b` | ASCII boarding titles; encoding cleanup; `set-active` recomputes `AttendanceObligation`. Report: `.wwg/reports/mojibake-encoding-20260817.md` |
| `b767562` | Device event details SHE (icons + labels) |

## Product rules to keep

1. Boarding notification titles stay ASCII. No emoji in those literals.
2. `set-active` must recompute obligations (`ScheduleChanged`) or HR Attendance stays Off Day.
3. Payroll generate uses **APPROVED** timesheets and **persisted Timesheetline** rows.
4. `POST .../generate-timesheet` generates **payroll from approved timesheets**. It does not create timesheet rows.
5. Preview clocks and cutoff dates for operators: **Asia/Manila**.

## Left open

| Item | Class | Next |
|---|---|---|
| Public DEV until this SHA serves | `apply_path` | GitOps roll |
| ~870 other people on Aug 11–25 still not payroll-ready | fleet | Separate job; do not treat as Zen |
| ₱11,000 is catalog floor, not a workbook basic | `NEEDS_CONFIRMATION` | Replace if HR gives official rate |
| Daily rate uses 14 non-rest lines (includes future SCHEDULED + holidays) | engine | Different formula if operator wants present-days only |
