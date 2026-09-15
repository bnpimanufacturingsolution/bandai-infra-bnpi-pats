# Line Leader Assign Overtime (Checkbox Screen) — Operator Doc

Status: `CONFIRMED_LIVE_LOCAL` (2026-09-08, local DEV: app `:5175/:5176` → API `:3001` → K3s Postgres `127.0.0.1:55435`)

This page documents the line-leader overtime journey: the checkbox "Assign
Overtime" screen, early OT support, the approval chain, and the approval
refusal policy. Companion page: `docs/LINE_LEADER_ACCOUNT.md` (the leader
login account).

---

## 1. Where to find it

Sidebar → **My Team → Assign Overtime** (`/employee/team?tab=overtime`).
Visible for manager-class roles; content only fills for `bnpi-pats-line-leader`
users who lead at least one section.

Screen layout (checkbox model — no per-person request modal):

```text
[ Overtime date (defaults to today, Manila) ] [ Overtime type ▼ ] [ Reason (applies to all) ]
┌──────────────────────────────────────────────────────────────────────┐
│ ☐  Member name (employee code · position)      [Hours]   [Minutes]   │
│ ☑  Danica Ebreo (00062 · Operator)             [ 1 ]     [ 30 ]      │
│ ☐  ... (all active members of your led sections)                     │
└──────────────────────────────────────────────────────────────────────┘
                                     [ Assign OT (N) ]
```

- **Tick** the members who worked overtime; ticking enables that row's
  Hours/Minutes inputs (defaults 2:00).
- **Overtime type** applies to the whole submission:
  - **Regular OT (after shift)** — default
  - **Early OT (before shift)** — pre-shift overtime
- One shared **date** and **reason**; each ticked member gets their **own**
  request so approvals and audit stay per-person.
- Submit shows an honest per-row result: "Filed X, failed Y" with the first
  failure reason. A failed member can be retried alone.

## 2. What happens after submit (wiring)

```text
Leader ticks members -> POST /api/request (one per member)
  requesterId      = the LEADER (stays the filer)
  targetEmployeeId = the MEMBER (on-behalf)
  metadata.employeeId = the MEMBER   <- OT lands here, never on the leader
  metadata.overtimeKind = REGULAR | EARLY
  requestSource = LINE_LEADER_FILED
        |
        v
Workflow WF-OVERTIME-LEADER-FILED (2026-09-08 operator decision: manager is
the FINAL approver — no HR step):
  1 Leader Submission  (auto-completed at filing, state SUBMITTED)
  2 Manager Approval   (the MEMBER's dept manager; FINAL approver)
  3 Overtime Completion (SYSTEM task, auto-completes -> COMPLETED)
        |
        v
Approval side effect writes to the MEMBER's effective Timesheetline:
  overtimeHours = requested duration
  metadata.overtimeKind / earlyOvertime  (early OT tag for payroll mapping)
```

Order of writes in the side effect (matters): attendance policy apply →
timesheet materialize/refresh (unfrozen timesheets only) → re-read the target
line → **payable-OT stamp last**. This prevents the line refresh from erasing
the approval stamp on manual (non-attendance-linked) OT.

Self-filed OT (For whom = Myself) uses the normal `WF-OVERTIME-DEFAULT`
HR-direct chain — same side effect, same kind tagging.

## 3. Approval refusal policy (no silent no-ops)

**Policy:** an OT approval that cannot write payable hours to an effective
**non-frozen** timesheet line is **refused with a clear 409 before any workflow
state changes**. The request stays exactly where it was (SUBMITTED), and the
approver sees:

```text
Cannot approve overtime: no effective timesheet line exists for <CODE> on the
overtime date. Materialize or approve the timesheet covering that date first,
then approve this request.
```

Why: manual leader/HR OT has no pre-selected timesheet line. If the member has
no active (non-APPROVED) timesheet covering the date, approval would complete
silently while the hours go nowhere. Refusing makes the fix actionable:
materialize/prepare the timesheet, then re-approve.

