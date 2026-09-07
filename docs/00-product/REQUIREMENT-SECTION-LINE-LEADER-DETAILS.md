# Requirement: Section Line Leader — Detailed Requirements (operator input)

- Status: `CONFIRMED — READY FOR BUILD PLAN` (2026-09-07; one nuance flagged in Open Item 4)
- Owner: Operator (BNPI)
- Branch: `feature/section-line-leader-requirements` (safety branch — no deploys until merged to `develop`)
- Base feature: Section line leader assignment shipped 2026-09-07 (`section_line_leaders` M:N join, role derivation, `/admin/configuration/sections` UI, VM-promoted to dev/uat/prod). See `.wwg/reports/section-line-leader-assignment-20260907.md`.

## Operator inputs (verbatim intent)

**#1 (2026-09-07):**
> "Line leader is under the section, then his under is the employee on production.
> Line leader should be the one responsible for the OT application, early OT,
> timesheet adjustment and other of the employee."

**#2 (2026-09-07):**
> "Line leader to manager to HR. All other request the line leader can do it,
> must go to approval."

**#3 (2026-09-07, answering the 5 open items):**
> "1, line leader can also do it, 2. goes to the normal process, 3. yes what
> they suppose to see, 4, yes but 1 person can be only under 1 line leader,
> 5. yes please"

## CONFIRMED MODEL (agent synthesis of inputs #1 + #2)

**Hierarchy:**
```
Section
  └── Line Leader(s)                    ← assigned to section (BUILT ✅)
        └── Production employees of that section
```

**The line leader is the INITIATOR/HANDLER, not an approver, of their people's
requests:**

1. **Who:** the line leader files requests **on behalf of** the production
   employees of the section(s) they lead. Scope: own sections only — never
   people in other sections/departments.
2. **What (types):** ALL request types — the leader can file everything the
   system supports for their people, explicitly including:
   - `OVERTIME` — OT application, including **early OT** (filed in advance,
     before the overtime is worked)
   - `TIMESHEET` / `ATTENDANCE_CORRECTION` — timesheet adjustments
     (wrong/missing punches, hours corrections)
   - All other request types (leave, schedule change, etc.)
3. **Approval is mandatory:** nothing the leader files takes effect directly.
   Every request goes through the approval chain:

   ```
   LINE LEADER (files for the employee)
        ↓
   MANAGER (approves)
        ↓
   HR (approves)
   ```

   The leader does **not** approve their own filings. No direct timesheet
   editing by the leader — corrections happen via approved requests.
4. **Section scoping:** the leader can only select/act on employees whose
   membership is in the leader's section(s) (via `section_line_leaders`).
5. Existing grounded machinery: request types `OVERTIME`, `TIMESHEET`,
   `ATTENDANCE_CORRECTION`, etc. already exist (`RequestType` enum); the
   approval engine already routes by role incl. `hris-line-leader`
   (`request.controller.ts` approver sets). This requirement wires the leader
   as **initiator with section-scoped employee selection**, and manager→HR as
   approvers.

## Implementation shaping (agent notes, not yet built)

- Filing UI: a "file request for my people" path where the employee picker is
  restricted to the leader's section members (server-enforced, not just UI).
- Request records should carry the on-behalf-of employee + the filing leader.
- Workflow: requests created by a leader enter the chain at the manager step.
- Server-side authorization is the boundary: section membership checked on
  every request create/view, never trusted from the client.

## OPEN ITEMS — RESOLVED by operator input #3

1. **Day labor tagging** — **YES, line leader can also do it.** The leader tags
   Direct/Indirect per day on timesheets for their own section's people
   (closes `REC-20260907-DAY-LABOR-LEADER-SECTION-SCOPING` intent). Note for
   build: today tagging is an unrestricted field on the timesheet day editor
   (`Timesheetline.dayLaborType`); the build adds section-scoped permission
   for leaders and keeps existing HR/manager/admin ability.
2. **Employee-initiated requests** — **normal process unchanged.** When an
   employee files their own request, it follows the existing flow (no new
   line-leader step inserted).
