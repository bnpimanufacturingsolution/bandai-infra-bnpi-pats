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
| docs/ARCHITECTURE.md | architecture source | architecture_context | high |
| docs/CLOUDFLARE_TRYCLOUDFLARE_TUNNEL_RUNBOOK.md | governance artifact | operational_readiness | medium |
| docs/DEVOPS_RUNBOOK.md | governance artifact | operational_readiness | medium |
| docs/GITOPS_GH_WATCH_RUNBOOK.md | governance artifact | operational_readiness | medium |
| docs/OPERATIONS.md | governance artifact | operational_readiness | medium |
| governance | governance root | quality_gates | medium |
| governance/regression-gaps.json | governance artifact | regression_guardrails | medium |
| governance/regression-gaps.md | governance artifact | regression_guardrails | medium |
| governance/regression-manifest.json | governance artifact | regression_guardrails | medium |
| governance/regression-manifest.md | governance artifact | regression_guardrails | medium |
| bnpi-pats-api/.wwg/changelog/config.yml | public surface | public_surface_updates | medium |
| bnpi-pats-api/.wwg/changelog/state.json | public surface | public_surface_updates | medium |
| bnpi-pats-api/.wwg/governance/audit-log.md | governance artifact | audit_log | medium |
| bnpi-pats-api/.wwg/governance/context-drift-detection.md | canonical context | project_master_context | medium |
| bnpi-pats-api/.wwg/governance/quality-gates.md | governance artifact | quality_gates | medium |
| bnpi-pats-api/.wwg/governance/regression-gaps.json | governance artifact | regression_guardrails | medium |
| bnpi-pats-api/.wwg/governance/regression-gaps.md | governance artifact | regression_guardrails | medium |
| bnpi-pats-api/.wwg/governance/regression-guardrail-catalog.md | governance artifact | regression_guardrails | medium |
| bnpi-pats-api/.wwg/governance/regression-manifest.json | governance artifact | regression_guardrails | medium |
| bnpi-pats-api/.wwg/governance/regression-manifest.md | governance artifact | regression_guardrails | medium |
| bnpi-pats-api/.wwg/governance/release-checklist.md | governance artifact | release_checklist | medium |
| bnpi-pats-api/.wwg/governance/security-review.md | governance artifact | quality_gates | medium |
| bnpi-pats-api/.wwg/governance/test-plan.md | governance artifact | test_plan | medium |
| bnpi-pats-api/.wwg/reports/adoption-regression-report.json | governance artifact | regression_guardrails | medium |
| bnpi-pats-api/.wwg/reports/adoption-regression-report.md | governance artifact | regression_guardrails | medium |
| bnpi-pats-api/.wwg/reports/api-testing-implementation.md | governance artifact | test_plan | medium |
| bnpi-pats-api/.wwg/reports/changelog-bump-recommendation.md | public surface | public_surface_updates | medium |
| bnpi-pats-api/.wwg/reports/changelog-preview.md | public surface | public_surface_updates | medium |
| bnpi-pats-api/.wwg/reports/context-skill-quality.md | canonical context | project_master_context | medium |
| bnpi-pats-api/.wwg/reports/cross-repo-context-reconciliation.md | canonical context | project_master_context | medium |
| bnpi-pats-api/.wwg/reports/regression-quality-report.md | governance artifact | regression_guardrails | medium |
| bnpi-pats-api/.wwg/reports/wwg-changelog-handoff.md | public surface | public_surface_updates | medium |
| bnpi-pats-api/.wwg/reports/wwg-refresh-context-report.md | canonical context | project_master_context | medium |
| bnpi-pats-api/.wwg/reports/wwg-regression-handoff.md | governance artifact | regression_guardrails | medium |
| bnpi-pats-api/.wwg/workspace/AGENTS.md | unknown scoped agent policy | specialized_agent_workflows | high |
| bnpi-pats-api/.wwg/workspace/context/architecture-context.md | architecture source | architecture_context | medium |
| bnpi-pats-api/.wwg/workspace/context/context-maintenance-matrix.md | maintenance matrix | maintenance_matrix | high |
| bnpi-pats-api/.wwg/workspace/context/domain-context.md | canonical context | domain_context | medium |
| bnpi-pats-api/.wwg/workspace/context/governance-context.md | canonical context | project_master_context | medium |
| bnpi-pats-api/.wwg/workspace/context/project-context.md | canonical context | project_master_context | medium |
| bnpi-pats-api/.wwg/workspace/context/ux-context.md | canonical context | project_master_context | medium |
| bnpi-pats-api/.wwg/workspace/prompts/bug-fix.md | prompt | workspace_prompts | medium |
| bnpi-pats-api/.wwg/workspace/prompts/feature-implementation.md | prompt | workspace_prompts | medium |
| bnpi-pats-api/.wwg/workspace/prompts/production-monitoring.md | prompt | workspace_prompts | medium |
| bnpi-pats-api/.wwg/workspace/prompts/public-discovery-maintenance.md | prompt | workspace_prompts | medium |
| bnpi-pats-api/.wwg/workspace/prompts/public-surface-update.md | prompt | workspace_prompts | medium |
| bnpi-pats-api/.wwg/workspace/prompts/runtime-infrastructure.md | prompt | workspace_prompts | medium |
| bnpi-pats-api/.wwg/workspace/prompts/task-router.md | prompt | workspace_prompts | medium |
| bnpi-pats-api/.wwg/workspace/skills/change-classifier.skill.md | skill | specialized_agent_workflows | high |
| bnpi-pats-api/.wwg/workspace/skills/context-skill-maintenance.skill.md | skill | specialized_agent_workflows | high |
| bnpi-pats-api/.wwg/workspace/skills/drift-detector.skill.md | skill | specialized_agent_workflows | high |
| bnpi-pats-api/.wwg/workspace/skills/regression-guardrail-maintenance.skill.md | skill | specialized_agent_workflows | high |
| bnpi-pats-api/.wwg/workspace/skills/regression-guardrail-maintenance.skill.md | governance artifact | regression_guardrails | medium |
| bnpi-pats-api/.wwg/workspace/skills/task-router.skill.md | skill | specialized_agent_workflows | high |
| bnpi-pats-api/.wwg/workspace/testing/manual-verification-checklist.md | governance artifact | test_plan | medium |
| bnpi-pats-api/.wwg/workspace/testing/manual-verification-evidence.json | governance artifact | test_plan | medium |
| bnpi-pats-api/.wwg/workspace/testing/non-technical-regression-checklist.md | governance artifact | regression_guardrails | medium |
| bnpi-pats-api/.wwg/workspace/testing/proposed-executable-tests.json | governance artifact | test_plan | medium |
| bnpi-pats-api/.wwg/workspace/testing/proposed-executable-tests.md | governance artifact | test_plan | medium |
| bnpi-pats-api/.wwg/workspace/testing/regression-candidate-review.json | governance artifact | regression_guardrails | medium |
| bnpi-pats-api/.wwg/workspace/testing/regression-candidate-review.md | governance artifact | regression_guardrails | medium |
| bnpi-pats-api/AGENTS.md | unknown scoped agent policy | specialized_agent_workflows | high |
| bnpi-pats-api/CHANGELOG.md | public surface | public_surface_updates | medium |
| bnpi-pats-api/docs/MIGRATION_CSV_UPLOAD_TESTING.md | governance artifact | test_plan | medium |
| bnpi-pats-api/docs/testing-maturity-audit.md | governance artifact | test_plan | medium |
| bnpi-pats-api/docs/testing-strategy.md | governance artifact | test_plan | medium |
| bnpi-pats-api/prisma/schema-postgres/statusIncident.prisma | governance artifact | reference_history | medium |
| bnpi-pats-api/prisma/schema/statusIncident.prisma | governance artifact | reference_history | medium |
| bnpi-pats-api/scripts/generate-bnpi-dm3-supporting-imports.cjs | public surface | approval_gated_public_messaging | medium |
| bnpi-pats-api/scripts/update-hikvision-metadata.ts | public surface | public_discovery_context | medium |
| bnpi-pats-api/tests/support/db-fault-invariants.ts | public surface | approval_gated_public_messaging | medium |
| bnpi-pats-api/tests/support/isolated-db-fault.guard.ts | public surface | approval_gated_public_messaging | medium |
| bnpi-pats-api/tests/support/isolated-prisma-client.ts | public surface | approval_gated_public_messaging | medium |
| bnpi-pats-api/tests/wwg-regression-coverage.spec.ts | governance artifact | regression_guardrails | medium |
| bnpi-pats-api/wiki-template/base/08-operations/monitoring.md | governance artifact | operational_readiness | medium |
| bnpi-pats-api/wiki-template/base/09-agent-context/canonical-context-policy.md | canonical context | project_master_context | medium |
| bnpi-pats-api/wiki-template/base/12-maintenance/context-maintenance-matrix.md | maintenance matrix | maintenance_matrix | high |
| bnpi-pats-api/workspace-template/base/context/context-maintenance-matrix.md | maintenance matrix | maintenance_matrix | high |
| bnpi-pats-app/.react-router/types/app/routes/admin/+types/audit-logs.ts | governance artifact | audit_log | medium |
| bnpi-pats-app/.react-router/types/app/routes/legal/+types/privacy-policy.ts | public surface | approval_gated_public_messaging | medium |
| bnpi-pats-app/.react-router/types/app/routes/legal/+types/terms-of-use.ts | public surface | approval_gated_public_messaging | medium |
| bnpi-pats-app/.react-router/types/app/routes/support/+types/faq.ts | public surface | approval_gated_public_messaging | medium |
| bnpi-pats-app/.react-router/types/app/routes/support/+types/help-desk.ts | public surface | approval_gated_public_messaging | medium |
| bnpi-pats-app/.wwg/changelog/config.yml | public surface | public_surface_updates | medium |
| bnpi-pats-app/.wwg/changelog/state.json | public surface | public_surface_updates | medium |
| bnpi-pats-app/.wwg/governance/audit-log.md | governance artifact | audit_log | medium |
| bnpi-pats-app/.wwg/governance/context-drift-detection.md | canonical context | project_master_context | medium |
| bnpi-pats-app/.wwg/governance/quality-gates.md | governance artifact | quality_gates | medium |
| bnpi-pats-app/.wwg/governance/regression-gaps.json | governance artifact | regression_guardrails | medium |
| bnpi-pats-app/.wwg/governance/regression-gaps.md | governance artifact | regression_guardrails | medium |
| bnpi-pats-app/.wwg/governance/regression-guardrail-catalog.md | governance artifact | regression_guardrails | medium |
| bnpi-pats-app/.wwg/governance/regression-manifest.json | governance artifact | regression_guardrails | medium |
| bnpi-pats-app/.wwg/governance/regression-manifest.md | governance artifact | regression_guardrails | medium |
| bnpi-pats-app/.wwg/governance/release-checklist.md | governance artifact | release_checklist | medium |
| bnpi-pats-app/.wwg/governance/security-review.md | governance artifact | quality_gates | medium |
| bnpi-pats-app/.wwg/governance/test-plan.md | governance artifact | test_plan | medium |
| bnpi-pats-app/.wwg/reports/adoption-regression-report.json | governance artifact | regression_guardrails | medium |
| bnpi-pats-app/.wwg/reports/adoption-regression-report.md | governance artifact | regression_guardrails | medium |
| bnpi-pats-app/.wwg/reports/changelog-bump-recommendation.md | public surface | public_surface_updates | medium |
| bnpi-pats-app/.wwg/reports/changelog-preview.md | public surface | public_surface_updates | medium |
| bnpi-pats-app/.wwg/reports/context-skill-quality.md | canonical context | project_master_context | medium |
| bnpi-pats-app/.wwg/reports/cross-repo-context-reconciliation.md | canonical context | project_master_context | medium |
| bnpi-pats-app/.wwg/reports/regression-priority-review.md | governance artifact | regression_guardrails | medium |
| bnpi-pats-app/.wwg/reports/testing-program-implementation.md | governance artifact | test_plan | medium |
| bnpi-pats-app/.wwg/reports/wwg-changelog-handoff.md | public surface | public_surface_updates | medium |
| bnpi-pats-app/.wwg/reports/wwg-refresh-context-report.md | canonical context | project_master_context | medium |
| bnpi-pats-app/.wwg/reports/wwg-regression-handoff.md | governance artifact | regression_guardrails | medium |
| bnpi-pats-app/.wwg/wiki/11-synthesis/context-completeness-review.md | canonical context | project_master_context | medium |
| bnpi-pats-app/.wwg/wiki/12-maintenance/context-maintenance-matrix.md | maintenance matrix | maintenance_matrix | high |
| bnpi-pats-app/.wwg/workspace/AGENTS.md | unknown scoped agent policy | specialized_agent_workflows | high |
| bnpi-pats-app/.wwg/workspace/context/architecture-context.md | architecture source | architecture_context | medium |
| bnpi-pats-app/.wwg/workspace/context/chain-state-template.md | canonical context | project_master_context | medium |
| bnpi-pats-app/.wwg/workspace/context/context-maintenance-matrix.md | maintenance matrix | maintenance_matrix | high |
| bnpi-pats-app/.wwg/workspace/context/domain-context.md | canonical context | domain_context | medium |
| bnpi-pats-app/.wwg/workspace/context/governance-context.md | canonical context | project_master_context | medium |
| bnpi-pats-app/.wwg/workspace/context/project-context.md | canonical context | project_master_context | medium |
| bnpi-pats-app/.wwg/workspace/context/task-context-index.md | canonical context | project_master_context | medium |
| bnpi-pats-app/.wwg/workspace/context/ux-context.md | canonical context | project_master_context | medium |
| bnpi-pats-app/.wwg/workspace/prompts/bug-fix.md | prompt | workspace_prompts | medium |
| bnpi-pats-app/.wwg/workspace/prompts/chain-pass-template.md | prompt | workspace_prompts | medium |
| bnpi-pats-app/.wwg/workspace/prompts/feature-implementation.md | prompt | workspace_prompts | medium |
| bnpi-pats-app/.wwg/workspace/prompts/production-monitoring.md | prompt | workspace_prompts | medium |
| bnpi-pats-app/.wwg/workspace/prompts/public-discovery-maintenance.md | prompt | workspace_prompts | medium |
| bnpi-pats-app/.wwg/workspace/prompts/public-surface-update.md | prompt | workspace_prompts | medium |
| bnpi-pats-app/.wwg/workspace/prompts/runtime-infrastructure.md | prompt | workspace_prompts | medium |
| bnpi-pats-app/.wwg/workspace/prompts/task-router.md | prompt | workspace_prompts | medium |
| bnpi-pats-app/.wwg/workspace/skills/change-classifier.skill.md | skill | specialized_agent_workflows | high |
| bnpi-pats-app/.wwg/workspace/skills/context-skill-maintenance.skill.md | skill | specialized_agent_workflows | high |
| bnpi-pats-app/.wwg/workspace/skills/drift-detector.skill.md | skill | specialized_agent_workflows | high |
| bnpi-pats-app/.wwg/workspace/skills/regression-guardrail-maintenance.skill.md | skill | specialized_agent_workflows | high |
| bnpi-pats-app/.wwg/workspace/skills/regression-guardrail-maintenance.skill.md | governance artifact | regression_guardrails | medium |
| bnpi-pats-app/.wwg/workspace/skills/task-router.skill.md | skill | specialized_agent_workflows | high |
| bnpi-pats-app/.wwg/workspace/testing/manual-verification-checklist.md | governance artifact | test_plan | medium |
| bnpi-pats-app/.wwg/workspace/testing/manual-verification-evidence.json | governance artifact | test_plan | medium |
| bnpi-pats-app/.wwg/workspace/testing/non-technical-regression-checklist.md | governance artifact | regression_guardrails | medium |
| bnpi-pats-app/.wwg/workspace/testing/proposed-executable-tests.json | governance artifact | test_plan | medium |
| bnpi-pats-app/.wwg/workspace/testing/proposed-executable-tests.md | governance artifact | test_plan | medium |
| bnpi-pats-app/.wwg/workspace/testing/regression-candidate-review.json | governance artifact | regression_guardrails | medium |
| bnpi-pats-app/.wwg/workspace/testing/regression-candidate-review.md | governance artifact | regression_guardrails | medium |
| bnpi-pats-app/AGENTS.md | unknown scoped agent policy | specialized_agent_workflows | high |
| bnpi-pats-app/app/lib/ci-cd-quality-gates.test.ts | governance artifact | test_plan | medium |
| bnpi-pats-app/app/routes/admin/audit-logs.tsx | governance artifact | audit_log | medium |
| bnpi-pats-app/app/routes/legal/privacy-policy.tsx | public surface | approval_gated_public_messaging | medium |
| bnpi-pats-app/app/routes/legal/terms-of-use.tsx | public surface | approval_gated_public_messaging | medium |
| bnpi-pats-app/app/routes/support/faq.tsx | public surface | approval_gated_public_messaging | medium |
| bnpi-pats-app/app/routes/support/help-desk.tsx | public surface | approval_gated_public_messaging | medium |
| bnpi-pats-app/app/services/audit-logs.service.ts | governance artifact | audit_log | medium |
| bnpi-pats-app/build/client/assets/audit-logs-BXkiI1U5.js | governance artifact | audit_log | medium |
| bnpi-pats-app/build/client/assets/privacy-policy-DKziWBt5.js | public surface | approval_gated_public_messaging | medium |
| bnpi-pats-app/build/client/assets/terms-of-use-BXeUTGd2.js | public surface | approval_gated_public_messaging | medium |
| bnpi-pats-app/docs/testing-coverage-matrix.md | governance artifact | test_plan | medium |
| bnpi-pats-app/docs/testing-maturity-audit.md | governance artifact | test_plan | medium |
| bnpi-pats-app/docs/testing-strategy.md | governance artifact | test_plan | medium |
| bnpi-pats-app/test-results/smoke-project-truth-devcur-30dbc-s-on-imported-VirtualBox-VM/error-context.md | canonical context | project_master_context | medium |
| bnpi-pats-app/test-results/smoke-project-truth-devcur-479f7-s-on-imported-VirtualBox-VM/error-context.md | canonical context | project_master_context | medium |
| bnpi-pats-app/test-results/smoke-project-truth-devcur-d5969-s-on-imported-VirtualBox-VM/error-context.md | canonical context | project_master_context | medium |
| reports | governance root | reference_history | medium |
| reports/adoption-regression-report.json | governance artifact | regression_guardrails | medium |
| reports/adoption-regression-report.md | governance artifact | regression_guardrails | medium |
| reports/context-skill-quality.md | canonical context | project_master_context | medium |
| terraform-hyperv/.terraform/providers/registry.terraform.io/taliesins/hyperv/1.2.1/windows_amd64/CHANGELOG.md | public surface | public_surface_updates | medium |
| vendor/zkteco-sdk/obj/Debug/net48/ZKTecoStandalone.exe.withSupportedRuntime.config | public surface | approval_gated_public_messaging | medium |
| vendor/zkteco-sdk/obj/x86/Debug/net48/ZKTecoStandalone.exe.withSupportedRuntime.config | public surface | approval_gated_public_messaging | medium |
| wiki | context root | project_master_context | medium |

