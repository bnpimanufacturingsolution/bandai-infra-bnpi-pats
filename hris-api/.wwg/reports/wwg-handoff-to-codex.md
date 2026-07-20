# WWG Handoff to Codex

## Purpose

This file is the Codex compatibility handoff for Codex-specific flows working from WWG project truth. The generic Agent Handoff doctrine lives at `.wwg/reports/wwg-agent-handoff.md`.

Generic source APIs now prefer `src/core/agent-handoff.ts`, `src/core/agent-readiness.ts`, and `handoff.agent_report` for new code. This file remains supported for Codex compatibility.

## Required Read Order

1. `.wwg/wiki/project-truth.md`
2. `.wwg/wiki/terminology.md`
3. `.wwg/wiki/principles/README.md`
4. Relevant `.wwg/wiki/principles/*.md` files when the task may affect durable reasoning
5. `.wwg/workspace/current-task.md`
6. `.wwg/workspace/context/project-context.md`
7. `.wwg/governance/drift-guard.md`
8. `.wwg/governance/quality-gates.md`
9. Root `AGENTS.md`
10. Relevant source, tests, templates, and docs

## Summary

Your WWG project is ready for Codex-compatible implementation from project truth, Workspace context, and Governance checks.

## WWG Readiness

Must Have items are required for agent-safe operation. Other Features are recommendations, not automatic authorization to expand task scope.

### Must Have

- [x] WWG workspace present (present)
  - Evidence: `.wwg`
- [x] Project config present (present)
  - Evidence: `.wwg/config/wwg.project.yaml`
- [x] Project Truth present (present)
  - Evidence: `.wwg/wiki/project-truth.md`
- [x] Terminology present (present)
  - Evidence: `.wwg/wiki/terminology.md`
- [x] Principles README present (present)
  - Evidence: `.wwg/wiki/principles/README.md`
- [x] Workspace current task present (present)
  - Evidence: `.wwg/workspace/current-task.md`
- [x] Governance drift guard present (present)
  - Evidence: `.wwg/governance/drift-guard.md`
- [x] Recommendation Registry present (present)
  - Evidence: `.wwg/governance/recommendation-registry.md`
- [x] Reports directory present (present)
  - Evidence: `.wwg/reports`
- [x] Root AGENTS.md present (present)
  - Evidence: `AGENTS.md`
- [x] Test enforcement governance present (present)
  - Evidence: `.wwg/governance/test-enforcement.md`
- [x] Regression guardrail governance present (present)
  - Evidence: `.wwg/governance/regression-guardrail-catalog.md`
- [x] Validation report present (present)
  - Evidence: `.wwg/reports/wwg-validate-report.md`
- [x] Audit report present (present)
  - Evidence: `.wwg/reports/wwg-audit-report.md`
- [x] Agent handoff present (present)
  - Evidence: `.wwg/reports/wwg-agent-handoff.md`, `.wwg/reports/wwg-handoff-to-codex.md`
- [x] Adoption regression baseline present (present)
  - Evidence: `.wwg/governance/regression-manifest.md`, `.wwg/governance/regression-manifest.json`

### Other Features

- [ ] Upgrade or migration review available (available)
  - Reason: Template version drift or migration-pack indicators were detected.
  - Agent action: Review a migration plan before applying upgrade or migration changes.
  - CLI support: `wwg migrations plan --from <current> --to <target>`
  - Evidence: `wwg.template_version`, `migrations/`

### Recommended Next

- [ ] Review relevant Other Features (available)
  - Reason: Only detected gaps or context-relevant actions are shown.
  - Agent action: Treat recommendations as scoped support, not permission to expand the current task.
  - CLI support: `wwg status`

Agents should follow Must Have items first. Missing Other Features are not blockers unless the current task depends on them.

## Target Folder

C:\Users\Zen\Desktop\AZURO\BANDAI\hris-api

## GitHub Repository

Not published.

## Selected Profiles

- None.

## Governed Skill State

- Skill manifest: `.wwg/config/skill-manifest.yaml` (valid/readable)
- Enabled core skills: 6
- Recommended domain skills: 10
- Recommended reference-only skills: business.business-brief, business.decision-memo, business.sop-writing, creative.storytelling, public.public-discovery-maintenance, public.public-surface-update, software.bug-fix, software.feature-implementation, software.runtime-infrastructure, software.web.rendering-strategy
- Creative/Business recommendations: business.business-brief, business.decision-memo, business.sop-writing, creative.storytelling (reference-only; no skill files copied)
- Local project skills: 0
- Disabled skills: 0
- Skill materialization: none 0, reference 11, copied 5, local 0
- Skill policy: manifest present, no policy violations
- Detected domains: business.compliance, business.decision, business.operations, business.strategy, creative.story, game-design, software.api, software.security, software.testing, software.web
- Legacy copied skills: 5 compatibility-core, 0 compatibility-domain
- Runtime activation: not performed by WWG; future Vorter responsibility.

