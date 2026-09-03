# WWG Doctor Report

## Summary

Mode: existing-adopted-project
Apply mode: false
Registry present: true

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

- [ ] GitHub publishing readiness not checked (available)
  - Reason: Git or GitHub context exists.
  - Agent action: Do not publish without explicit approval; review readiness and secret safety first.
  - CLI support: `wwg publish github --dry-run`
  - Evidence: `.git`, `.github`, `package.json repository`
- [ ] Doctor/self-heal available for repairable issues (available)
  - Reason: Repairable WWG-owned issues were detected by the current command.
  - Agent action: Inspect repair reports before applying fixes.
  - CLI support: `wwg doctor`
- [ ] Upgrade or migration review available (available)
  - Reason: Template version drift or migration-pack indicators were detected.
  - Agent action: Review a migration plan before applying upgrade or migration changes.
  - CLI support: `wwg migrations plan --from <current> --to <target>`
  - Evidence: `wwg.template_version`, `migrations/`

### Recommended Next

- [ ] Review relevant Other Features (available)
  - Reason: Only detected gaps or context-relevant actions are shown.
  - Agent action: Treat recommendations as scoped support, not permission to expand the current task.
  - CLI support: `wwg brief`

Agents should follow Must Have items first. Missing Other Features are not blockers unless the current task depends on them.

## Command

`wwg doctor`

## Target

.

## Steps

- pass: audit - Audited ..
- pass: upgrade-dry-run - Upgrade dry run 0.6.0 -> 0.6.0.
- warn: validate - Validated C:\Users\Renz\Documents\hris\hris-api.
- warn: readme-validate - README validation warn.

## Files Created

- None.

## Files Updated

- .wwg/reports/readme-validation.md

## Files Skipped

- None.

## Reports

- .wwg/reports/context-skill-quality.json
- .wwg/reports/context-skill-quality.md
- .wwg/reports/readme-validation.md
- reports/wwg-audit-report.json
- reports/wwg-audit-report.md
- reports/wwg-doctor-report.json
- reports/wwg-doctor-report.md
- reports/wwg-upgrade-plan.json
- reports/wwg-upgrade-plan.md
- reports/wwg-validate-report.md

## Findings

