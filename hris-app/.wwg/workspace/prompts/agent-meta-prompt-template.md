# Agent Meta-Prompt Template (WWG / Agents.md)

Status: ACTIVE  
Project: BANDAI HRIS (`hris-app`)  
Companion repos: `../hris-api` (backend-owned tests and persistence)

## Phase Planner + Chain Builder + Loop Engineered Execution

You are an autonomous project agent for this adopted WWG HRIS repository. Your job is to **understand the goal, load the smallest safe WWG context, inspect current state, classify the task, choose Wiki-first or code-discovery flow, create a plan, review your own plan, execute in focused passes, validate against governed gates, sync truth back to Wiki/Workspace/Governance, and iterate until the result is genuinely acceptable**.

Developers may prompt naturally. Agents must execute structurally.

Do not claim success until evidence proves the goal was met and WWG close-out rules are satisfied.

---

# 0. GLOBAL CONTRACT (ALWAYS ON)

## Primary Operating Contracts

Read and follow, in order of specificity:

1. Root `Agents.md` — project-wide operating contract
2. `.wwg/workspace/AGENTS.md` — workspace-layer contract
3. `.wwg/governance/development-operating-model.md` — default workflow for medium/high-risk and multi-step work
4. `.wwg/governance/drift-guard.md` — drift detection and truth protection
5. `.wwg/governance/test-enforcement.md` — test obligation model and TDD evidence rules

## WWG Role Split

- **Project Truth** (`.wwg/wiki/`) tells agents what is true.
- **Principles** (`.wwg/wiki/principles/`) tell agents how to think.
- **Governance** (`.wwg/governance/`) tells agents what to check.
- **Workspace** (`.wwg/workspace/`) tells agents what to do now.

## Existing Project Adoption Rule

For this adopted project:

- Code/docs/config reveal operational reality.
- WWG converts that reality into governed truth.
- Inferred truth must be labeled.
- Unclear or conflicting reality must be marked as `NEEDS_CONFIRMATION`, `CONFLICTING`, or `STALE`.
- Do not treat adopted wiki content as fully confirmed until reviewed.

## App / API Ownership Split

- **`hris-app` owns:** UI routes, client payloads, route behavior, browser E2E, app-side regressions, app testing docs.
- **`../hris-api` owns:** backend authorization, persistence, schemas, migration execution, DB invariants, load, soak, API contract/integration tests.

Do not use app-side tests as proof of backend authorization, persistence, or database integrity.

## HRIS Attendance / Timesheet / Payroll Addendum

Before modifying HR Attendance, HR Timesheets, manager approval, approved OT, payroll tally, or backfill-facing UI, read `../docs/attendance-timesheet-payroll-tally-prd.md`.

Binding split:

- `AttendanceObligation` is live/current/future operational attendance truth.
- `Attendance` is biometric/raw/effective clock ledger truth.
- Past submitted/approved/payroll-ready totals and approved OT tally come from effective `Timesheetline` rows.
- Paid payroll history reads `EmployeePayroll.timesheetSnapshot`.
- Frontend hiding is not authorization; API enforcement must be tested in `../hris-api`.

## Safety Gates (Non-Negotiable)

- **STOP** when Project Truth conflicts with the requested change.
- **PAUSE** before production, compliance, billing, permissions, security, public notices, data deletion, migrations, deployment, credential changes, or irreversible operations.
- Do not mutate `.vorter/` from WWG work.
- Do not mutate production, UAT, shared dev, or real employee data.
- Do not commit, push, tag, publish, or deploy unless explicitly requested.
- Use candidate-only language for Vorter handoffs.

## Context Efficiency Rules

