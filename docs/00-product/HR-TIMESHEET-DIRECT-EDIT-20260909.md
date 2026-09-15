# HR Direct Timesheet Editing (APPROVED timesheets)

**Date:** 2026-09-09
**Operator request:** "HR should be able to update the timesheet of the employees" — including the
2,235 APPROVED ("Payroll Ready") timesheets on the current period, which were previously
impossible to edit from anywhere.

## Where

- HR → Timekeeping → **Timesheets** (`/hr/timesheets`)
- Open any timesheet row (eye icon) → **Timesheet details** modal.

## What changed

### Before

- Day editing only worked for `REVISED` sheets or sheets with an approved **edit permission**
  request (an employee-oriented flow).
- **APPROVED sheets were hard-blocked for everyone, HR included**
  (`400 Cannot update timesheet in APPROVED status`).
- The HR page opened the view modal with no save path at all.

### After

- **HR/admin can click any day on an APPROVED (not payroll-locked) timesheet and edit it directly**
  (time in/out, hours, status), then press **Save changes (N)**.
- The timesheet **stays APPROVED** — it remains payroll-ready; no re-approval loop.
- Every changed day is **versioned for audit** (CORRECTION ledger, previous line preserved),
  so who-changed-what history survives.
- **Payroll-locked (paid) sheets are still protected** — they continue to require the
  Payroll Correction flow.

## Rules (backend guardrails — `bnpi-pats-api/app/timesheet/timesheet.controller.ts`)

| Rule | Detail |
|---|---|
| Who | `bnpi-pats-admin` / `admin` / `super_admin` / `superadmin` / `bnpi-pats-hr-manager` / `bnpi-pats-hr-user` / `bnpi-pats-timekeeper` |
| What | Breakdown-only payload (`breakdown` + `editedDayKeys`) — status/money fields on the side are still rejected |
| Status | Only `APPROVED` sheets get the new allowance; `SUBMITTED` keeps its breakdown-only rule; non-HR actors keep the original hard block |
| Payroll lock | Unchanged — `409` before any other check |
| Audit | Changed days are versioned (`CORRECTION` ledger) through `resolveVersionDayKeys` / `resolveManualEditDayKeys`; activity + audit logs recorded |
| Status mutation | HR cannot flip an APPROVED sheet's status through this path (breakdown-only enforced) |

## Frontend behavior (`bnpi-pats-app/app/components/organisms/TimesheetViewModal.tsx`)

- Orange **HR edit mode** banner appears on APPROVED sheets for HR roles:
  "HR edit mode: click any day to correct it, then use Save changes. The timesheet stays
  APPROVED and edits are versioned for audit."
- Days become clickable; the existing `TimesheetDayEditor` opens (same editor employees use).
- Each edited day triggers the server **normalize-breakdown preview** for recomputation.
- Footer shows **Save changes (N)** only after days were edited; save sends the
  full breakdown + `editedDayKeys` via `PATCH /api/timesheet/:id`, then resets the dirty state.
- Non-HR roles see no banner and no editable days on APPROVED sheets.

## Tests

- Backend: `bnpi-pats-api/tests/timesheet-hr-approved-edit.spec.ts` (6 passing) — pins the HR
  allowance, the retained hard block for non-HR, the payroll-lock-first ordering, audit
  versioning, and the untouched leader guard.
- Frontend: `bnpi-pats-app/app/components/organisms/TimesheetViewModal.test.tsx` — HR CTA gating,
  HR edit banner, non-HR isolation. Also repaired 8 pre-existing failing baseline tests
  (incomplete `useTimesheets` mock).

## Boundary

- Local implementation on the current feature workspace; not yet pushed to `develop` and not
  yet rolled to the VM runtime.
- Paid/locked sheets still intentionally require Payroll Correction (money snapshot integrity).
