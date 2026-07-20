<!-- docs-union: careful merge of standalone snapshot + bandai-infra develop (hris-app/AGENTS.md) -->
# Adopted Project Agent Guide

## Purpose

Provide the active operating contract for agents working in this adopted WWG project.

Project: react-app-template

## Mandatory Grok Skill: WWG Auto-Sync

For every meaningful task in this package, load and follow the monorepo skill:

- `../.grok/skills/wwg-auto-sync/SKILL.md` (slash: `/wwg-auto-sync`)
- Always-on rule: `../.grok/rules/wwg-auto-sync.md`

**START gate** — read important `.wwg` MDs before code changes (and `../hris-api/.wwg/wiki/project-truth.md` + `terminology.md` for attendance/timesheet/payroll).  
**CLOSE gate** — update package `.wwg` MDs when truth/terminology/UX/architecture changed; always update `.wwg/workspace/current-task.md`. Sync backend wiki when backend truth changed.  
Do not leave new truth only in code. Include a short `## WWG Auto-Sync` section in the final response after meaningful work.

## HRIS Attendance/Timesheet/Payroll Source-Of-Truth Addendum

Before modifying HR Attendance, HR Timesheets, manager approval, approved OT, payroll tally, or backfill-facing UI, read `../hris-api/.wwg/wiki/project-truth.md` (Canonical Terminology, Architecture Truth) and `../hris-api/.wwg/wiki/terminology.md` (HR Attendance / Timesheet / Payroll Source Terms).