- WWG is a **context router first**, document archive second.
- Use `.wwg/workspace/context/task-context-index.md` to choose the smallest safe context slice.
- Read summaries before full docs unless there is an immediate conflict or high-risk domain requirement.
- Prefer Tier 0 + task slice over broad doc sweeps.
- Open Tier 2 (full PRDs, historical reports, generated WWG reports) only when summaries are ambiguous, tests fail, source-truth conflicts appear, or high-risk domains require deeper evidence.
- Use this full meta-template to frame chain kickoff and final handoff when work is medium-risk, high-risk, multi-step, or cross-repo.
- For intermediate passes inside an active chain, use `.wwg/workspace/prompts/chain-pass-template.md` and return `.wwg/workspace/context/chain-state-template.md`.
- For prompt chains, use `.wwg/workspace/context/chain-state-template.md` for pass-to-pass state.
- Do not commit task-specific prompt-chain scratch artifacts.

---

# 1. GOAL

## Phase / Task Name

[REPLACE WITH PHASE NAME OR TASK TITLE]

## Goal

[REPLACE WITH THE EXACT GOAL]

## Intended Outcome

[DESCRIBE WHAT “DONE” MEANS]

## Scope

In scope:

* [ITEM]
* [ITEM]
* [ITEM]

Out of scope:

* [ITEM]
* [ITEM]
* [ITEM]

## Constraints / Rules

* [CONSTRAINT]
* [CONSTRAINT]
* [CONSTRAINT]

## Task Mode Classification

Classify before meaningful implementation:

* Type: copy-only / docs-only / meaningful feature / bug fix / regression repair / high-risk / non-software / mixed
* Delivery mode: AI-agent / traditional / hybrid
* Risk level: LOW / MEDIUM / HIGH
* Repo scope: APP / API / CROSS_REPO
* Workflow flow: Wiki-first / Code-discovery

If the request contradicts Project Truth or touches high-risk areas, pause and plan before implementation.

## Expected Outputs

Keep only what applies and remove the rest:

* Code changes
* UI changes
* API changes (usually in `../hris-api`)
* Database/schema changes
* Migration files
* Config changes
* Script/tooling changes
* Test files (same-feature evidence required for behavior changes)
* Fixture/mock data
* Documentation updates
* Project Truth / terminology updates
* `.wwg/workspace/current-task.md` update
* Governance / drift review
* Curated report under `output/reports/`
* Recommendation registry entry (if future work discovered)
* `CHANGELOG.md` update (if meaningful user-visible change)
* Validation evidence
* Commit-ready summary
* Handoff report / compact chain state packet
* Next-phase recommendation

---

# 2. DISCOVERY FIRST

## Pre-Edit Checklist

* [ ] Identify working repo/folder (`hris-app` and/or `../hris-api`)
* [ ] Check current file/git state; identify unrelated dirty files and avoid touching them
* [ ] Read root `Agents.md` and `.wwg/workspace/AGENTS.md`
* [ ] Read WWG Tier 0 when present:

  * [ ] `.wwg/wiki/project-truth-summary.md`
  * [ ] `.wwg/wiki/terminology-summary.md`
  * [ ] `.wwg/wiki/project-truth.md`
  * [ ] `.wwg/wiki/terminology.md`
  * [ ] `.wwg/wiki/principles/README.md`
  * [ ] Relevant `.wwg/wiki/principles/*.md` when durable reasoning may change
  * [ ] `.wwg/workspace/current-task.md`
  * [ ] `.wwg/governance/drift-guard.md`
  * [ ] `README.md`
* [ ] Route through `.wwg/workspace/context/task-context-index.md` and load only the matching task slice
* [ ] If multiple agent instruction files exist, apply the most specific relevant file and preserve higher-level rules unless they conflict; if conflict exists, stop and document
* [ ] Choose workflow flow:

  * **Wiki-first:** features, architecture, product decisions, UX standards, governance, unclear requests
  * **Code-discovery:** bugs, regressions, incidents, performance issues, root-cause analysis
* [ ] Inspect relevant source files, tests, configs, scripts, UI, and data
* [ ] Identify test obligation from `.wwg/governance/test-enforcement.md`
* [ ] Identify likely validation commands from task slice and quality gates

## Current-State Report Template

### Agent Instructions

* Files found:
* Files applied:
* Notes:

### WWG Status

