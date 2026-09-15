# WWG Adoption Audit

## Audit Summary

- Target: C:\Users\anoni\OneDrive\Desktop\PROJECT_TRUTH_HYPERV_FRESH
- Date: 2026-06-29
- Recommended adoption mode: infer
- Adoption readiness score: 100 / 100
- Confidence: HIGH
- Command: `wwg audit --existing`

## Evidence Reviewed

- README/docs: README.md, client-handover/node-health-appliance/README.md, data/import/README.md, docs/ARCHITECTURE.md, docs/BNPI_DESEC_CLOUDFLARE_TUNNEL_STATUS_20260629.md, docs/CLOUDFLARE_TRYCLOUDFLARE_TUNNEL_RUNBOOK.md, docs/DEVOPS_RUNBOOK.md, docs/DEV_CURRENT_GCP_VDI_PROOF_RESULT.md, docs/GAPS_AND_NEXT_GOALS.md, docs/GITOPS_CLIENT_ENV_SCALING.md, docs/GITOPS_GH_WATCH_RUNBOOK.md, docs/HEALTHCHECKS.md, docs/HYPERV_FINAL_ARTIFACT_AND_DAY2_REPAIR.md, docs/HYPERV_LAN_PROOF_20260622.md, docs/IMAGE_FORMATS.md, docs/INSTALLER_TEST_REPORT.md, docs/LOGIN_VISUAL_PROOF_SELF_LOOP_PROMPT.md, docs/OBSERVABILITY_PROOF_20260622.md, docs/OPERATIONS.md, docs/OVERNIGHT_DEVICE_EVENT_BRIDGE_DRY_RUN_PROMPT.md, docs/OVERNIGHT_DEV_CURRENT_GCP_VDI_PROOF_PROMPT.md, docs/OVERNIGHT_HARDCUTOVER_MINIO_DRIFT_REPAIR_PROMPT.md, docs/OVERNIGHT_HYPERV_HEALTH_PROOF_PROMPT.md, docs/OVERNIGHT_SOURCE_INPUTS_GCP_IMAGE_DRY_RUN_PROMPT.md, docs/OVERNIGHT_TERRAFORM_HYPERV_FRESH_REPO_PROMPT.md, docs/OVERNIGHT_VIRTUALBOX_GCP_APPLIANCE_PROOF_PROMPT.md, docs/OVERNIGHT_ZKTECO_PROJECT_TRUTH_BRIDGE_PROMPT.md, docs/OVERNIGHT_ZKTECO_RUNTIME_TRUTH_PROMPT.md, docs/SELF_HEALING_AND_DRIFT_RECOVERY.md, docs/SHORTCUTS.md, docs/TERRAFORM_HYPERV_ARCHITECTURE.md, docs/USER_JOURNEY_PROOF.md, docs/UZARO_CLOUDFLARE_CUTOVER_20260629.md, docs/V3_GCP_HYPERV_STORAGE_PROOF_20260625.md, docs/ZKTECO_RUNTIME_TRUTH.md, docs/architecture/onprem-vm-automation-and-observability.md, docs/dm-migration-workflow.md, bnpi-pats-api/.wwg/governance/README.md, bnpi-pats-api/.wwg/reports/README.md, bnpi-pats-api/.wwg/wiki/principles/README.md
- Package/config files: app/package.json, appliance/zkteco-bridge/package.json, bnpi-pats-api/generated/prisma-postgres/package.json, bnpi-pats-api/generated/prisma/package.json, bnpi-pats-api/package.json, bnpi-pats-app/package.json, package.json
- Source folders: app
- Tests: bnpi-pats-api/tests/attendance-action.helper.spec.ts, bnpi-pats-api/tests/attendance-obligation.helper.spec.ts, bnpi-pats-api/tests/attendance-realtime.helper.spec.ts, bnpi-pats-api/tests/attendance-status-migration.spec.ts, bnpi-pats-api/tests/auditLogger.spec.ts, bnpi-pats-api/tests/auth-login-identifier.spec.ts, bnpi-pats-api/tests/bulk-password.helper.spec.ts, bnpi-pats-api/tests/database-backup.helper.spec.ts, bnpi-pats-api/tests/db/isolated-db-fault.guard.spec.ts, bnpi-pats-api/tests/db/isolated-db-faults.spec.ts, bnpi-pats-api/tests/db/isolated-db.smoke.ts, bnpi-pats-api/tests/db/isolated-prisma.integration.spec.ts, bnpi-pats-api/tests/db/prepare-isolated-db.ts, bnpi-pats-api/tests/db/schema-source-truth.contract.spec.ts, bnpi-pats-api/tests/device-event-realtime.helper.spec.ts, bnpi-pats-api/tests/device-health-zkteco.spec.ts, bnpi-pats-api/tests/dm3-attendance-obligation-repair.helper.spec.ts, bnpi-pats-api/tests/dm4-biometric-proof.spec.ts, bnpi-pats-api/tests/document-field-validation.helper.spec.ts, bnpi-pats-api/tests/employee-action-block.helper.spec.ts, bnpi-pats-api/tests/employee-helper-credentials.spec.ts, bnpi-pats-api/tests/employee-import.helper.spec.ts, bnpi-pats-api/tests/employee-organization-reporting-query.contract.spec.ts, bnpi-pats-api/tests/employee-schedule.helper.spec.ts, bnpi-pats-api/tests/employeepayroll.snapshot-lock.contract.spec.ts, bnpi-pats-api/tests/enterprise-csv-loader.spec.ts, bnpi-pats-api/tests/enterprise-csv-sample-pack.spec.ts, bnpi-pats-api/tests/enterprise-migration-dm-masterlist.spec.ts, bnpi-pats-api/tests/enterprise-migration-dm-report.spec.ts, bnpi-pats-api/tests/enterprise-migration-runner-env.spec.ts
- Deployment/config: .github/workflows/promote-gitops.yml, .github/workflows/validate.yml, app/Dockerfile, appliance/docker-compose.yml, appliance/zkteco-bridge/Dockerfile, bnpi-pats-api/Dockerfile, bnpi-pats-api/docker-compose.yml, bnpi-pats-api/infrastructure/onprem/observability/docker-compose.yml, bnpi-pats-app/Dockerfile, bnpi-pats-app/firebase.json
- Existing agent/context files: .wwg/changelog/config.yml, .wwg/changelog/state.json, .wwg/readme/config.yml, .wwg/readme/state.json, AGENTS.md, bnpi-pats-api/.wwg/workspace/AGENTS.md, bnpi-pats-api/AGENTS.md, bnpi-pats-app/.wwg/workspace/AGENTS.md, bnpi-pats-app/AGENTS.md

