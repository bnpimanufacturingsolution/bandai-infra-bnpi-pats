# Pass 4 of 6 — Fix Issues 3 + 6 (P2/P3): Status Control Consolidation + CTA Copy

```txt
You are executing pass 4 of 6 for attendance-ux-fixes.

GLOBAL CONTRACT
- Follow Agents.md and .wwg/workspace/AGENTS.md.
- Use .wwg/governance/development-operating-model.md.
- Use .wwg/workspace/context/task-context-index.md to choose context.
- Use .wwg/workspace/context/chain-state-template.md for handoff state.
- Do not commit task-specific prompt-chain scratch artifacts.

TASK SLICE
- Context slice: HR attendance correction modal
- Repo scope: APP
- Risk level: LOW

INPUT STATE
<PASTE PASS 3's RETURNED STATE PACKET HERE>

PASS GOAL
Two presentation-only fixes inside AttendanceFixModal.tsx, same file as
Pass 2 but sequenced after it so each diff is reviewable in isolation:

1. (Issue 3) The "Corrected Status" control (around line 294-334)
   represents one decision (day status) as four equal-weight cards
   (Work Day/Leave/Absent/Rest Day) plus a disconnected checkbox for
   INCOMPLETE that silently overwrites form.status. Make INCOMPLETE a
   fifth full-weight option in the same grid, OR a clearly nested toggle
   visually attached to the "Work Day" card (e.g. a segmented control
   inside that card) — do not leave it as a separate checkbox floating
   below the grid.
2. (Issue 6) Standardize title/CTA copy between backfill and correction
   modes. Currently: title "Create Missing Attendance" / button "Create
   Missing Record" (backfill) vs title "Correct Attendance" / button
   "Apply Correction" (correction) (line 232-233, 438). Use a shared
   title format, e.g. "Fix Attendance — Create Missing Record" / "Fix
   Attendance — Correct Attendance", with mode-specific but structurally
   parallel button verbs.

Do NOT change validateCorrectionForm, statusUsesWorkedWindow, or any
payload/state logic in app/routes/hr/time-corrections.ts — this pass is
presentation only.

LIKELY FILES
- app/components/organisms/hr/AttendanceFixModal.tsx (status grid block
  line 294-334; title/description line 232-235; submit button text line
  438)
- app/components/organisms/hr/AttendanceFixModal.test.tsx (from Pass 2;
  extend it)
- app/routes/hr/time-corrections.test.ts (verify still passes unchanged —
  do not edit unless a title-text assertion needs updating)
- tests/smoke/hr-attendance-timesheet-end-user.spec.ts (it asserts exact
  text "Correct Attendance" and "Create Missing Attendance" at lines
  ~1374 and ~1391 — update to match new titles)

ACCEPTANCE CRITERIA
- All five day statuses (PRESENT, LEAVE, ABSENT, REST_DAY, INCOMPLETE)
  are represented with consistent visual weight/treatment — no status is
  set via a control visually disconnected from the others.
- Selecting INCOMPLETE still results in form.status === "INCOMPLETE" and
  disables Time Out per the existing statusUsesWorkedWindow contract —
  verify this behavior is unchanged, only its presentation moved.
- Modal titles for both modes follow one shared naming pattern.
- Submit button copy remains mode-specific but structurally parallel.
- Add a component test asserting INCOMPLETE is visually distinguishable
  from PRESENT (e.g. by checking which element has the "selected"
  styling/aria-pressed state) rather than only checking the checkbox.
- Update the two exact-text assertions in
  tests/smoke/hr-attendance-timesheet-end-user.spec.ts to match the new
  titles.

VALIDATION
- npm run test -- app/components/organisms/hr/AttendanceFixModal.test.tsx app/routes/hr/time-corrections.test.ts
- npm run test:e2e:smoke -- tests/smoke/hr-attendance-timesheet-end-user.spec.ts
- npm run typecheck:test

STOP CONDITIONS
- Stop if changing INCOMPLETE's presentation would require changing
  validateCorrectionForm's contract — that would mean this isn't
  presentation-only, and the plan needs revision before proceeding.
- Stop if Project Truth conflicts with the requested change.

HANDOFF
Return an updated compact state packet. List the exact before/after for
both the status-control markup and the title/button copy. Report test
results by command and pass/fail. Set next.pass_goal to Pass 5's goal
from docs/attendance-ux-fixes-prompts/pass-5-comp-leave-and-overtime-reason.md.
```
