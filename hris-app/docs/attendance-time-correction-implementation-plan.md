# Attendance Time Correction Implementation Plan

Status: ACTIVE_DRAFT  
Last reviewed: 2026-06-26
Task mode: docs-only / planning / high-risk workflow clarification  
Delivery mode: AI-agent  
Scope: Board item 1, `Attendance: time correction scenarios`

## Purpose

This document captures the verified correction workflow, the logic already present in the app and API, the parts that should be consolidated, the recommended implementation sequence, and the provisional engineering decisions we are adopting while owner answers remain unavailable.

It is intentionally a planning artifact, not an implementation record.

## Related Board Items

This plan focuses on the first assigned item for `git-yehoshua`:

1. `Attendance: time correction scenarios`

The remaining assigned items are sequenced after this one:

- `Attendance: absence-to-sick-leave conversion`
- `Attendance: overtime approval reason and comp leave credit`
- `Attendance: advanced filters and employee-day threshold`

Completed sibling item:

- `Attendance: daily trend chart by day and department` - embedded in the HR attendance template below the summary cards, with the existing attendance filters driving the chart and the dedicated backend metric support no longer queued in this plan.

## Source-Of-Truth Guardrails

The correction workflow must respect the adopted WWG split:

- `AttendanceObligation` is live/current/future operational attendance truth.
- `Attendance` is biometric/raw/effective clock ledger truth.
- Past submitted/approved/payroll-ready totals and approved OT tally come from effective `Timesheetline` rows.
- Paid payroll history reads `EmployeePayroll.timesheetSnapshot`.

This means the correction workflow is not a free-form edit path. It is a ledger rewrite with downstream read-model refreshes.

## Provisional Engineering Decision

Because the owner answers are not available, the implementation will proceed with the following policy until an owner explicitly overrides it. These are provisional engineering decisions, not permanent product truth.

- One HR front door: `Fix Attendance`.
- Existing same-day attendance row: `Correct attendance`.
- No same-day attendance row: `Create missing attendance` using a dedicated backfill path, not the generic clock-in create route.
- Payroll-locked or already-paid day: no direct write; route to a controlled `TIME_ADJUSTMENT` exception request.
- Direct HR backfill and correction remain HR-only.
- Employees stay in the generic request/report flow.
- Approval-side `ATTENDANCE_CORRECTION` remains a separate request-driven path.
- Correction supersession remains all-or-nothing for the day's effective rows.
- Backfill creates the first row and does not supersede anything.
- Reason categories remain shared code-defined for this wave.
- Audit labels must explicitly say `backfill`, `correction`, or `locked exception`.

## Implementation Progress

The provisional decision above has now been wired into code as the working implementation baseline:

- The HR attendance screen uses a `Fix Attendance` front door.
- The front door switches between correction and backfill based on whether the row is virtual / missing.
- The backend now has a dedicated backfill route and helper for the missing-row case.
- The app now has a dedicated backfill mutation hook alongside the existing correction hook.
- Remaining follow-up is smoke/docs validation and any owner override that changes the policy later.

## Verified Current Workflow

### 1) App entry point

The direct HR correction flow starts from the attendance management surface in `app/components/templates/common/attendance-management-template.tsx`.

Observed behavior:

- HR selects a record and opens the correction flow.
- The app navigates to `/hr/time-corrections`.
- Query params preload the correction screen with:
  - `action=create`
  - `source=attendance`
  - `attendanceDate`
  - `status`
  - `timeIn`
  - `timeOut`
  - `notes`
  - `employeeCode`
  - `employeeName`
  - optional `attendanceId`
  - optional `timesheetId`
  - optional `employeeId`

Relevant files:

- `app/components/templates/common/attendance-management-template.tsx`
- `app/routes/hr/time-corrections.tsx`
- `app/services/attendance.service.ts`
- `app/lib/hooks/useAttendances.ts`

### 2) App route behavior

`app/routes/hr/time-corrections.tsx` is the visible correction screen.