## Observed Reality

- Product/app identity: CONFIRMED - project_truth_hyperv_fresh Evidence: package.json (package name)
- Product category: INFERRED - Web application Evidence: package/source (frontend framework or route folders detected)
- Tech stack: NEEDS_CONFIRMATION - NEEDS_CONFIRMATION Evidence: package/config (no known stack metadata detected)
- Runtime/build tools: CONFIRMED - test Evidence: package.json (scripts)
- Main entry points: CONFIRMED - index.js, app/server.js, appliance/zkteco-bridge/src/index.js, bnpi-pats-api/app/Rule/index.ts, bnpi-pats-api/app/activityLogging/index.ts, bnpi-pats-api/app/agency/index.ts, bnpi-pats-api/app/applicant/index.ts, bnpi-pats-api/app/attendance/index.ts, bnpi-pats-api/app/auditLogging/index.ts, bnpi-pats-api/app/auth/index.ts, bnpi-pats-api/app/benefitType/index.ts, bnpi-pats-api/app/boardingProcess/index.ts, bnpi-pats-api/app/boardingTemplate/index.ts Evidence: index.js (entry point candidate); app/server.js (entry point candidate); appliance/zkteco-bridge/src/index.js (entry point candidate); bnpi-pats-api/app/Rule/index.ts (entry point candidate); bnpi-pats-api/app/activityLogging/index.ts (entry point candidate); bnpi-pats-api/app/agency/index.ts (entry point candidate); bnpi-pats-api/app/applicant/index.ts (entry point candidate); bnpi-pats-api/app/attendance/index.ts (entry point candidate); bnpi-pats-api/app/auditLogging/index.ts (entry point candidate); bnpi-pats-api/app/auth/index.ts (entry point candidate); bnpi-pats-api/app/benefitType/index.ts (entry point candidate); bnpi-pats-api/app/boardingProcess/index.ts (entry point candidate); bnpi-pats-api/app/boardingTemplate/index.ts (entry point candidate)
- Main implemented features: INFERRED - Current Working Branch, Main Documents, Normal CLI Flow, VHDX Autopilot, Target Architecture, Target Repo Shape, Image Format Targets, Ownership Rules, app/server Evidence: README.md (README headings or route files)
- User roles/surfaces: INFERRED - user, owner, guest Evidence: README/source (role-like terms detected)
- Data persistence: CONFIRMED - bnpi-pats-api/app/migration/dm3-migration.adapter.ts, bnpi-pats-api/app/migration/dm3-workbook-import.service.ts, bnpi-pats-api/app/migration/dm4-migration.adapter.ts, bnpi-pats-api/app/migration/enterprise-migration.service.ts, bnpi-pats-api/app/migration/index.ts, bnpi-pats-api/app/migration/migration-dry-run.service.ts, bnpi-pats-api/app/migration/migration-event.service.ts, bnpi-pats-api/app/migration/migration-orchestrator.service.ts Evidence: bnpi-pats-api/app/migration/dm3-migration.adapter.ts (persistence indicator)
- Auth/security: CONFIRMED - appliance/bin/project-truth-console-session-hook.sh, bnpi-pats-api/.wwg/governance/security-review.md, bnpi-pats-api/app/auth/auth.controller.ts, bnpi-pats-api/app/auth/auth.router.ts, bnpi-pats-api/app/auth/index.ts, bnpi-pats-api/config/security.ts, bnpi-pats-api/docs/MD Files/auth-api.md, bnpi-pats-api/docs/SECURITY.md Evidence: appliance/bin/project-truth-console-session-hook.sh (auth/security indicator)
- Payments/billing: CONFIRMED - bnpi-pats-app/.react-router/types/app/routes/hr/+types/billings.$id.ts, bnpi-pats-app/.react-router/types/app/routes/hr/+types/billings.ts, bnpi-pats-app/app/components/templates/common/billings-template.tsx, bnpi-pats-app/app/lib/mock-soa-billings.ts, bnpi-pats-app/app/routes/hr/billings.$id.tsx, bnpi-pats-app/app/routes/hr/billings.tsx, bnpi-pats-app/build/client/assets/billings-aJ54d_bS.js, bnpi-pats-app/build/client/assets/billings._id-sRB6gk7r.js Evidence: bnpi-pats-app/.react-router/types/app/routes/hr/+types/billings.$id.ts (payments/billing indicator)
- Deployment/runtime: CONFIRMED - .github/workflows/promote-gitops.yml, .github/workflows/validate.yml, app/Dockerfile, appliance/docker-compose.yml, appliance/zkteco-bridge/Dockerfile, bnpi-pats-api/Dockerfile, bnpi-pats-api/docker-compose.yml, bnpi-pats-api/infrastructure/onprem/observability/docker-compose.yml, bnpi-pats-app/Dockerfile, bnpi-pats-app/firebase.json Evidence: .github/workflows/promote-gitops.yml (deployment config); .github/workflows/validate.yml (deployment config); app/Dockerfile (deployment config); appliance/docker-compose.yml (deployment config); appliance/zkteco-bridge/Dockerfile (deployment config); bnpi-pats-api/Dockerfile (deployment config); bnpi-pats-api/docker-compose.yml (deployment config); bnpi-pats-api/infrastructure/onprem/observability/docker-compose.yml (deployment config); bnpi-pats-app/Dockerfile (deployment config); bnpi-pats-app/firebase.json (deployment config)

