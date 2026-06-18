# Development Operating Model

Status: ACTIVE
Last reviewed: 2026-05-26

## Purpose

Define the default development workflow for this adopted HRIS app so agents can work safely without overloading the context window.

This model makes WWG a context router first and a document archive second.

## Applies To

- AI-agent development work in `hris-app`.
- Cross-repo app/API work with `../hris-api`.
- Medium-risk and high-risk changes.
- Prompt-chained implementation.
- Test, migration, import, payroll, auth, governance, and release-readiness work.

## Rules

### Must

- Use prompt chaining for medium-risk, high-risk, multi-step, or cross-repo work.
- Keep prompt chains delta-oriented: stable rules live in canonical WWG files, while each pass carries only current goal, state, changed files, risks, and validation.
- Read WWG summaries before full docs unless the task has an immediate conflict or high-risk domain requirement.
- Use `.wwg/workspace/context/task-context-index.md` to choose task-specific context.
- Keep passing validation output summarized by command and result; store verbose details in report artifacts.
- Keep scratch prompt-chain artifacts out of the shippable diff.
- Update current task state when the workflow standard changes or when validation creates new evidence.
- Keep development TDD by default: behavior-bearing app or quality-script changes require changed tests that target the same source feature before close-out.
- Preserve the app/API ownership split:
  - `hris-app` owns UI routes, client payloads, route behavior, browser E2E, and app-side regressions.
  - `../hris-api` owns backend authorization, persistence, schemas, migration execution, DB invariants, load, and soak tests.

### Must Not

- Treat generated reports as active context unless the task is validation, governance, or report repair.
- Paste full passing test logs into handoffs.
- Recreate the same global safety and source-truth text in every pass prompt.
- Commit task-specific prompt pass folders, temporary handoffs, raw runner JSON, or local scratch logs.
- Use app-side tests as proof of backend authorization, persistence, or database integrity.
- Run production/shared DB migrations, backfills, seed writes, deletion, load, or soak commands without explicit approval.

### Prefer

- Small state packets over narrative handoffs.
- Task-specific context slices over broad doc sweeps.
- Structured YAML-style handoffs for machine continuity.
- Curated evidence reports over raw command output.
- Focused gates before broad gates, then broad gates before ship.

### Avoid

- Long standalone pass prompts that duplicate the same repository contract.
- Reading historical reports by default.
- Letting prompt-chain artifacts pile up in `.wwg/workspace/prompts/` or `.wwg/workspace/testing/`.
- Treating context volume as safety. Safety comes from the right context, not all context.

## Enforcement

Use this model during task planning and close-out.

- Missing prompt chain for medium/high-risk multi-step work: warn and create a chain plan before implementation.
- Prompt chain with repeated full-context pass prompts: compact before continuing.
- Generated reports used as primary context without need: warn and route through the task context index.
- Scratch prompt artifacts staged for commit: remove or ignore before ship.
- High-risk work without matching validation: pause or stop according to `.wwg/governance/test-enforcement.md`.

## Reports / Artifacts

Stable, shippable artifacts:

- `.wwg/workspace/context/task-context-index.md`
- `.wwg/workspace/context/chain-state-template.md`
- `.wwg/workspace/prompts/chain-pass-template.md`
- `.wwg/workspace/current-task.md`
- Curated quality reports under `output/reports/`

Scratch artifacts:

- Task-specific prompt folders.
- Pass handoff folders.
- Raw runner JSON files.
- Local validation logs.

Scratch artifacts should be ignored or removed before shipping.

## References

- `.wwg/workspace/context/task-context-index.md`
- `.wwg/workspace/context/chain-state-template.md`
- `.wwg/workspace/prompts/chain-pass-template.md`
- `.wwg/governance/test-enforcement.md`
- `.wwg/governance/quality-gates.md`
- `.wwg/governance/drift-guard.md`
- `../docs/attendance-timesheet-payroll-tally-prd.md`
