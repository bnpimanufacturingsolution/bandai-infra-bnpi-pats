# WWG Adoption Plan

## Summary

Conservative adoption should register existing artifacts before creating new WWG folders.

## Recommended Mode

conservative

## Existing Artifacts to Reuse

| Existing artifact | Classification | Suggested WWG role | Confidence |
|---|---|---|---|
| .wwg/changelog/config.yml | public surface | public_surface_updates | medium |
| .wwg/changelog/state.json | public surface | public_surface_updates | medium |
| AGENTS.md | root agent policy | root_agents | high |
| CHANGELOG.md | public surface | public_surface_updates | medium |
| docs/MIGRATION_CSV_UPLOAD_TESTING.md | governance artifact | test_plan | medium |
| governance | governance root | quality_gates | medium |
| governance/audit-log.md | governance artifact | audit_log | medium |
| governance/context-drift-detection.md | canonical context | project_master_context | medium |
| governance/quality-gates.md | governance artifact | quality_gates | medium |
| governance/regression-gaps.json | governance artifact | regression_guardrails | medium |
| governance/regression-gaps.md | governance artifact | regression_guardrails | medium |
| governance/regression-guardrail-catalog.md | governance artifact | regression_guardrails | medium |
| governance/regression-manifest.json | governance artifact | regression_guardrails | medium |
| governance/regression-manifest.md | governance artifact | regression_guardrails | medium |
| governance/release-checklist.md | governance artifact | release_checklist | medium |
| governance/security-review.md | governance artifact | quality_gates | medium |
| governance/test-plan.md | governance artifact | test_plan | medium |
| prisma/schema-postgres/statusIncident.prisma | governance artifact | reference_history | medium |
| prisma/schema/statusIncident.prisma | governance artifact | reference_history | medium |
| reports | governance root | reference_history | medium |
| reports/adoption-regression-report.json | governance artifact | regression_guardrails | medium |
| reports/adoption-regression-report.md | governance artifact | regression_guardrails | medium |
| reports/changelog-bump-recommendation.md | public surface | public_surface_updates | medium |
| reports/changelog-preview.md | public surface | public_surface_updates | medium |
| reports/context-skill-quality.md | canonical context | project_master_context | medium |
| reports/regression-quality-report.md | governance artifact | regression_guardrails | medium |
| reports/wwg-changelog-handoff.md | public surface | public_surface_updates | medium |
| reports/wwg-refresh-context-report.md | canonical context | project_master_context | medium |
| reports/wwg-regression-handoff.md | governance artifact | regression_guardrails | medium |
| scripts/update-hikvision-metadata.ts | public surface | public_discovery_context | medium |
| tests/wwg-regression-coverage.spec.ts | governance artifact | regression_guardrails | medium |
| wiki | context root | project_master_context | medium |
| wiki-template/base/08-operations/monitoring.md | governance artifact | operational_readiness | medium |
| wiki-template/base/09-agent-context/canonical-context-policy.md | canonical context | project_master_context | medium |
| wiki-template/base/12-maintenance/context-maintenance-matrix.md | maintenance matrix | maintenance_matrix | high |
| workspace-template/base/context/context-maintenance-matrix.md | maintenance matrix | maintenance_matrix | high |
| workspace/AGENTS.md | unknown scoped agent policy | specialized_agent_workflows | high |
| workspace/context/architecture-context.md | architecture source | architecture_context | medium |
| workspace/context/context-maintenance-matrix.md | maintenance matrix | maintenance_matrix | high |
| workspace/context/domain-context.md | canonical context | domain_context | medium |
| workspace/context/governance-context.md | canonical context | project_master_context | medium |
| workspace/context/project-context.md | canonical context | project_master_context | medium |
| workspace/context/ux-context.md | canonical context | project_master_context | medium |
| workspace/prompts/bug-fix.md | prompt | workspace_prompts | medium |
| workspace/prompts/feature-implementation.md | prompt | workspace_prompts | medium |
| workspace/prompts/production-monitoring.md | prompt | workspace_prompts | medium |
| workspace/prompts/public-discovery-maintenance.md | prompt | workspace_prompts | medium |
| workspace/prompts/public-surface-update.md | prompt | workspace_prompts | medium |
| workspace/prompts/runtime-infrastructure.md | prompt | workspace_prompts | medium |
| workspace/prompts/task-router.md | prompt | workspace_prompts | medium |
| workspace/skills | skills root | workspace_skills | medium |
| workspace/skills/change-classifier.skill.md | skill | specialized_agent_workflows | high |
| workspace/skills/context-skill-maintenance.skill.md | skill | specialized_agent_workflows | high |
| workspace/skills/drift-detector.skill.md | skill | specialized_agent_workflows | high |
| workspace/skills/regression-guardrail-maintenance.skill.md | skill | specialized_agent_workflows | high |
| workspace/skills/regression-guardrail-maintenance.skill.md | governance artifact | regression_guardrails | medium |
| workspace/skills/task-router.skill.md | skill | specialized_agent_workflows | high |
| workspace/testing/manual-verification-checklist.md | governance artifact | test_plan | medium |
| workspace/testing/manual-verification-evidence.json | governance artifact | test_plan | medium |
| workspace/testing/non-technical-regression-checklist.md | governance artifact | regression_guardrails | medium |
| workspace/testing/proposed-executable-tests.json | governance artifact | test_plan | medium |
| workspace/testing/proposed-executable-tests.md | governance artifact | test_plan | medium |
| workspace/testing/regression-candidate-review.json | governance artifact | regression_guardrails | medium |
| workspace/testing/regression-candidate-review.md | governance artifact | regression_guardrails | medium |

