# Pass 3 - Supersession, Write, and Refresh Core

## Input (from Pass 2)

Read Pass 2's Handover before doing anything else. You need the classification
and normalization functions already built and tested. Do not re-implement or
duplicate that logic here - call into it.

## Objective

Build the second half of the shared correction logic: the part that actually
touches the database. This is the highest-risk pass in the chain, since it
writes to live attendance truth and triggers downstream payroll-adjacent
refreshes.

## Action

Implement, calling Pass 2's classification/normalization functions as the first
step:

- Same-day row lookup: validate that a same-day attendance record exists.
  Confirmed by audit: correction requires an existing same-day row - do not add
  a path that creates the first row for a day with none.
- Supersession: mark all effective same-day rows as ineffective (confirmed by
  audit: multiple effective rows per day are possible - do not limit this to
  "most recent only").
- New row creation: create the replacement `Attendance` row with
  `ledgerType: "CORRECTION"`, `isEffective: true`, `supersedesAttendanceId`, and
  provenance in `deviceInfo`.
- Provenance tagging: accept a `source` and `context` parameter
  (`{ source: 'direct' | 'approval', actorId, requestId? }`). This parameter may
  only affect provenance tagging, actor resolution, realtime/notification
  labels, and cache scope. It must not branch which rows get superseded, how the
  new row is built, or whether refreshes run. This is the single most important
  rule in this pass - re-read it before writing the function signature.
- Refresh pipeline: refresh `AttendanceObligation` and timesheet read models,
  per the Pass 1 contract's refresh-behavior decision (always-refresh by default
  unless the contract states a conditional rule).
- Cache invalidation: post-commit, outside the DB transaction. This is
  confirmed existing behavior from the audit - preserve this placement, do not
  move it inside the transaction.
- Boundary check: confirm this code path never writes to
  `EmployeePayroll.timesheetSnapshot`. That surface is out of scope entirely.

## Self-Check

- Trace the `source` parameter through every branch in this function. Does it
  affect anything beyond provenance/actor/labels/cache scope? If yes, stop -
  this is the exact failure mode the whole consolidation effort exists to avoid,
  and it must be fixed in this pass, not patched later.
- Is cache invalidation inside or outside the transaction? It must be outside.
- Does the supersession query affect all effective rows, or did it default to
  "most recent" out of habit? Check the actual query filter.

## Validation for this pass

- Integration test: same-day attendance is required - correction fails cleanly
  without it.
- Integration test: all prior effective same-day rows are superseded, not just
  one, when multiple exist.
- Integration test: refresh pipeline runs per the Pass 1 contract's decision.
- Integration test: cache invalidation happens, and happens after commit.
- Integration test: no write occurs to `EmployeePayroll.timesheetSnapshot` as a
  side effect of this function.

## Handover to Pass 4

- The complete shared correction function/service (name, file location, full
  signature including the `source`/`context` parameter shape).
- Confirmation, with evidence (test output), that `source` does not branch core
  mutation logic.
- List of every DB write this function performs, for Pass 7's final audit
  cross-check against the WWG guardrails.
- Test file location and pass/fail status.
