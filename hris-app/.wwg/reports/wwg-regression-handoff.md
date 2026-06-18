# WWG Regression Handoff

## Purpose

Prepare regression test strategy and executable-test draft review without treating generated proposals as meaningful coverage.

## Target

.

## Source Evidence Inspected

- .wwg/governance/regression-manifest.json
- .wwg/governance/regression-gaps.json
- .wwg/governance/rule-traceability.json
- .wwg/workspace/testing/proposed-executable-tests.md
- .wwg/workspace/testing/proposed-executable-tests.json

## Existing Truth Files To Read First

- .wwg/wiki/project-truth.md
- .wwg/wiki/terminology.md
- .wwg/wiki/principles/README.md
- .wwg/workspace/current-task.md
- .wwg/governance/drift-guard.md
- README.md
- CHANGELOG.md

## Deterministic Findings

- Proposals: 10
- Eligible source scaffolds: 0
- Proposal-only: 0
- Written source test files: 0
- Explicit source scaffold mode: no

## Gaps / Unknowns

- None.

## Required Agent Instructions

- Treat `.wwg/workspace/testing/proposed-executable-tests.md` as review-only.
- Design meaningful assertions from code behavior, tests, logs, or product truth before counting coverage.
- Do not count generated proposal artifacts as executable regression coverage.
- If source scaffold files exist, replace placeholder assertions before treating them as tests.

## Guardrails

- Do not invent project truth.
- Use existing WWG truth first.
- If truth is missing, state what evidence is missing.
- Update `.wwg/wiki/project-truth.md` only when durable facts are supported.
- Reconcile README/docs/tests/changelog changes with WWG truth and governance.

## Recommended Next Action

Review this handoff with a coding agent and implement meaningful regression tests in the source tree only after code review.

## Files The Agent May Update

- .wwg/workspace/testing/proposed-executable-tests.md
- .wwg/workspace/testing/proposed-executable-tests.json
- source test files after agent/human review
- .wwg/governance/regression-gaps.md
- .wwg/governance/rule-traceability.md

## Files Not Final Without Review

- .wwg/workspace/testing/proposed-executable-tests.md
- .wwg/workspace/testing/proposed-executable-tests.json
- Any source scaffold test containing the WWG Scaffold Test Draft header