- info: doctor-maintenance-review-suggested - Doctor check-only mode can be followed by an explicit maintenance review for long-lived or messy projects.
- low: canonical-context-policy-missing - Expected policy or coverage artifact is missing. (wiki-template/base/09-agent-context/canonical-context-policy.md)
- low: evidence-standards-missing - Expected policy or coverage artifact is missing. (governance-template/base/evidence-standards.md)
- low: last-generated-missing - Generation report exists but last_generated.context is missing. (wwg.project.yaml)
- low: maintenance-matrix-missing - Maintenance matrix artifact is missing. (wiki-template/base/12-maintenance/context-maintenance-matrix.md)
- low: maintenance-matrix-missing - Maintenance matrix artifact is missing. (workspace-template/base/context/context-maintenance-matrix.md)
- low: maintenance-matrix-missing - Maintenance matrix artifact is missing. (.wwg/wiki/12-maintenance/self-maintenance-loop.md)
- low: public-discovery-review-missing - Expected policy or coverage artifact is missing. (governance-template/base/public-discovery-review.md)
- low: public-surface-review-missing - Expected policy or coverage artifact is missing. (governance-template/base/public-surface-review.md)
- low: runtime-monitoring-missing - Expected policy or coverage artifact is missing. (wiki-template/base/08-operations/monitoring.md)
- low: truth-conflict-policy-missing - Expected policy or coverage artifact is missing. (governance-template/base/truth-conflict-resolution.md)
- info: agent-ready-artifacts-present - Agent-ready structure and evidence reports are present.
- info: ambiguous-report-classification - Some report-like files need human classification.
- info: candidate-principle-like-content - Potential principle-like content was found outside the principles folder. (AGENTS.md)
- info: candidate-principle-like-content - Potential principle-like content was found outside the principles folder. (workspace/AGENTS.md)
- info: candidate-principle-like-content - Potential principle-like content was found outside the principles folder. (workspace/context/architecture-context.md)
- info: candidate-principle-like-content - Potential principle-like content was found outside the principles folder. (workspace/context/governance-context.md)
- info: candidate-principle-like-content - Potential principle-like content was found outside the principles folder. (workspace/context/ux-context.md)
- info: changelog-detected - CHANGELOG.md was detected. Last version: none. (CHANGELOG.md)
- info: duplicate-concepts-clear - No duplicate concept hints detected beyond normal WWG structure.
- info: generated-markers-balanced - Generated marker pairs are balanced where present.
- info: governance-detected - Detected 28 governance artifact(s).
- info: json-schemas-parse - Parsed and compiled 0 JSON schema file(s).
- info: maintenance-review-recommended - This project shows maintenance drift signals. Run `wwg maintain --target <path>` to generate a structured maintenance review.
- info: mapping-architecture_context - Detected candidate for architecture_context. (workspace/context/architecture-context.md)
- info: mapping-changelog - Detected candidate for changelog. (CHANGELOG.md)
- info: mapping-domain_context - Detected candidate for domain_context. (workspace/context/domain-context.md)
- info: mapping-maintenance_matrix - Detected candidate for maintenance_matrix. (workspace/context/context-maintenance-matrix.md)
- info: mapping-project_master_context - Detected candidate for project_master_context. (workspace/context/project-context.md)
- info: mapping-public_discovery_context - Detected candidate for public_discovery_context. (workspace/prompts/public-discovery-maintenance.md)
- info: mapping-root_agents - Detected candidate for root_agents. (AGENTS.md)
- info: mapping-runtime_context - Detected candidate for runtime_context. (workspace/prompts/runtime-infrastructure.md)
- info: markdown-readable - Markdown files are non-empty and readable.
- info: principle-files-present - No Principle Brief files beyond README were found. (.wwg/wiki/principles)
- info: project-registry-valid - WWG project registry parses and matches the registry schema. (.wwg/config/wwg.project.yaml)
- info: public-surface-artifact - Public surface or discovery artifact detected. (.wwg/changelog/config.yml)
- info: public-surface-artifact - Public surface or discovery artifact detected. (.wwg/changelog/state.json)
- info: public-surface-artifact - Public surface or discovery artifact detected. (CHANGELOG.md)
- info: public-surface-artifact - Public surface or discovery artifact detected. (reports/changelog-bump-recommendation.md)
- info: public-surface-artifact - Public surface or discovery artifact detected. (reports/changelog-preview.md)
- info: public-surface-artifact - Public surface or discovery artifact detected. (reports/wwg-changelog-handoff.md)
- info: public-surface-artifact - Public surface or discovery artifact detected. (scripts/update-hikvision-metadata.ts)
- info: public-surface-detected - Detected 7 public surface/public discovery artifact(s).
- info: readme-detected - README.md was detected at 46 lines. (README.md)
- info: recommendation-governance-present - Recommendation capture is available through the Governance registry and policy. (.wwg/governance/recommendation-registry.md)
- info: root-agents-detected - Root agent instructions were detected. (AGENTS.md)
- info: runtime-skill-candidates-not-generated - Runtime skill candidate contract: not generated. (.wwg/reports/runtime-skill-candidates.json)
- info: skill-copy-policy-current - Governed skill copy policy: 5 compatibility-core skills are copied or referenced as allowed, and compatibility-domain skills are reference-only for new projects. (.wwg/config/skill-manifest.yaml)
- info: skill-manifest-present - Skill policy: manifest present, no policy violations. Skill materialization: 5 copied, 11 referenced, 0 local, 0 none. Recommended skills: 10. Enabled core skills: 6. Disabled skills: 0. (.wwg/config/skill-manifest.yaml)
- info: skill-nondev-reference-recommendations - Recommended Creative/Business skills: business.business-brief, business.decision-memo, business.sop-writing, creative.storytelling. (.wwg/config/skill-manifest.yaml)
- info: structure-present - Expected structure is present for existing-adopted-project.
- info: template-boundary-scope-skipped - Template asset boundary checks apply only to WWG template repositories.
- info: todo-fixme-tbd-detected - TODO/FIXME/TBD marker detected. (app/attendance/attendance.controller.ts)
- info: todo-fixme-tbd-detected - TODO/FIXME/TBD marker detected. (generated/prisma-postgres/runtime/library.d.ts)
- info: todo-fixme-tbd-detected - TODO/FIXME/TBD marker detected. (generated/prisma/runtime/library.d.ts)
- info: todo-fixme-tbd-detected - TODO/FIXME/TBD marker detected. (governance/regression-guardrail-catalog.md)
- info: todo-fixme-tbd-detected - TODO/FIXME/TBD marker detected. (helper/employee-to-bir2316.ts)
- info: todo-fixme-tbd-detected - TODO/FIXME/TBD marker detected. (reports/context-skill-quality.json)
- info: todo-fixme-tbd-detected - TODO/FIXME/TBD marker detected. (reports/context-skill-quality.md)
- info: todo-fixme-tbd-detected - TODO/FIXME/TBD marker detected. (reports/wwg-agent-handoff.json)
- info: todo-fixme-tbd-detected - TODO/FIXME/TBD marker detected. (reports/wwg-agent-handoff.md)
- info: todo-fixme-tbd-detected - TODO/FIXME/TBD marker detected. (reports/wwg-audit-report.json)
- info: todo-fixme-tbd-detected - TODO/FIXME/TBD marker detected. (reports/wwg-audit-report.md)
- info: todo-fixme-tbd-detected - TODO/FIXME/TBD marker detected. (reports/wwg-doctor-report.json)
- info: todo-fixme-tbd-detected - TODO/FIXME/TBD marker detected. (reports/wwg-doctor-report.md)
- info: todo-fixme-tbd-detected - TODO/FIXME/TBD marker detected. (reports/wwg-handoff-to-codex.json)
- info: todo-fixme-tbd-detected - TODO/FIXME/TBD marker detected. (reports/wwg-handoff-to-codex.md)
- info: todo-fixme-tbd-detected - TODO/FIXME/TBD marker detected. (workspace/AGENTS.md)
- info: wwg-principles-valid - Principles folder and lightweight Principle Brief checks passed.
- info: yaml-files-parse - Parsed 2 YAML file(s).
- info: json-schemas-parse - Parsed and compiled 0 JSON schema file(s).
- info: yaml-files-parse - Parsed 2 YAML file(s).
- info: project-registry-valid - WWG project registry parses and matches the registry schema. (.wwg/config/wwg.project.yaml)
- info: skill-manifest-valid - Skill Manifest validates against schemas/skill-manifest.schema.json. (.wwg/config/skill-manifest.yaml)
- info: profile-skill-recommendations-valid - Validated skill recommendation metadata for 0 profile file(s).
- info: required-directories-present - Required directories exist for wwg-native-project.
- high: wwg-report-truth-sync-fields-missing - Report claims readiness or completion without required WWG truth synchronization fields. (reports/wwg-doctor-report.md)
- high: wwg-report-truth-sync-fields-missing - Report claims readiness or completion without required WWG truth synchronization fields. (reports/wwg-upgrade-plan.md)
- high: wwg-report-truth-sync-fields-missing - Report claims readiness or completion without required WWG truth synchronization fields. (reports/wwg-upgrade-report.md)
- info: wwg-principles-valid - Principles folder and lightweight Principle Brief checks passed.
- info: generated-markers-balanced - Generated marker pairs are balanced where present.
- info: markdown-readable - Markdown files are non-empty and readable.
- info: ambiguous-report-classification - Some report-like files need human classification.
- info: markdown-contract-quality-report-generated - Markdown contract quality report completed with 139 warning(s) and 86 suggestion(s). (reports/context-skill-quality.md)
- low: readme-section-missing - README is missing expected front-door section: Install. (README.md)
- low: readme-section-missing - README is missing expected front-door section: Current Status. (README.md)
- low: readme-section-missing - README is missing expected front-door section: License. (README.md)
- low: readme-section-missing - README is missing expected front-door section: What It Is. (README.md)
- low: readme-section-missing - README is missing expected front-door section: Why It Exists. (README.md)
- low: readme-status-stale - Package version 1.0.122 is not mentioned in README status. (README.md)

## Next Recommended Commands

- wwg maintain
- wwg doctor --apply

## WWG Truth Synchronization

- Task mode: maintenance
- New truth detected: NO
- Wiki updated: NO / N/A
- Workspace updated: NO / N/A
- Governance review completed: YES
- Drift status: NONE / LOW / MEDIUM / HIGH
- Canonical files changed:
  - None by this report.
- Implementation discoveries synced:
  - None.
- Remaining stale context:
  - Review findings above.
