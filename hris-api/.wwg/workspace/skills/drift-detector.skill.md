# drift-detector Skill

## Purpose

Detect mismatch between code, wiki, workspace context, skills, governance, reports, and public/user-facing surfaces.

## Trigger

Use during audits, post-change maintenance, production investigations, release readiness checks, and template/default boundary reviews.

## Stop Conditions

Do not use to rewrite canonical truth without evidence or approval for high-risk domains.

Stop or switch workflows when:

- Required inputs, evidence, reproduction details, or canonical artifacts are missing.
- The request enters an approval-gated area without explicit approval.
- A local governance rule, specialist review, or canonical project truth conflicts with this skill.
- The work would require WWG to claim runtime skill activation, loading, injection, mounting, routing, or execution.

## Inputs

- Current behavior or implementation evidence
- Canonical wiki and context files
- Workspace prompts and skills
- Governance checks and reports
- Public/user-facing surfaces when applicable

## Preconditions

- Required inputs are available or missing inputs are documented before action.
- Relevant Wiki truth, Workspace context, and Governance rules have been checked.
- Approval-gated areas are identified before files, configuration, public surfaces, or irreversible behavior change.
- WWG skill state is treated as governance or recommendation metadata, not runtime activation.

## Output Contract

```md
Drift type:
Evidence:
Canonical artifact:
Affected derived artifacts:
Recommended fix:
Owner:
Follow-up required:
```

## Drift Types

- Product drift
- Terminology drift
- Architecture drift
- Source-of-truth drift
- Skill drift
- Design drift
- Test drift
- Public content drift
- Governance drift
- Canonical context drift
- Reference-history drift
- Truth-conflict drift
- Template-vs-project drift
- Mock/demo vs production drift
- Workspace task drift

## Checks

1. Compare implementation behavior against requirements and domain rules.
2. Compare code architecture against system overview, data model, and ADRs.
3. Compare prompts and context files against current wiki truth.
4. Compare reusable skills against the latest workflow.
5. Compare UI behavior against design source-of-truth files.
6. Compare tests against quality gates and product invariants.
7. Compare public/admin copy against canonical terminology.
8. Compare master context and dedicated context files against canonical wiki truth.
9. Identify unresolved conflicts between code/runtime behavior and docs.
10. Check that reports do not override or contradict `project-truth.md`.
11. Check that `current-task.md` reflects the completed work.
12. Check that mock/demo flows are clearly labeled and not described as production-ready.
13. Check whether upstream template defaults and local project files are intentionally different.

## Invariants to Preserve

- Suspected drift is a hypothesis until evidence confirms it.
- Truth conflicts must be resolved through canonical artifacts.
- Reference history is not automatically rewritten.

## References

- `wiki-template/base/12-maintenance/drift-policy.md`
- `governance-template/base/context-drift-detection.md`
- `governance-template/base/canonical-artifact-review.md`
- `governance-template/base/evidence-standards.md`
- Template/default boundary docs when comparing upstream defaults with local project files

## Steps

1. State the suspected drift as a hypothesis.
2. Gather evidence from code, docs, schemas, generated markers, reports, or runtime artifacts.
3. Classify drift type and affected canonical family.
4. Decide whether to update implementation, canonical docs, generated context, skills, governance, or public surfaces.
5. Record unresolved ambiguity as a follow-up rather than silently choosing truth.

## Required Checks

Every drift finding should identify evidence level, affected artifact, and recommended correction.

## Output / Reporting Expectations

Produce a drift report grouped by critical, high, medium, and low priority.

Include truth synchronization status: new truth detected, Wiki updated, Workspace updated, Governance review completed, drift status, canonical files changed, implementation discoveries synced, and remaining stale context.

## Maintenance Contract

Update this skill when new drift types, canonical families, or enforcement levels are added.

## Examples

- A cache becomes the only place a runtime setting exists: source-of-truth drift.
- A renamed product term appears in code but not docs: terminology and public content drift.
- A bug-fix workflow changes but the debugging skill remains stale: skill drift.
