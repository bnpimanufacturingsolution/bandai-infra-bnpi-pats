# Payroll Correction → Next Period Apply (MVP)

**Status:** Implemented defaults (2026-07-15)  
**Contract:** `docs/PAYROLL_CORRECTION_NEXT_PERIOD_HANDOFF_PROMPT.md`  
**Policy label:** `IMPLEMENTED_DEFAULT_PENDING_OWNER_CONFIRMATION` where noted

## Product policy (accepted for implementation)

When a timesheet has been consumed by payroll generation (`lockedAt` / `PAYROLL_PERIOD_LOCK` / linked employee payroll):

1. Employees **cannot** edit the timesheet or request edit-permission for money changes.
2. Employees file a **`PAYROLL_CORRECTION`** request with day-level before→after hour deltas and a reason. **UI (emp + hris-app):** proposed change is entered as **Time In / Time Out** (same mental model as edit timesheet); `hoursType` is auto-derived and not user-editable; API still receives `beforeMinutes` / `afterMinutes` / `deltaMinutes` (optional `timeIn`/`timeOut` may ride for audit).
3. Manager approval (workflow `WF-PAYROLL-CORRECTION-DEFAULT`) moves a durable **`PayrollCorrection`** to **`READY`** (or **`APPROVED_HOLD`** if estimated net is negative).
4. On **`generatePayrollFromTimesheets`** for a later open period, READY corrections for in-scope employees are included as **explicit payslip lines** under `EmployeePayroll.metadata.payrollCorrections[]` (with `dayDeltas`), amount rolled into `otherCompensation` / gross / net / totalReceivable.
5. Correction is marked **`APPLIED`** with `appliedPayrollPeriodId` + `appliedEmployeePayrollId`.
6. Period A `timesheetSnapshot` and timesheet day cells are **never** rewritten.
7. **Visibility on apply-period payroll:** labeled lines on payslip PDF; `buildEmployeePayrollComputationView` gross rows; employee payslip “Adjustments / Retro”; HR **Payroll summary** modal (`/hr/hr-payroll` view) — Prior-period corrections accordion + Daily detail correction category.

## API

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/timesheet/:id/payroll-corrections` | Create request + `PayrollCorrection` (`REQUESTED`) |
| `GET` | `/api/timesheet/:id/payroll-corrections` | List corrections for source timesheet |
| existing | request approve/reject | Side effects → READY / REJECTED / APPROVED_HOLD |

### Create body

```json
{
  "reason": "Missed OT on Jun 2",
  "dayDeltas": [
    {
      "date": "2026-06-02",
      "hoursType": "OT",
      "beforeMinutes": 0,
      "afterMinutes": 120,
      "deltaMinutes": 120
    }
  ]
}
```

Requires timesheet to be payroll-locked. Unlocked sheets must use normal edit / edit-permission.

## Status machine

`REQUESTED` → (`READY` \| `APPROVED_HOLD` on approve) \| `REJECTED`  
`READY` → `APPLIED` (on generate, idempotent)  
`APPROVED_HOLD` = negative net; not auto-applied in MVP (HR path Phase 2)

## Money

- **Estimate** at request create (employee basic → rough hourly).
- **Final** at generate using period hourly/OT/ND rates from the generating period calculator path.
- Positive amounts → `otherCompensation` + gross/net.
- Lines labeled via `buildRetroPayslipLabel`: `Retro {typeLabel} ({sourcePeriodName} correction)`.
  - Single type: `OT` → “OT”, `ND` → “ND”, `REGULAR` → “hours”, other types lowercased; mixed/empty → “adjustment”.
  - Example: `Retro OT (Period 1 - Jun 2026 correction)`.

## Explicit non-goals

- Rewriting locked timesheet lines as pay mechanism
- Stuffing prior-period hours into next timesheet day cells
- Silent apply without approval
- Off-cycle immediate pay
- Full negative-delta recovery automation

## Tests

- `tests/payroll-correction.helper.spec.ts` — deltas, money, hold, metadata merge, apply idempotency
- `tests/employee-payroll-computation-view-corrections.spec.ts` — labeled retro rows in computation view
- `tests/payslip-pdf.helper.spec.ts` — retro earnings rows in PDF formula
- emp/hris-app: `payroll-correction-form` unit + smoke harness for Time In/Out submit rules

## Schema

- `prisma/schema-postgres/payrollCorrection.prisma`
- `RequestType.PAYROLL_CORRECTION`
- Apply DB: `npx prisma db push` / migrate against target env when authorized