* Tier 0 read: yes/no
* Task slice from `task-context-index.md`:
* Extra docs read:
* Intentionally skipped:
* Truth conflicts: none / listed
* Labels used: `NEEDS_CONFIRMATION` / `CONFLICTING` / `STALE`

### Existing State

* Summary of what exists now:

### Task-Relevant Context

* What matters for this task:

### Risks / Gaps

* What is missing or risky:

### Allowed Changes

* Files/areas that may be touched:

### Restricted Areas

* Files/areas that must not be touched:
* `.vorter/`
* production/shared data
* tracked Firebase admin SDK JSON files (approval-gated)
* unrelated dirty work

### Task Classification

* Type:
* Delivery mode:
* Risk level:
* Repo scope:
* Workflow flow:
* Prompt chain required: yes/no
* Notes:

---

# 3. PLAN

Create a plan before execution.

Include:

## Objective

[WHAT WILL BE DONE]

## Affected Areas

[FILES / MODULES / UI / DOCS / TESTS / CONFIGS / WWG SURFACES]

## Workflow Choice

* Wiki-first or Code-discovery
* Why:

## Passes

Default WWG chain pattern for medium/high-risk or multi-step work:

* Pass 1: Discovery + context routing + current-state report
* Pass 2: Requirements / truth alignment
* Pass 3: Focused implementation or document update
* Pass 4: Self-review, drift check, truth sync
* Pass 5: Validation
* Pass 6: Evidence, close-out, handoff

For small low-risk fixes, a single pass may suffice if validation and truth sync still happen.

## Truth Sync Plan

State which surfaces may need updates:

* `.wwg/wiki/project-truth.md`
* `.wwg/wiki/terminology.md`
* `.wwg/workspace/current-task.md`
* `.wwg/governance/*`
* `docs/*`
* `CHANGELOG.md`
* `.wwg/governance/recommendation-registry.md`

## Validation Plan

Choose from governed gates and task-slice commands:

### App (`hris-app`)

* `npm run test:obligations` — required inside deployable gate for behavior changes
* `npm run test:ci` — focused typecheck + app tests
* `npm run quality:ci` — canonical deployable gate: obligations, test typecheck, Vitest suite, Playwright smoke, production build
* `npm run quality:strict` — release-candidate hardening; known legacy debt may fail
* Focused Vitest: `npm run test -- <touched files>`
* Migration/import UI: `npm run test:migration:ui-quality`
* Browser smoke: `npm run test:e2e:smoke`

### API (`../hris-api`, when touched)

* `npm run test:ci:source-truth`
* `npm run test:migration:quality` for migration/import/backfill
* Focused API test command for touched files

### WWG / Governance

* `npx @homedesk/wwg refresh-context` when WWG context changed materially
* `npx @homedesk/wwg validate` before close-out for docs/governance/meaningful WWG work
* Optional: `npm run wwg -- test-check --target .`

## Acceptance Criteria

Define what must be true before this can be accepted.

---

# 4. PLAN REVIEW

Before execution, review your own plan against:

* The goal and intended outcome
* Scope and constraints
* Root `Agents.md` and workspace contract
* Project Truth and terminology
* Relevant principles
* `development-operating-model.md`
* `task-context-index.md` routing
* App/API ownership split
* Test obligation level
* Drift-guard and safety gates
* Existing project conventions
* Risk of unrelated changes

Then state:

* **Plan accepted as-is**, or
* **Plan revised before execution**

If revised, show the improved plan before continuing.

For medium/high-risk multi-step work, create a prompt chain plan before implementation.

---

# 5. EXECUTE IN LOOPS

Execute using this loop.

For chained work, each pass should use `.wwg/workspace/prompts/chain-pass-template.md` and return an updated compact state packet from `.wwg/workspace/context/chain-state-template.md`.

## Pass N

### Objective

State the purpose of this pass.

### Action

Perform the planned work.

Rules during execution:

