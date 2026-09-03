# change-classifier Skill

## Purpose

Classify natural developer prompts into structured change categories and choose the correct decision flow.

## Trigger

Use when a developer prompt needs to become a structured WWG change request before execution, ticket writing, audit, or approval review.

## Stop Conditions

Do not use as a replacement for implementation, evidence gathering, or governance validation after the category is known.

Stop or switch workflows when:

- Required inputs, evidence, reproduction details, or canonical artifacts are missing.
- The request enters an approval-gated area without explicit approval.
- A local governance rule, specialist review, or canonical project truth conflicts with this skill.
- The work would require WWG to claim runtime skill activation, loading, injection, mounting, routing, or execution.

## Inputs

- Natural developer prompt
- Root `AGENTS.md`
- Change classification guide
- Maintenance matrix
- Applicable profile routing keywords

## Categories

- Feature
- Bug Fix
- Architecture
- UI/UX
- Security
- Data Model
- Agent Behavior
- Public Content
- Governance
- Incident / Root Cause
- Unclear Request

## Decision Rules

- Use Wiki-first for features, architecture, product decisions, domain rules, UX standards, governance changes, and unclear requests.
- Use code-investigation-first for bugs, regressions, incidents, performance problems, production issues, and root-cause analysis.
- If a request mixes categories, classify the highest-risk category first and list secondary categories.

## Preconditions

- Required inputs are available or missing inputs are documented before action.
- Relevant Wiki truth, Workspace context, and Governance rules have been checked.
- Approval-gated areas are identified before files, configuration, public surfaces, or irreversible behavior change.
- WWG skill state is treated as governance or recommendation metadata, not runtime activation.

## Output Contract

```md
Change category:
Secondary categories:
User request:
Decision flow:
Canonical artifacts to check:
Workspace context to check:
Skills to check:
Governance checks expected:
Known ambiguity:
```

## Invariants to Preserve

- Developers may prompt naturally; agents must execute structurally.
- High-risk work must route to approval-gated mode.
- Bugs, incidents, and runtime findings start with investigation evidence before truth changes.

## References

- `wiki-template/base/12-maintenance/change-classification.md`
- `wiki-template/base/12-maintenance/context-maintenance-matrix.md`
- `.wwg/workspace/context/context-maintenance-matrix.md`
- Profile README and profile YAML when profile keywords are involved

## Steps

1. Parse verbs, nouns, profile keywords, and risk indicators in the prompt.
2. Pick a primary change category and secondary categories.
3. Pick execution mode: execution-first, ticket-only, read-only-audit, or approval-gated.
4. Identify canonical artifacts, workspace context, skills, and governance checks.
5. Return a concise classified change request.

## Required Checks

Confirm that the selected category maps to the maintenance matrix and that high-risk terms were not routed to execution-first without approval.

## Output / Reporting Expectations

Return the structured classification block and any ambiguity that needs human decision.

## Maintenance Contract

Update this skill when change categories, execution modes, profile routing keywords, or maintenance matrix columns change.

## Examples

- "Add team billing roles" -> Feature plus Security, Wiki-first.
- "Checkout broke after deploy" -> Bug Fix plus Incident, code-investigation-first.
- "Rename customer workspace to account" -> Public Content plus Domain, Wiki-first.