Observed validation and state rules:

- `employeeId` is required.
- `correctionDate` is required.
- `reasonCategory` is required.
- `notes` / explanation is required.
- `PRESENT` corrections require both `timeIn` and `timeOut`.
- `INCOMPLETE` corrections require `timeIn` and may keep `timeOut` blank.
- `ABSENT`, `LEAVE`, and `REST_DAY` are treated as non-work correction statuses.
- Worked-day corrections must still reject invalid time formats, and if both times are present, `timeOut` must be later than `timeIn`.

The route now mirrors the shared backend contract for the worked-window rule instead of defining a separate app-only version.

The route is currently the client-side form gate, but it does not own the business rule. The backend does.

### 3) Backend direct correction endpoint

The direct write path lives in `../hris-api/app/attendance/attendance.controller.ts`.

Observed backend behavior:

- The handler requires an existing same-day attendance record.
- The correction date is normalized to the selected day.
- Correction statuses are interpreted as either worked or non-worked.
- Non-worked statuses null out `timeIn`, `timeOut`, and location data.
- The transaction marks prior effective same-day attendance rows as ineffective.
- The transaction creates a new `Attendance` row with:
  - `ledgerType: "CORRECTION"`
  - `isEffective: true`
  - `supersedesAttendanceId`
  - provenance in `deviceInfo`
- After the write, the backend refreshes the attendance obligation and timesheet read models.
- Cache invalidation is performed after the correction write.
- The response returns the new correction record plus a history view.

Relevant backend file:

- `../hris-api/app/attendance/attendance.controller.ts`

### 4) Backend approval-side correction path

The approval flow in `../hris-api/app/request/request.controller.ts` also performs attendance-correction side effects when a request of type `ATTENDANCE_CORRECTION` is approved.

Observed backend behavior:

- The request metadata contains the correction payload.
- The same-day attendance record is required.
- The same worked-vs-non-work split is applied.
- Prior effective rows are superseded.
- A new correction `Attendance` row is created.
- Obligation and timesheet read models are refreshed afterward.

Relevant backend file:

- `../hris-api/app/request/request.controller.ts`

### 5) Why this matters

At the moment, the same business outcome is exposed through two entry points:

- direct HR correction write
- request-approval side effect

That is not wrong by itself, and the sibling API repo now routes both entry points through the shared mutation helper. The remaining drift risk is at the entry-point and contract layer if either caller starts diverging from the shared helper or the app surface stops matching the backend contract.

## Current Logic Summary

### Correction status matrix

| Status | Current treatment | Notes |
|---|---|---|
| `PRESENT` | Worked-day correction | Requires `timeIn` and `timeOut` |
| `INCOMPLETE` | Worked-day correction with partial-window support | `timeIn` is required; `timeOut` may be blank; if both are present, `timeOut` must be later than `timeIn` |
| `LEAVE` | Non-work correction | Clears worked-window values |
| `ABSENT` | Non-work correction | Clears worked-window values |
| `REST_DAY` | Non-work correction | Clears worked-window values |

### Shared outcome across both paths

Both the direct endpoint and the approval-side effect should produce the same operational result:

1. Replace the effective attendance row for the day.
2. Preserve the audit trail through a correction ledger row.
3. Refresh operational attendance truth.
4. Refresh timesheet read models.
5. Preserve correction provenance so the source can still be identified later.

## Phase 0 Audit Results

The code verification pass resolved most of the draft assumptions. Treat these as the current working facts unless an owner explicitly overrides them.