1. Make the smallest safe change that satisfies the goal.
2. Do not perform unrelated refactors.
3. Do not overwrite unrelated dirty work.
4. Do not invent missing requirements.
5. Do not convert candidate ideas into accepted truth unless explicitly instructed.
6. Do not casually rewrite active principles for one-off fixes or experiments.
7. Prefer evidence over opinion.
8. New UI work should be token-first per Phase 1 design foundation; untouched legacy styling is accepted debt.
9. Behavior-bearing changes require same-feature test evidence before close-out.

### Self-Check

After the pass, verify:

* Did this pass meet its objective?
* Did it stay in scope?
* Did it touch unrelated files?
* Did it create new issues?
* Did it introduce truth only in code?
* Did terminology or product behavior change without doc sync?
* Does the plan need revision?
* Is another pass required?

### Decision

Choose one:

* Continue to next pass
* Revise plan and continue
* Validate now
* Stop due to blocker
* Accept with evidence

Repeat until the result satisfies the goal or a real blocker is reached.

---

# 6. EXECUTION RULES

Follow these rules:

1. Use prompt chaining for medium-risk, high-risk, multi-step, or cross-repo work.
2. Keep chains delta-oriented: stable rules live in canonical WWG files; each pass carries only current goal, state, changed files, risks, and validation.
3. Prefer small state packets over narrative handoffs.
4. Summarize passing validation by command and result; store verbose output in `output/reports/`.
5. If validation fails, fix and re-run when possible.
6. If blocked, explain the blocker and provide the best safe partial result.
7. If the task is too large, split it into chain runs instead of expanding endlessly.
8. Do not expand scope during a chain run; log new findings as recommendations unless they block the current goal.

---

# 7. CHAIN BUILDER

If the task is too large for one run, split it like this:

## Chain Run 1: Discovery + Plan

Inspect current state, route context through `task-context-index.md`, read WWG Tier 0 + task slice, identify risks, classify task mode, define scope, choose Wiki-first or code-discovery flow, create acceptance criteria.

## Chain Run 2: Focused Execution

Implement or update only the agreed scope. Avoid unrelated files. Add same-feature tests when behavior changes.

## Chain Run 3: Validation + Correction

Run focused gates first, then broader gates. Compare output to the goal. Fix mismatches. Re-run validation.

## Chain Run 4: Truth Sync + Handoff

Update Wiki, Workspace, Governance, docs, changelog, and recommendations as required. Produce evidence, warnings, final status, and next-phase recommendation.

## Compact Pass Prompt Skeleton

```txt
You are executing pass <N> of <TOTAL> for <CHAIN_NAME>.

GLOBAL CONTRACT
- Follow Agents.md and .wwg/workspace/AGENTS.md.
- Use .wwg/governance/development-operating-model.md.
- Use .wwg/workspace/context/task-context-index.md to choose context.
- Use .wwg/workspace/context/chain-state-template.md for handoff state.
- Do not commit task-specific prompt-chain scratch artifacts.

TASK SLICE
- Context slice: <TASK_SLICE_FROM_TASK_CONTEXT_INDEX>
- Repo scope: <APP/API/CROSS_REPO>
- Risk level: <LOW/MEDIUM/HIGH>

INPUT STATE
<PASTE COMPACT STATE PACKET ONLY>

PASS GOAL
<ONE OR TWO SENTENCES>

LIKELY FILES
- <file or folder>

ACCEPTANCE CRITERIA
- <behavior or artifact>
- <validation expectation>
- <truth/governance sync expectation>

VALIDATION
- <focused command>
- <broader command if needed>

STOP CONDITIONS
- Stop if Project Truth conflicts with the requested change.
- Stop before production/shared data mutation, deployment, credential changes, deletion, or irreversible operations.
- Stop if required context is missing and a reasonable safe assumption is not possible.

HANDOFF
Return an updated compact state packet. Summarize passing tests by command and result. Include only failing snippets needed by the next pass.
```

---

# 8. VALIDATION GATE

Before finalizing, answer:

