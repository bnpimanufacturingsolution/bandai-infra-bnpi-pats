# Candidate Terminology Summary

## Purpose

Candidate compact active Terminology surface for human or agent review.

This candidate is not canonical terminology and must not be installed without review.

## Canonical Source

- Canonical source: `.wwg/wiki/terminology.md`.
- Full Terminology wins on conflict.
- Candidate content is generated from existing project files and may be incomplete.

## High-Priority Terms

- - Observed Term: Where Found: Inferred Meaning: Status
- - ---: ---: ---: ---
- - Concept: Recommended Canonical Term: Also Seen As: Confidence: Evidence
- - ---: ---: ---: ---: ---
- - dashboard: Dashboard: None detected: MEDIUM: source text, README/source text, app/dashboard/dashboard.controller.ts, app/dashboard/dashboard.router.ts
- - Conflict: Evidence: Recommendation
- - ---: ---: ---
- - None confirmed: No direct conflict detected by lightweight audit: Confirm inferred terms before large renames

## Project-Specific Terms

- Requires human review: keep accepted local terms and remove any generic placeholder that does not fit the project.

## Governance Terms

- Project Truth: canonical project truth source.
- Drift Guard: governance contract that prevents unsupported truth, terminology, validation, or boundary drift.
- Requires human review: confirm local governance terms before adoption.

## Context / Skill Terms

- Context file: tells agents what to know before doing work.
- Skill file: tells agents how to perform repeatable work.
- Stop Conditions: required pause or block conditions for repeatable skills.
- Output Contract: expected result, destination, and reporting shape for repeatable skills.

## Preferred Language

- Use canonical project terms from `.wwg/wiki/terminology.md`.
- Use candidate-only language for runtime handoffs when Vorter is referenced.

## Avoided / Incorrect Language

- Do not claim WWG activates runtime skills.
- Do not claim WWG loads runtime skills.
- Do not claim WWG injects, mounts, routes, or executes runtime skills.

## Requires Human Review

- High-Priority Terms.
- Project-Specific Terms.
- Preferred Language.
- Avoided / Incorrect Language.

## Load Full Terminology When

- A task changes naming, layer boundaries, governance terms, context terms, skill terms, or runtime handoff language.
- This candidate appears to conflict with `.wwg/wiki/terminology.md`.

## References

- .wwg/wiki/terminology.md
- AGENTS.md
- .wwg/governance/drift-guard.md
- .wwg/workspace/context/project-context.md

## Evidence Excerpts

- .wwg/wiki/terminology.md: Observed Terms
- .wwg/wiki/terminology.md: Canonical Term Candidates
- .wwg/wiki/terminology.md: Terminology Conflicts
- .wwg/wiki/terminology.md: Rules
- .wwg/wiki/terminology.md: - Do not rename core concepts casually.
- .wwg/wiki/terminology.md: - If a prompt introduces a synonym, decide whether it is canonical before using it broadly.
- .wwg/wiki/terminology.md: - If terminology changes, update this file and reconcile code/docs.
- .wwg/wiki/terminology.md: - If terminology changes, reconcile reports, tests, governance files, and generated context too.
- .wwg/wiki/terminology.md: - For adopted projects, confirm inferred canonical terms before large renames.
- AGENTS.md: Purpose
- AGENTS.md: Existing Project Adoption Rule
- AGENTS.md: - Wiki leads code.
- AGENTS.md: - Code/docs/config reveal operational reality.
- AGENTS.md: - WWG converts that reality into governed truth.

## WWG Truth Synchronization

- Task mode: candidate compact terminology surface generation
- New truth detected: NO
- Wiki updated: NO
- Workspace updated: NO
- Governance review completed: YES
- Drift status: REVIEW
- Canonical files changed:
  - None; this candidate lives under reports.
- Implementation discoveries synced:
  - None; candidate content requires review before promotion.
- Remaining stale context:
  - Review all requires-human-review sections before adopting this candidate.
