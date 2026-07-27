# Handoff Prompt — Post-Payroll Timesheet Correction → Next Period Apply

**Copy everything below the line into a new agent session** (or run from monorepo root with this file as the task contract).  
Meta-prompt base: `agent-meta-prompt-template-v2.md` (v2.0 — Intent-Traceable Phase Planner + Chain Builder + Loop-Engineered Execution).

**Origin:** Audit of locked payroll timesheet edit behavior (2026-07-15). Confirmed: payroll-locked timesheets hard-block employee edit/edit-permission; leave/time-adjustment surface `adjustment_required` only; **next-period auto-apply does not exist**. Product decision: apply valid post-lock corrections as **explicit retro deltas on the next open payroll**, never by rewriting the locked period.

---

```text
# 0. TASK CONTRACT

## Phase / Task Name

Post-payroll timesheet correction → durable PayrollCorrection → next-period payroll apply + full UI (employee → approval → payslip visibility)

## Execution Mode

Selected mode: `PLAN_AND_APPLY`

Binding notes:
- Do not stop after planning documents unless a real blocker prevents safe implementation.
- This is a large multi-package feature. Use the **Recommended Chain** (Section below) if a single session cannot complete all slices. Prefer one **vertical slice end-to-end** over incomplete surface sprawl.
- High-risk areas (payroll money, schema, auth/workflows): architecture gate before coding; stop if product policy is still ambiguous on listed decision points.

## Goal

Implement a product path so that when a payroll period has already been generated and the employee timesheet is payroll-locked, a valid employee correction is:
1. Filed as a governed **payroll correction request** (not timesheet edit-permission).
2. Approved through workflow.
3. Materialized as a durable **PayrollCorrection** (or equivalent) in `READY` state.
4. Automatically included when the **next open payroll period** is generated.
5. Visible on employee/HR UI end-to-end: locked timesheet → request → approval → scheduled → applied on next payslip as an explicit retro line — without rewriting Period A paid snapshot or stuffing prior-period hours into Period B timesheet day cells.

## Intended Outcome

User-observable definition of done (MVP vertical slice):

1. Employee opens a **payroll-locked** timesheet and sees a clear “processed in payroll” state; **cannot** edit days or use edit-permission for that sheet.
2. Employee can **Request payroll correction**, select days, propose Time In/Time Out (minutes derived), submit reason.
3. Manager (and HR if configured) can approve/reject in Approvals / request review UI.
4. On approve, correction is **READY for next payroll** (not applied to locked timesheet source).
5. Generating payroll for the **next** period includes the correction as an **explicit payslip/register line** with source-period linkage.
6. Employee sees the retro line on **My Payroll / payslip**, and the source timesheet shows **Applied** with payslip link.
7. Period A `EmployeePayroll.timesheetSnapshot` and timesheet lock remain immutable.
8. Automated tests prove lock immutability, approval side effects, next-period include, and no double-apply.
9. WWG project-truth / terminology updated to close the previous “next-payroll auto-apply out of scope” open question with the **accepted** policy.

## Repositories / Working Directories

* Monorepo root: `BANDAI` (workspace path as checked out)
* `hris-api` — backend SOT (schema, requests, payroll generate, correction ledger)
* `hris-emp-app` — employee timesheets, requests, approvals, payroll/payslip UX
* `hris-app` — HR/admin payroll generate readiness + approval surfaces if they own those screens (only if current product routes live there; prefer existing ownership)

## In Scope

### Backend (`hris-api`)
* Durable correction domain model (new Prisma model preferred) + migration (Postgres + Mongo schema parity if both maintained)
* Request type / workflow for payroll correction (reuse `Request` + `RequestWorkflow` + step execution; seed default workflow)
* APIs: create/list/get correction request; approve/reject via existing request pipeline; list READY items for a target period; mark APPLIED on generate
* Payroll generation integration: include READY corrections for employees in period; write payslip/register amounts; idempotent apply
* Hard guarantees: payroll-locked timesheet still rejects edit/update/submit/edit-permission; paid snapshot immutable
* Replace “dead end” messaging with guided correction path where appropriate
* Unit/integration tests for reconciliation, lock, apply, double-apply prevention
* WWG truth + docs updates

### Employee UI (`hris-emp-app`)
* Locked timesheet list/modal UX (processed chip, banner, hide edit-permission primary CTA when payroll-locked)
* Correction request modal (day select → before/after → submit)
* My Requests tracking + detail
* Approvals review (paid vs proposed vs delta)
* Notifications hooks if existing notification patterns allow without new infra
* My Payroll / payslip: Retro / prior-period section + links
* Source timesheet post-apply status strip

### HR / Admin UI (only where payroll generate & readiness already live)
* “Ready corrections to include” on payroll period generate / readiness
* Generation report inclusion counts
* Optional HR correction queue

### Documentation
* PRD/plan note under `hris-api/docs/`
* WWG accepted truth for policy
* This handoff remains the contract; update only if implementation truth diverges (mark CONFLICTING)

## Out of Scope

* Reopening / rewriting locked timesheet lines as the pay mechanism
* Injecting prior-period hours into next-period timesheet day cells as if worked then
* Silent auto-apply without approval
* Full tax/statutory redesign beyond treating retro earnings under **existing** next-period gross/contribution rules (document assumption)
* Off-cycle / immediate payment outside next payroll (Phase 2+)
* Negative delta recovery policy automation beyond a documented stub / NEEDS_CONFIRMATION path (see Decision Points)
* Mobile-native apps beyond existing web responsive behavior
* Unrelated payroll benefit schedule work, migration quality, or attendance biometric changes
* Production deploy, push, or non-draft PR unless later authorized
* Destructive DB reset

## Non-Negotiable Requirements

* `R1` — **Immutability:** After payroll generation locks a timesheet (`lockedAt` / `PAYROLL_PERIOD_LOCK` / linked employee payroll snapshot), the paid Period A timesheet source and `EmployeePayroll.timesheetSnapshot` MUST NOT be rewritten by employee edits, edit-permission, or correction approval.
* `R2` — **Employee path:** For payroll-locked timesheets, employee primary action is **Request payroll correction** (not Request edit permission). Edit-permission and direct breakdown edit remain blocked with clear UX + API 409.
* `R3` — **Durable ledger:** Approved corrections persist in a first-class durable record (not only `Request.metadata`), with statuses at least: `REQUESTED` | `APPROVED`/`READY` | `APPLIED` | `REJECTED` | `VOID` (names may match existing enum style).
* `R4` — **Approval required:** Money/hours move only after workflow approval (manager minimum; HR second step if org workflow configured).
* `R5` — **Delta-based:** Payable amount is a **delta** vs paid snapshot (or explicit proposed hours × rate rules), not a full re-run of Period A payroll as mutation of A.
* `R6` — **Next-period apply:** On `generatePayrollFromTimesheets` (or equivalent) for the next open period, all `READY` corrections for in-scope employees are included idempotently and marked `APPLIED` with `appliedPayrollPeriodId` / `appliedEmployeePayrollId`.
* `R7` — **Payslip visibility:** Applied corrections appear as **explicit separate lines** (e.g. “Retro OT (Jun 1–15 correction)”) with source period + request id metadata — not silent merge into basic pay only without label.
* `R8` — **Period B timesheet purity:** Period B timesheet day grid remains only Period B attendance; corrections are payroll/payslip (and optional banner), not fake B days.
* `R9` — **Traceability:** Every applied line links: employee, source period, source timesheet/payroll, request id, day-level delta summary, approver trail.
* `R10` — **No double pay:** Re-generate / resume payroll must not double-apply the same correction.
* `R11` — **UI end-to-end states:** Employee can observe: pending → approved/scheduled → applied (with payslip link) or rejected (with reason).
* `R12` — **Tests:** Automated coverage for R1, R3–R6, R10 at minimum; UI smoke or component tests where package patterns exist.
* `R13` — **WWG:** Update `hris-api/.wwg/wiki/project-truth.md` and `terminology.md` (and summaries if present) so next-payroll correction policy is ACCEPTED_TRUTH; refresh `current-task.md`; include WWG Auto-Sync close report.
* `R14` — **Backward compatible:** Existing unlocked edit-permission / submit flows for non-locked timesheets keep working.

## Constraints / Invariants

* Binding SOT split (`hris-api` AGENTS / WWG):  
  - `AttendanceObligation` = live/current ops  
  - `Attendance` = biometric/raw/effective ledger  
  - `Timesheetline` / timesheet snapshot = submitted/approved/payroll-ready  
  - `EmployeePayroll.timesheetSnapshot` = paid history  
  - **NEW:** PayrollCorrection ledger = post-lock payable delta for future periods  
* Do not mix SOT layers.
* Tenant/org scoping on all queries; employee may only correct own locked timesheets; approvers per workflow.
* Prefer reusing existing request workflow engine (`Request`, `RequestWorkflow`, `RequestStepExecution`) over a parallel approval system.
* Prefer additive schema + migrate; no destructive reset.
* Payroll math must use existing rate helpers where possible; do not invent tax engines.
* Follow package `AGENTS.md` + monorepo `Agents.md` + mandatory WWG auto-sync skill for any meaningful edits under packages with `.wwg/`.
* Preserve unrelated dirty worktree changes; do not stash/reset foreign work.

## Authorization Matrix

| Action | Authorization |
| --- | --- |
| Read repository and run non-mutating discovery | Allowed |
| Modify source files (`hris-api`, `hris-emp-app`, `hris-app` as needed) | Allowed |
| Modify tests | Allowed |
| Modify documentation under `hris-api/docs/**` and package READMEs if needed | Allowed |
| Modify `.wwg/**` | Allowed — `UPDATE_ACCEPTED_TRUTH_AUTHORIZED` for `hris-api` (and package-local WWG if UI contracts need recording) |
| Modify runtime evidence such as `.vorter/**` | Prohibited unless already used by package and non-secret |
| Add or upgrade dependencies | Allowed only if necessary; prefer zero new deps; justify in handoff |
| Change schemas or migrations | Allowed (additive, backward compatible) |
| Perform destructive data reset | Prohibited |
| Use network or external services | Allowed for local package scripts/tests only; no production API calls |
| Create external side effects (email to real users, SaaS writes) | Prohibited |
| Commit | Prohibited unless user later elevates |
| Push | Prohibited |
| Open pull request | Prohibited |
| Tag, publish, deploy, or release | Prohibited |

Anything not explicitly allowed remains unauthorized if it creates a meaningful mutation or external side effect.

## Data / Compatibility Strategy

Selected strategy: `PRESERVE_AND_MIGRATE` + `BACKWARD_COMPATIBLE_CHANGE`

* Additive tables/columns only.
* Existing locked timesheets and paid payrolls remain valid.
* New request type must not break existing request lists (filter-friendly).
* Feature-flag optional if org-level config pattern already exists (`TimesheetConfig` or payroll config); if no clean flag pattern, ship enabled with safe defaults and document.

## WWG Truth-Write Mode

Selected mode: `UPDATE_ACCEPTED_TRUTH_AUTHORIZED`

Must update (hris-api):
* `.wwg/wiki/project-truth.md` — close open question on next-payroll auto-apply; record accepted correction policy
* `.wwg/wiki/terminology.md` — PayrollCorrection / retro apply terms
* summaries if present and drifted
* `.wwg/workspace/current-task.md` — start + close
* Drift/governance only if policy text requires

Do not invent finance policy beyond what this contract states; mark residual finance edge cases `NEEDS_CONFIRMATION`.

## Sub-Agent Policy

Selected policy: `ALLOWED_WHEN_USEFUL`

Maximum concurrent agents: `3`

Recommended roles:
* Discovery / architecture (schema + payroll generate touchpoints)
* Implementation (API vs UI can split after contract stable)
* Independent acceptance review (read-only) before claiming done

Do not parallelize conflicting schema migrations.

## Git / Delivery Authorization

Selected level: `NO_GIT_WRITES`

Leave a clean handoff of files changed; user will commit. Do not push or open PR.

## Expected Outputs

* Code changes (api + emp-app + hr-app if required)
* UI changes (states listed in UI Spec)
* API or contract changes
* Database/schema changes + migration notes
* Tests and regression coverage
* Documentation updates (`hris-api/docs/…`)
* WWG accepted-truth update
* Intent Compliance Table
* Handoff and next-phase recommendation
* Architecture decision notes inside plan (or short ADR in docs if schema choice is non-obvious)

## Required Validation

* `hris-api`: relevant unit/integration tests for correction service, request side effects, payroll generate include/idempotency; at least targeted suite(s) green
* `hris-api`: typecheck or package equivalent if routinely used
* `hris-emp-app`: typecheck/lint or existing test command for touched modules if available
* Manual walkthrough script documented (even if not executed in CI): lock → request → approve → generate next → payslip line
* Confirm R1 still holds: attempts to edit locked timesheet still 409
* WWG close report in final response

## Completion Evidence

The goal is proven only when:

* Intent Compliance Table shows every R1–R14 with evidence (or explicit deferred residual with owner reason — only for true Phase-2 items listed in Out of Scope / Decision Points)
* Tests prove no rewrite of locked snapshot + next-period apply + no double-apply
* UI path exists for employee request and payslip visibility (screens or code paths reviewed)
* WWG truth no longer says “next-payroll auto-apply out of scope” without replacement accepted policy
* Handoff lists residual risks honestly (tax, negative delta, termination final pay)

## Decision Points (resolve in Architecture Gate; stop if blocked)

If product owner is unavailable, implement the **Default** and label as `IMPLEMENTED_DEFAULT_PENDING_OWNER_CONFIRMATION` in WWG:

| ID | Question | Default for MVP |
| --- | --- | --- |
| D1 | Delta unit | Hours types (regular/OT/ND/late/absent) stored; money computed at next generate with then-current rate helpers from source period rates if stored on snapshot, else employee current rate with audit note |
| D2 | Approval chain | Manager only via default workflow seed; HR optional second step if org configures workflow |
| D3 | Negative deltas | Allow store + approve but **do not auto-apply** negative net in MVP; status `APPROVED_HOLD` or require HR-only path — document |
| D4 | Target period selection | Implicit: next open (non-COMPLETED/CLOSED) period for employee pay frequency after approval; pin `targetPayrollPeriodId` at generate time if null |
| D5 | Interaction with existing `adjustment_required` on leave/TIME_ADJUSTMENT | Leave metadata as-is; new path is explicit PAYROLL_CORRECTION; optional later bridge |
| D6 | Payslip field mapping | Prefer dedicated correction lines in payroll metadata/breakdown JSON + register-friendly label; reuse `adjustmentOtNd` only if no better extension without schema fight — prefer explicit `payrollCorrections[]` on snapshot/metadata |
| D7 | Request type name | `PAYROLL_CORRECTION` (or `TIMESHEET_PAYROLL_CORRECTION` if collision) |

---

# 1–2. OPERATING PRINCIPLES & TRUTH PRECEDENCE

Follow `agent-meta-prompt-template-v2.md` sections 1–2 in full.

Project-specific truth hierarchy for this task:
1. This Task Contract
2. `hris-api/.wwg/wiki/project-truth.md` + `terminology.md` (update when policy accepted)
3. `hris-api`/`hris-emp-app`/`hris-app` `AGENTS.md` + monorepo `Agents.md`
4. Existing code behavior for locks and payroll generate
5. Prior audit findings in this conversation / this handoff “Current-State Baseline”

Known baseline facts (CONFIRMED from code audit — re-verify on discovery):

* Payroll generate sets `Timesheet.lockedAt`, `lockReason: PAYROLL_PERIOD_LOCK`, `lockedEmployeePayrollId` (`helper/payroll-period.helper.ts`).
* `findTimesheetLock` + 409 `TIMESHEET_LOCKED` on update/submit/edit-permission (`app/timesheet/timesheet.controller.ts`).
* Mutable refresh only for `DRAFT|REVISED|REJECTED`; else `TIMESHEET_SNAPSHOT_LOCKED` (`helper/timesheet.helper.ts`).
* Leave / TIME_ADJUSTMENT → `adjustment_required` metadata only; **no** next-period apply (`time-adjustment-reconciliation.service.ts`, project-truth open question).
* Edit-permission PRD covers workflow lock, **not** payroll lock money path (`docs/TIMESHEET_EDIT_PERMISSION_WORKFLOW_PRD.md`).

---

# 3. DISCOVERY FIRST (mandatory before plan)

Complete template §3 checklists, then specifically:

### Must-read files
* `hris-api/.wwg/wiki/project-truth.md`, `terminology.md`, `project-truth-summary.md` if present
* `hris-api/.wwg/workspace/current-task.md`, `governance/drift-guard.md`
* `hris-api/helper/payroll-period.helper.ts` — generate + lock
* `hris-api/app/timesheet/timesheet.controller.ts` — lock guards, edit permission
* `hris-api/app/request/request.controller.ts` — approval side effects pattern
* `hris-api/app/request/time-adjustment-reconciliation.service.ts`
* `hris-api/prisma/schema-postgres/timesheet.prisma`, `employeepayroll.prisma`, request schemas
* `hris-api/prisma/seeds/requestWorkflowCatalog.ts`
* `hris-api/docs/REQUEST_WORKFLOW_GUIDE.md`, `TIMESHEET_EDIT_PERMISSION_WORKFLOW_PRD.md`
* `hris-emp-app/app/components/organisms/TimesheetViewModal.tsx`
* `hris-emp-app/app/components/employee-timesheets-dashboard.tsx`
* `hris-emp-app/app/routes/payroll.tsx`, requests routes/templates
* `hris-api/app/employeepayroll/employeepayroll.controller.ts` — paid snapshot lock

### Produce Current-State Report before coding
Instructions applied, WWG status, existing state, dirty worktree triage, risk tier (**High** — payroll money).

---

# 4. REQUIREMENT AND INTENT LEDGER

Maintain an Intent Ledger mapping user intent → R1–R14 → evidence.

### Assumption Ledger (initial)

| ID | Assumption | Status |
| --- | --- | --- |
| A1 | “Payroll period already ran and locked” ≡ timesheet `lockedAt` set via payroll generate (and/or paid payroll linkage as implemented by `findTimesheetLock`) | Re-verify |
| A2 | Next period = next open period for same employee pay frequency | Default D4 |
| A3 | Employee app is primary UX; HR app only if generate UI lives there | Re-verify routes |
| A4 | Workflow engine can host a new request type with seed | Re-verify catalog |
| A5 | Payslip UI can render extra earning lines from payroll metadata/API | Re-verify emp payroll template |

Do not silently drop requirements. If scope must shrink, stop and list which R# cannot be met.

---

# 5. EXECUTION-MODE GATE

Mode is `PLAN_AND_APPLY`. Not a no-op: product gap is confirmed.

If discovery finds an existing full correction ledger already applying to next period, switch to gap-fill only and document.

---

# 6. PLAN AND ARCHITECTURE GATES

## 6.1 Required plan format

### Objective
Post-lock corrections pay on next open payroll as explicit retro lines with full UI lifecycle, without mutating paid Period A truth.

### Affected Areas (expected — adjust after discovery)

| Area / path | Repository | Planned change | Requirement IDs |
| --- | --- | --- | --- |
| Prisma PayrollCorrection (+ lines) | hris-api | New model + migrate | R3,R5,R9 |
| Request type + workflow seed | hris-api | PAYROLL_CORRECTION | R2,R4 |
| Correction service + controller/router | hris-api | CRUD + apply hooks | R3–R6,R10 |
| request.controller side effects | hris-api | On approve → READY | R4,R3 |
| payroll-period.helper generate | hris-api | Include + mark APPLIED | R6,R7,R10 |
| timesheet.controller messaging | hris-api | Guide to correction | R2 |
| TimesheetViewModal + dashboard | hris-emp-app | Locked UX + CTA | R2,R11 |
| Correction request modal | hris-emp-app | Create flow | R2,R5,R11 |
| Requests + Approvals UI | hris-emp-app | Track + review | R4,R11 |
| Payroll/payslip template | hris-emp-app | Retro lines | R7,R8,R11 |
| Payroll generate readiness | hris-app or emp | Include list | R6 |
| tests | hris-api | Lock/apply/idempotency | R12 |
| WWG wiki | hris-api | Accepted policy | R13 |

### Passes (bounded loops)

**Pass 0 — Discovery + architecture gate**  
Output: Current-State Report, ADR-style decision (model shape, money calc, workflow code), PLAN_ACCEPTED.

**Pass 1 — Schema + domain service (API only)**  
Model, statuses, create draft/request, approve→READY, list by employee/period. Tests for state machine.

**Pass 2 — Request workflow integration**  
Seed workflow; wire approval side effects; reject path; permissions.

**Pass 3 — Payroll generate apply**  
Include READY; write payslip lines/metadata; mark APPLIED; idempotency tests; lock regression tests.

**Pass 4 — Employee UI**  
Locked banner/CTA; request modal; requests list; approval review; scheduled/applied states.

**Pass 5 — Payslip + HR readiness UI**  
Retro section; generate readiness; source timesheet applied strip.

**Pass 6 — Validation, repair, WWG, handoff**  
Full Intent Compliance Table; independent review if available.

### Validation Matrix (minimum)

| Requirement ID | Check | Evidence type |
| --- | --- | --- |
| R1 | Edit/submit/edit-permission on locked timesheet still 409; snapshot unchanged after correction approve | test + code |
| R3–R5 | Correction row + day deltas persisted; not only request metadata | test |
| R6,R10 | Generate next period applies once; second generate no double count | test |
| R7 | Payslip/API payload contains labeled retro line + source period | test or API assertion |
| R2,R11 | UI code paths for CTA and states exist | code review + optional manual script |
| R13 | WWG files updated | file diff |
| R14 | Existing edit-permission tests still pass | test |

### Acceptance Criteria (observable)

1. Given locked timesheet A, employee cannot edit; can file correction.
2. Given approval, correction is READY; A snapshot unchanged.
3. When period B generates, employee payslip B shows labeled retro line; correction APPLIED.
4. Re-running generate does not duplicate amount.
5. Period B timesheet days do not show A’s hours as B attendance.

## 6.2 Architecture Decision Gate (must complete before Pass 1 code)

Decide and record:

1. **Model name & fields** (recommended):

```text
PayrollCorrection
  id, organizationId, employeeId
  sourcePayrollPeriodId, sourceTimesheetId, sourceEmployeePayrollId?
  targetPayrollPeriodId?
  requestId?
  status: REQUESTED | APPROVED | READY | APPLIED | REJECTED | VOID | APPROVED_HOLD?
  reason, requestedAt, approvedAt, approvedBy, rejectedAt, rejectionReason
  appliedAt, appliedEmployeePayrollId?
  estimatedAmount?, appliedAmount?
  dayDeltas: Json or child PayrollCorrectionLine[]
    date, field/hoursType, before, after, deltaMinutes, notes
  metadata Json
  audit timestamps, isDeleted
```

2. **Money computation timing:** approve-time estimate vs generate-time final (recommend generate-time final + store both).
3. **Where amounts land on EmployeePayroll** (metadata.corrections[] + gross components — specify exact fields).
4. **Workflow code** `WF-PAYROLL-CORRECTION-DEFAULT`.
5. **API routes** (REST style consistent with repo), e.g.:
   - `POST /api/payroll-correction` or via `/api/request` with type
   - Prefer **via Request create** for workflow consistency, plus read APIs for READY-by-period
6. **AuthZ matrix** for create/approve/list.

Declare `PLAN_ACCEPTED` | `PLAN_REVISED` | `PLAN_BLOCKED`.

---

# 7. SPECIALIST SUB-AGENT ORCHESTRATION

Use when useful. Lead agent owns Intent Ledger and final verdicts. Independent acceptance reviewer is read-only and may not expand scope.

---

# 8. EXECUTE IN BOUNDED LOOPS

For each Pass N:
* Objective, Requirement IDs, Actions, Immediate Verification, Decision (continue / repair / stop)

### Repair Loop
On failure: smallest complete fix; re-run failed checks; do not weaken R#.

---

# 9. IMPLEMENTATION RULES

* Smallest **complete coherent** vertical slice > partial UI without backend apply (or vice versa). MVP must include **apply on generate** or it is not done.
* Match existing code style, logging, error response helpers (`buildErrorResponse`, etc.).
* No drive-by refactors.
* Feature must degrade safely if workflow seed missing (clear 409 like edit-permission).
* Internationalization: follow existing string patterns (likely inline English).

---

# 10. VALIDATION AND EVIDENCE GATES

Risk tier: **High** (payroll).

Minimums:
* Targeted automated tests for money path and immutability
* Explicit manual test script in handoff
* No claim of production readiness

Record Validation Record table per template §10.3.

---

# 11. WWG AND DOCUMENTATION RECONCILIATION

Truth-write mode: UPDATE_ACCEPTED_TRUTH_AUTHORIZED.

Must change project-truth open question:

> Confirm owner sign-off on … deferred next-payroll auto-apply …

Into accepted policy:

> Post-payroll-lock valid corrections are filed as PAYROLL_CORRECTION, approved, stored as PayrollCorrection READY, and applied as explicit retro lines on the next open payroll generate. Locked period snapshots remain immutable. Stuffing prior hours into next timesheet days is prohibited.

Add terminology for PayrollCorrection / retro line.

Close report required in final response (WWG Auto-Sync section).

Also add durable plan doc if useful:  
`hris-api/docs/PAYROLL_CORRECTION_NEXT_PERIOD_PRD.md` summarizing behavior for humans.

---

# 12. GIT / DELIVERY

`NO_GIT_WRITES` — do not commit/push/PR.  
Report files changed and suggested commit message for the user.

---

# 13. CHAIN BUILDER (if session budget insufficient)

### Chain Run 1 — Discovery, architecture, schema, domain service, workflow, generate apply, API tests  
### Chain Run 2 — Employee UI (locked + request + approvals + request tracking)  
### Chain Run 3 — Payslip visibility + HR generate readiness + integration polish  
### Chain Run 4 — Independent acceptance, WWG, full validation, handoff  

Each chain ends with Intent Compliance for its R# subset and residual backlog.

**Prefer finishing Chain 1+ apply path before polishing every UI animation.**

---

# 14. FINAL INTENT AND ACCEPTANCE GATE

Complete Intent Compliance Table for R1–R14.

Do not declare user acceptance. Declare evidence-backed readiness for review.

---

# 15. VERDICT MODEL

Report separately:
* Instruction Fulfillment
* Validation
* Product / Change Readiness
* Audit Completeness
* Release / Delivery (`NOT_AUTHORIZED` for release)

---

# 16. FINAL HANDOFF FORMAT

Use template §16 exactly (Verdicts, Executive Summary, Intent Compliance Table, Work Completed, Files Changed, Validation Evidence, WWG reconciliation, Warnings, Recommended Next Step).

---

# 17. UI SPEC (implementation contract)

## Employee — Timesheets list
* Chip when payroll-locked: `Processed in payroll` (wording may match design system).
* Optional subtitle: corrections go to next cut-off.

## Employee — Timesheet modal (payroll-locked)
* Read-only day grid (no edit permission unlock).
* Banner:
  - Title: timesheet already processed in payroll
  - Show period name; link View payslip if available
  - Primary CTA: **Request payroll correction**
  - Do **not** emphasize Request edit permission
* Status strip for correction lifecycle: pending | approved/scheduled | applied | rejected
* Day markers for days included in open/applied correction

## Employee — Request payroll correction (in-modal panel; both apps)
1. Select days on calendar (from source period; multi-select)
2. Per selected day: **Time In / Time Out** (TimePicker; same mental model as edit timesheet) — paid baseline shown; duration delta derived overnight-aware; **hoursType auto** (not user-editable; not shown in compact grid)
3. API payload still `dayDeltas[]` with before/after/delta minutes (+ optional clocks)
4. Reason required
5. Confirm copy: will **not** change this timesheet; difference pays next open payroll as labeled retro
6. Submit → create Request + PayrollCorrection REQUESTED
7. Implemented surfaces: `TimesheetPayrollCorrectionPanel` (primary), `TimesheetPayrollCorrectionModal` (legacy standalone)

## Employee — My Requests
* Type label: Payroll correction
* Detail: day delta table, workflow timeline, target/applied payslip links

## Manager — Approvals
* Review: Paid truth | Proposed | Delta
* Approve / Reject + reason
* On approve: READY (unless D3 hold)

## Employee — My Payroll / Payslip (next period)
* Section: Adjustments / Retro (or under earnings with clear labels)
* Line: `Retro … (source period name)` + amount (`buildRetroPayslipLabel`)
* Expand: days, request id, approver

## HR — Payroll summary modal (apply period)
* `/hr/hr-payroll` view employee payroll: **Payroll computation** includes labeled retro gross rows
* Accordion **Prior-period corrections**: day delta table (date, type, before/after/delta, clocks if present)
* **Daily detail**: separate correction category + totals so GrossPay narrative tallies (not mixed into source-period attendance punches)

## Employee — Source timesheet after apply
* Banner: Correction applied on payslip #… · original snapshot unchanged

## HR — Payroll generate
* Readiness: count of READY corrections included
* Post-run: included N corrections; failures listed

## Explicit non-goals in UI
* No editable locked day cells
* No silent toast-only success without durable status
* No injection of retro hours into next period day cells

---

# 18. API / DOMAIN SKETCH (starting point — refine in gate)

## Preferred flow
1. `POST` create Request `type=PAYROLL_CORRECTION` with metadata: sourceTimesheetId, sourcePayrollPeriodId, dayDeltas[], reason  
2. Side effect: create `PayrollCorrection` status REQUESTED linked to request  
3. Workflow approve → status READY (or APPROVED then READY)  
4. `generatePayrollFromTimesheets(periodB)`:
   - load READY corrections for employees in run
   - compute amounts
   - add to payroll earnings/metadata
   - set APPLIED + FKs
5. Payslip read APIs return correction lines for UI

## Failure modes
* Locked timesheet edit → still 409 TIMESHEET_LOCKED (optionally error detail code `USE_PAYROLL_CORRECTION`)
* Duplicate open correction for same day → 409
* Workflow not configured → 409 clear message
* Generate with no READY → no-op
* Generate twice → idempotent

---

# 19. TEST SKETCH (minimum cases)

1. Locked timesheet update → 409; snapshot bytes/fields unchanged after correction lifecycle  
2. Create correction on unlocked timesheet → reject or route to normal edit (choose one; document)  
3. Approve → READY; timesheet still locked; lines not rewritten  
4. Generate period B → amount included once; status APPLIED  
5. Generate period B again → no double apply  
6. Reject → not included on generate  
7. Payslip payload contains label + sourcePeriodId  
8. R14: draft/submitted edit-permission still works when not payroll-locked  

---

# 20. START NOW

Begin with:

1. Instruction, repository, WWG, and baseline discovery (dirty worktree triage)
2. Current-State Report
3. Intent and Assumption Ledgers (R1–R14)
4. Architecture Decision Gate → PLAN_ACCEPTED
5. Pass 1…N implementation loops with verification
6. Risk-proportional validation and repair
7. WWG accepted-truth update
8. Final multi-axis verdicts + Intent Compliance Table + manual test script

Do not claim done while next-period apply exists only in docs or UI mock without generate integration.

Progress updates at pass boundaries. Prefer durable docs only as authorized (PRD + WWG + this contract compliance).
```

---

## How to use this handoff

1. Open a new agent session at monorepo root `BANDAI`.
2. Paste the fenced task contract (from `# 0. TASK CONTRACT` through `# 20. START NOW`), **or** instruct:  
   `Execute the task contract in hris-api/docs/PAYROLL_CORRECTION_NEXT_PERIOD_HANDOFF_PROMPT.md using agent-meta-prompt-template-v2.md operating rules.`
3. If the agent cannot finish UI + API in one run, authorize **Chain Run 1** first (backend apply path), then Chain Run 2–4.
4. Elevate git authorization only when you want commits (`COMMIT_ONLY` / `DRAFT_PR`).

## Suggested first user message (short)

```text
Execute hris-api/docs/PAYROLL_CORRECTION_NEXT_PERIOD_HANDOFF_PROMPT.md
Mode PLAN_AND_APPLY. Follow agent-meta-prompt-template-v2.md.
Start with discovery + architecture gate, then implement vertical slice through next-period payroll apply + employee UI.
NO_GIT_WRITES. Update hris-api WWG accepted truth when policy is implemented.
```