| Item | Result | Plan impact |
|---|---|---|
| 1 `INCOMPLETE` handling | CONFIRMED_WITH_OWNER_DIRECTION | `INCOMPLETE` means the employee clocked in but has not clocked out yet, so `timeIn` is required while `timeOut` may remain blank. |
| 2 Non-work status set | CONFIRMED_WITH_OWNER_DIRECTION | `ABSENT`, `LEAVE`, and `REST_DAY` remain the full non-work correction set for now. |
| 3 Same-day record required | CONFIRMED_WITH_OWNER_DIRECTION | Correction still requires an existing same-day record; backfill is now the separate no-row path. |
| 4 Approval gating precedent | CONFIRMED_WITH_OWNER_DIRECTION | Direct HR correction remains immediate for now, and the implementation should preserve audit trails rather than add a new approval gate. |
| 5 Supersession scope | PROVISIONAL_POLICY_LOCKED | Corrections keep all-or-nothing same-day supersession; backfills do not supersede because they only apply when no same-day row exists. |
| 6 Notes requirement | CONFIRMED_WITH_OWNER_DIRECTION | Explanation/notes are now required for attendance corrections. |
| 7 Reason category coupling | PROVISIONAL_POLICY_LOCKED | The shared allowlist stays code-defined for this wave; org-configurable reason policy can be a later follow-up. |
| 9 Shared helper source behavior | CONTRADICTED | A shared helper is still viable, but `source` affects more than provenance alone. |
| 10 Services-layer precedent | CONFIRMED | A service extraction pattern already exists in the backend. |
| 11 Refresh cost profile | CONFIRMED | The refresh paths are nontrivial and query/rebuild read models, so the cost is real. |
| 12 Payroll snapshot coupling | CONFIRMED | The correction path does not write `EmployeePayroll.timesheetSnapshot`. |
| 13 Cache invalidation placement | CONFIRMED | Cache invalidation already happens after the DB transaction. |
| 14 Provenance already in UI | CONFIRMED | The UI already shows partial provenance through ledger type and applied-by actor. |
| 15/16 Terminology usage | CONFIRMED | The visible app surfaces touched in this pass now use `Attendance Correction`; remaining `Time Correction` mentions are historical planning-doc context. |

What this means for the plan:

- The shared mutation helper is still the right direction.
- The helper should stay source-agnostic for the core attendance rewrite, but it may still accept context for provenance, actor resolution, realtime labels, and cache scope.
- The remaining work is implementation sequencing for the correction helper plus the dedicated backfill helper, not basic behavior discovery.

## What Should Be Consolidated

### 1) Status classification

Current duplication:

- The app route knows which statuses need a worked window.
- The backend also knows which statuses are non-worked.

Consolidation target:

- One backend-owned status classification rule.
- The app can mirror the rule for validation, but it should not become the source of truth.

### 2) Correction payload normalization

Current duplication:

- The direct endpoint and the request-approval path both normalize correction values, notes, and dates.

Consolidation target:

- One shared normalization step in the API layer.
- The same helper should handle:
  - time parsing
  - non-work status coercion
  - notes fallback
  - same-day date handling

### 3) Supersession and new-row write

Current duplication:

- Both paths deactivate the prior effective row(s) and create a new correction row.

Consolidation target:

- One correction write helper or service.
- The helper should encapsulate:
  - same-day row lookup
  - updateMany to clear the prior effective row(s)
  - create of the replacement `Attendance` row
  - provenance tagging

### 4) Downstream side effects

Current duplication:

- Both paths trigger obligation refresh and timesheet refresh.

Consolidation target:

- One post-write side-effect pipeline.
- Keep cache invalidation in the same correction flow so every entry path stays consistent.

### 5) Error contract

Current duplication:

- The app route parses field errors.
- The API returns structured errors from multiple code paths.

Consolidation target:

- One predictable API error shape for correction validation.
- The app should map that shape, not reinterpret it.

### 6) UX entry points

Current reality:

- The attendance page can launch the correction flow directly.
- The request-approval path can also create the same correction result.

Recommended stance:

- Keep both entry points if the product needs them.
- Do not force a UI merge unless the business explicitly wants one.
- Consolidate the mutation semantics first.
- Keep the source context out of the core rewrite decision, but allow it to inform provenance and side-effect labeling where the two entry points remain intentionally distinct.

## Recommended Implementation Plan

### Phase 0: Lock the implementation policy

