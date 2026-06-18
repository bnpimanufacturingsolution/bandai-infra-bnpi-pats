# context-skill-maintenance Skill

## Purpose

Determine whether workspace context or skills need create, edit, merge, or delete actions after any meaningful change.

## Trigger

Use after meaningful feature, bug fix, architecture, governance, profile, runtime, public surface, or template/default changes.

## Stop Conditions

Do not use for trivial wording changes that do not alter canonical truth, reusable workflow, agent instructions, or governance expectations.
Stop or switch workflows when:

- Required inputs, evidence, reproduction details, or canonical artifacts are missing.
- The request enters an approval-gated area without explicit approval.
- A local governance rule, specialist review, or canonical project truth conflicts with this skill.
- The work would require WWG to claim runtime skill activation, loading, injection, mounting, routing, or execution.

## Inputs

- Classified change request
- Maintenance matrix
- Relevant wiki pages
- Workspace context files
- Existing skill files
- Implementation summary or investigation findings

## Preconditions

- Required inputs are available or missing inputs are documented before action.
- Relevant Wiki truth, Workspace context, and Governance rules have been checked.
- Approval-gated areas are identified before files, configuration, public surfaces, or irreversible behavior change.
- WWG skill state is treated as governance or recommendation metadata, not runtime activation.

## Output Contract

- Context update decision
- Skill update decision
- Files updated or intentionally left unchanged
- Known drift and follow-up items

## Invariants to Preserve

- Canonical wiki truth remains primary.
- Generated or compiled context must not silently become the only source of truth.
- Duplicate skills should be merged or clarified rather than multiplied.
- Reports and handoff notes cannot override `project-truth.md`.
- Stale or conflicting context must be reported before close-out.

## References

- Maintenance matrix
- Relevant canonical wiki files
- Workspace context files
- Existing skill files and skill index
- Governance drift and evidence standards

## Steps

1. Read the classified change request and identify the change category.
2. Inspect the maintenance matrix for required artifacts.
3. Compare implementation findings against wiki truth and workspace context.
4. Identify artifact type: canonical-update-on-change, generated-from-wiki, reference-history, temporary-working, public-surface, or machine-readable-catalog.
5. Check whether any reusable workflow changed.
6. Create, edit, merge, or delete skills only when the workflow knowledge should be reused.
7. Refresh generated context when canonical wiki truth changed.
8. Run truth capture and drift guard when meaningful truth changed.
9. Record context and skill decisions in the implementation report.

## Required Checks

Confirm context and skill files either reflect the changed truth/workflow or are explicitly recorded as unchanged.

## Output / Reporting Expectations

Report context checked, context updated, skills checked, skills created/edited/merged/deleted, known drift, and follow-up required.

Include whether reports or handoff files are stale, whether generated context was refreshed, and whether project truth remains canonical.

## Maintenance Contract

Update this skill when artifact types, generated context policy, skill format, or maintenance matrix rules change.

## Guardrails

- Do not create a skill for one-off work.
- Do not leave stale skill instructions after a canonical workflow changes.
- Do not invent project truth while refreshing context.
- Prefer merging duplicate skills over adding near-copies.
- Do not treat reference history or temporary notes as current canonical truth unless promoted.
- Do not confuse upstream template defaults with accepted local project skills.

## Examples

- A new billing provider in a SaaS project may require billing context updates and a reusable billing integration skill.
- A fixed production incident may require operations wiki updates, a debugging skill refinement, and drift detection notes.
- A terminology rename may require glossary updates, context refresh, and public content drift review.
