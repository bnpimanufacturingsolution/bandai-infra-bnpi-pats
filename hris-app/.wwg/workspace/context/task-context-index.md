# Task Context Index

Status: ACTIVE
Last reviewed: 2026-05-26

## Purpose

Route agents to the smallest safe context slice for a task.

Read the Tier 0 files first, then add only the task slice that matches the current work. Open full docs, reports, or historical handoffs only when the slice says to escalate.

## Tier 0: Always Read

- `.wwg/wiki/project-truth-summary.md`
- `.wwg/wiki/terminology-summary.md`
- `.wwg/wiki/project-truth.md`
- `.wwg/wiki/terminology.md`
- `.wwg/wiki/principles/README.md`
- `.wwg/workspace/current-task.md`
- `.wwg/governance/drift-guard.md`
- `README.md`

## Tier 1: Task Slices

### App UI / Route Behavior

Read:

- `.wwg/workspace/context/project-context.md`
- `.wwg/workspace/context/ux-context.md`
- `docs/testing-strategy.md`
- Relevant route, component, service, and test files.

Validate:

- `npm run test:ci`
- Focused Vitest command for touched files.

Escalate when:

- Auth, permissions, payroll, billing, persistence, or public applicant behavior is touched.

### Data Migration / Import UI

Read:

- `../docs/attendance-timesheet-payroll-tally-prd.md`
- `docs/testing-strategy.md`
- `docs/testing-maturity-audit.md`
- Relevant import route/helper/test files.
- API context in `../hris-api` for backend execution, persistence, or migration script changes.

Validate:

- App: `npm run test:migration:ui-quality`
- App: `npm run test:ci`
- API, when touched: `npm run test:migration:quality`
- API, when touched: `npm run test:ci:source-truth`

Escalate when:

- Any change can mutate data, create timesheets, affect attendance source selection, or touch payroll history.

### API / Backend-Owned Behavior

Read:

- `../hris-api/AGENTS.md`
- `../hris-api/.wwg/wiki/project-truth-summary.md`
- `../hris-api/.wwg/wiki/terminology-summary.md`
- `../hris-api/.wwg/workspace/current-task.md`
- Relevant API source and tests.

Validate:

- API: `npm run test:ci:source-truth`
- Focused API test command for touched files.

Escalate when:

- Auth, authorization, persistence, migrations, payroll, load, soak, or DB fault testing is touched.

### Auth / Authorization / Security

Read:

- `.wwg/workspace/context/governance-context.md`
- `.wwg/governance/security-review.md`
- `.wwg/governance/human-approval-matrix.md`
- API security context in `../hris-api` when backend enforcement is involved.

Validate:

- App: `npm run test:ci`
- API, when touched: relevant auth/contract tests plus `npm run test:ci:source-truth`

Escalate when:

- Secrets, permissions, production config, Firebase admin SDK files, public applicant privacy, or token behavior is involved.

### Payroll / Attendance / Timesheet Source Truth

Read:

- `../docs/attendance-timesheet-payroll-tally-prd.md`
- `docs/testing-strategy.md`
- `../hris-api/docs/testing-strategy.md` when backend behavior is touched.
- Relevant app/API source and tests.

Validate:

- App: focused service/UI tests plus `npm run test:ci`
- API: `npm run test:api:source-truth`
- API: `npm run test:db:source-truth`
- API: `npm run test:migration:quality` when migration/import/backfill is involved.

Escalate when:

- Paid payroll history, approved OT, effective timesheet lines, or attendance obligation materialization is touched.

### Docs / Governance / WWG Behavior

Read:

- `.wwg/governance/development-operating-model.md`
- `.wwg/workspace/context/governance-context.md`
- `.wwg/governance/quality-gates.md`
- `.wwg/governance/test-enforcement.md`
- `.wwg/governance/recommendation-policy.md`
- Relevant WWG source files.

Validate:

- `npx @homedesk/wwg validate`
- Optional focused doc review by reading changed docs.

Escalate when:

- Governance changes affect safety gates, approval requirements, or agent behavior.

### Bug / Regression Repair

Read:

- Tier 0.
- Relevant source files before editing.
- Existing tests around the bug.
- `.wwg/governance/test-enforcement.md`

Validate:

- Reproducing regression test first when practical.
- Focused test command for the bug.
- Broader gate for the touched area.

Escalate when:

- The bug touches high-risk behavior or contradicts Project Truth.

### Ship / Release Readiness

Read:

- `.wwg/governance/release-checklist.md`
- `.wwg/governance/quality-gates.md`
- `.wwg/workspace/current-task.md`
- Curated reports for touched quality gates.

Validate:

- App: `npm run test:ci`
- App migration/import UI, when touched: `npm run test:migration:ui-quality`
- API, when touched: `npm run test:ci:source-truth`
- API governance, when touched: `npm run wwg:task:end`

Escalate when:

- Deployments, production config, data mutation, credentials, or irreversible operations are requested.

## Tier 2: Escalation Context

Open only when needed:

- Full PRDs.
- Historical reports.
- Generated WWG reports.
- Old handoffs.
- Full validation logs.
- Broad repository search output.

Use Tier 2 when a summary is ambiguous, a test fails, a source-truth conflict appears, or a high-risk domain requires deeper evidence.

## Context Budget Rules

- Keep active context focused on decisions and changed files.
- Prefer summaries over full documents.
- Prefer exact file references over pasted content.
- Summarize passing command output by command and result.
- Paste only failing output or the minimal lines needed for diagnosis.
- For prompt chains, use `.wwg/workspace/context/chain-state-template.md` for pass-to-pass state.