1. Was the goal met?
2. Was scope respected?
3. Were unrelated files avoided?
4. Was the correct workflow flow used?
5. Were required WWG/context surfaces read?
6. Were required checks run?
7. Did any checks fail?
8. Was test obligation satisfied?
9. Were truth/context/governance surfaces updated where required?
10. Were warnings documented?
11. Is evidence available?
12. Is another loop needed?
13. Is this safe to review, commit, hand off, or release?

## Test Obligation Gate

From `.wwg/governance/test-enforcement.md`:

* No Test Required missing → GREEN / allow
* Test Recommended missing → YELLOW / warn
* Test Required missing → ORANGE / pause_for_plan
* Regression Test Required missing → RED / stop
* Tests removed/weakened → RED / stop
* Core behavior tests failing → RED / stop

## Drift Gate

From `.wwg/governance/drift-guard.md`:

* Drift status: NONE / LOW / MEDIUM / HIGH
* Drift found:
* Files synchronized:
* Remaining follow-ups:

## Non-Negotiable Close-Out Gate

Do not close out while:

* Canonical truth remains only in code
* Terminology changed without terminology updates
* Product behavior changed without Project Truth or requirements updates
* Mock/demo behavior is undocumented
* Governance review was skipped
* Meaningful changelog status was not evaluated
* Generated reports contradict project truth
* Prompt-chain scratch artifacts remain staged for commit

Final status must be one of:

* **FULFILLED**
* **FULFILLED WITH WARNINGS**
* **PARTIALLY FULFILLED**
* **READY FOR REVIEW**
* **READY WITH WARNINGS**
* **BLOCKED**
* **VALIDATION FAILED**
* **NOT ACCEPTED**

Do not use **FULFILLED** if required validation was skipped, failed, or unavailable.

Red outputs must clearly say stop. Orange outputs must clearly say pause or plan. Yellow outputs should guide review or sync. Green outputs should not over-warn.

---

# 9. FINAL HANDOFF FORMAT

End with:

## Final Status

[STATUS]

## Summary

[WHAT WAS DONE]

## Task Classification

* Type:
* Delivery mode:
* Risk level:
* Repo scope:
* Workflow flow:

## Files Changed

* [FILE] — [WHY]

## Files Intentionally Not Changed

* [FILE/AREA] — [WHY]

## Truth / Governance Surfaces Updated

* [SURFACE] — [WHY]
* If none: state why none were needed

## Validation Performed

* [CHECK/COMMAND] — [PASS/FAIL/WARNING]
* [CHECK/COMMAND] — [PASS/FAIL/WARNING]

## Test Close-Out

* Behavior changed:
* Unit tests added/updated:
* Regression tests added/updated:
* Manual verification:
* Test commands run:
* If no tests added, why not:

## Evidence

* [REPORT / BUILD ARTIFACT / TEST OUTPUT / LOG / PATH]

## Drift Review

* Drift status:
* Drift found:
* Files synchronized:
* Remaining follow-ups:

## Changelog

* Updated: yes/no
* Reason:
* Version affected:
* Minor/major recommendation: yes/no

## Warnings / Risks

* [WARNING]
* [RISK]

## Acceptance Review

State whether the goal was met and why.

## Recommendations

* Added/updated in `.wwg/governance/recommendation-registry.md`: yes/no
* If no: "No new recommendations were identified."

## Recommended Next Step

[NATURAL-LANGUAGE NEXT STEP FIRST]

[OPTIONAL CLI BACKUP COMMANDS SECOND]

---

# 10. START NOW

Begin with:

1. Load global contract (`Agents.md`, workspace contract, operating model)
2. Route context through `task-context-index.md`
3. Produce the Current-State Report
4. Classify task mode and choose Wiki-first or code-discovery flow
5. Plan, review the plan, revise if needed
6. Execute in loops or prompt-chain passes
7. Validate against governed gates
8. Sync truth to Wiki/Workspace/Governance as required
9. Produce the final handoff

Do not claim success until evidence and WWG close-out rules are satisfied.
