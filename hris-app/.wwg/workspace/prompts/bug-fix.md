# Bug Fix Prompt

## Purpose

Provide a reusable prompt for common agent work.

## How to Use

Fill placeholders with project context, task scope, constraints, and validation commands.

## Rules

- Keep prompts grounded in wiki truth and governance gates.
- Read project truth for orientation, then investigate code/runtime behavior first.
- Capture exact symptom/error.
- Define expected vs actual behavior.
- Identify likely failing boundary.
- Compare the broken path against a nearby working path.
- Trace authoritative state when data correctness is involved.
- Use instrumentation only where it helps confirm or prevent the failure.
- Find root cause before broad refactor.
- Fix minimally.
- Add regression test or explicit validation.
- Validate adjacent flows.
- Sync discovered truth back into Wiki when investigation reveals accepted behavior, constraints, or stale context.
- Update `.wwg/workspace/current-task.md`.
- Run truth capture and drift guard before close-out.
- Update the regression guardrail catalog if this was a missed bug or sign-off gap.
- Update wiki/context/skills only when truth or reusable workflow changed.
- Map all root-cause and fix claims to concrete code paths, logs, tests, config, database state, or reproduction steps.

## Failing Boundary List

frontend/UI, backend/API, database/persistence, auth/session, queue/worker/job, cache/projection, external integration, deployment/runtime, agent/tool execution, public content/discovery.

## Adjacent-Flow Comparison

Compare the broken path against a nearby working path to isolate the failing boundary. Examples: production vs local, mobile vs desktop, admin vs user, direct API vs UI flow, queued path vs synchronous path, cache/projection vs authoritative datastore, new flow vs old flow, provider callback vs manual refresh, agent tool execution vs manual tool execution.

## Output Format

Symptom, expected behavior, actual behavior, failing boundary, adjacent-flow comparison, evidence level, root cause, fix, regression coverage, validation, guardrail update decision, maintenance updates, and remaining risk.