## Inferred Truth

- Product identity: INFERRED - project_truth_hyperv_fresh Evidence: package.json (package name)
- Product category: INFERRED - Web application Evidence: package/source (frontend framework or route folders detected)
- Primary users: INFERRED - user, owner, guest Evidence: README/source (role-like terms detected)
- Core features: INFERRED - Current Working Branch, Main Documents, Normal CLI Flow, VHDX Autopilot, Target Architecture, Target Repo Shape, Image Format Targets, Ownership Rules, app/server Evidence: README.md (README headings or route files)
- Architecture: INFERRED - source folders: app Evidence: source/config (folders and package metadata)
- Safety/production boundaries: INFERRED - mock/demo files detected Evidence: README/source/package (safety boundary indicators)

## Conflicts and Drift Risks

- README vs code: CONFIRMED - No direct issue detected by lightweight audit.
- UI/copy vs implementation: CONFIRMED - No direct issue detected by lightweight audit.
- package metadata vs actual stack: NEEDS_CONFIRMATION - JS/TS source detected without package dependencies. Recommendation: Confirm package metadata location or monorepo package boundaries.
- mock/demo vs production claims: CONFIRMED - No direct issue detected by lightweight audit.
- terminology drift: CONFIRMED - No direct issue detected by lightweight audit.
- stale/generated files: CONFIRMED - No direct issue detected by lightweight audit.
- missing tests/checks: CONFIRMED - No direct issue detected by lightweight audit.

