# Pass 5 - WWG Doc Sync And Validation

Source label: `docs/phase-1-design-token-prompts/source-plan.md`

## Context Slice

Docs / Governance / WWG Behavior

## Pass Goal

Sync the accepted token strategy into active docs and run the right validation so Phase 1 ends with governed context rather than code-only knowledge. This pass should also record the adoption rule that new UI work is token-first and that legacy non-token styling is tracked as debt or drift.

## Required Reads

- `docs/phase-1-design-token-prompts/pass-4.md`
- `docs/design-system.md`
- `DOCUMENTATION_INDEX.md`
- `.wwg/governance/development-operating-model.md`
- `.wwg/workspace/context/task-context-index.md`

## Likely Files

- `docs/design-system.md`
- `DOCUMENTATION_INDEX.md`
- Optional WWG workspace files only if the task state truly changed
- `output/reports/phase-1-validation.md`

## Acceptance Criteria

- Update `docs/design-system.md` if the token layer or font strategy becomes active app guidance.
- Record the post-Phase 1 adoption rule in active docs if the token layer becomes accepted guidance.
- Update `DOCUMENTATION_INDEX.md` to surface the new prompt pack or accepted design docs.
- Update `.wwg/workspace/current-task.md` only if the active task record or validation evidence needs to change.
- Summarize build, test, and WWG validation results in `output/reports/phase-1-validation.md`.

## Validation

- `npm run build`
- `npm run test:ci` when code changed in earlier passes
- `npx @homedesk/wwg validate` when WWG or governed docs changed

## Stop Conditions

- Stop if the accepted implementation path changes durable project truth and that truth has not been reconciled.

## Handoff

Return the synced docs, validation summary, and unresolved watch items for final handoff.