## Artifacts to Register

- root_agents: AGENTS.md
- changelog: CHANGELOG.md
- project_master_context: workspace/context/project-context.md
- maintenance_matrix: workspace-template/base/context/context-maintenance-matrix.md
- architecture_context: workspace/context/architecture-context.md
- runtime_context: wiki-template/base/08-operations/monitoring.md
- public_discovery_context: workspace/prompts/public-discovery-maintenance.md
- domain_context: workspace/context/domain-context.md

## Recommended Artifacts for Later Phases

- No mappings inferred.

## Artifacts to Create Later

- wiki/workspace/governance native folders only after a later explicit command exists
- scoped AGENTS.md files only after local ownership is confirmed and a future flag permits creation

## Files Not to Duplicate

- .wwg/changelog/config.yml
- .wwg/changelog/state.json
- AGENTS.md
- CHANGELOG.md
- docs/MIGRATION_CSV_UPLOAD_TESTING.md
- governance
- governance/audit-log.md
- governance/context-drift-detection.md
- governance/quality-gates.md
- governance/regression-gaps.json
- governance/regression-gaps.md
- governance/regression-guardrail-catalog.md
- governance/regression-manifest.json
- governance/regression-manifest.md
- governance/release-checklist.md
- governance/security-review.md
- governance/test-plan.md
- prisma/schema-postgres/statusIncident.prisma
- prisma/schema/statusIncident.prisma
- reports
- reports/adoption-regression-report.json
- reports/adoption-regression-report.md
- reports/changelog-bump-recommendation.md
- reports/changelog-preview.md
- reports/context-skill-quality.md
- reports/regression-quality-report.md
- reports/wwg-changelog-handoff.md
- reports/wwg-refresh-context-report.md
- reports/wwg-regression-handoff.md
- scripts/update-hikvision-metadata.ts
- tests/wwg-regression-coverage.spec.ts
- wiki
- wiki-template/base/08-operations/monitoring.md
- wiki-template/base/09-agent-context/canonical-context-policy.md
- wiki-template/base/12-maintenance/context-maintenance-matrix.md
- workspace-template/base/context/context-maintenance-matrix.md
- workspace/AGENTS.md
- workspace/context/architecture-context.md
- workspace/context/context-maintenance-matrix.md
- workspace/context/domain-context.md
- workspace/context/governance-context.md
- workspace/context/project-context.md
- workspace/context/ux-context.md
- workspace/prompts/bug-fix.md
- workspace/prompts/feature-implementation.md
- workspace/prompts/production-monitoring.md
- workspace/prompts/public-discovery-maintenance.md
- workspace/prompts/public-surface-update.md
- workspace/prompts/runtime-infrastructure.md
- workspace/prompts/task-router.md
- workspace/skills
- workspace/skills/change-classifier.skill.md
- workspace/skills/context-skill-maintenance.skill.md
- workspace/skills/drift-detector.skill.md
- workspace/skills/regression-guardrail-maintenance.skill.md
- workspace/skills/regression-guardrail-maintenance.skill.md
- workspace/skills/task-router.skill.md
- workspace/testing/manual-verification-checklist.md
- workspace/testing/manual-verification-evidence.json
- workspace/testing/non-technical-regression-checklist.md
- workspace/testing/proposed-executable-tests.json
- workspace/testing/proposed-executable-tests.md
- workspace/testing/regression-candidate-review.json
- workspace/testing/regression-candidate-review.md

