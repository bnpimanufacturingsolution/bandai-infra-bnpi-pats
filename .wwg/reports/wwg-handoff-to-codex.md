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

## Scenario

Validation Failure Handoff

## Current State

- The latest WWG validation report indicates blockers or required follow-up.
- Overall status: FAIL
- PASS Required WWG directories exist - 1 finding(s)
- FAIL WWG operating loop files are present and actionable - 2 finding(s)
- HIGH wwg-report-truth-sync-fields-missing (reports/wwg-adoption-plan.md): evidence=confirmed Report claims readiness or completion without required WWG truth synchronization fields. Recommendation: Add WWG Truth Synchronization, task mode, truth/update/governance/drift fields, and remaining stale context before claiming completion.
- HIGH wwg-report-truth-sync-fields-missing (reports/wwg-existing-audit-report.md): evidence=confirmed Report claims readiness or completion without required WWG truth synchronization fields. Recommendation: Add WWG Truth Synchronization, task mode, truth/update/governance/drift fields, and remaining stale context before claiming completion.
- Candidate counts: total 0, high-risk 0, requires-approval 0, truth 0, recommendations 0, current-task 0, warnings 0.

## Next Actions

1. Fix top validation blockers before implementation or release work.
2. Prioritize generated report contract findings, truth-sync field failures, then missing test/regression findings.
3. Regenerate or repair WWG-owned generated reports through the responsible WWG command.
4. Rerun validation and test-check after each focused fix.

## Commands To Run

```bash
wwg doctor --apply
wwg validate
wwg test-check --format plain
wwg reconcile --format plain --json
# Run repo-specific validation from package.json, for example:
npm run build
npm test
npm run lint
```

## Candidate / Truth Review

- Candidate counts: total 0, high-risk 0, requires-approval 0, truth 0, recommendations 0, current-task 0, warnings 0.
- If validation reports truth-sync field failures, update the report generator or explicit report classification instead of weakening validation broadly.
- Do not rewrite `.wwg/wiki` semantic truth to mask generated-report contract failures.
- Review reconciliation candidates only after validation blockers are understood.

## Boundaries

- Do not approve, apply, or promote high-risk truth candidates automatically.
- Do not rewrite `.wwg/wiki` semantic truth during a governance-only pass.
- Do not treat Vorter runtime evidence as accepted WWG truth.
- Do not mutate `.vorter` unless the task is explicitly Vorter-owned.
- Do not mutate application source files during report-only, validation-only, upgrade-review, or governance-only passes.
- Reports and candidates are evidence; `.wwg/wiki` remains canonical truth.

## Commit Readiness

- Do not commit release or upgrade completion while `wwg validate` fails.
- `wwg validate` passes or has only documented acceptable warnings.
- `wwg test-check` has no unexplained blocker.
- Repo-specific build, tests, lint, smoke, or package checks pass.
- Boundary diff is reviewed for `.wwg/wiki`, `.vorter`, generated reports, and source changes.
- High-risk candidates are reviewed but not automatically applied.

## Stop Conditions

- `wwg validate` fails.
- High-risk truth candidates exist and have not been reviewed.
- Unexpected `.wwg/wiki` changes appear.
- Unexpected `.vorter` changes appear.
- Source code changes appear during a governance-only pass.
- Package dry-run is unsafe.
- Tests fail.

## Report Location

- .wwg/reports/wwg-validate-report.md

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
- [ ] Recommendation Registry present (missing)
  - Agent action: Complete the missing WWG-owned structure before relying on the project as agent-ready.
  - CLI support: `wwg generate-governance`
  - Evidence: `.wwg/governance/recommendation-registry.md`
- [x] Reports directory present (present)
  - Evidence: `.wwg/reports`
- [x] Root AGENTS.md present (present)
  - Evidence: `AGENTS.md`
- [ ] Test enforcement governance present (missing)
  - Agent action: Complete the missing WWG-owned structure before relying on the project as agent-ready.
  - CLI support: `wwg generate-governance`
  - Evidence: `.wwg/governance/test-enforcement.md`
- [ ] Regression guardrail governance present (missing)
  - Agent action: Complete the missing WWG-owned structure before relying on the project as agent-ready.
  - CLI support: `wwg generate-governance`
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

- [ ] Changelog missing (missing)
  - Reason: Package, product, or git history signals make release memory relevant.
  - Agent action: Prepare or review release narrative before treating changelog wording as final.
  - CLI support: `wwg changelog generate --from-git --weekly --dry-run`
  - Evidence: `CHANGELOG.md`
- [ ] Infrastructure readiness not checked (available)
  - Reason: Build, deploy, env, or infrastructure indicators were detected.
  - Agent action: Inspect infrastructure readiness before deployment-related work.
  - CLI support: `wwg infra check`
  - Evidence: `.env.example`, `.github/workflows`
- [ ] GitHub publishing readiness not checked (available)
  - Reason: Git or GitHub context exists.
  - Agent action: Do not publish without explicit approval; review readiness and secret safety first.
  - CLI support: `wwg publish github --dry-run`
  - Evidence: `.git`, `.github`, `package.json repository`
- [ ] Current version, optional candidate review (available)
  - Reason: Workspace is current. Optional semantic/candidate review artifacts exist; run only if adopting candidate surfaces.
  - Agent action: Treat candidate/review artifacts as optional review surfaces unless the user asks to promote them.
  - CLI support: `wwg audit --upgrade-candidates`
  - Evidence: `.wwg/reports/generated-project-upgrade-review.md`

### Recommended Next

- [ ] Complete Must Have readiness first (available)
  - Reason: 3 Must Have item(s) are missing.
  - Agent action: Do not treat Other Features as blockers until Must Have readiness is clear.
  - CLI support: `wwg maintain`

Agents should follow Must Have items first. Missing Other Features are not blockers unless the current task depends on them.

## Target Folder

C:\Users\anoni\OneDrive\Desktop\PROJECT_TRUTH_HYPERV_FRESH

## GitHub Repository

Not published.

## Selected Profiles

- None.

## Governed Skill State

- Skill manifest: not present
- Runtime activation: not performed by WWG; future Vorter responsibility.

## Runtime Skill Candidates

WWG generated runtime skill candidates only. WWG did not activate these skills. Vorter is responsible for runtime activation, task-level context loading, tool routing, permissions, and token budgeting. HomeDesk is responsible for user visibility, approval, disabling, and override controls.

- Status: not generated
- Reason: Skill Manifest is not present.
- Activation owner: Vorter

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

Not checked yet.

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

- .wwg/config/wwg.project.yaml
- .wwg/governance
- .wwg/governance/drift-guard.md
- .wwg/reports/adoption-audit.md
- .wwg/reports/adoption-regression-report.json
- .wwg/reports/adoption-regression-report.md
- .wwg/reports/readme-validation.md
- .wwg/reports/wwg-adoption-plan.md
- .wwg/reports/wwg-adoption-report.md
- .wwg/reports/wwg-audit-report.md
- .wwg/reports/wwg-doctor-report.md
- .wwg/reports/wwg-upgrade-history.md
- .wwg/reports/wwg-upgrade-report.md
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
- .wwg/config/skill-manifest.yaml
- .wwg/reports/truth-reconciliation-candidates.json
- .wwg/reports/truth-reconciliation-candidates.md
- .wwg/reports/wwg-infra-check-report.md
- .wwg/reports/wwg-sources-report.md
- .wwg/reports/wwg-upgrade-plan.md
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
- Select: C:\Users\anoni\OneDrive\Desktop\PROJECT_TRUTH_HYPERV_FRESH.
- Start Codex.
- Use the recommended first prompt above.
