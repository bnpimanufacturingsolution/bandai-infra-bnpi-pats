# WWG Changelog Handoff

## Purpose

Review release narrative and version bump judgment before treating changelog prose as final project memory.

## Target

.

## Source Evidence Inspected

- git log
- CHANGELOG.md
- .wwg/reports/changelog-preview.md
- .wwg/reports/changelog-bump-recommendation.md

## Existing Truth Files To Read First

- .wwg/wiki/project-truth.md
- .wwg/wiki/terminology.md
- .wwg/wiki/principles/README.md
- .wwg/workspace/current-task.md
- .wwg/governance/drift-guard.md
- README.md
- CHANGELOG.md

## Deterministic Findings

- Recommended bump: major
- Meaningful groups: 7
- Unreleased present: no
- Unreleased possible minor/major: no
- Validation status: warn

## Gaps / Unknowns

- A breaking, migration, folder-contract, or operating-model signal was detected.

## Required Agent Instructions

- Review whether the detected changes are patch, minor, or major from the project-owner perspective.
- Rewrite release notes in owner-readable language when git-derived wording is too mechanical.
- Do not apply a minor or major bump without explicit user approval.
- Preserve existing human-written changelog history.

## Guardrails

- Do not invent project truth.
- Use existing WWG truth first.
- If truth is missing, state what evidence is missing.
- Update `.wwg/wiki/project-truth.md` only when durable facts are supported.
- Reconcile README/docs/tests/changelog changes with WWG truth and governance.

## Recommended Next Action

Review this handoff with a human or implementation agent before finalizing minor, major, or ambiguous release narrative.

## Files The Agent May Update

- CHANGELOG.md
- .wwg/changelog/config.yml
- .wwg/changelog/state.json
- .wwg/wiki/project-truth.md
- .wwg/workspace/current-task.md

## Files Not Final Without Review

- .wwg/reports/changelog-preview.md
- .wwg/reports/changelog-bump-recommendation.md
- Git-derived suggested release notes