## Artifacts to Register

- root_agents: AGENTS.md
- project_master_context: bnpi-pats-api/.wwg/workspace/context/project-context.md
- maintenance_matrix: bnpi-pats-api/.wwg/workspace/context/context-maintenance-matrix.md
- architecture_context: docs/ARCHITECTURE.md
- runtime_context: docs/CLOUDFLARE_TRYCLOUDFLARE_TUNNEL_RUNBOOK.md
- public_discovery_context: bnpi-pats-api/.wwg/workspace/prompts/public-discovery-maintenance.md
- domain_context: bnpi-pats-api/.wwg/workspace/context/domain-context.md

## Recommended Artifacts for Later Phases

- changelog: CHANGELOG.md
- evidence_standards: governance/evidence-standards.md

## Artifacts to Create Later

- wiki/workspace/governance native folders only after a later explicit command exists
- scoped AGENTS.md files only after local ownership is confirmed and a future flag permits creation

## Files Not to Duplicate

- .wwg/changelog/config.yml
- .wwg/changelog/state.json
- AGENTS.md
- docs/ARCHITECTURE.md
- docs/CLOUDFLARE_TRYCLOUDFLARE_TUNNEL_RUNBOOK.md
- docs/DEVOPS_RUNBOOK.md
- docs/GITOPS_GH_WATCH_RUNBOOK.md
- docs/OPERATIONS.md
- governance
- governance/regression-gaps.json
- governance/regression-gaps.md
- governance/regression-manifest.json
- governance/regression-manifest.md
- bnpi-pats-api/.wwg/changelog/config.yml
- bnpi-pats-api/.wwg/changelog/state.json
- bnpi-pats-api/.wwg/governance/audit-log.md
- bnpi-pats-api/.wwg/governance/context-drift-detection.md
- bnpi-pats-api/.wwg/governance/quality-gates.md
- bnpi-pats-api/.wwg/governance/regression-gaps.json
- bnpi-pats-api/.wwg/governance/regression-gaps.md
- bnpi-pats-api/.wwg/governance/regression-guardrail-catalog.md
- bnpi-pats-api/.wwg/governance/regression-manifest.json
- bnpi-pats-api/.wwg/governance/regression-manifest.md
- bnpi-pats-api/.wwg/governance/release-checklist.md
- bnpi-pats-api/.wwg/governance/security-review.md
- bnpi-pats-api/.wwg/governance/test-plan.md
- bnpi-pats-api/.wwg/reports/adoption-regression-report.json
- bnpi-pats-api/.wwg/reports/adoption-regression-report.md
- bnpi-pats-api/.wwg/reports/api-testing-implementation.md
- bnpi-pats-api/.wwg/reports/changelog-bump-recommendation.md
- bnpi-pats-api/.wwg/reports/changelog-preview.md
- bnpi-pats-api/.wwg/reports/context-skill-quality.md
- bnpi-pats-api/.wwg/reports/cross-repo-context-reconciliation.md
- bnpi-pats-api/.wwg/reports/regression-quality-report.md
- bnpi-pats-api/.wwg/reports/wwg-changelog-handoff.md
- bnpi-pats-api/.wwg/reports/wwg-refresh-context-report.md
- bnpi-pats-api/.wwg/reports/wwg-regression-handoff.md
- bnpi-pats-api/.wwg/workspace/AGENTS.md
- bnpi-pats-api/.wwg/workspace/context/architecture-context.md
- bnpi-pats-api/.wwg/workspace/context/context-maintenance-matrix.md
- bnpi-pats-api/.wwg/workspace/context/domain-context.md
- bnpi-pats-api/.wwg/workspace/context/governance-context.md
- bnpi-pats-api/.wwg/workspace/context/project-context.md
- bnpi-pats-api/.wwg/workspace/context/ux-context.md
- bnpi-pats-api/.wwg/workspace/prompts/bug-fix.md
- bnpi-pats-api/.wwg/workspace/prompts/feature-implementation.md
- bnpi-pats-api/.wwg/workspace/prompts/production-monitoring.md
- bnpi-pats-api/.wwg/workspace/prompts/public-discovery-maintenance.md
- bnpi-pats-api/.wwg/workspace/prompts/public-surface-update.md
- bnpi-pats-api/.wwg/workspace/prompts/runtime-infrastructure.md
- bnpi-pats-api/.wwg/workspace/prompts/task-router.md
- bnpi-pats-api/.wwg/workspace/skills/change-classifier.skill.md
- bnpi-pats-api/.wwg/workspace/skills/context-skill-maintenance.skill.md
- bnpi-pats-api/.wwg/workspace/skills/drift-detector.skill.md
- bnpi-pats-api/.wwg/workspace/skills/regression-guardrail-maintenance.skill.md
- bnpi-pats-api/.wwg/workspace/skills/regression-guardrail-maintenance.skill.md
- bnpi-pats-api/.wwg/workspace/skills/task-router.skill.md
- bnpi-pats-api/.wwg/workspace/testing/manual-verification-checklist.md
- bnpi-pats-api/.wwg/workspace/testing/manual-verification-evidence.json
- bnpi-pats-api/.wwg/workspace/testing/non-technical-regression-checklist.md
- bnpi-pats-api/.wwg/workspace/testing/proposed-executable-tests.json
- bnpi-pats-api/.wwg/workspace/testing/proposed-executable-tests.md
- bnpi-pats-api/.wwg/workspace/testing/regression-candidate-review.json
- bnpi-pats-api/.wwg/workspace/testing/regression-candidate-review.md
- bnpi-pats-api/AGENTS.md
- bnpi-pats-api/CHANGELOG.md
- bnpi-pats-api/docs/MIGRATION_CSV_UPLOAD_TESTING.md
- bnpi-pats-api/docs/testing-maturity-audit.md
- bnpi-pats-api/docs/testing-strategy.md
- bnpi-pats-api/prisma/schema-postgres/statusIncident.prisma
- bnpi-pats-api/prisma/schema/statusIncident.prisma
- bnpi-pats-api/scripts/generate-bnpi-dm3-supporting-imports.cjs
- bnpi-pats-api/scripts/update-hikvision-metadata.ts
- bnpi-pats-api/tests/support/db-fault-invariants.ts
- bnpi-pats-api/tests/support/isolated-db-fault.guard.ts
- bnpi-pats-api/tests/support/isolated-prisma-client.ts
- bnpi-pats-api/tests/wwg-regression-coverage.spec.ts
- bnpi-pats-api/wiki-template/base/08-operations/monitoring.md
- bnpi-pats-api/wiki-template/base/09-agent-context/canonical-context-policy.md
- bnpi-pats-api/wiki-template/base/12-maintenance/context-maintenance-matrix.md
- bnpi-pats-api/workspace-template/base/context/context-maintenance-matrix.md
- bnpi-pats-app/.react-router/types/app/routes/admin/+types/audit-logs.ts
- bnpi-pats-app/.react-router/types/app/routes/legal/+types/privacy-policy.ts
- bnpi-pats-app/.react-router/types/app/routes/legal/+types/terms-of-use.ts
- bnpi-pats-app/.react-router/types/app/routes/support/+types/faq.ts
- bnpi-pats-app/.react-router/types/app/routes/support/+types/help-desk.ts
- bnpi-pats-app/.wwg/changelog/config.yml
- bnpi-pats-app/.wwg/changelog/state.json
- bnpi-pats-app/.wwg/governance/audit-log.md
- bnpi-pats-app/.wwg/governance/context-drift-detection.md
- bnpi-pats-app/.wwg/governance/quality-gates.md
- bnpi-pats-app/.wwg/governance/regression-gaps.json
- bnpi-pats-app/.wwg/governance/regression-gaps.md
- bnpi-pats-app/.wwg/governance/regression-guardrail-catalog.md
- bnpi-pats-app/.wwg/governance/regression-manifest.json
- bnpi-pats-app/.wwg/governance/regression-manifest.md
- bnpi-pats-app/.wwg/governance/release-checklist.md
- bnpi-pats-app/.wwg/governance/security-review.md
- bnpi-pats-app/.wwg/governance/test-plan.md
- bnpi-pats-app/.wwg/reports/adoption-regression-report.json
- bnpi-pats-app/.wwg/reports/adoption-regression-report.md
- bnpi-pats-app/.wwg/reports/changelog-bump-recommendation.md
- bnpi-pats-app/.wwg/reports/changelog-preview.md
- bnpi-pats-app/.wwg/reports/context-skill-quality.md
- bnpi-pats-app/.wwg/reports/cross-repo-context-reconciliation.md
- bnpi-pats-app/.wwg/reports/regression-priority-review.md
- bnpi-pats-app/.wwg/reports/testing-program-implementation.md
- bnpi-pats-app/.wwg/reports/wwg-changelog-handoff.md
- bnpi-pats-app/.wwg/reports/wwg-refresh-context-report.md
- bnpi-pats-app/.wwg/reports/wwg-regression-handoff.md
- bnpi-pats-app/.wwg/wiki/11-synthesis/context-completeness-review.md
- bnpi-pats-app/.wwg/wiki/12-maintenance/context-maintenance-matrix.md
- bnpi-pats-app/.wwg/workspace/AGENTS.md
- bnpi-pats-app/.wwg/workspace/context/architecture-context.md
- bnpi-pats-app/.wwg/workspace/context/chain-state-template.md
- bnpi-pats-app/.wwg/workspace/context/context-maintenance-matrix.md
- bnpi-pats-app/.wwg/workspace/context/domain-context.md
- bnpi-pats-app/.wwg/workspace/context/governance-context.md
- bnpi-pats-app/.wwg/workspace/context/project-context.md
- bnpi-pats-app/.wwg/workspace/context/task-context-index.md
- bnpi-pats-app/.wwg/workspace/context/ux-context.md
- bnpi-pats-app/.wwg/workspace/prompts/bug-fix.md
- bnpi-pats-app/.wwg/workspace/prompts/chain-pass-template.md
- bnpi-pats-app/.wwg/workspace/prompts/feature-implementation.md
- bnpi-pats-app/.wwg/workspace/prompts/production-monitoring.md
- bnpi-pats-app/.wwg/workspace/prompts/public-discovery-maintenance.md
- bnpi-pats-app/.wwg/workspace/prompts/public-surface-update.md
- bnpi-pats-app/.wwg/workspace/prompts/runtime-infrastructure.md
- bnpi-pats-app/.wwg/workspace/prompts/task-router.md
- bnpi-pats-app/.wwg/workspace/skills/change-classifier.skill.md
- bnpi-pats-app/.wwg/workspace/skills/context-skill-maintenance.skill.md
- bnpi-pats-app/.wwg/workspace/skills/drift-detector.skill.md
- bnpi-pats-app/.wwg/workspace/skills/regression-guardrail-maintenance.skill.md
- bnpi-pats-app/.wwg/workspace/skills/regression-guardrail-maintenance.skill.md
- bnpi-pats-app/.wwg/workspace/skills/task-router.skill.md
- bnpi-pats-app/.wwg/workspace/testing/manual-verification-checklist.md
- bnpi-pats-app/.wwg/workspace/testing/manual-verification-evidence.json
- bnpi-pats-app/.wwg/workspace/testing/non-technical-regression-checklist.md
- bnpi-pats-app/.wwg/workspace/testing/proposed-executable-tests.json
- bnpi-pats-app/.wwg/workspace/testing/proposed-executable-tests.md
- bnpi-pats-app/.wwg/workspace/testing/regression-candidate-review.json
- bnpi-pats-app/.wwg/workspace/testing/regression-candidate-review.md
- bnpi-pats-app/AGENTS.md
- bnpi-pats-app/app/lib/ci-cd-quality-gates.test.ts
- bnpi-pats-app/app/routes/admin/audit-logs.tsx
- bnpi-pats-app/app/routes/legal/privacy-policy.tsx
- bnpi-pats-app/app/routes/legal/terms-of-use.tsx
- bnpi-pats-app/app/routes/support/faq.tsx
- bnpi-pats-app/app/routes/support/help-desk.tsx
- bnpi-pats-app/app/services/audit-logs.service.ts
- bnpi-pats-app/build/client/assets/audit-logs-BXkiI1U5.js
- bnpi-pats-app/build/client/assets/privacy-policy-DKziWBt5.js
- bnpi-pats-app/build/client/assets/terms-of-use-BXeUTGd2.js
- bnpi-pats-app/docs/testing-coverage-matrix.md
- bnpi-pats-app/docs/testing-maturity-audit.md
- bnpi-pats-app/docs/testing-strategy.md
- bnpi-pats-app/test-results/smoke-project-truth-devcur-30dbc-s-on-imported-VirtualBox-VM/error-context.md
- bnpi-pats-app/test-results/smoke-project-truth-devcur-479f7-s-on-imported-VirtualBox-VM/error-context.md
- bnpi-pats-app/test-results/smoke-project-truth-devcur-d5969-s-on-imported-VirtualBox-VM/error-context.md
- reports
- reports/adoption-regression-report.json
- reports/adoption-regression-report.md
- reports/context-skill-quality.md
- terraform-hyperv/.terraform/providers/registry.terraform.io/taliesins/hyperv/1.2.1/windows_amd64/CHANGELOG.md
- vendor/zkteco-sdk/obj/Debug/net48/ZKTecoStandalone.exe.withSupportedRuntime.config
- vendor/zkteco-sdk/obj/x86/Debug/net48/ZKTecoStandalone.exe.withSupportedRuntime.config
- wiki

