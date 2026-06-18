# regression-guardrail-maintenance Skill

## Purpose

Maintain a catalog of bugs, incidents, sign-off misses, and validation blind spots so future runs can catch them reliably.

## Trigger

Use after a missed bug, incident, sign-off gap, repeated regression, failed release check, or validation blind spot.

## Stop Conditions

Do not update product truth solely because a regression occurred. Some regressions update sign-off workflow truth, testing truth, or operational guardrails only.

Stop or switch workflows when:

- Required inputs, evidence, reproduction details, or canonical artifacts are missing.
- The request enters an approval-gated area without explicit approval.
- A local governance rule, specialist review, or canonical project truth conflicts with this skill.
- The work would require WWG to claim runtime skill activation, loading, injection, mounting, routing, or execution.

## Inputs

- Symptom
- Root cause or missed-by reason
- Evidence paths
- Existing tests and guardrails
- Release or sign-off workflow

## Preconditions

- Required inputs are available or missing inputs are documented before action.
- Relevant Wiki truth, Workspace context, and Governance rules have been checked.
- Approval-gated areas are identified before files, configuration, public surfaces, or irreversible behavior change.
- WWG skill state is treated as governance or recommendation metadata, not runtime activation.

## Output Contract

- New or updated guardrail catalog entry
- Required validation notes
- Updated human workflow docs when needed
- Maintenance report

## Invariants to Preserve

- Guardrails must be actionable.
- Guardrails should reduce future miss probability.
- Product truth changes only when the regression revealed product truth was wrong or incomplete.

## References

- `governance-template/base/regression-guardrail-catalog.md`
- `governance-template/base/evidence-standards.md`
- `governance-template/base/test-plan.md`
- `governance-template/base/release-checklist.md`
- `wiki-template/base/08-operations/signoff-learnings.md`
- Relevant incident log or known issue

## Steps

1. Capture symptom.
2. Capture missed-by reason.
3. Define future guardrail.
4. Record evidence paths.
5. Update machine-readable catalog or catalog section when available.
6. Refresh human workflow docs.
7. Update wiki/context only if product truth changed.
8. Run validation.

Evidence level must be recorded for the missed-by reason and future guardrail.

## Required Checks

Confirm the guardrail is specific, repeatable, owned, and tied to required validation.

## Output / Reporting Expectations

Report guardrail entry, updated docs, validation performed, and remaining risk.

## Maintenance Contract

Record guardrail changes in governance checks and reports.
