# Drift Guard

This file protects the project from context drift.

## Existing Project Adoption Rule

For existing projects, code/docs/config are evidence of current reality, not automatically final truth.

Adoption should:
- capture observed reality
- infer initial truth
- mark uncertainty
- identify conflicts
- create open questions
- avoid changing source code unless requested

Drift is not always bad. Healthy requirement evolution is accepted when documented; documentation lag should usually warn; implementation drift, terminology drift, regression/quality drift, high-risk contradictions, unsafe overwrites, and weakened tests require stronger action.

## Required Reading

Before modifying code, read:

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

## Principle Drift Guard

When a change affects product architecture, naming, positioning, agent behavior, governance behavior, project structure, UX philosophy, or long-term design direction, agents must check whether relevant principle files in `.wwg/wiki/principles/` need to be updated.

Principles are high-friction mutable. Do not rewrite active principles casually.

A principle update is appropriate when:

- the user explicitly identifies a new or changed principle
- an accepted architecture or product decision changes durable reasoning
- terminology or positioning changes the way future agents should understand the project
- governance rules change how agents should behave
- repeated task behavior becomes a durable standard

A principle update is not appropriate for:

- one-off implementation details
- temporary experiments
- small bug fixes
- ambiguous user statements
- assistant speculation
- task-local preferences

If uncertain, add a candidate principle or record the issue in the handoff/report.

## Test Enforcement

- Meaningful feature behavior requires meaningful tests.
- Bug fixes require regression tests whenever practical.
- Tests should verify behavior, not only file existence, static structure, or build smoke.
- Non-software work may use decision logs, manual verification, approval checklists, or Project Truth updates when software tests are not the right evidence.

## Output Guidance

- Natural-language next steps should appear before CLI backup commands.
- Red outputs must clearly say stop.
- Orange outputs must clearly say pause or plan.
- Yellow outputs should guide review or sync.
- Green outputs should not over-warn.

## Drift Result

- Drift status: NONE / LOW / MEDIUM / HIGH
- Drift found:
  - NEEDS_CONFIRMATION
- Files synchronized:
  - NEEDS_CONFIRMATION
- Remaining follow-ups:
  - NEEDS_CONFIRMATION