## Open Questions

- Confirm product category. Why: Category affects profile selection, architecture defaults, and governance gates. Evidence: INFERRED: Web application
- Confirm primary users and role names. Why: Roles affect permissions, UX, terminology, and task routing. Evidence: INFERRED: user, owner, guest

## Recommended Adoption Plan

- Recommended mode: infer
- Files WWG should create/update: `.wwg/wiki/project-truth.md`, `.wwg/wiki/terminology.md`, `.wwg/wiki/principles/README.md`, `.wwg/workspace/current-task.md`, `.wwg/governance/truth-capture.md`, `.wwg/governance/drift-guard.md`, `.wwg/reports/adoption-audit.md`, `AGENTS.md`.
- Follow-up actions: confirm inferred truth, resolve conflicts, answer open questions, and run `wwg validate --target <project>`.

Labels used: CONFIRMED, INFERRED, NEEDS_CONFIRMATION, CONFLICTING, STALE.


## Legacy Registry Mapping Summary

Detected 176 artifact(s). Registry-first mode: conservative.

## Observed Facts

- Observed facts are listed in the audit sections above and are backed by README/docs, package/config, source, test, deployment, and agent/context evidence.

## Inferred Truth

- Inferred truth is labeled above and should be reviewed before it becomes confirmed canonical truth.

## Conflicts

- package metadata vs actual stack: NEEDS_CONFIRMATION - JS/TS source detected without package dependencies.

## Open Questions

- Confirm product category. Evidence: INFERRED: Web application
- Confirm primary users and role names. Evidence: INFERRED: user, owner, guest

## Recommended Follow-Up

- Run `wwg adopt --mode infer --target <project>` to populate initial WWG truth from evidence.
- Review `.wwg/wiki/project-truth.md` before treating inferred truth as confirmed.

Reports are reference history. `.wwg/wiki/project-truth.md` is the canonical current truth once reviewed and maintained.

## Adoption Readiness Score

Score: 93 / 105

### Strengths

- Root AGENTS.md exists
- Canonical context candidates detected
- Maintenance matrix detected
- Governance or operations assets detected

### Gaps

- None.

### Scoring Categories

| Category | Score | Reason |
|---|---:|---|
| agent instructions | 10 / 10 | Root agent policy exists. |
| canonical context | 10 / 10 | Context candidates detected. |
| maintenance matrix | 10 / 10 | Maintenance matrix detected. |
| governance assets | 10 / 10 | Governance or operations assets detected. |
| skills/prompts | 5 / 5 | Skills or prompts detected. |
| public surface/discovery | 5 / 5 | Public surface or discovery assets detected. |
| project structure clarity | 0 / 10 | Implementation boundaries detected. |
| readme/docs quality | 10 / 10 | README or docs exist for product reality. |
| tests/checks | 10 / 10 | Tests or specs detected. |
| deployment config | 10 / 10 | Deployment/runtime config detected. |
| entry point clarity | 5 / 5 | Conventional entry points detected. |
| mock vs production boundaries | 3 / 5 | Mock/demo/sample signals detected and should be documented. |
| registry/readiness | 5 / 5 | WWG registry exists. |