`../docs/attendance-timesheet-payroll-tally-prd.md` was the original binding spec for this split but is confirmed permanently unrecoverable as of 2026-06-26 (never committed in either repo's git history). The terms below are re-grounded directly against the backend's Prisma schemas and service code; see the wiki files above for evidence.

Binding split:
- `AttendanceObligation` is live/current/future operational attendance truth.
- `Attendance` is biometric/raw/effective clock ledger truth.
- Past submitted/approved/payroll-ready totals and approved OT tally from effective `Timesheetline` rows.
- Paid payroll history reads `EmployeePayroll.timesheetSnapshot`.

## Mandatory: Dual-app UI parity with hris-emp-app

`hris-app` and `../hris-emp-app` share parallel implementations of timesheets, attendance, payroll/payslips, leave-request patterns, and many molecules/utils.

**Rule:** If you change a surface that exists (or has a counterpart) in `hris-emp-app`, update **both** packages in the same task unless the user explicitly scopes to one app.

1. Search `../hris-emp-app` for the same component/util/route before coding.
2. Mirror behavior, UX, validation, and tests.
3. Do not mark the task complete after a one-app-only dual-surface change without an explicit exception.
4. Close report must state: `both updated` | `single-app exception (reason)` | `HR-only (no emp counterpart)`.

**HR-only exceptions (no mirror required):** run payroll, payroll period generate, HR payroll register/management, org/admin config, and other admin-only routes without an employee-app counterpart.

Always-on monorepo rule: `../.grok/rules/hris-dual-app-ui-parity.md`  
Monorepo overview: `../AGENTS.md`

## Existing Project Adoption Rule

For new projects:
- Wiki leads code.

For existing projects:
- Code/docs/config reveal operational reality.
- WWG converts that reality into governed truth.
- Inferred truth must be labeled.
- Unclear or conflicting reality must be marked as `NEEDS_CONFIRMATION`, `CONFLICTING`, or `STALE`.

Do not treat adopted wiki content as fully confirmed until reviewed.

Developers may prompt naturally. Agents must execute structurally.

## Required WWG Reading Order

Before modifying code, always read in this order when the files exist:

1. `.wwg/wiki/project-truth-summary.md` when present
2. `.wwg/wiki/terminology-summary.md` when present
3. `.wwg/wiki/project-truth.md`
4. `.wwg/wiki/terminology.md`
5. `.wwg/wiki/principles/README.md`
6. Relevant `.wwg/wiki/principles/*.md` files when the task may affect durable reasoning
7. `.wwg/workspace/current-task.md`
8. `.wwg/governance/drift-guard.md`
9. `README.md`
10. Relevant source files

## Principle Management

Principles live in `.wwg/wiki/principles/`.

Principles are durable, high-friction mutable guidance documents that explain why the project is designed a certain way and how agents should reason about future work.

Project Truth tells agents what is true. Principles tell agents how to think. Governance tells agents what to check. Workspace tells agents what to do now.

Before making changes that affect product architecture, naming, positioning, agent behavior, governance, project structure, UX philosophy, or long-term design direction, review relevant principle files.

Explicit principle updates are required when the user says something like:

- "This is a principle."
- "Add this to our guiding principles."
- "Save this as design doctrine."
- "This should guide future architecture."
- "This is how agents should think about the project."
- "This should be maintained going forward."

Implicit principle review is required when a task affects durable reasoning, such as changing product architecture, naming or terminology, major system relationships, governance behavior, agent behavior, positioning, project structure, or cross-project reusable rules.

Agents must not casually rewrite active principles for one-off implementation details, bug fixes, temporary experiments, or ambiguous user comments.

If a possible principle change is uncertain, record it as a candidate principle or mention it in a handoff/report instead of modifying an active principle directly.

## Task Mode Classification

Classify meaningful work before implementation as copy-only, docs-only, meaningful feature, bug fix, regression repair, high-risk, non-software, or mixed. Also record whether delivery is AI-agent, traditional, or hybrid.

If the request contradicts Project Truth or touches high-risk areas, pause and plan before implementation. High-risk areas include payment, auth, authorization, security, persistence, database or user data, production deployment, destructive or irreversible actions, and regulated or compliance-sensitive behavior.

## Safety Gates

- Stop when Project Truth conflicts with the requested change.
- Pause for approval before production, compliance, billing, permissions, security, public notices, data deletion, migrations, or irreversible operations.
- Do not mutate `.vorter/` from WWG work.
- Use candidate-only language for Vorter handoffs.

## Wiki-First Flow

Use Wiki-first flow for features, architecture, product decisions, UX standards, governance, and unclear requests.

## Code-Discovery Flow

Use code-investigation-first flow for bugs, regressions, incidents, performance issues, and root-cause analysis.

## Truth Synchronization Rule

Code changes may reveal truth, but they must not become the only place truth lives. Update Wiki, Workspace, Governance, and reports when a task introduces or discovers product identity, roles, terminology, feature scope, architecture, data model, payment/auth/security behavior, UX standards, operational rules, testing/release requirements, or production-readiness boundaries.

Project Truth must not be silently overwritten. Requirement evolution is allowed when documented and accepted. If terminology changes, update terminology docs. If accepted product behavior changes, update Project Truth or requirements docs. Governance changes should be merged carefully rather than overwritten.

## Non-Negotiable Close-Out Rule

Do not close out while canonical truth remains only in code, terminology changed without terminology updates, mock/demo behavior is undocumented, governance review was skipped, or generated reports contradict project truth.

## Test Enforcement

Meaningful feature behavior requires meaningful tests. Bug fixes require regression tests whenever practical. Removed or weakened tests must be flagged. If no tests are added for meaningful work, document why.

## Natural Prompt Preference

Users may prompt naturally, for example: "Sync Project Truth with the latest docs and reports.", "Reconcile this implementation back to Project Truth.", "Pause and create a planning review before implementation.", or "Add meaningful regression tests for the fixed bug." CLI commands are backup for technical users.

## Handoff / Reporting Rules

- Report what changed, what was validated, what truth/context/governance surfaces were updated, and what risks remain.
- State whether new recommendations were added or no new recommendations were identified.

## References

- `.wwg/wiki/project-truth-summary.md`
- `.wwg/wiki/terminology-summary.md`
- `.wwg/wiki/project-truth.md`
- `.wwg/wiki/terminology.md`
- `.wwg/workspace/current-task.md`
- `.wwg/governance/drift-guard.md`
- `.wwg/governance/test-enforcement.md`
