# EmployeePayroll.hourlySalary generate-time snapshot (2026-08-19)

Status: `CONFIRMED_CODE`. WWG documentation of the payroll hourly snapshot.  
This note does **not** invent a hire/edit hourly input or a Sheet2 Hourly Salary column.

Timezone for operator dates: **Asia/Manila (UTC+8)**.

## What

| Item | Truth |
|---|---|
| Field | `EmployeePayroll.hourlySalary` |
| Type | `Float` `@default(0)` |
| When written | Payroll generate / generate-timesheet, **or** optional backfill of existing `0` rows from current daily/metadata |
| What it stores | Snapshot of the **derived attendance hourly** already used for OT and late/UT on that run |
| Source of truth | Still `Employee.basicSalary` (+ `currency` + `payFrequency`) |
| Existing rows | Stay `0` until unpaid regenerate **or** the optional hourlySalary backfill |

## Why

| Reason | Detail |
|---|---|
| Audit | Operators can see the hourly the engine used without re-deriving from metadata JSON |
| Same number as deductions | OT / late / UT already use `resolveBnpiAttendanceDailyRate` / `resolveBandaiApprovedBucketRateBasis` hourly |
| Fail-closed default | `0` means “not generated on this schema yet,” not “employee earns ₱0/hour” |
| No new input surface | Avoid a second salary the UI can drift from `basicSalary` |

## Formula

Hourly is **derived**, then snapshotted. It is not typed on Employee.

| Step | Formula | BNPI 313 (Bandai approved buckets / attendance path) |
|---|---|---|
| Period / monthly basic | From `Employee.basicSalary` and `payFrequency` | Semi-monthly period basic is typically half of monthly |
| Daily | Attendance helper daily | `monthly × 12 / 313` (`BANDAI_DIRECT_ANNUAL_WORK_DAYS`) |
| Hourly | `daily / workingHoursPerDay` | `workingHoursPerDay = 8` (`BANDAI_WORKING_HOURS_PER_DAY`) |
| Snapshot | Write that hourly onto `EmployeePayroll.hourlySalary` at generate | Same value already used for OT pay and late/UT peso |

Helpers (existing, not a new rate family):

- `bnpi-pats-api/helper/payroll-period.helper.ts` — `resolveBnpiAttendanceDailyRate`, `resolveBandaiApprovedBucketRateBasis`
- Schedule hours may be 7.5 on some days; **BNPI 313 peso rates ignore schedule hours and use 8**

## What we did not add

| Not added | Why |
|---|---|
| `Employee.hourlyRate` / `Employee.hourlySalary` | Employee still has only `basicSalary` + `currency` + `payFrequency` |
| Hire / edit / boarding hourly field | Not an Employee input |
| Sheet2 / payroll-computation **Hourly Salary** column | Register stays G Monthly, H Daily, I No. of Days |
| Using stored `hourlySalary` as SoT on a later edit | Recompute from `basicSalary` at generate, then snapshot again |
| Using stored `hourlySalary` in OT/late/absent/gross | Confirmed unused. Money uses in-memory `attendanceRate.hourlyRate` only. Backfill does not change that |
| Rewriting paid money / regenerating payroll via backfill | Not added. Backfill writes `hourlySalary` only |
| UI claim that hourly is a register or employee master field | Do not invent that UI |

## Backfill (existing `0` rows)

Optional script. Fills stored `EmployeePayroll.hourlySalary` from **current** `dailySalary` / payroll `metadata`. It does **not** change payroll computation. Dry-run is the default.

Commands (`cd bnpi-pats-api`):

```text
npm run backfill:employee-payroll-hourly-salary
npm run backfill:employee-payroll-hourly-salary:execute
```

| Mode | Command | Writes? | What happens |
|---|---|---|---|
| Dry-run (default) | `npm run backfill:employee-payroll-hourly-salary` | No | Counts/samples rows with `hourlySalary` 0 (or missing) that can be derived from current `dailySalary` and/or `metadata.hourlyRate` / daily / hours. No `UPDATE` |
| Execute | `npm run backfill:employee-payroll-hourly-salary:execute` | Yes, `hourlySalary` only | Same derive, then write the snapshot column |

