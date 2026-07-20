# Pass 1 of 6 — Discovery / State Verification

```txt
You are executing pass 1 of 6 for attendance-ux-fixes.

GLOBAL CONTRACT
- Follow Agents.md and .wwg/workspace/AGENTS.md.
- Use .wwg/governance/development-operating-model.md.
- Use .wwg/workspace/context/task-context-index.md to choose context.
- Use .wwg/workspace/context/chain-state-template.md for handoff state.
- Do not commit task-specific prompt-chain scratch artifacts.

TASK SLICE
- Context slice: HR attendance correction / timesheet view UI
- Repo scope: APP (hris-app only — no API changes in this chain)
- Risk level: LOW

INPUT STATE
(none — this is the first pass)

PASS GOAL
Verify the repo state still matches the assumptions in
docs/attendance-ux-fixes-prompts/00-chain-plan.md before any pass touches
code. This plan was written against the branch
attendance-absence-sick-leave-conversion. Confirm nothing has drifted.

LIKELY FILES (read-only this pass)
- app/components/organisms/hr/AttendanceFixModal.tsx
- app/components/templates/common/attendance-management-template.tsx
- app/components/organisms/TimesheetViewModal.tsx
- app/components/molecules/TimesheetDayTooltipContent.tsx
- app/services/timesheet.service.ts
- tests/smoke/hr-attendance-timesheet-end-user.spec.ts
- docs/attendance-ux-fixes-prompts/00-chain-plan.md

ACCEPTANCE CRITERIA
- Confirm the locked-state CTA in AttendanceFixModal.tsx (around line
  284-289) still only calls onOpenChange(false) and has not already been
  fixed or changed.
- Confirm the DropdownMenu in attendance-management-template.tsx (around
  line 2766-2796 and 3338-3355) still gates "Fix Attendance" behind a
  MoreVertical overflow trigger.
- Confirm the status card grid + INCOMPLETE checkbox in
  AttendanceFixModal.tsx (around line 294-334) is unchanged.
- Confirm TimesheetCompensatoryLeaveCredit in app/services/timesheet.service.ts
  (around line 44-57) still has the shape: totalMinutes, totalDays,
  deltaMinutes, deltaDays, lineCount, creditApplied?, skipReason?
  ("NO_COMPENSATORY_LEAVE_POLICY" only).
- Confirm TimesheetViewModal.tsx's compensatory leave banner (around line
  1312-1343 and 1517-1545) still renders nothing when getCompensatoryLeaveCredit
  returns null (i.e. when creditApplied is false).
- Run `git status` and `git diff --stat` to confirm no unrelated uncommitted
  work exists in these files that this chain would clobber.
- If anything has drifted from these assumptions, stop and report the
  drift instead of proceeding to Pass 2 — do not silently adapt the plan.

VALIDATION
- git status
- git log --oneline -5
- Read-only file inspection of the files above (no test run needed this pass)

STOP CONDITIONS
- Stop if any of the five code assumptions above no longer hold.
- Stop if unrelated uncommitted changes exist in the target files.
- Stop if Project Truth conflicts with the requested change.

HANDOFF
Return an updated compact state packet (chain-state-template.md format)
confirming each assumption as VERIFIED or DRIFTED (with what changed). If
all VERIFIED, set next.pass_goal to Pass 2's goal from
docs/attendance-ux-fixes-prompts/pass-2-locked-cta-fix.md.
```
