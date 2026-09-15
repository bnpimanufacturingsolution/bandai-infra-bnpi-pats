# Line Leader Timesheet Adjustment (Operator Doc)

Status: `CONFIRMED_CODE_AND_LIVE_LOCAL` (verified 2026-09-09 against local DEV:
K3s Postgres forward `127.0.0.1:55435`, API `http://localhost:3001`, app
`http://localhost:5175`)

The line leader can file a **timesheet adjustment** (attendance correction —
fix a member's clock-in / clock-out) for the people under them. The **section
manager of the member is the final approver**, exactly like the OT / early-OT
filing pattern (2026-09-09 operator direction: "the adjusted need to approve by
the section manager like how the ot and early ot being filed"). There is **no
HR step** on the leader-filed chain.

---

## 1. Where to find it

- Log in as the line leader (`leader@bandai.local` / `password123` in DEV).
- Sidebar: **My Requests** (`/employee/requests`) → **New Request** →
  **Attendance Request**.
- In the modal, Request type = **Attendance adjustment**.
- With the leader role, a **"For whom"** picker appears (Myself + the active
  members of the sections they lead, from `GET /api/section/led-members`).
- Pick a member, set the correction (Clock in / Clock out / Clock in and clock
  out + times + reason), and submit.

The modal shows an **Approval flow panel on the right side** — the approval
tasks laid out **before** anything executes:

```text
Leader-filed (member picked):
  1. Leader submission          — you file for <member>.
  2. Member's manager approval  — their section manager approves or rejects (final).
  3. Applied to their attendance — on approval the correction is applied to the
                                   member's attendance.

Self-filed (Myself picked / plain employees):
  1. Your submission  2. Manager approval  3. HR review  4. Applied to your attendance
```

Nothing is applied until every approval step above is done.

## 2. What happens after submit (wiring)

```text
POST /api/request  (requesterId = LEADER, targetEmployeeId = MEMBER)
  |- scope guard: canActAsLineLeaderForEmployee  (leader must lead the member's section)
  |- workflow: WF-ATTENDANCE-CORRECTION-LEADER-FILED  (3 steps, manager-final)
  |    1. Leader Submission (REQUESTER)
  |    2. Manager Approval (TARGET_DEPARTMENT_MANAGER, state_on_approve = APPROVED)
  |    3. Attendance Correction Completion (SYSTEM)
  |- approval list: the MEMBER's manager sees the request in
  |    My Approvals (sidebar badge + /employee/approvals/requests + dashboard
  |    Pending Approvals card) via GET /api/request?approvalActorId=<manager>
  v
on manager approve -> APPROVED -> SYSTEM completion task auto-runs
applyAttendanceCorrectionRequest (employeeId resolves
targetEmployeeId -> requesterId -> metadata.attendanceCorrection.employeeId)
  -> the correction/backfill lands on the MEMBER's attendance, never the leader's
```

Chain shape (2026-09-09): mirrors `WF-OVERTIME-LEADER-FILED` — leader files,
member's manager approves (final), no HR step. The self-service chain
`WF-ATTENDANCE-CORRECTION-DEFAULT` (employee → supervisor → HR review) is
unchanged. `WF-TIMESHEET-LEADER-FILED` (timesheet submission/edit-permission
surface) is unchanged (manager → HR).

## 3. Approver notes

- Only the assigned manager decides the manager step — HR override does **not**
  apply to `TARGET_DEPARTMENT_MANAGER` steps (403 by design, same as OT).
- The leader can never approve their own filing (self-approval is refused).
- The manager's queue badge and the Pending Approvals dashboard card count the
  leader-filed adjustment like any other approval task.

## 4. Testing summary (2026-09-09)

- Backend: `bnpi-pats-api/tests/line-leader-workflow.spec.ts` (pins the 3-step
  manager-final chain, no HR step), `section-leader-scope.spec.ts`,
  `overtime-approval-target-line.spec.ts`, `overtime-workflow.spec.ts`,
  `workflow-config.helper.spec.ts` — **53 passing**.
- Frontend: `bnpi-pats-app/app/lib/utils/attendance-adjustment-request.test.ts`
  (on-behalf adjustment payload: requester = leader, targetEmployeeId = member,
  `requestSource=LINE_LEADER_FILED`, `workflowTarget=MANAGER_FINAL`),
  `bnpi-pats-app/app/components/modals/AttendanceAdjustmentRequestModal.test.tsx`
  (For-whom on the adjustment branch, right-panel chains) — **26 passing**.
- Live API E2E: leader `TESTBEN004` filed for member `00062` (Danica Ebreo)
  → chain created (3 steps, manager step assigned to `00021`) → manager
  approved → member's attendance backfilled PRESENT 08:00–17:00 Manila on the
  corrected date → side effect wrote to the member, leader untouched. Test
  attendance row deleted afterwards; the completed request remains as marked
  evidence (`REQ-1786424090647`).
- Browser E2E:
  `bnpi-pats-app/tests/smoke/line-leader-timesheet-adjustment.spec.ts` (PASSED) —
  For-whom picker on the adjustment branch, right-panel member chain, POST 201
  with leader-filed payload (`REQ-1786424090648`, cancelled after proof).

## 5. Boundaries (do not assume)

- The **scope guard is server-enforced**: a leader can only file for members of
  the sections they lead (or members explicitly assigned to them). HR/admin can
  file for anyone.
- The manager approval step **resolves from the member** (department/reportTo),
  not from the leader.
- Attendance corrections are **money-adjacent** (time in/out feeds payroll);
  approval is a real write — the right panel is shown precisely so the filer
  sees the chain before executing.
- Bulk checkbox screen (like Assign Overtime) does not exist for adjustments;
  adjustments are per-person/per-day with times, so the requests-hub modal is
  the filing surface. If the operator wants a My Team "Adjust Timesheet" tab
  later, it would be a new task.
- Dual-app parity: **HR-only exception** — no `bnpi-pats-emp-app` counterpart for
  the requests hub modal (consistent with the 2026-09-08 line-leader exception).

## 6. Evidence

- `.runtime/leader-timesheet-adjustment-20260909-154503/` (API E2E + workflow
  truth + approvals list + cleanup)
- `.runtime/leader-timesheet-adjustment-browser-proof/` (Playwright proof.json
  + screenshots)