## Changelog

- Found: yes
- Last version: none detected
- Last date: none detected
- Unreleased present: yes
- Weekly cadence detected: no
- Recommended next patch: 0.0.1
- Recommended action: Preserve the existing changelog and run `wwg changelog preview --target . --from-git --weekly` before any generated update.
- Risk: low: preserve existing history.

## Suggested wwg.project.yaml

```yaml
wwg:
  instance_type: existing-project
  template_version: 0.6.0
  adoption_mode: conservative
  created_by: wwg-cli
  created_at: 2026-05-16
  last_updated_at: 2026-05-16
  registry_owner: wwg
  registry_update_policy: safe_merge
layers:
  wiki:
    root: wiki
    strategy: mapped-existing
  workspace:
    root: .
    strategy: mapped-existing
  governance:
    root: governance
    strategy: mapped-existing
canonical_artifacts:
  root_agents: AGENTS.md
  changelog: CHANGELOG.md
  project_master_context: workspace/context/project-context.md
  maintenance_matrix: workspace-template/base/context/context-maintenance-matrix.md
  architecture_context: workspace/context/architecture-context.md
  runtime_context: wiki-template/base/08-operations/monitoring.md
  public_discovery_context: workspace/prompts/public-discovery-maintenance.md
  domain_context: workspace/context/domain-context.md
recommended_artifacts: {}
scoped_agents: []
reports:
  adoption_audit: reports/wwg-existing-audit-report.md
  adoption_audit_json: reports/wwg-existing-audit-report.json
  adoption_plan: reports/wwg-adoption-plan.md
  adoption_plan_json: reports/wwg-adoption-plan.json
  adoption_report: reports/wwg-adoption-report.md
  adoption_report_json: reports/wwg-adoption-report.json
  adoption_regression_baseline: .wwg/reports/adoption-regression-report.md
  adoption_regression_baseline_json: .wwg/reports/adoption-regression-report.json
  regression_manifest: .wwg/governance/regression-manifest.md
  regression_manifest_json: .wwg/governance/regression-manifest.json
  regression_gaps: .wwg/governance/regression-gaps.md
  regression_gaps_json: .wwg/governance/regression-gaps.json
  rule_traceability: .wwg/governance/rule-traceability.md
  rule_traceability_json: .wwg/governance/rule-traceability.json
```

## Risk Classification

| Risk | Path | Message | Recommendation |
|---|---|---|---|
| low | wwg.project.yaml | Create or safe-merge a WWG-owned project registry. | Allowed in conservative apply. |
| low | reports | Create audit, adoption plan, adoption report, JSON reports, and registry backups. | Allowed in conservative apply. |
| medium | n/a | Add missing WWG index or generated context files. | Defer until a later explicit init or adoption expansion phase. |
| high | n/a | Move docs, rewrite AGENTS.md, or reorganize context structure. | Do not perform in Phase 2B conservative apply. |
| approval-gated | n/a | Change production config, compliance-sensitive docs, public customer notices, permissions, security, data deletion, or migrations. | Require explicit approval and evidence-backed plan. |

## Rollback Guidance

- Conservative apply creates or safe-merges only `wwg.project.yaml` and WWG reports.
- If an existing registry is updated, a backup is written under `reports/backups/` first.
- Revert by restoring the backup over `wwg.project.yaml` or deleting newly created WWG reports and registry files.

## Next Steps

- wwg adopt --mode conservative --dry-run