| Writes | Does not write / does not do |
|---|---|
| `EmployeePayroll.hourlySalary` on existing rows that are still `0` | OT, late, UT, absent, gross, net, tax, contributions, receivables |
| Derived via `computeEmployeePayrollHourlySalarySnapshot` — prefer `metadata.hourlyRate`, else `dailySalary` (or `metadata.dailyRate`) ÷ `workingHoursPerDay` (BNPI 313 uses 8) | `Employee.basicSalary` / any Employee hourly field (none exists) |
| Same generate-time formula, applied to **already stored** daily/metadata | Payroll regenerate, period status, paid/published/lock flags |
| | Sheet2 / register Hourly Salary column |
| | Read stored `hourlySalary` as compute input |

Boundary: paid money history stays immutable. A filled snapshot is audit/display of the derived hourly, not a new rate family.

## Files (code contract this note describes)

| Layer | Path | Role |
|---|---|---|
| Employee SoT | `bnpi-pats-api/prisma/schema/employee.prisma` | `basicSalary`, `currency`, `payFrequency` only |
| Snapshot field | `bnpi-pats-api/prisma/schema/employeepayroll.prisma` | `hourlySalary Float @default(0)` + comment |
| Postgres twin | `bnpi-pats-api/prisma/schema-postgres/employeepayroll.prisma` | Same field |
| Additive migration | `bnpi-pats-api/prisma/schema-postgres/migrations/20260819_add_employee_payroll_hourly_salary.sql` | `ADD COLUMN IF NOT EXISTS` default 0 |
| Zod allow-list | `bnpi-pats-api/zod/employeepayroll.zod.ts` | `hourlySalary` in register number field names |
| Derive hourly | `bnpi-pats-api/helper/payroll-period.helper.ts` | Daily / 8; OT and late already use this hourly. Backfill reuses `computeEmployeePayrollHourlySalarySnapshot` |
| Sheet2 columns | `BANDAI_PAYROLL_REGISTER_COLUMNS` in that helper; `bnpi-pats-app/app/routes/hr/reports/payroll.tsx` | No hourly column |
| Backfill (optional) | `bnpi-pats-api` npm `backfill:employee-payroll-hourly-salary` (+ `:execute`) | Dry-run default. Fills existing `0` from daily/metadata. Not compute |

## WWG updated this pass

| File | Change |
|---|---|
| `.wwg/wiki/project-truth.md` | HourlySalary section + backfill bullet (existing `0` from daily/metadata; still unused in compute) |
| `.wwg/wiki/project-truth-summary.md` | Last updated 2026-08-19 + backfill one-liner |
| `.wwg/wiki/terminology.md` | Observed term **EmployeePayroll.hourlySalary snapshot** |
| `.wwg/workspace/current-task.md` | Latest Task Addendum 2026-08-19 backfill (docs) |
| `.wwg/reports/wwg-agent-handoff.md` | Prepended 2026-08-19 backfill (docs) entry |
| `.wwg/reports/employee-payroll-hourly-salary-snapshot-20260819.md` | This report + **Backfill** section (2026-08-19 addendum) |

## Done vs not done

| Claim | Status | Evidence | UI still shows |
|---|---|---|---|
| Field is a generate snapshot, not Employee input | Confirmed | Prisma Employee has no hourly; EmployeePayroll has `hourlySalary` default 0 | Hire/edit still basic + currency + frequency |
| Formula is daily / hours (313 uses 8) | Confirmed | `resolveBnpiAttendanceDailyRate` / 313 helpers | Same OT/late math as before |
| Not a Sheet2 column | Confirmed | Register G/H/I mapping has no hourly | Payroll Computation register unchanged |
| Historical rows have a real hourly | Open until regenerate **or** backfill execute | Default 0; dry-run does not write | Old `EmployeePayroll` rows show 0 until generate or `:execute` |
| Backfill does not change compute | Confirmed contract | Helper still write-only; money uses in-memory hourly | No payroll money change from backfill |
| Public DEV serving the column | `NEEDS_CONFIRMATION` | Migration exists in repo; runtime apply is a separate job | Do not claim live DEV until generate or backfill writes and reread prove it |

## Agent next (not this WWG pass)

| Pri | Action | Owner |
|---|---|---|
| 1 | Keep generate write using the same attendance hourly; do not invent a second rate | Implementer (product code) |
| 2 | After unpaid regenerate **or** backfill `:execute`, reread `EmployeePayroll.hourlySalary` ≠ 0 when daily/metadata can derive | Tester |
| 3 | Do not add Hourly to Sheet2 parity or employee forms unless the operator explicitly asks | All agents |
| 4 | Keep backfill dry-run default; do not treat execute as a compute/regenerate job | Implementer (script) |
