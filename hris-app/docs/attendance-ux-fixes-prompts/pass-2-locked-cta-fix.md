# Pass 2 of 6 — Fix Issue 1 (P0): Locked-State CTA Does Nothing

```txt
You are executing pass 2 of 6 for attendance-ux-fixes.

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
<PASTE PASS 1's RETURNED STATE PACKET HERE>

PASS GOAL
Remove the locked-state CTA in AttendanceFixModal.tsx that currently claims
to "Create Time Adjustment Request" but only closes the modal
(onOpenChange(false)). Replace it with accurate static guidance text. Do
NOT wire this button to any request-creation flow — confirmed in this
chain's plan (00-chain-plan.md) that HR-initiated TIME_ADJUSTMENT request
creation does not exist anywhere in the stack (request.controller.ts
forces requesterId to the caller's own employee ID; targetEmployeeId is
allow-listed to PAN_REQUEST_TYPES only, which excludes TIME_ADJUSTMENT).
Building that capability is explicitly out of scope for this chain.

LIKELY FILES
- app/components/organisms/hr/AttendanceFixModal.tsx (the isLocked branch,
  around line 275-289)
- app/components/organisms/hr/AttendanceFixModal.test.tsx (create if it
  does not exist)
- tests/smoke/hr-attendance-timesheet-end-user.spec.ts (check if any
  assertion references the old button text; update if so)

ACCEPTANCE CRITERIA
- The locked-state view (isLocked === true) no longer renders a button
  that performs no action.
- Replace it with static text accurately describing: this date is
  payroll-locked, direct edits are disabled, and the employee must file a
  Time Adjustment request themselves (self-service, not HR-initiated).
- Keep the existing "Payroll Locked" heading/icon treatment — this is a
  copy/structure fix, not a redesign of the locked state's visual style.
- No new interactive element should imply an action HR cannot actually
  take from this modal.
- Add or update a component test asserting: when isLocked is true, no
  button with the old "Create Time Adjustment Request" label is rendered,
  and the new guidance text is present.

VALIDATION
- npm run test -- app/components/organisms/hr/AttendanceFixModal.test.tsx
- npm run test:e2e:smoke -- tests/smoke/hr-attendance-timesheet-end-user.spec.ts
- npm run typecheck:test

STOP CONDITIONS
- Stop if you find any existing code path elsewhere in the app that DOES
  support HR creating a TIME_ADJUSTMENT request for another employee —
  re-verify against request.controller.ts before assuming the plan's
  finding still holds, and report instead of guessing.
- Stop before any change to ../hris-api.
- Stop if Project Truth conflicts with the requested change.

HANDOFF
Return an updated compact state packet. List the exact diff made to
AttendanceFixModal.tsx (old text/button removed, new text added). Report
test results by command and pass/fail. Set next.pass_goal to Pass 3's
goal from docs/attendance-ux-fixes-prompts/pass-3-fix-attendance-discoverability.md.
```