### Recommended Adoption Mode

conservative

## Command

`wwg audit --existing`

## Repository Type Detected

wwg-native-project

## Existing Artifacts Detected

| Existing artifact | Classification | Suggested WWG role | Confidence |
|---|---|---|---|
| .github/workflows | project structure | runtime_context | medium |
| .github/workflows | project structure | impact_zone | medium |
| .wwg/changelog/config.yml | public surface | public_surface_updates | medium |
| .wwg/changelog/state.json | public surface | public_surface_updates | medium |
| AGENTS.md | root agent policy | root_agents | high |
| app/Dockerfile | runtime structure | runtime_context | medium |
| appliance/docker-compose.yml | runtime structure | runtime_context | medium |
| appliance/zkteco-bridge/Dockerfile | runtime structure | runtime_context | medium |
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
| bnpi-pats-api/docker-compose.yml | runtime structure | runtime_context | medium |
| bnpi-pats-api/Dockerfile | runtime structure | runtime_context | medium |
| bnpi-pats-api/docs/MIGRATION_CSV_UPLOAD_TESTING.md | governance artifact | test_plan | medium |
| bnpi-pats-api/docs/testing-maturity-audit.md | governance artifact | test_plan | medium |
| bnpi-pats-api/docs/testing-strategy.md | governance artifact | test_plan | medium |
| bnpi-pats-api/infrastructure/onprem/observability/docker-compose.yml | runtime structure | runtime_context | medium |
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
| bnpi-pats-app/Dockerfile | runtime structure | runtime_context | medium |
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

## Findings by Evidence Level

### confirmed