The audit already resolved the code facts. Phase 0 now needs the provisional policy above to be applied consistently across the app and API.

This is a high-risk workflow because it touches attendance truth, timesheet refreshes, and payroll-adjacent history.

### Phase 1: Consolidate the backend correction logic

Implement a shared API-side correction helper or service that both backend paths can call.

Candidate helper responsibilities:

- validate same-day attendance existence
- normalize correction status and window
- enforce non-work status behavior
- supersede prior effective rows
- create the new correction row
- apply attendance obligation updates
- refresh timesheet read models
- invalidate caches
- preserve source provenance

Preferred outcome:

- direct HR correction and request-approval correction should become two entry points into one mutation implementation.

### Phase 2: Align app validation to the confirmed contract

Keep the app route and service as entry surfaces, but make them match the finalized backend contract exactly.

App changes should be limited to:

- form validation
- payload shape
- error display
- copy if the canonical terminology changes

Avoid using the app as a second source of business rule truth.

### Phase 2b: Add a dedicated backfill helper

Do not overload the generic attendance create route for missing-row backfills.

Why:

- the current generic create route is clock-in oriented and defaults `timeIn` when it is omitted
- backfill needs explicit provenance so audit and review flows can distinguish it from a correction
- the backfill path must support both worked and non-worked statuses without pretending every row is a clock-in

The backfill helper should reuse the same downstream refresh pipeline as correction:

- attendance-obligation refresh
- timesheet refresh
- cache invalidation

But it should not supersede an existing same-day row, because backfill only applies when no same-day row exists.

### Phase 3: Add regression tests before or with the refactor

Meaningful change in this workflow should include meaningful tests.

Minimum coverage:

- direct HR correction creates a new correction row
- approval-side correction creates the same kind of correction row
- non-work statuses clear the worked-window fields
- worked-day corrections require valid time input
- same-day attendance is required
- prior effective row(s) are superseded
- obligation and timesheet refreshes still happen
- cache invalidation still happens

### Phase 4: Validate and sync truth

After implementation:

- validate the app and API gates
- update WWG docs if the confirmed behavior differs from current docs
- record any new durable rule in the proper truth surface

## Recommended Execution Order

If we implement this item next, the safest order is:

1. Apply the provisional engineering policy as the product decision baseline.
2. Build the dedicated HR backfill helper.
3. Keep the shared correction helper for same-day replacements.
4. Route the direct endpoint and approval-side effect path through the same correction helper.
5. Update the app route so one `Fix Attendance` front door can choose between backfill, correction, and locked exception.
6. Add regression tests for all three outcomes and the downstream read-model refreshes.
7. Validate and update WWG truth/doc surfaces if needed.

## Real-World Setup Recommendation

This is the ideal operating model for a real attendance team, and it is now the provisional implementation policy until an owner overrides it.

The business problem should be split into three cases:

- `Missing attendance`: no row exists for the date. This is a backfill/create case, not a correction.
- `Wrong attendance`: a row exists, but the status, window, or reason is wrong. This is a correction.
- `Closed payroll period`: the day is already payroll-locked or paid. This should route to a controlled exception flow, not a silent edit.

Recommended policy:

1. Do not force users to create a row first and then correct it.
2. Keep employees in a request/report flow instead of a direct ledger-edit flow.
3. Let HR handle the actual ledger change.
4. Make the audit trail show whether the result was a backfill or a correction.
5. If the period is locked, stop the edit and route it to `TIME_ADJUSTMENT`.

## Simple App Design

The simplest user-facing design is one HR action that adapts to the data:

- Add a single primary button on the HR attendance screen: `Fix Attendance`.
- If a row exists for the day, open the modal in `Correct attendance` mode.
- If no row exists, open the same modal in `Create missing attendance` mode.
- Use the same core fields in both modes: employee, date, status, times, reason, and notes.
- Change the helper text and final label based on mode:
  - `Correction` when replacing an existing row
  - `Backfill` when creating the first row for that day