3. **Leader visibility** — **yes, what they're supposed to see:** their
   section's people and the requests concerning them (their people's
   attendance/timesheets where relevant, and the requests filed for their
   people with status). Exact screen list = agent proposes in build plan.
4. **Two-section employee** — **yes, either leader may file for them, BUT a
   person can be under only ONE line leader.** ⚠️ CONFLICT FLAGGED (agent):
   today's data model allows both (a) one section with MULTIPLE leaders
   (operator's earlier option B) and (b) an employee in many sections each
   with leaders. Input #4b adds a new rule: **each production employee has at
   most one responsible line leader.** Agent interpretation for build: at
   request-filing time, if the employee's section(s) have multiple leaders,
   ANY of those leaders may file (the rule binds employees-to-a-single-
   *responsible-leader*, not the section's leader count). NEEDS_OPERATOR_READ
   at build plan review — if the intent is stricter (one leader per SECTION,
   i.e. revisiting option B, or one leader per EMPLOYEE enforced in the
   schema), say so and the model changes accordingly.
5. **Leader removed mid-request** — **yes:** pending requests continue up the
   chain (manager → HR); removal of the leader does not cancel or reassign
   in-flight requests.

---

## Detailed section answers (as confirmed)

## 1. Summary

**Confirmed:** The line leader is the first-level supervisor of a section's
production employees. They handle ALL work requests for their people — OT
(including early/advance OT), timesheet adjustments, and every other request
type — but everything they file must be approved upward: manager, then HR.

## 2. What a Line Leader can do (permissions)

**Confirmed:**
- File ALL request types for their section's employees ✅
- Early OT = OT filed in advance ✅ (agent interpretation, unchallenged)
- NO direct timesheet editing — corrections only via requests ✅
- NO self-approval — manager then HR must approve ✅

## 3. What a Line Leader can see (visibility)

**Confirmed (input #3.3 — "what they're supposed to see"):** their section's
people and the requests concerning them — attendance/timesheets of their
section members, the requests filed for their people with status, and the
filing UI. Exact screens proposed in the build plan for sign-off.

## 4. Assignment rules

- One person can lead many sections ✅ (built)
- One section can have multiple leaders ✅ (built — operator's option B)
- **New rule from input #3.4 (nuance — see Open Item 4):** each production
  employee has at most ONE responsible line leader.
- Open (minor): who assigns/removes leaders — admin only / HR too? (Today:
  admin configuration surface.)

## 5. Day labor tagging

**Confirmed (input #3.1):** line leader tags Direct/Indirect per day for their
own section's people; existing HR/manager/admin tagging ability retained.

## 6. Notifications & approvals

**Confirmed:** leader-filed requests route manager → HR (notifications to
approver steps). Employee-initiated requests keep the normal process (no new
leader step). Leader removal mid-request does not disturb in-flight requests.

## 7. Reporting / payroll

- LLA money stays enrollment-driven via benefits (no change) — assumed.
- Leader-facing visibility covered in section 3 / build plan.

## 8. Employee self-service / employee app

**Confirmed:** employee-initiated requests keep the normal process. (Any
emp-app filing UI for leaders is out of scope unless requested.)

## 9. Edge cases & boundaries

- Leader never acts on people outside their sections — CONFIRMED scope guard (server-enforced).
- Removing a leader revokes powers immediately ✅ (built — role re-derivation).
- Leader who is also manager/HR keeps the stronger role ✅ (built).
- In-flight requests survive leader removal ✅ (confirmed input #3.5).
- Employee-under-one-leader rule: see Open Item 4 nuance (flagged for build-plan review).

## 10. Screenshots / sketches / examples

- None provided. Agent will propose leader screen list in the build plan.

---

## Agent-use note (do not delete)

When the operator fills this in, the agent must:
1. Read the whole file before planning.
2. Confirm understanding back in operator language before code changes.
3. Classify changes (schema/API/UI/behavior) and mark anything that contradicts
   Project Truth or touches high-risk areas (auth, payroll, permissions) for
   explicit approval before implementation.
4. Record accepted answers into Project Truth/terminology/handoff per the
   close-out rules, and note anything not built as recommendations.