## Changelog

- Found: no
- Last version: none detected
- Last date: none detected
- Unreleased present: no
- Weekly cadence detected: no
- Recommended next patch: 0.0.1
- Recommended action: Create a preview first with `wwg changelog generate --target . --from-git --weekly --dry-run`.
- Risk: low: missing project memory should be introduced through dry-run preview first.

## Suggested wwg.project.yaml

```yaml
wwg:
  instance_type: existing-project
  template_version: 0.6.6
  adoption_mode: conservative
  created_by: wwg-cli
  created_at: 2026-06-29
  last_updated_at: 2026-06-29
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
  project_master_context: bnpi-pats-api/.wwg/workspace/context/project-context.md
  maintenance_matrix: bnpi-pats-api/.wwg/workspace/context/context-maintenance-matrix.md
  architecture_context: docs/ARCHITECTURE.md
  runtime_context: docs/CLOUDFLARE_TRYCLOUDFLARE_TUNNEL_RUNBOOK.md
  public_discovery_context: bnpi-pats-api/.wwg/workspace/prompts/public-discovery-maintenance.md
  domain_context: bnpi-pats-api/.wwg/workspace/context/domain-context.md
recommended_artifacts:
  changelog: CHANGELOG.md
  evidence_standards: governance/evidence-standards.md
scoped_agents: []
reports:
  adoption_audit: reports/wwg-existing-audit-report.md
  adoption_audit_json: reports/wwg-existing-audit-report.json
  adoption_plan: reports/wwg-adoption-plan.md
  adoption_plan_json: reports/wwg-adoption-plan.json
  adoption_report: reports/wwg-adoption-report.md
  adoption_report_json: reports/wwg-adoption-report.json
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

## WWG Truth Synchronization

- Task mode: generated adoption planning report.
- New truth detected: no; this report records adoption-plan findings and recommended actions only.
- Wiki updated: no.
- Workspace updated: no.
- Governance review completed: yes; report contract reviewed during 2026-07-01 validation repair.
- Drift status: low; historical generated report needed required truth-sync fields.
- Canonical files changed:
  - `.wwg/reports/wwg-adoption-plan.md`
- Implementation discoveries synced:
  - None; no implementation changes were made by this report.
- Remaining stale context:
  - This report remains adoption-era evidence. Current runtime truth is governed by `.wwg/wiki/project-truth.md`, `.wwg/wiki/project-truth-summary.md`, `.wwg/workspace/current-task.md`, and newer runtime reports.
