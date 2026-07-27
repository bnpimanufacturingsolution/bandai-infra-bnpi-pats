# Chain Plan: HR Attendance/Timesheet UX Fixes

Status: READY TO EXECUTE
Created: 2026-06-28
Chain name: `attendance-ux-fixes`
Repo scope: APP only (`hris-app`) — confirmed no `hris-api` changes required
Risk level: LOW-MEDIUM (UI-only; one item explicitly defers a higher-risk capability to a separate ticket)
Total passes: 6

## Source

Senior UX review of the HR attendance/timesheet flow (current branch:
`attendance-absence-sick-leave-conversion`), grounded in:
- `app/components/organisms/hr/AttendanceFixModal.tsx`
- `app/components/templates/common/attendance-management-template.tsx`
- `app/components/organisms/TimesheetViewModal.tsx`
- `app/components/molecules/TimesheetDayTooltipContent.tsx`
- `app/services/timesheet.service.ts`
- `tests/smoke/hr-attendance-timesheet-end-user.spec.ts`
- `../hris-api/app/request/request.controller.ts` (read-only — confirmed
  authorization boundary, no API change needed)
- `../hris-api/app/timesheet/approved-overtime-comp-leave.service.ts`
  (read-only — confirmed metadata shape, no API change needed)

Two items that looked like open questions were resolved by reading the code
directly, not assumed:

1. **HR cannot create a `TIME_ADJUSTMENT` request on behalf of an employee
   today.** `request.controller.ts:1261-1264` always forces `requesterId` to
   the caller's own employee ID; the one escape hatch (`targetEmployeeId`) is
   allow-listed to `PAN_REQUEST_TYPES` only, which excludes
   `TIME_ADJUSTMENT`. Building that capability is a separate
   API-authorization feature, not part of this fix — Pass 6 logs it as a
   recommendation, it is explicitly **out of scope** for this chain.
2. **The comp-leave-credit metadata is written on every timesheet approval,
   even with zero overtime.** A banner gated only on `creditApplied === false`
   would add noise to every ordinary timesheet. The correct condition,
   derivable from fields the app already has typed in
   `TimesheetCompensatoryLeaveCredit` (`app/services/timesheet.service.ts:44-57`),
   is `credit.lineCount > 0 && credit.creditApplied === false`. No backend
   change needed.

## Final Implementation Plan (5 issues, app-only)

| # | Issue | File(s) | Priority |
|---|---|---|---|
| 1 | Locked-state CTA ("Create Time Adjustment Request") only closes the modal | `AttendanceFixModal.tsx` | P0 |
| 2 | "Fix Attendance" hidden behind a 2-item overflow menu | `attendance-management-template.tsx` | P1 |
| 3 | Day status split across 4 cards + a disconnected `INCOMPLETE` checkbox | `AttendanceFixModal.tsx` | P2 |
| 4 | Comp-leave credit is silent when overtime existed but credit wasn't applied | `TimesheetViewModal.tsx`, `app/services/timesheet.service.ts` (types only, already correct) | P2 |
| 5 | Overtime approval/employee notes are tooltip-only, no persistent cue | `TimesheetDayTooltipContent.tsx` | P3 |
| 6 | Inconsistent backfill/correction title and CTA copy | `AttendanceFixModal.tsx` | P3 |

Explicitly **not** in this chain: building HR-initiated `TIME_ADJUSTMENT`
request creation (needs API authorization work + sign-off — log as a
recommendation in Pass 6, do not implement).

## Pass Breakdown

| Pass | Goal | Files | Why split here |
|---|---|---|---|
| 1 | Verify repo state matches this plan's assumptions before touching anything | read-only | Catch drift if other work landed on this branch since the review |
| 2 | Fix Issue 1 (P0) — remove the dead-end CTA | `AttendanceFixModal.tsx` | Isolated, highest severity, smallest diff — ship alone |
| 3 | Fix Issue 2 (P1) — promote Fix Attendance out of the overflow menu | `attendance-management-template.tsx`, smoke spec locator | Different file/component than Pass 2 and 4; independent risk surface (table actions, not the modal) |
| 4 | Fix Issues 3 + 6 (P2/P3) — status control consolidation + CTA copy | `AttendanceFixModal.tsx` | Same file as Pass 2; sequenced after so Pass 2's diff lands cleanly first and is easy to review in isolation |
| 5 | Fix Issues 4 + 5 (P2/P3) — comp-leave skip banner + overtime note indicator | `TimesheetViewModal.tsx`, `TimesheetDayTooltipContent.tsx` | Distinct component tree (timesheet view, not attendance fix) — independent of Passes 2-4 |
| 6 | Validation, truth sync, recommendation registry, final handoff | `.wwg/workspace/current-task.md`, `.wwg/governance/recommendation-registry.md` (if it exists), `output/reports/` | Standard WWG close-out gate |

## Validation Plan

- Pass 2: `npm run test -- app/components/organisms/hr/AttendanceFixModal.test.tsx` (create if absent) + `npm run test:e2e:smoke -- tests/smoke/hr-attendance-timesheet-end-user.spec.ts`
- Pass 3: `npm run test:e2e:smoke -- tests/smoke/hr-attendance-timesheet-end-user.spec.ts` (locator change) + relevant `attendance-management-template.test.tsx` if it exists
- Pass 4: `npm run test -- app/routes/hr/time-corrections.test.ts app/components/organisms/hr/AttendanceFixModal.test.tsx`
- Pass 5: `npm run test -- app/components/organisms/TimesheetViewModal.test.tsx app/components/molecules/TimesheetDayTooltipContent.test.tsx` (create if absent) + update smoke assertions in `hr-attendance-timesheet-end-user.spec.ts` for the "skipped" banner case
- Pass 6: `npm run quality:ci` (full deployable gate), `npx @homedesk/wwg validate` if WWG context changed materially

## Stop Conditions (apply to every pass)

- Stop if Project Truth conflicts with the requested change.
- Stop before production/shared data mutation, deployment, credential changes, deletion, or irreversible operations.
- Stop if a pass discovers the locked-state CTA, comp-leave metadata shape, or request-authorization boundary has changed since this plan was written — re-verify against current code before proceeding, do not trust this doc blindly.
- Do not implement HR-initiated `TIME_ADJUSTMENT` request creation in this chain under any circumstance — it requires a separate API authorization change and explicit owner sign-off.

## Files In This Chain

- `00-chain-plan.md` — this file
- `pass-1-discovery.md`
- `pass-2-locked-cta-fix.md`
- `pass-3-fix-attendance-discoverability.md`
- `pass-4-status-control-and-copy.md`
- `pass-5-comp-leave-and-overtime-reason.md`
- `pass-6-validation-and-closeout.md`

Each pass file is self-contained per `.wwg/workspace/prompts/chain-pass-template.md`.
Run them in order, in a single continuous chat, pasting each pass's prompt and
carrying forward the state packet it returns into the next pass's `INPUT STATE`.