## Runtime Skill Candidates

WWG generated runtime skill candidates only. WWG did not activate these skills. Vorter is responsible for runtime activation, task-level context loading, tool routing, permissions, and token budgeting. HomeDesk is responsible for user visibility, approval, disabling, and override controls.

- Status: candidate-only contract generated
- Artifact: `.wwg/reports/runtime-skill-candidates.json`
- Activation owner: Vorter
- Candidate count: 16
- Creative/Business candidates: business.business-brief, business.decision-memo, business.sop-writing, creative.storytelling (reference-only; Vorter activation candidate only)

| Skill | State | Confidence | Activation Status | Reason |
| --- | --- | --- | --- | --- |
| business.business-brief | recommended | high | candidate_only | Business, strategy, proposal, stakeholder, or requirements evidence detected. |
| business.decision-memo | recommended | high | candidate_only | Decision, options, tradeoff, governance, or memo evidence detected. |
| business.sop-writing | recommended | high | candidate_only | SOP, process, operations, runbook, workflow, or approval evidence detected. |
| creative.storytelling | recommended | high | candidate_only | Story, narrative, lore, campaign, or game profile evidence detected. |
| public.public-discovery-maintenance | recommended | high | candidate_only | Public surface or discovery evidence suggests this skill may help. |
| public.public-surface-update | recommended | high | candidate_only | Public or customer-facing communication evidence suggests this skill may help. |
| software.bug-fix | recommended | high | candidate_only | Software, testing, bug, or incident evidence suggests this skill may help. |
| software.feature-implementation | recommended | high | candidate_only | Software project or implementation task evidence suggests this skill may help. |
| software.runtime-infrastructure | recommended | high | candidate_only | Runtime, deployment, or infrastructure evidence suggests this skill may help. |
| software.web.rendering-strategy | recommended | high | candidate_only | Rendering, SEO, hydration, or framework evidence detected. |
| core.change-classifier | enabled | high | candidate_only | Core WWG change classification behavior. |
| core.context-skill-maintenance | enabled | high | candidate_only | Core WWG context and skill synchronization behavior. |

## Project Summary

- Project: TBD
- Summary: TBD
- Status: TBD

## Key Decisions

- Use Wiki truth as the source of planning and implementation context.
- Use Workspace context, prompts, and skills as generated agent operating material.
- Use Governance checks for validation, release, evidence, and approval gates.
- Keep secrets out of Wiki truth, reports, Workspace, and commits.

## Users and Roles

TBD

## MVP Features

TBD

## Pages / Screens

TBD

## Architecture and Hosting Preferences

TBD

## Design Preferences

TBD

## Sources and References

No source index or source report was available.

Accessible external-chat files, screenshots, docs, and images should be registered through WWG source intake so they land under `.wwg/wiki/01-sources/raw/uploads/`. If a chat-only reference is not accessible as a file or upload, add a raw source note documenting the missing artifact.

Keep raw originals in `.wwg/wiki/01-sources/raw`; use `.wwg/wiki/01-sources/processed` only for later cleaned extracts or summaries.

## Infrastructure Readiness

WWG infrastructure readiness check complete.
Must Have items are required for agent-safe operation. Other Features are recommendations, not automatic authorization to expand task scope.
- [x] WWG workspace present (present)
- Evidence: `.wwg`
- [x] Project config present (present)
- Evidence: `.wwg/config/wwg.project.yaml`
- [x] Project Truth present (present)
- Evidence: `.wwg/wiki/project-truth.md`

## Governance Level and Approval Gates

Level: TBD. Approval gates should follow AGENTS.md and governance checklists.

## Current Native Structure

- Canonical WWG metadata lives under `.wwg/`: `.wwg/config`, `.wwg/wiki`, `.wwg/workspace`, `.wwg/governance`, and `.wwg/reports`.
- `.wwg/config/wwg.project.yaml` is the canonical native registry.
- Root `wwg.project.yaml` is a legacy compatibility mirror/fallback when present.
- `.wwg/reports/` is canonical for generated WWG reports.
- Root `reports/` may remain for historical, release, package, external-upload, or human-facing reports.
- Config fallback/mirror status: canonical config present; no root fallback detected.

## Truth Loop

Implementation changes must reconcile code, project truth, terminology, principles, Workspace context, Governance checks, templates, tests, generated outputs, and reports when relevant.

## Principle Review

- Principles reviewed:
  - No principle-impacting changes detected.
- Principles updated:
  - None.
- Candidate principle changes:
  - None.
- Principle drift concerns:
  - None.

No principle-impacting changes detected.

## Truth Loop Review

- Project truth updated: N/A
- Terminology updated: N/A
- Principles updated: N/A
- Governance updated: N/A
- Workspace updated: N/A
- Templates/tests updated: N/A
- Reports updated:
  - .wwg/reports/wwg-handoff-to-codex.md
  - .wwg/reports/wwg-handoff-to-codex.json
  - .wwg/reports/runtime-skill-candidates.json
  - .wwg/reports/runtime-skill-candidates.md

