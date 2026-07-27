# Attendance Time Correction Context Pack

Status: ACTIVE
Last reviewed: 2026-06-26
Task mode: docs-only / handoff context
Delivery mode: AI-agent

## Purpose

Use this doc to resume the attendance correction planning conversation without rereading the full implementation plan first.

## Confirmed Reality

- Direct HR correction requires an existing same-day attendance row.
- Approval-side `ATTENDANCE_CORRECTION` also requires a same-day row.
- The HR screen now uses a `Fix Attendance` front door that can switch between correction and backfill.
- There is a dedicated attendance backfill endpoint for the missing-row case.
- The employee path is currently the generic request flow, not a separate attendance-correction UI.
- The shared API helper handles normalization, supersession, attendance-obligation refresh, timesheet refresh, and cache invalidation.

## Provisional Engineering Decision

Because the owner answers are unavailable, the implementation will proceed with the following policy until an owner explicitly overrides it:

- `Fix Attendance` is the one HR front door and is now implemented.
- If a same-day row exists, open `Correct attendance`.
- If no same-day row exists, open `Create missing attendance`.
- If the day is payroll-locked or already paid, do not write directly; route to a controlled `TIME_ADJUSTMENT` request flow.
- HR direct writes are HR-only.
- Employees stay in the request/report flow.
- Approval-side `ATTENDANCE_CORRECTION` remains a separate request-driven path.
- Backfill uses a dedicated create helper, not the generic clock-in create route.
- Correction keeps all-or-nothing same-day supersession.
- Backfill creates the first row and does not supersede.
- Reason categories remain code-defined in the shared correction schema for now.
- Audit trail labels should explicitly say `backfill`, `correction`, or `locked exception`.

## Real-World Recommendation

- `Missing attendance`: no row exists yet, so this is a backfill/create case.
- `Wrong attendance`: a row exists but the data is wrong, so this is a correction case.
- `Closed payroll period`: the day is already locked or paid, so this should route to a controlled exception flow.

Recommended policy:

1. Do not force a create-first-then-correct workaround.
2. Keep employees in a request or report flow instead of direct ledger editing.
3. Let HR handle the actual ledger change.
4. Label the audit trail clearly when the result is a backfill versus a correction.
5. Stop the edit and route it to payroll or reopening workflow when the period is locked.

## Simple App Shape

- Add a single HR action on the attendance screen: `Fix Attendance`.
- If a row exists for the day, open `Correct attendance`.
- If no row exists, open `Create missing attendance`.
- Keep the same core fields in both modes: employee, date, status, times, reason, and notes.
- Keep employees in a `Report attendance issue` or request flow.
- Keep approvers on the existing review path.

## Open Questions

None for the current implementation pass. The provisional engineering decision above is the baseline unless an owner later overrides it.

## Suggested Next Step

Implement against the provisional engineering decision above, then reconcile with owner feedback if and when it arrives.

## New Chat Starter Prompt

```text
Continue the attendance correction planning work in the BANDAI HRIS app.

Use these context sources first:
- docs/attendance-correction-feature-summary.md
- docs/attendance-time-correction-implementation-plan.md
- docs/attendance-time-correction-context.md
- .wwg/workspace/current-task.md

Current confirmed reality:
- Direct HR correction requires an existing same-day attendance row.
- Approval-side ATTENDANCE_CORRECTION also requires a same-day row.
- There is no dedicated employee attendance-correction create screen; employees currently use the generic request flow.
- The shared API helper handles normalization, supersession, obligation refresh, timesheet refresh, and cache invalidation.

Current recommendation:
- Treat missing attendance as backfill/create, not correction.
- Treat wrong attendance as correction.
- Treat locked payroll periods as a controlled exception flow.
- Prefer a simple HR `Fix Attendance` front door that switches between `Create missing attendance` and `Correct attendance`.

Do not change code yet. Apply the provisional engineering decision above and keep the entry points and labels explicit.
```
