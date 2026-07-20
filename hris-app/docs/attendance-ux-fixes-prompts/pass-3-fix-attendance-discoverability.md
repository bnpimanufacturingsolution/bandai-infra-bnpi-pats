# Pass 3 of 6 — Fix Issue 2 (P1): "Fix Attendance" Hidden Behind Overflow Menu

```txt
You are executing pass 3 of 6 for attendance-ux-fixes.

GLOBAL CONTRACT
- Follow Agents.md and .wwg/workspace/AGENTS.md.
- Use .wwg/governance/development-operating-model.md.
- Use .wwg/workspace/context/task-context-index.md to choose context.
- Use .wwg/workspace/context/chain-state-template.md for handoff state.
- Do not commit task-specific prompt-chain scratch artifacts.

TASK SLICE
- Context slice: HR attendance management table row actions
- Repo scope: APP
- Risk level: LOW

INPUT STATE
<PASTE PASS 2's RETURNED STATE PACKET HERE>

PASS GOAL
Promote "Fix Attendance" from inside the row-level DropdownMenu (triggered
by an unlabeled MoreVertical "⋮" icon) to a directly visible icon button
on each attendance table row, in
app/components/templates/common/attendance-management-template.tsx. There
are two near-identical DropdownMenu instances doing this (around line
2766-2796 and 3338-3355) — fix both consistently. Keep "View Details" as a
secondary action (it is a legitimate, distinct read-only inspection view
that itself contains its own "Fix Attendance" button as a funnel — do not
remove or merge it).

LIKELY FILES
- app/components/templates/common/attendance-management-template.tsx
  (both DropdownMenu blocks; search for setSelectedRecord and
  openFixAttendance)
- tests/smoke/hr-attendance-timesheet-end-user.spec.ts (the
  openAttendanceFixModal helper currently does:
  row.getByRole("button", { name: "Attendance actions" }).click() then
  page.getByRole("menuitem", { name: "Fix Attendance" }).click() — this
  needs to change to a direct button locator)
- any attendance-management-template.test.tsx if it exists (check first)

ACCEPTANCE CRITERIA
- "Fix Attendance" is reachable with one click directly from the table
  row (e.g. a pencil/edit icon button with an accessible name like "Fix
  attendance for {employeeName}" or similar — do not ship an icon with no
  accessible name).
- "View Details" remains available as a secondary action — either as a
  smaller icon button alongside, or kept in a reduced one-item menu. Pick
  whichever fits the existing row-action layout with the least visual
  disruption; do not redesign the whole row.
- Both DropdownMenu instances (the two locations found in discovery) are
  updated consistently — do not fix only one and leave the other stale.
- Update tests/smoke/hr-attendance-timesheet-end-user.spec.ts's
  openAttendanceFixModal helper to use the new direct-button locator
  instead of opening a menu first.
- No change to openFixAttendance's behavior or payload — this is a
  placement/accessibility fix only.

VALIDATION
- npm run test:e2e:smoke -- tests/smoke/hr-attendance-timesheet-end-user.spec.ts
- npm run test -- app/components/templates/common/attendance-management-template.test.tsx
  (if it exists; skip if no such file and note that in the handoff)
- npm run typecheck:test

STOP CONDITIONS
- Stop if the two DropdownMenu instances have diverged in structure more
  than expected (e.g. different action sets) — report the difference
  instead of forcing them into an identical shape.
- Stop if Project Truth conflicts with the requested change.

HANDOFF
Return an updated compact state packet. List both locations changed in
attendance-management-template.tsx and the smoke spec locator change.
Report test results by command and pass/fail. Set next.pass_goal to Pass
4's goal from docs/attendance-ux-fixes-prompts/pass-4-status-control-and-copy.md.
```