- If the day is locked, do not submit a direct write. Instead open the `TIME_ADJUSTMENT` request flow with a locked-period banner.
- Keep employees in a `Report attendance issue` or request flow so they can ask for help without changing records directly.
- Keep approvers on the existing request-review path.

This gives the business one simple front door while still preserving the different backend meanings.

## Suggested Rollout Plan

If the team wants to move toward that ideal setup later, a safe sequence is:

1. Implement the provisional policy above as the baseline behavior.
2. Keep the direct HR and approval-side correction paths separate but backed by the same helper.
3. Add regression tests for the existing-row correction path, the missing-row backfill path, and the locked-period exception path.
4. Update docs, terminology, and workflow guidance after the behavior is confirmed.

## Pass 2 Implementation Status

Observed in `hris-api`:

- `app/attendance/attendance-correction.service.ts` centralizes correction status classification, time-window normalization, the reason-category allowlist, and the shared mutation path.
- `zod/attendance.zod.ts` now uses the shared normalizer and the schema-backed reason-category list.
- `app/attendance/attendance.controller.ts` routes the direct HR correction write through `applyAttendanceCorrection`.
- `app/request/request.controller.ts` routes the approval-side `ATTENDANCE_CORRECTION` side effect through `applyAttendanceCorrection` with `allowDerivedStatus: true`.
- `tests/attendance-correction.service.spec.ts` covers worked, incomplete, and non-worked branches, notes fallback, reason-category validation, and schema acceptance of the incomplete branch.
- A stubbed runtime smoke of `applyAttendanceCorrection` confirms the shared mutation path reaches supersession, obligation refresh, timesheet refresh, and cache invalidation hooks.

Still pending for later passes:

- broader API regression validation beyond the dedicated attendance correction spec

## Non-Goals

This plan does not include:

- redesigning the attendance UI
- collapsing direct correction and approval correction into one user journey
- changing payroll history storage
- introducing a new attendance model
- changing the broader requests workflow unless it is required by the correction flow

## Recommendations

1. Keep the direct HR correction and request-approval correction entry points separate.
2. Add the dedicated backfill helper instead of overloading the generic create route.
3. Route payroll-locked days to `TIME_ADJUSTMENT` rather than a silent direct write.
4. Add regression tests around the backfill and correction helpers before the refactor lands.
5. Preserve same-day replacement semantics for corrections and first-write semantics for backfills.

## Remaining Decisions

The owner decisions for the correction contract are now replaced by the provisional engineering policy above.

Open item:

- `../docs/attendance-timesheet-payroll-tally-prd.md` is confirmed permanently unrecoverable as of 2026-06-26 (never committed to either repo's git history, per `git log --all --diff-filter=A/D` and `git fsck --unreachable` in both `hris-app` and `hris-api`). The HR Attendance/Timesheet/Payroll source-of-truth terms it was cited for have been re-grounded directly against Prisma schemas and service code in `../hris-api/.wwg/wiki/terminology.md` and `project-truth.md`; treat those files, not this provisional policy alone, as the live reference going forward.

## Open Risks

- This is a high-risk workflow because it touches live attendance truth and downstream payroll-adjacent read models.
- The PRD is permanently unrecoverable, so owner-confirmed policy beyond what is re-grounded in `../hris-api/.wwg/wiki/terminology.md`/`project-truth.md` is still incomplete; payroll lock/reopen/correction policy in particular remains an open question requiring explicit sign-off rather than inference.
- If the direct endpoint and approval path are refactored independently, they can drift again.
- If the app becomes the source of business-rule truth, future correction behavior will be harder to govern.

## Validation Targets For The Future Implementation

When the implementation phase begins, the regression target should include:

- direct correction flow coverage
- approval-side correction flow coverage
- worked vs non-worked correction cases
- same-day enforcement
- supersession of prior effective rows
- obligation refresh verification
- timesheet refresh verification
- cache invalidation verification
- API error-shape verification
