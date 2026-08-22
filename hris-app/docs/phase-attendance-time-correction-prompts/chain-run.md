# Attendance Time Correction Chain Run

Source label: [docs/attendance-time-correction-implementation-plan.md](../attendance-time-correction-implementation-plan.md) (post Phase 0 audit revision)

## Objective

Replace the duplicated correction mutation logic in `../../../hris-api/app/attendance/attendance.controller.ts`
(direct HR correction) and `../../../hris-api/app/request/request.controller.ts`
(approval-side correction) with calls into one shared, source-agnostic correction
service, without changing the user-facing entry points, without touching payroll
snapshot storage, and without expanding into the three other queued attendance
board items.

## Chain

1. Pass 1 - Decision lock and finalized contract.
2. Pass 2 - Classification and normalization core.
3. Pass 3 - Supersession, write, and refresh core.
4. Pass 4 - Route both controllers through the shared service.
5. Pass 5 - App-side alignment and terminology cleanup.
6. Pass 6 - Regression test coverage.
7. Pass 7 - Validation, WWG sync, and handoff report.

## Boundaries

- No payroll snapshot writes (`EmployeePayroll.timesheetSnapshot` stays untouched).
- No UI redesign.
- No collapsing direct correction and approval correction into one user journey.
- No changes to backfill behavior.
- No work on the three other queued board items (`absence-to-sick-leave conversion`,
  `overtime approval reason and comp leave credit`, `advanced filters and
  employee-day threshold`). The daily trend chart item is already implemented
  and no longer part of this chain.
- No silently defaulting on an open decision - escalate instead of guessing.
- `source` (direct vs approval) may inform provenance, actor resolution, realtime
  labels, and cache scope only. It must never branch the core mutation steps
  (status classification, supersession, row creation, refresh logic).

## Handover Protocol

Each pass ends with a **Handover** block containing exactly what the next pass
needs: decisions locked, contracts finalized, files created or changed, and any
open flags. The next pass starts by reading the previous pass's Handover before
doing anything else. If a Handover flags a blocker, the next pass does not
proceed past that blocker - it surfaces it back up instead of guessing past it.