No truth-loop-impacting changes detected.

## Native Structure Review

- `.wwg/config/wwg.project.yaml` present: yes
- `.wwg/reports/` present: yes
- Legacy root metadata folders present: none
- Config fallback/mirror status: canonical config present; no root fallback detected

## Maintenance Awareness

- Maintenance review recommended: yes
- Reason: Current audit or handoff inputs contain maintenance drift signals.
- Suggested command: `wwg maintain --target <path>`

## Recommendation Capture

Review whether this task revealed useful future work outside the approved scope.
If yes, add or update `.wwg/governance/recommendation-registry.md`.
If no, state that no new recommendations were identified.

Recommendations are candidate work only. They are not project truth, active work, or commitments until reviewed and promoted.

## WWG Truth Synchronization

- Task mode: TBD
- New truth detected: YES / NO
- Wiki updated: YES / NO / N/A
- Workspace updated: YES / NO
- Governance review completed: YES / NO
- Drift status: NONE / LOW / MEDIUM / HIGH
- Canonical files changed:
  - TBD
- Implementation discoveries synced:
  - TBD
- Remaining stale context:
  - TBD

Reports cannot override `.wwg/wiki/project-truth.md`. If this handoff or another report conflicts with project truth, update the stale report or leave a drift finding.

## Open Questions

- Missing planning input: .wwg/wiki/02-project/project-brief.md.
- Missing planning input: .wwg/wiki/03-requirements/functional-requirements.md.
- Missing planning input: .wwg/wiki/05-architecture/deployment-model.md.
- Missing planning input: .wwg/wiki/07-ux/screens.md.
- Missing planning input: .wwg/wiki/11-synthesis/open-questions.md.
- Missing planning input: .wwg/wiki/11-synthesis/planning-summary.md.

## Generated WWG Files

- .wwg/config/skill-manifest.yaml
- .wwg/config/wwg.project.yaml
- .wwg/governance
- .wwg/governance/drift-guard.md
- .wwg/reports/adoption-audit.md
- .wwg/reports/adoption-regression-report.json
- .wwg/reports/adoption-regression-report.md
- .wwg/reports/wwg-adoption-plan.md
- .wwg/reports/wwg-adoption-report.md
- .wwg/reports/wwg-audit-report.md
- .wwg/reports/wwg-env-example-report.md
- .wwg/reports/wwg-generate-governance-report.md
- .wwg/reports/wwg-generate-workspace-report.md
- .wwg/reports/wwg-infra-check-report.md
- .wwg/reports/wwg-infra-plan-report.md
- .wwg/reports/wwg-refresh-context-report.md
- .wwg/reports/wwg-refresh-skills-report.md
- .wwg/reports/wwg-validate-report.md
- .wwg/wiki
- .wwg/wiki/principles/README.md
- .wwg/wiki/project-truth.md
- .wwg/wiki/terminology.md
- .wwg/workspace
- .wwg/workspace/current-task.md
- AGENTS.md
- reports/wwg-adoption-plan.json
- reports/wwg-adoption-report.json
- reports/wwg-existing-audit-report.json

## Missing Inputs

- .wwg/config/intake.answers.yaml
- .wwg/reports/wwg-sources-report.md
- .wwg/wiki/01-sources/source-index.json
- .wwg/wiki/01-sources/source-index.md
- .wwg/wiki/02-project/project-brief.md
- .wwg/wiki/03-requirements/functional-requirements.md
- .wwg/wiki/05-architecture/deployment-model.md
- .wwg/wiki/07-ux/design-preferences.md
- .wwg/wiki/07-ux/screens.md
- .wwg/wiki/11-synthesis/open-questions.md
- .wwg/wiki/11-synthesis/planning-summary.md
- intake answers

## Validation Result

- Report: .wwg/reports/wwg-validate-report.md

## Audit Result

- Report: .wwg/reports/wwg-audit-report.md

## Recommended First Codex Prompt

```txt
Read AGENTS.md and .wwg/reports/wwg-handoff-to-codex.md. Follow the WWG operating loop, then continue from the WWG plan and begin implementation with Codex.
```

## Implementation Log

Use `.wwg/reports/agent-implementation-log.md` for implementation notes across agents. Treat `.wwg/reports/codex-implementation-log.md` as a legacy name and prefer renaming or avoiding it in new work.

## Suggested First Implementation Tasks

```txt id="starter-tasks"
1. Read WWG project context and confirm assumptions.
2. Review open questions before building.
3. Create the initial app architecture plan.
4. Implement the first MVP page/screen.
5. Add tests and update WWG context after implementation.
```

## Next Steps

- Open VSCode.
- File -> Open Folder.
- Select: C:\Users\Zen\Desktop\AZURO\BANDAI\hris-api.
- Start Codex.
- Use the recommended first prompt above.