- INFO governance-detected: evidence=confirmed risk=low Detected 73 governance artifact(s). Recommendation: Reuse and register existing governance artifacts.
- INFO mapping-architecture_context (docs/ARCHITECTURE.md): evidence=confirmed risk=low Detected candidate for architecture_context. Recommendation: Register docs/ARCHITECTURE.md as architecture_context; do not duplicate it.
- INFO mapping-domain_context (bnpi-pats-api/.wwg/workspace/context/domain-context.md): evidence=confirmed risk=low Detected candidate for domain_context. Recommendation: Register bnpi-pats-api/.wwg/workspace/context/domain-context.md as domain_context; do not duplicate it.
- INFO mapping-maintenance_matrix (bnpi-pats-api/.wwg/workspace/context/context-maintenance-matrix.md): evidence=confirmed risk=low Detected candidate for maintenance_matrix. Recommendation: Register bnpi-pats-api/.wwg/workspace/context/context-maintenance-matrix.md as maintenance_matrix; do not duplicate it.
- INFO mapping-project_master_context (bnpi-pats-api/.wwg/workspace/context/project-context.md): evidence=confirmed risk=low Detected candidate for project_master_context. Recommendation: Register bnpi-pats-api/.wwg/workspace/context/project-context.md as project_master_context; do not duplicate it.
- INFO mapping-public_discovery_context (bnpi-pats-api/.wwg/workspace/prompts/public-discovery-maintenance.md): evidence=confirmed risk=low Detected candidate for public_discovery_context. Recommendation: Register bnpi-pats-api/.wwg/workspace/prompts/public-discovery-maintenance.md as public_discovery_context; do not duplicate it.
- INFO mapping-root_agents (AGENTS.md): evidence=confirmed risk=low Detected candidate for root_agents. Recommendation: Register AGENTS.md as root_agents; do not duplicate it.
- INFO mapping-runtime_context (docs/CLOUDFLARE_TRYCLOUDFLARE_TUNNEL_RUNBOOK.md): evidence=confirmed risk=low Detected candidate for runtime_context. Recommendation: Register docs/CLOUDFLARE_TRYCLOUDFLARE_TUNNEL_RUNBOOK.md as runtime_context; do not duplicate it.
- INFO public-surface-artifact (.wwg/changelog/config.yml): evidence=confirmed risk=low Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact (.wwg/changelog/state.json): evidence=confirmed risk=low Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact (bnpi-pats-api/.wwg/changelog/config.yml): evidence=confirmed risk=low Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact (bnpi-pats-api/.wwg/changelog/state.json): evidence=confirmed risk=low Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact (bnpi-pats-api/.wwg/reports/changelog-bump-recommendation.md): evidence=confirmed risk=low Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact (bnpi-pats-api/.wwg/reports/changelog-preview.md): evidence=confirmed risk=low Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact (bnpi-pats-api/.wwg/reports/wwg-changelog-handoff.md): evidence=confirmed risk=low Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact (bnpi-pats-api/CHANGELOG.md): evidence=confirmed risk=low Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact (bnpi-pats-api/scripts/generate-bnpi-dm3-supporting-imports.cjs): evidence=confirmed risk=approval-gated Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact (bnpi-pats-api/scripts/update-hikvision-metadata.ts): evidence=confirmed risk=low Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact (bnpi-pats-api/tests/support/db-fault-invariants.ts): evidence=confirmed risk=approval-gated Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact (bnpi-pats-api/tests/support/isolated-db-fault.guard.ts): evidence=confirmed risk=approval-gated Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact (bnpi-pats-api/tests/support/isolated-prisma-client.ts): evidence=confirmed risk=approval-gated Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact (bnpi-pats-app/.react-router/types/app/routes/legal/+types/privacy-policy.ts): evidence=confirmed risk=approval-gated Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact (bnpi-pats-app/.react-router/types/app/routes/legal/+types/terms-of-use.ts): evidence=confirmed risk=approval-gated Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact (bnpi-pats-app/.react-router/types/app/routes/support/+types/faq.ts): evidence=confirmed risk=approval-gated Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact (bnpi-pats-app/.react-router/types/app/routes/support/+types/help-desk.ts): evidence=confirmed risk=approval-gated Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact (bnpi-pats-app/.wwg/changelog/config.yml): evidence=confirmed risk=low Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact (bnpi-pats-app/.wwg/changelog/state.json): evidence=confirmed risk=low Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact (bnpi-pats-app/.wwg/reports/changelog-bump-recommendation.md): evidence=confirmed risk=low Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact (bnpi-pats-app/.wwg/reports/changelog-preview.md): evidence=confirmed risk=low Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact (bnpi-pats-app/.wwg/reports/wwg-changelog-handoff.md): evidence=confirmed risk=low Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact (bnpi-pats-app/app/routes/legal/privacy-policy.tsx): evidence=confirmed risk=approval-gated Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact (bnpi-pats-app/app/routes/legal/terms-of-use.tsx): evidence=confirmed risk=approval-gated Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact (bnpi-pats-app/app/routes/support/faq.tsx): evidence=confirmed risk=approval-gated Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact (bnpi-pats-app/app/routes/support/help-desk.tsx): evidence=confirmed risk=approval-gated Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact (bnpi-pats-app/build/client/assets/privacy-policy-DKziWBt5.js): evidence=confirmed risk=approval-gated Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact (bnpi-pats-app/build/client/assets/terms-of-use-BXeUTGd2.js): evidence=confirmed risk=approval-gated Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact (terraform-hyperv/.terraform/providers/registry.terraform.io/taliesins/hyperv/1.2.1/windows_amd64/CHANGELOG.md): evidence=confirmed risk=low Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact (vendor/zkteco-sdk/obj/Debug/net48/ZKTecoStandalone.exe.withSupportedRuntime.config): evidence=confirmed risk=approval-gated Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact (vendor/zkteco-sdk/obj/x86/Debug/net48/ZKTecoStandalone.exe.withSupportedRuntime.config): evidence=confirmed risk=approval-gated Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-detected: evidence=confirmed risk=low Detected 31 public surface/public discovery artifact(s). Recommendation: Map existing public discovery sources before proposing new ones.
- INFO root-agents-detected (AGENTS.md): evidence=confirmed risk=low Root agent instructions were detected. Recommendation: Map this file as canonical_artifacts.root_agents.

### likely

