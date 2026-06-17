# task-router Skill

## Purpose

Convert short natural developer prompts into structured WWG execution.

## Trigger

Use at the start of meaningful work, especially when the request is short, mixed, urgent, or written in natural language.

## Stop Conditions

Do not use when the user explicitly provided a complete classified task ticket and asked only for execution.
Stop or switch workflows when:

- Required inputs, evidence, reproduction details, or canonical artifacts are missing.
- The request enters an approval-gated area without explicit approval.
- A local governance rule, specialist review, or canonical project truth conflicts with this skill.
- The work would require WWG to claim runtime skill activation, loading, injection, mounting, routing, or execution.

## Inputs

- Natural developer prompt
- Project manifest and selected profiles
- Maintenance matrix
- Relevant `AGENTS.md` instructions

## Preconditions

- Required inputs are available or missing inputs are documented before action.
- Relevant Wiki truth, Workspace context, and Governance rules have been checked.
- Approval-gated areas are identified before files, configuration, public surfaces, or irreversible behavior change.
- WWG skill state is treated as governance or recommendation metadata, not runtime activation.

## Output Contract

- Change category
- Primary workflow
- Secondary workflows when useful
- Execution mode: execution-first, ticket-only, read-only-audit, or approval-gated
- Canonical artifacts to inspect
- Artifact type and canonical family
- Template-vs-instance impact when working in the WWG template repository
- Validation expectations
- Public/user-facing surfaces to review
- Context and skill maintenance expectations
- Concise execution report after work is complete

## Invariants to Preserve

- Developers may prompt naturally. Agents must execute structurally.
- Execution-first is the default when the agent has required access.
- Ticket-only mode applies only when explicitly requested.
- Read-only-audit mode is required for monitoring, inspection, production health, log summaries, performance analysis, and issue hunting unless execution is explicitly requested.
- Approval-gated mode is required for production config, compliance-sensitive behavior, pricing, billing, permissions, security posture, legal/trust messaging, public customer notices, data deletion/migration, and irreversible operations.

## References

- `wiki-template/base/12-maintenance/change-classification.md`
- `wiki-template/base/12-maintenance/context-maintenance-matrix.md`
- `wiki-template/base/12-maintenance/maintenance-contract.md`
- Relevant profile README and `profile.yaml`
- `wiki-template/base/09-agent-context/canonical-context-policy.md`
- `governance-template/base/truth-conflict-resolution.md`
- `/wiki/12-maintenance/template-vs-instance-boundary.md` when present

## Steps

1. Parse the natural prompt.
2. Detect whether the prompt, uploads, images, documents, screenshots, or naming decisions introduce new canonical truth.
3. Classify the change category.
4. Infer likely affected layers.
5. Select Wiki-first for features, architecture, product decisions, UX standards, terminology, and uploaded-source requirements.
6. Select code-discovery flow for bugs, regressions, incidents, small fixes, and runtime findings.
7. Add secondary workflows only when useful.
8. Decide execution mode.
9. Identify canonical artifacts to inspect.
10. Identify artifact type and canonical family.
11. Identify validation expectations.
12. Identify public/user-facing surfaces to review.
13. Identify context/skill maintenance requirements.
14. Execute or produce a ticket according to execution mode.

## Execution Mode Taxonomy

- `execution-first`: classify, route, implement, validate, maintain context/skills/governance, report, commit/push if allowed.
- `ticket-only`: produce execution-ready ticket/prompt only; do not implement.
- `read-only-audit`: gather evidence, write report, recommend next steps; do not modify code/config/deployments unless explicitly requested.
- `approval-gated`: prepare plan/draft/recommendation and require explicit approval before release-impacting change.

## Required Checks

Validate the work according to the selected workflow, profile gates, and maintenance matrix row.

## Output / Reporting Expectations

Report classification, routing decision, execution mode, files changed, validation performed, public surfaces reviewed, maintenance updates, and known drift.

Reports cannot override `project-truth.md`. Flag stale or conflicting reports and include truth synchronization status.

## Maintenance Contract

Use the maintenance contract for all meaningful execution-first work.
