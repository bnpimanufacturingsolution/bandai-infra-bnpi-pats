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
| hris-api/.wwg/changelog/config.yml | public surface | public_surface_updates | medium |
| hris-api/.wwg/changelog/state.json | public surface | public_surface_updates | medium |
| hris-api/.wwg/governance/audit-log.md | governance artifact | audit_log | medium |
| hris-api/.wwg/governance/context-drift-detection.md | canonical context | project_master_context | medium |
| hris-api/.wwg/governance/quality-gates.md | governance artifact | quality_gates | medium |
| hris-api/.wwg/governance/regression-gaps.json | governance artifact | regression_guardrails | medium |
| hris-api/.wwg/governance/regression-gaps.md | governance artifact | regression_guardrails | medium |
| hris-api/.wwg/governance/regression-guardrail-catalog.md | governance artifact | regression_guardrails | medium |
| hris-api/.wwg/governance/regression-manifest.json | governance artifact | regression_guardrails | medium |
| hris-api/.wwg/governance/regression-manifest.md | governance artifact | regression_guardrails | medium |
| hris-api/.wwg/governance/release-checklist.md | governance artifact | release_checklist | medium |
| hris-api/.wwg/governance/security-review.md | governance artifact | quality_gates | medium |
| hris-api/.wwg/governance/test-plan.md | governance artifact | test_plan | medium |
| hris-api/.wwg/reports/adoption-regression-report.json | governance artifact | regression_guardrails | medium |
| hris-api/.wwg/reports/adoption-regression-report.md | governance artifact | regression_guardrails | medium |
| hris-api/.wwg/reports/api-testing-implementation.md | governance artifact | test_plan | medium |
| hris-api/.wwg/reports/changelog-bump-recommendation.md | public surface | public_surface_updates | medium |
| hris-api/.wwg/reports/changelog-preview.md | public surface | public_surface_updates | medium |
| hris-api/.wwg/reports/context-skill-quality.md | canonical context | project_master_context | medium |
| hris-api/.wwg/reports/cross-repo-context-reconciliation.md | canonical context | project_master_context | medium |
| hris-api/.wwg/reports/regression-quality-report.md | governance artifact | regression_guardrails | medium |
| hris-api/.wwg/reports/wwg-changelog-handoff.md | public surface | public_surface_updates | medium |
| hris-api/.wwg/reports/wwg-refresh-context-report.md | canonical context | project_master_context | medium |
| hris-api/.wwg/reports/wwg-regression-handoff.md | governance artifact | regression_guardrails | medium |
| hris-api/.wwg/workspace/AGENTS.md | unknown scoped agent policy | specialized_agent_workflows | high |
| hris-api/.wwg/workspace/context/architecture-context.md | architecture source | architecture_context | medium |
| hris-api/.wwg/workspace/context/context-maintenance-matrix.md | maintenance matrix | maintenance_matrix | high |
| hris-api/.wwg/workspace/context/domain-context.md | canonical context | domain_context | medium |
| hris-api/.wwg/workspace/context/governance-context.md | canonical context | project_master_context | medium |
| hris-api/.wwg/workspace/context/project-context.md | canonical context | project_master_context | medium |
| hris-api/.wwg/workspace/context/ux-context.md | canonical context | project_master_context | medium |
| hris-api/.wwg/workspace/prompts/bug-fix.md | prompt | workspace_prompts | medium |
| hris-api/.wwg/workspace/prompts/feature-implementation.md | prompt | workspace_prompts | medium |
| hris-api/.wwg/workspace/prompts/production-monitoring.md | prompt | workspace_prompts | medium |
| hris-api/.wwg/workspace/prompts/public-discovery-maintenance.md | prompt | workspace_prompts | medium |
| hris-api/.wwg/workspace/prompts/public-surface-update.md | prompt | workspace_prompts | medium |
| hris-api/.wwg/workspace/prompts/runtime-infrastructure.md | prompt | workspace_prompts | medium |
| hris-api/.wwg/workspace/prompts/task-router.md | prompt | workspace_prompts | medium |
| hris-api/.wwg/workspace/skills/change-classifier.skill.md | skill | specialized_agent_workflows | high |
| hris-api/.wwg/workspace/skills/context-skill-maintenance.skill.md | skill | specialized_agent_workflows | high |
| hris-api/.wwg/workspace/skills/drift-detector.skill.md | skill | specialized_agent_workflows | high |
| hris-api/.wwg/workspace/skills/regression-guardrail-maintenance.skill.md | skill | specialized_agent_workflows | high |
| hris-api/.wwg/workspace/skills/regression-guardrail-maintenance.skill.md | governance artifact | regression_guardrails | medium |
| hris-api/.wwg/workspace/skills/task-router.skill.md | skill | specialized_agent_workflows | high |
| hris-api/.wwg/workspace/testing/manual-verification-checklist.md | governance artifact | test_plan | medium |
| hris-api/.wwg/workspace/testing/manual-verification-evidence.json | governance artifact | test_plan | medium |
| hris-api/.wwg/workspace/testing/non-technical-regression-checklist.md | governance artifact | regression_guardrails | medium |
| hris-api/.wwg/workspace/testing/proposed-executable-tests.json | governance artifact | test_plan | medium |
| hris-api/.wwg/workspace/testing/proposed-executable-tests.md | governance artifact | test_plan | medium |
| hris-api/.wwg/workspace/testing/regression-candidate-review.json | governance artifact | regression_guardrails | medium |
| hris-api/.wwg/workspace/testing/regression-candidate-review.md | governance artifact | regression_guardrails | medium |
| hris-api/AGENTS.md | unknown scoped agent policy | specialized_agent_workflows | high |
| hris-api/CHANGELOG.md | public surface | public_surface_updates | medium |
| hris-api/docs/MIGRATION_CSV_UPLOAD_TESTING.md | governance artifact | test_plan | medium |
| hris-api/docs/testing-maturity-audit.md | governance artifact | test_plan | medium |
| hris-api/docs/testing-strategy.md | governance artifact | test_plan | medium |
| hris-api/prisma/schema-postgres/statusIncident.prisma | governance artifact | reference_history | medium |
| hris-api/prisma/schema/statusIncident.prisma | governance artifact | reference_history | medium |
| hris-api/scripts/generate-bnpi-dm3-supporting-imports.cjs | public surface | approval_gated_public_messaging | medium |
| hris-api/scripts/update-hikvision-metadata.ts | public surface | public_discovery_context | medium |
| hris-api/tests/support/db-fault-invariants.ts | public surface | approval_gated_public_messaging | medium |
| hris-api/tests/support/isolated-db-fault.guard.ts | public surface | approval_gated_public_messaging | medium |
| hris-api/tests/support/isolated-prisma-client.ts | public surface | approval_gated_public_messaging | medium |
| hris-api/tests/wwg-regression-coverage.spec.ts | governance artifact | regression_guardrails | medium |
| hris-api/wiki-template/base/08-operations/monitoring.md | governance artifact | operational_readiness | medium |
| hris-api/wiki-template/base/09-agent-context/canonical-context-policy.md | canonical context | project_master_context | medium |
| hris-api/wiki-template/base/12-maintenance/context-maintenance-matrix.md | maintenance matrix | maintenance_matrix | high |
| hris-api/workspace-template/base/context/context-maintenance-matrix.md | maintenance matrix | maintenance_matrix | high |
| hris-app/.react-router/types/app/routes/admin/+types/audit-logs.ts | governance artifact | audit_log | medium |
| hris-app/.react-router/types/app/routes/legal/+types/privacy-policy.ts | public surface | approval_gated_public_messaging | medium |
| hris-app/.react-router/types/app/routes/legal/+types/terms-of-use.ts | public surface | approval_gated_public_messaging | medium |
| hris-app/.react-router/types/app/routes/support/+types/faq.ts | public surface | approval_gated_public_messaging | medium |
| hris-app/.react-router/types/app/routes/support/+types/help-desk.ts | public surface | approval_gated_public_messaging | medium |
| hris-app/.wwg/changelog/config.yml | public surface | public_surface_updates | medium |
| hris-app/.wwg/changelog/state.json | public surface | public_surface_updates | medium |
| hris-app/.wwg/governance/audit-log.md | governance artifact | audit_log | medium |
| hris-app/.wwg/governance/context-drift-detection.md | canonical context | project_master_context | medium |
| hris-app/.wwg/governance/quality-gates.md | governance artifact | quality_gates | medium |
| hris-app/.wwg/governance/regression-gaps.json | governance artifact | regression_guardrails | medium |
| hris-app/.wwg/governance/regression-gaps.md | governance artifact | regression_guardrails | medium |
| hris-app/.wwg/governance/regression-guardrail-catalog.md | governance artifact | regression_guardrails | medium |
| hris-app/.wwg/governance/regression-manifest.json | governance artifact | regression_guardrails | medium |
| hris-app/.wwg/governance/regression-manifest.md | governance artifact | regression_guardrails | medium |
| hris-app/.wwg/governance/release-checklist.md | governance artifact | release_checklist | medium |
| hris-app/.wwg/governance/security-review.md | governance artifact | quality_gates | medium |
| hris-app/.wwg/governance/test-plan.md | governance artifact | test_plan | medium |
| hris-app/.wwg/reports/adoption-regression-report.json | governance artifact | regression_guardrails | medium |
| hris-app/.wwg/reports/adoption-regression-report.md | governance artifact | regression_guardrails | medium |
| hris-app/.wwg/reports/changelog-bump-recommendation.md | public surface | public_surface_updates | medium |
| hris-app/.wwg/reports/changelog-preview.md | public surface | public_surface_updates | medium |
| hris-app/.wwg/reports/context-skill-quality.md | canonical context | project_master_context | medium |
| hris-app/.wwg/reports/cross-repo-context-reconciliation.md | canonical context | project_master_context | medium |
| hris-app/.wwg/reports/regression-priority-review.md | governance artifact | regression_guardrails | medium |
| hris-app/.wwg/reports/testing-program-implementation.md | governance artifact | test_plan | medium |
| hris-app/.wwg/reports/wwg-changelog-handoff.md | public surface | public_surface_updates | medium |
| hris-app/.wwg/reports/wwg-refresh-context-report.md | canonical context | project_master_context | medium |
| hris-app/.wwg/reports/wwg-regression-handoff.md | governance artifact | regression_guardrails | medium |
| hris-app/.wwg/wiki/11-synthesis/context-completeness-review.md | canonical context | project_master_context | medium |
| hris-app/.wwg/wiki/12-maintenance/context-maintenance-matrix.md | maintenance matrix | maintenance_matrix | high |
| hris-app/.wwg/workspace/AGENTS.md | unknown scoped agent policy | specialized_agent_workflows | high |
| hris-app/.wwg/workspace/context/architecture-context.md | architecture source | architecture_context | medium |
| hris-app/.wwg/workspace/context/chain-state-template.md | canonical context | project_master_context | medium |
| hris-app/.wwg/workspace/context/context-maintenance-matrix.md | maintenance matrix | maintenance_matrix | high |
| hris-app/.wwg/workspace/context/domain-context.md | canonical context | domain_context | medium |
| hris-app/.wwg/workspace/context/governance-context.md | canonical context | project_master_context | medium |
| hris-app/.wwg/workspace/context/project-context.md | canonical context | project_master_context | medium |
| hris-app/.wwg/workspace/context/task-context-index.md | canonical context | project_master_context | medium |
| hris-app/.wwg/workspace/context/ux-context.md | canonical context | project_master_context | medium |
| hris-app/.wwg/workspace/prompts/bug-fix.md | prompt | workspace_prompts | medium |
| hris-app/.wwg/workspace/prompts/chain-pass-template.md | prompt | workspace_prompts | medium |
| hris-app/.wwg/workspace/prompts/feature-implementation.md | prompt | workspace_prompts | medium |
| hris-app/.wwg/workspace/prompts/production-monitoring.md | prompt | workspace_prompts | medium |
| hris-app/.wwg/workspace/prompts/public-discovery-maintenance.md | prompt | workspace_prompts | medium |
| hris-app/.wwg/workspace/prompts/public-surface-update.md | prompt | workspace_prompts | medium |
| hris-app/.wwg/workspace/prompts/runtime-infrastructure.md | prompt | workspace_prompts | medium |
| hris-app/.wwg/workspace/prompts/task-router.md | prompt | workspace_prompts | medium |
| hris-app/.wwg/workspace/skills/change-classifier.skill.md | skill | specialized_agent_workflows | high |
| hris-app/.wwg/workspace/skills/context-skill-maintenance.skill.md | skill | specialized_agent_workflows | high |
| hris-app/.wwg/workspace/skills/drift-detector.skill.md | skill | specialized_agent_workflows | high |
| hris-app/.wwg/workspace/skills/regression-guardrail-maintenance.skill.md | skill | specialized_agent_workflows | high |
| hris-app/.wwg/workspace/skills/regression-guardrail-maintenance.skill.md | governance artifact | regression_guardrails | medium |
| hris-app/.wwg/workspace/skills/task-router.skill.md | skill | specialized_agent_workflows | high |
| hris-app/.wwg/workspace/testing/manual-verification-checklist.md | governance artifact | test_plan | medium |
| hris-app/.wwg/workspace/testing/manual-verification-evidence.json | governance artifact | test_plan | medium |
| hris-app/.wwg/workspace/testing/non-technical-regression-checklist.md | governance artifact | regression_guardrails | medium |
| hris-app/.wwg/workspace/testing/proposed-executable-tests.json | governance artifact | test_plan | medium |
| hris-app/.wwg/workspace/testing/proposed-executable-tests.md | governance artifact | test_plan | medium |
| hris-app/.wwg/workspace/testing/regression-candidate-review.json | governance artifact | regression_guardrails | medium |
| hris-app/.wwg/workspace/testing/regression-candidate-review.md | governance artifact | regression_guardrails | medium |
| hris-app/AGENTS.md | unknown scoped agent policy | specialized_agent_workflows | high |
| hris-app/app/lib/ci-cd-quality-gates.test.ts | governance artifact | test_plan | medium |
| hris-app/app/routes/admin/audit-logs.tsx | governance artifact | audit_log | medium |
| hris-app/app/routes/legal/privacy-policy.tsx | public surface | approval_gated_public_messaging | medium |
| hris-app/app/routes/legal/terms-of-use.tsx | public surface | approval_gated_public_messaging | medium |
| hris-app/app/routes/support/faq.tsx | public surface | approval_gated_public_messaging | medium |
| hris-app/app/routes/support/help-desk.tsx | public surface | approval_gated_public_messaging | medium |
| hris-app/app/services/audit-logs.service.ts | governance artifact | audit_log | medium |
| hris-app/build/client/assets/audit-logs-BXkiI1U5.js | governance artifact | audit_log | medium |
| hris-app/build/client/assets/privacy-policy-DKziWBt5.js | public surface | approval_gated_public_messaging | medium |
| hris-app/build/client/assets/terms-of-use-BXeUTGd2.js | public surface | approval_gated_public_messaging | medium |
| hris-app/docs/testing-coverage-matrix.md | governance artifact | test_plan | medium |
| hris-app/docs/testing-maturity-audit.md | governance artifact | test_plan | medium |
| hris-app/docs/testing-strategy.md | governance artifact | test_plan | medium |
| hris-app/test-results/smoke-project-truth-devcur-30dbc-s-on-imported-VirtualBox-VM/error-context.md | canonical context | project_master_context | medium |
| hris-app/test-results/smoke-project-truth-devcur-479f7-s-on-imported-VirtualBox-VM/error-context.md | canonical context | project_master_context | medium |
| hris-app/test-results/smoke-project-truth-devcur-d5969-s-on-imported-VirtualBox-VM/error-context.md | canonical context | project_master_context | medium |
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
- project_master_context: hris-api/.wwg/workspace/context/project-context.md
- maintenance_matrix: hris-api/.wwg/workspace/context/context-maintenance-matrix.md
- architecture_context: docs/ARCHITECTURE.md
- runtime_context: docs/CLOUDFLARE_TRYCLOUDFLARE_TUNNEL_RUNBOOK.md
- public_discovery_context: hris-api/.wwg/workspace/prompts/public-discovery-maintenance.md
- domain_context: hris-api/.wwg/workspace/context/domain-context.md

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
- hris-api/.wwg/changelog/config.yml
- hris-api/.wwg/changelog/state.json
- hris-api/.wwg/governance/audit-log.md
- hris-api/.wwg/governance/context-drift-detection.md
- hris-api/.wwg/governance/quality-gates.md
- hris-api/.wwg/governance/regression-gaps.json
- hris-api/.wwg/governance/regression-gaps.md
- hris-api/.wwg/governance/regression-guardrail-catalog.md
- hris-api/.wwg/governance/regression-manifest.json
- hris-api/.wwg/governance/regression-manifest.md
- hris-api/.wwg/governance/release-checklist.md
- hris-api/.wwg/governance/security-review.md
- hris-api/.wwg/governance/test-plan.md
- hris-api/.wwg/reports/adoption-regression-report.json
- hris-api/.wwg/reports/adoption-regression-report.md
- hris-api/.wwg/reports/api-testing-implementation.md
- hris-api/.wwg/reports/changelog-bump-recommendation.md
- hris-api/.wwg/reports/changelog-preview.md
- hris-api/.wwg/reports/context-skill-quality.md
- hris-api/.wwg/reports/cross-repo-context-reconciliation.md
- hris-api/.wwg/reports/regression-quality-report.md
- hris-api/.wwg/reports/wwg-changelog-handoff.md
- hris-api/.wwg/reports/wwg-refresh-context-report.md
- hris-api/.wwg/reports/wwg-regression-handoff.md
- hris-api/.wwg/workspace/AGENTS.md
- hris-api/.wwg/workspace/context/architecture-context.md
- hris-api/.wwg/workspace/context/context-maintenance-matrix.md
- hris-api/.wwg/workspace/context/domain-context.md
- hris-api/.wwg/workspace/context/governance-context.md
- hris-api/.wwg/workspace/context/project-context.md
- hris-api/.wwg/workspace/context/ux-context.md
- hris-api/.wwg/workspace/prompts/bug-fix.md
- hris-api/.wwg/workspace/prompts/feature-implementation.md
- hris-api/.wwg/workspace/prompts/production-monitoring.md
- hris-api/.wwg/workspace/prompts/public-discovery-maintenance.md
- hris-api/.wwg/workspace/prompts/public-surface-update.md
- hris-api/.wwg/workspace/prompts/runtime-infrastructure.md
- hris-api/.wwg/workspace/prompts/task-router.md
- hris-api/.wwg/workspace/skills/change-classifier.skill.md
- hris-api/.wwg/workspace/skills/context-skill-maintenance.skill.md
- hris-api/.wwg/workspace/skills/drift-detector.skill.md
- hris-api/.wwg/workspace/skills/regression-guardrail-maintenance.skill.md
- hris-api/.wwg/workspace/skills/regression-guardrail-maintenance.skill.md
- hris-api/.wwg/workspace/skills/task-router.skill.md
- hris-api/.wwg/workspace/testing/manual-verification-checklist.md
- hris-api/.wwg/workspace/testing/manual-verification-evidence.json
- hris-api/.wwg/workspace/testing/non-technical-regression-checklist.md
- hris-api/.wwg/workspace/testing/proposed-executable-tests.json
- hris-api/.wwg/workspace/testing/proposed-executable-tests.md
- hris-api/.wwg/workspace/testing/regression-candidate-review.json
- hris-api/.wwg/workspace/testing/regression-candidate-review.md
- hris-api/AGENTS.md
- hris-api/CHANGELOG.md
- hris-api/docs/MIGRATION_CSV_UPLOAD_TESTING.md
- hris-api/docs/testing-maturity-audit.md
- hris-api/docs/testing-strategy.md
- hris-api/prisma/schema-postgres/statusIncident.prisma
- hris-api/prisma/schema/statusIncident.prisma
- hris-api/scripts/generate-bnpi-dm3-supporting-imports.cjs
- hris-api/scripts/update-hikvision-metadata.ts
- hris-api/tests/support/db-fault-invariants.ts
- hris-api/tests/support/isolated-db-fault.guard.ts
- hris-api/tests/support/isolated-prisma-client.ts
- hris-api/tests/wwg-regression-coverage.spec.ts
- hris-api/wiki-template/base/08-operations/monitoring.md
- hris-api/wiki-template/base/09-agent-context/canonical-context-policy.md
- hris-api/wiki-template/base/12-maintenance/context-maintenance-matrix.md
- hris-api/workspace-template/base/context/context-maintenance-matrix.md
- hris-app/.react-router/types/app/routes/admin/+types/audit-logs.ts
- hris-app/.react-router/types/app/routes/legal/+types/privacy-policy.ts
- hris-app/.react-router/types/app/routes/legal/+types/terms-of-use.ts
- hris-app/.react-router/types/app/routes/support/+types/faq.ts
- hris-app/.react-router/types/app/routes/support/+types/help-desk.ts
- hris-app/.wwg/changelog/config.yml
- hris-app/.wwg/changelog/state.json
- hris-app/.wwg/governance/audit-log.md
- hris-app/.wwg/governance/context-drift-detection.md
- hris-app/.wwg/governance/quality-gates.md
- hris-app/.wwg/governance/regression-gaps.json
- hris-app/.wwg/governance/regression-gaps.md
- hris-app/.wwg/governance/regression-guardrail-catalog.md
- hris-app/.wwg/governance/regression-manifest.json
- hris-app/.wwg/governance/regression-manifest.md
- hris-app/.wwg/governance/release-checklist.md
- hris-app/.wwg/governance/security-review.md
- hris-app/.wwg/governance/test-plan.md
- hris-app/.wwg/reports/adoption-regression-report.json
- hris-app/.wwg/reports/adoption-regression-report.md
- hris-app/.wwg/reports/changelog-bump-recommendation.md
- hris-app/.wwg/reports/changelog-preview.md
- hris-app/.wwg/reports/context-skill-quality.md
- hris-app/.wwg/reports/cross-repo-context-reconciliation.md
- hris-app/.wwg/reports/regression-priority-review.md
- hris-app/.wwg/reports/testing-program-implementation.md
- hris-app/.wwg/reports/wwg-changelog-handoff.md
- hris-app/.wwg/reports/wwg-refresh-context-report.md
- hris-app/.wwg/reports/wwg-regression-handoff.md
- hris-app/.wwg/wiki/11-synthesis/context-completeness-review.md
- hris-app/.wwg/wiki/12-maintenance/context-maintenance-matrix.md
- hris-app/.wwg/workspace/AGENTS.md
- hris-app/.wwg/workspace/context/architecture-context.md
- hris-app/.wwg/workspace/context/chain-state-template.md
- hris-app/.wwg/workspace/context/context-maintenance-matrix.md
- hris-app/.wwg/workspace/context/domain-context.md
- hris-app/.wwg/workspace/context/governance-context.md
- hris-app/.wwg/workspace/context/project-context.md
- hris-app/.wwg/workspace/context/task-context-index.md
- hris-app/.wwg/workspace/context/ux-context.md
- hris-app/.wwg/workspace/prompts/bug-fix.md
- hris-app/.wwg/workspace/prompts/chain-pass-template.md
- hris-app/.wwg/workspace/prompts/feature-implementation.md
- hris-app/.wwg/workspace/prompts/production-monitoring.md
- hris-app/.wwg/workspace/prompts/public-discovery-maintenance.md
- hris-app/.wwg/workspace/prompts/public-surface-update.md
- hris-app/.wwg/workspace/prompts/runtime-infrastructure.md
- hris-app/.wwg/workspace/prompts/task-router.md
- hris-app/.wwg/workspace/skills/change-classifier.skill.md
- hris-app/.wwg/workspace/skills/context-skill-maintenance.skill.md
- hris-app/.wwg/workspace/skills/drift-detector.skill.md
- hris-app/.wwg/workspace/skills/regression-guardrail-maintenance.skill.md
- hris-app/.wwg/workspace/skills/regression-guardrail-maintenance.skill.md
- hris-app/.wwg/workspace/skills/task-router.skill.md
- hris-app/.wwg/workspace/testing/manual-verification-checklist.md
- hris-app/.wwg/workspace/testing/manual-verification-evidence.json
- hris-app/.wwg/workspace/testing/non-technical-regression-checklist.md
- hris-app/.wwg/workspace/testing/proposed-executable-tests.json
- hris-app/.wwg/workspace/testing/proposed-executable-tests.md
- hris-app/.wwg/workspace/testing/regression-candidate-review.json
- hris-app/.wwg/workspace/testing/regression-candidate-review.md
- hris-app/AGENTS.md
- hris-app/app/lib/ci-cd-quality-gates.test.ts
- hris-app/app/routes/admin/audit-logs.tsx
- hris-app/app/routes/legal/privacy-policy.tsx
- hris-app/app/routes/legal/terms-of-use.tsx
- hris-app/app/routes/support/faq.tsx
- hris-app/app/routes/support/help-desk.tsx
- hris-app/app/services/audit-logs.service.ts
- hris-app/build/client/assets/audit-logs-BXkiI1U5.js
- hris-app/build/client/assets/privacy-policy-DKziWBt5.js
- hris-app/build/client/assets/terms-of-use-BXeUTGd2.js
- hris-app/docs/testing-coverage-matrix.md
- hris-app/docs/testing-maturity-audit.md
- hris-app/docs/testing-strategy.md
- hris-app/test-results/smoke-project-truth-devcur-30dbc-s-on-imported-VirtualBox-VM/error-context.md
- hris-app/test-results/smoke-project-truth-devcur-479f7-s-on-imported-VirtualBox-VM/error-context.md
- hris-app/test-results/smoke-project-truth-devcur-d5969-s-on-imported-VirtualBox-VM/error-context.md
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
  project_master_context: hris-api/.wwg/workspace/context/project-context.md
  maintenance_matrix: hris-api/.wwg/workspace/context/context-maintenance-matrix.md
  architecture_context: docs/ARCHITECTURE.md
  runtime_context: docs/CLOUDFLARE_TRYCLOUDFLARE_TUNNEL_RUNBOOK.md
  public_discovery_context: hris-api/.wwg/workspace/prompts/public-discovery-maintenance.md
  domain_context: hris-api/.wwg/workspace/context/domain-context.md
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