- MEDIUM recommended-changelog (CHANGELOG.md): evidence=likely risk=medium Recommended artifact is not currently mapped or detected. Recommendation: Create only in a later explicit adoption/init phase.
- MEDIUM recommended-evidence_standards (governance/evidence-standards.md): evidence=likely risk=medium Recommended artifact is not currently mapped or detected. Recommendation: Create only in a later explicit adoption/init phase.

### hypotheses

- No findings.

### unknowns/gaps

- No findings.

## Suggested WWG Mappings

- root_agents: AGENTS.md
- project_master_context: bnpi-pats-api/.wwg/workspace/context/project-context.md
- maintenance_matrix: bnpi-pats-api/.wwg/workspace/context/context-maintenance-matrix.md
- architecture_context: docs/ARCHITECTURE.md
- runtime_context: docs/CLOUDFLARE_TRYCLOUDFLARE_TUNNEL_RUNBOOK.md
- public_discovery_context: bnpi-pats-api/.wwg/workspace/prompts/public-discovery-maintenance.md
- domain_context: bnpi-pats-api/.wwg/workspace/context/domain-context.md

## Recommended Artifacts

- changelog: CHANGELOG.md
- evidence_standards: governance/evidence-standards.md

## Changelog

- Found: no
- Last version: none detected
- Last date: none detected
- Unreleased present: no
- Weekly cadence detected: no
- Recommended next patch: 0.0.1
- Recommended action: Create a preview first with `wwg changelog generate --target . --from-git --weekly --dry-run`.
- Risk: low: missing project memory should be introduced through dry-run preview first.

## Scoped AGENTS.md Recommendations

### Recommended

- None.

### Not Recommended / Cross-Cutting

| Path | Reason |
|---|---|
| auth | not-recommended: Authentication is usually cross-cutting; keep policy in canonical context unless ownership is isolated. |
| billing | not-recommended: Billing is approval-sensitive and cross-cutting; use governance and canonical context first. |
| shared | not-recommended: Shared code affects multiple owners; scoped instructions can conflict with broader truth. |
| features/* | not-recommended: Feature folders are often too narrow; prefer the maintenance matrix for routing. |

## Missing WWG Artifacts

- changelog
- evidence_standards

## Public Surface Findings

- INFO public-surface-detected: evidence=confirmed risk=low Detected 31 public surface/public discovery artifact(s). Recommendation: Map existing public discovery sources before proposing new ones.

## Governance Findings

- INFO governance-detected: evidence=confirmed risk=low Detected 73 governance artifact(s). Recommendation: Reuse and register existing governance artifacts.

## Adoption Risk Classification

| Risk | Path | Message | Recommendation |
|---|---|---|---|
| low | wwg.project.yaml | Create or safe-merge a WWG-owned project registry. | Allowed in conservative apply. |
| low | reports | Create audit, adoption plan, adoption report, JSON reports, and registry backups. | Allowed in conservative apply. |
| medium | n/a | Add missing WWG index or generated context files. | Defer until a later explicit init or adoption expansion phase. |
| high | n/a | Move docs, rewrite AGENTS.md, or reorganize context structure. | Do not perform in Phase 2B conservative apply. |
| approval-gated | n/a | Change production config, compliance-sensitive docs, public customer notices, permissions, security, data deletion, or migrations. | Require explicit approval and evidence-backed plan. |

## Recommended Adoption Mode

conservative

## Recommended Next Command

`wwg adopt --mode conservative --dry-run`

## WWG Truth Synchronization

- Task mode: generated existing-project audit report.
- New truth detected: no; this report records audit findings and adoption recommendations only.
- Wiki updated: no.
- Workspace updated: no.
- Governance review completed: yes; report contract reviewed during 2026-07-01 validation repair.
- Drift status: low; historical generated report needed required truth-sync fields.
- Canonical files changed:
  - `.wwg/reports/wwg-existing-audit-report.md`
- Implementation discoveries synced:
  - None; no implementation changes were made by this report.
- Remaining stale context:
  - This report remains adoption-era evidence. Current runtime truth is governed by `.wwg/wiki/project-truth.md`, `.wwg/wiki/project-truth-summary.md`, `.wwg/workspace/current-task.md`, and newer runtime reports.
