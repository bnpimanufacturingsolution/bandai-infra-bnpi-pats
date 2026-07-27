# Pass 5 of 6 — Fix Issues 4 + 5 (P2/P3): Comp-Leave Skip Banner + Overtime Note Indicator

```txt
You are executing pass 5 of 6 for attendance-ux-fixes.

GLOBAL CONTRACT
- Follow Agents.md and .wwg/workspace/AGENTS.md.
- Use .wwg/governance/development-operating-model.md.
- Use .wwg/workspace/context/task-context-index.md to choose context.
- Use .wwg/workspace/context/chain-state-template.md for handoff state.
- Do not commit task-specific prompt-chain scratch artifacts.

TASK SLICE
- Context slice: HR timesheet view modal, overtime day tooltip
- Repo scope: APP
- Risk level: LOW

INPUT STATE
<PASTE PASS 4's RETURNED STATE PACKET HERE>

PASS GOAL
Two fixes in a different component tree than Passes 2-4 (timesheet view,
not the attendance fix modal):

1. (Issue 4) TimesheetViewModal.tsx's getCompensatoryLeaveCredit
   (line 78-101) returns null whenever creditApplied is false, so the
   "Compensatory Leave Credited" banner (line 1312-1343 in approval mode,
   1517-1545 in normal mode) never renders anything when overtime existed
   but credit wasn't applied. CONFIRMED in this chain's discovery: the
   API writes this metadata on every approval including zero-overtime
   timesheets (lineCount: 0), so a banner gated only on
   creditApplied === false would add noise to every ordinary timesheet.
   The correct condition is: show a "not credited" message only when
   credit.lineCount > 0 AND credit.creditApplied === false. When
   credit.skipReason === "NO_COMPENSATORY_LEAVE_POLICY" is present, show
   that specific reason; otherwise show a generic message (e.g. "Approved
   overtime this period did not result in additional credited leave.").
   All fields needed (lineCount, creditApplied, skipReason) already exist
   on TimesheetCompensatoryLeaveCredit in app/services/timesheet.service.ts
   (line 44-57) — no API or type change needed.

2. (Issue 5) TimesheetDayTooltipContent.tsx's approver/employee notes
   (line 404-427) are visible only on hover of the day cell that triggers
   the tooltip (the +OT badge in TimesheetViewModal/TimesheetDayCell).
   Add a small persistent visual cue (e.g. a subtle dot/icon on the day
   cell, not inside the tooltip) when a day has approverNotes or
   employeeNotes, so existence of a reason is visible without hovering.
   Locate where TimesheetDayCell renders badges (search for the "+OT"
   badge wiring in TimesheetViewModal.tsx around line 1653-1697) and add
   a comparable badge/indicator for "has notes," reusing the existing
   badge pattern rather than inventing a new visual language.

LIKELY FILES
- app/components/organisms/TimesheetViewModal.tsx (getCompensatoryLeaveCredit
  line 78-101; both banner render blocks line 1312-1343 and 1517-1545;
  badge-building logic near line 1653-1697)
- app/components/molecules/TimesheetDayTooltipContent.tsx (read-only
  reference for note field names — approverNotes/employeeNotes)
- app/services/timesheet.service.ts (read-only — confirm types already
  support this; do not change unless a genuinely missing field is found)
- app/components/organisms/TimesheetViewModal.test.tsx (create if absent)
- tests/smoke/hr-attendance-timesheet-end-user.spec.ts (the test "HR
  manager does not see the compensatory leave banner when creditApplied
  is false" at the bottom currently asserts
  toHaveCount(0) for "Compensatory Leave Credited" — this fixture
  (approvedTimesheetWithoutCredit) has lineCount: 1 from the base fixture,
  so under the new logic it SHOULD now show the "not credited" message
  instead of nothing; update this assertion, do not just keep it green by
  accident)

ACCEPTANCE CRITERIA
- A timesheet with overtime (lineCount > 0) and creditApplied: false
  shows a distinct, visible message — specific text when skipReason is
  present, generic text otherwise.
- A timesheet with zero overtime (lineCount: 0) shows nothing — verify
  this does NOT regress into showing the new message on ordinary
  timesheets (add a test fixture/case for this exact scenario if one
  doesn't already exist).
- Overtime day cells with approverNotes or employeeNotes show a
  persistent visual cue distinct from cells without notes; tooltip
  hover behavior is unchanged.
- Update the existing smoke assertion for the "creditApplied: false"
  fixture to match the new expected message instead of pure absence.

VALIDATION
- npm run test -- app/components/organisms/TimesheetViewModal.test.tsx
- npm run test:e2e:smoke -- tests/smoke/hr-attendance-timesheet-end-user.spec.ts
- npm run typecheck:test

STOP CONDITIONS
- Stop if you find compensatoryLeaveCredit is NOT written for
  zero-overtime timesheets after all (i.e. the discovery finding doesn't
  hold) — re-verify against
  ../hris-api/app/timesheet/approved-overtime-comp-leave.service.ts
  before implementing the lineCount > 0 gate, since the whole point of
  that gate is avoiding noise on the zero-overtime case.
- Stop before any change to ../hris-api.
- Stop if Project Truth conflicts with the requested change.

HANDOFF
Return an updated compact state packet. List the exact logic added for
the comp-leave gate and the new note indicator. Report test results by
command and pass/fail, including the updated smoke assertion. Set
next.pass_goal to Pass 6's goal from
docs/attendance-ux-fixes-prompts/pass-6-validation-and-closeout.md.
```