- **Frozen timesheets are never targets.** The shared line resolver excludes
  APPROVED/SUBMITTED timesheets in every lookup path (explicit line id,
  employee+date, materialization). The business-day window spans two calendar
  dates (Manila offset), so without this filter an approval could silently
  overwrite the neighboring day's OT on a frozen timesheet (a data-loss bug
  found and fixed by live proof on 2026-09-08: line 00633/07-25 had 1:28 from
  DM4, was overwritten to 1:00, restored, and the resolver hardened).
- Rejections skip the pre-check (nothing needs writing for a reject).
- If a side effect still fails after approval, the request metadata is stamped
  with `overtimeApplyError` + `overtimeApplyErrorAt` so the failure is visible.
- Dates inside an **APPROVED** timesheet are frozen — refusal is expected
  (never un-approve payroll-ready truth to make an OT fit).

## 4. Approver notes

- **The leader cannot approve** their own filing (self-approval guard, 403).
- **2026-09-08 operator decision: manager is the final approver.** The leader
  files; the member's department manager approves; done — no HR step for OT.
  (Leader-filed TIMESHEET / ATTENDANCE_CORRECTION chains still include HR.)
- The manager step resolves via `TARGET_DEPARTMENT_MANAGER` from the member's
  department/reportTo — proven live: TESTBEN003 → EMP3334, member 00633 →
  their Production manager (arvin@bandai.com.ph).
- **`admin@bandai.local` cannot approve workflow steps** — the admin user has
  no linked employee, so the workflow cannot resolve an acting employee.
- The member list comes from `GET /api/section/led-members` (sections the
  signed-in employee leads). The backend re-validates leader scope on every
  submit; out-of-scope targets are refused 403.

## 5. Testing summary (2026-09-08)

- Backend unit: `tests/overtime-approval-target-line.spec.ts` 6/6 (target
  resolution order, materialize fallback, refusal-null case, explicit lineId,
  frozen-timesheet exclusion); regression suites: line-leader-workflow 8/8
  (3-step OT chain pinned), overtime-approval 4/4, overtime-workflow 3/3,
  section-leader-scope 15/15, section.controller 66/66 — **102 passing**.
- Frontend unit: payload builder vitest 11/11 (on-behalf + EARLY/REGULAR kind).
- Browser E2E: `tests/smoke/line-leader-ot-checkbox-screen.spec.ts` — sidebar
  link, 515 members, 2 ticked, 2× POST 201 on `WF-OVERTIME-LEADER-FILED`.
- **Full-chain live proof (manager-final, no HR):** leader filed for member
  00633 (2026-07-26, 1:00 REGULAR) → 3-step chain (no HR step) → the member's
  Production manager approved → request **COMPLETED** → member's DRAFT line
  now `overtimeHours=1:00`, `overtimeApprovalStatus=APPROVED`,
  `overtimeKind=REGULAR`, request id stamped. Frozen neighbor line untouched
  (1:28 preserved).
- **Data-loss bug found and fixed by live proof:** the pre-fix resolver could
  pick the neighboring business-day line from an APPROVED (frozen) timesheet
  and overwrite its OT (00633/07-25: 1:28 → 1:00). Fixed with a frozen-sheet
  exclusion in every resolver lookup + stamp-last write ordering; the damaged
  line was restored to 1:28 from its own DM4 snapshot.
- **Live refusal proof:** HR approval of an OT with no effective line → **409**
  with the refusal message; request state unchanged (SUBMITTED).
- Historical happy-path proof: 2026-08-19 Zen journey — HR approval wrote
  `timesheetline.overtimeHours` (2:50 / 170 min) via this same side effect.
- All test requests cancelled after proof.

## 6. Boundaries

- **Pay rate:** early OT pays the same OT rate as regular OT today; the kind is
  metadata for reporting/mapping. A separate multiplier needs an operator rule.
- **PROD/UAT:** schema + code are local-DEV until pushed; VM promotion rides
  the next `develop` push.

## 7. Evidence

- `.runtime/line-leader-ot-on-behalf-proof/` (SUMMARY, FULL-CHAIN-PROOF,
  checkbox E2E proof + screenshot)
- `.runtime/line-leader-account-check-20260908-092132/` (account + wiring)
- `.wwg/reports/section-line-leader-assignment-20260907.md` (feature origin)
