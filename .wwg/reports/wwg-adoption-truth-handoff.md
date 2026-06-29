# WWG Adoption Truth Handoff

## Purpose

Review inferred adoption truth before treating populated Wiki files as accepted canonical project truth.

## Target

.

## Source Evidence Inspected

- README.md
- client-handover/node-health-appliance/README.md
- data/import/README.md
- docs/ARCHITECTURE.md
- docs/BNPI_DESEC_CLOUDFLARE_TUNNEL_STATUS_20260629.md
- docs/CLOUDFLARE_TRYCLOUDFLARE_TUNNEL_RUNBOOK.md
- docs/DEVOPS_RUNBOOK.md
- docs/DEV_CURRENT_GCP_VDI_PROOF_RESULT.md
- docs/GAPS_AND_NEXT_GOALS.md
- docs/GITOPS_CLIENT_ENV_SCALING.md
- docs/GITOPS_GH_WATCH_RUNBOOK.md
- docs/HEALTHCHECKS.md
- docs/HYPERV_FINAL_ARTIFACT_AND_DAY2_REPAIR.md
- docs/HYPERV_LAN_PROOF_20260622.md
- docs/IMAGE_FORMATS.md
- docs/INSTALLER_TEST_REPORT.md
- docs/LOGIN_VISUAL_PROOF_SELF_LOOP_PROMPT.md
- docs/OBSERVABILITY_PROOF_20260622.md
- docs/OPERATIONS.md
- docs/OVERNIGHT_DEVICE_EVENT_BRIDGE_DRY_RUN_PROMPT.md
- docs/OVERNIGHT_DEV_CURRENT_GCP_VDI_PROOF_PROMPT.md
- docs/OVERNIGHT_HARDCUTOVER_MINIO_DRIFT_REPAIR_PROMPT.md
- docs/OVERNIGHT_HYPERV_HEALTH_PROOF_PROMPT.md
- docs/OVERNIGHT_SOURCE_INPUTS_GCP_IMAGE_DRY_RUN_PROMPT.md
- docs/OVERNIGHT_TERRAFORM_HYPERV_FRESH_REPO_PROMPT.md
- docs/OVERNIGHT_VIRTUALBOX_GCP_APPLIANCE_PROOF_PROMPT.md
- docs/OVERNIGHT_ZKTECO_PROJECT_TRUTH_BRIDGE_PROMPT.md
- docs/OVERNIGHT_ZKTECO_RUNTIME_TRUTH_PROMPT.md
- docs/SELF_HEALING_AND_DRIFT_RECOVERY.md
- docs/SHORTCUTS.md
- docs/TERRAFORM_HYPERV_ARCHITECTURE.md
- docs/USER_JOURNEY_PROOF.md
- docs/UZARO_CLOUDFLARE_CUTOVER_20260629.md
- docs/V3_GCP_HYPERV_STORAGE_PROOF_20260625.md
- docs/ZKTECO_RUNTIME_TRUTH.md
- docs/architecture/onprem-vm-automation-and-observability.md
- docs/dm-migration-workflow.md
- hris-api/.wwg/governance/README.md
- hris-api/.wwg/reports/README.md
- hris-api/.wwg/wiki/principles/README.md
- app/package.json
- appliance/zkteco-bridge/package.json
- hris-api/generated/prisma-postgres/package.json
- hris-api/generated/prisma/package.json
- hris-api/package.json
- hris-app/package.json
- package.json
- app
- hris-api/tests/attendance-action.helper.spec.ts
- hris-api/tests/attendance-obligation.helper.spec.ts
- hris-api/tests/attendance-realtime.helper.spec.ts
- hris-api/tests/attendance-status-migration.spec.ts
- hris-api/tests/auditLogger.spec.ts
- hris-api/tests/auth-login-identifier.spec.ts
- hris-api/tests/bulk-password.helper.spec.ts
- hris-api/tests/database-backup.helper.spec.ts
- hris-api/tests/db/isolated-db-fault.guard.spec.ts
- hris-api/tests/db/isolated-db-faults.spec.ts
- hris-api/tests/db/isolated-db.smoke.ts
- hris-api/tests/db/isolated-prisma.integration.spec.ts
- hris-api/tests/db/prepare-isolated-db.ts
- hris-api/tests/db/schema-source-truth.contract.spec.ts
- hris-api/tests/device-event-realtime.helper.spec.ts
- hris-api/tests/device-health-zkteco.spec.ts
- hris-api/tests/dm3-attendance-obligation-repair.helper.spec.ts
- hris-api/tests/dm4-biometric-proof.spec.ts
- hris-api/tests/document-field-validation.helper.spec.ts
- hris-api/tests/employee-action-block.helper.spec.ts
- hris-api/tests/employee-helper-credentials.spec.ts
- hris-api/tests/employee-import.helper.spec.ts
- hris-api/tests/employee-organization-reporting-query.contract.spec.ts
- hris-api/tests/employee-schedule.helper.spec.ts
- hris-api/tests/employeepayroll.snapshot-lock.contract.spec.ts
- hris-api/tests/enterprise-csv-loader.spec.ts
- hris-api/tests/enterprise-csv-sample-pack.spec.ts
- hris-api/tests/enterprise-migration-dm-masterlist.spec.ts
- hris-api/tests/enterprise-migration-dm-report.spec.ts
- hris-api/tests/enterprise-migration-runner-env.spec.ts
- .github/workflows/promote-gitops.yml
- .github/workflows/validate.yml
- app/Dockerfile
- appliance/docker-compose.yml
- appliance/zkteco-bridge/Dockerfile
- hris-api/Dockerfile
- hris-api/docker-compose.yml
- hris-api/infrastructure/onprem/observability/docker-compose.yml
- hris-app/Dockerfile
- hris-app/firebase.json
- AGENTS.md
- hris-api/.wwg/workspace/AGENTS.md
- hris-api/AGENTS.md
- hris-app/.wwg/workspace/AGENTS.md
- hris-app/AGENTS.md
- .wwg/reports/adoption-audit.md

## Existing Truth Files To Read First

- .wwg/wiki/project-truth.md
- .wwg/wiki/terminology.md
- .wwg/wiki/principles/README.md
- .wwg/workspace/current-task.md
- .wwg/governance/drift-guard.md
- README.md
- CHANGELOG.md

## Deterministic Findings

- Adoption confidence: HIGH
- Readiness score: 99 / 100
- Inferred product identity: project_truth_hyperv_fresh
- Open questions: 2
- Conflicts: 1
- Status: Inferred from repository evidence. Requires human/agent review before becoming accepted project truth.

## Gaps / Unknowns

- Confirm product category.
- Confirm primary users and role names.
- package metadata vs actual stack: NEEDS_CONFIRMATION - Confirm package metadata location or monorepo package boundaries.

## Required Agent Instructions

- Read the inferred Wiki files as review-required drafts.
- Confirm durable facts against repository evidence and project-owner knowledge.
- Replace inferred wording with confirmed truth only when supported.
- Keep open questions visible until answered.

## Guardrails

- Do not invent project truth.
- Use existing WWG truth first.
- If truth is missing, state what evidence is missing.
- Update `.wwg/wiki/project-truth.md` only when durable facts are supported.
- Reconcile README/docs/tests/changelog changes with WWG truth and governance.

## Recommended Next Action

Start an implementation agent with this handoff, then review `.wwg/wiki/project-truth.md` and `.wwg/wiki/terminology.md` before major work.

## Files The Agent May Update

- .wwg/wiki/project-truth.md
- .wwg/wiki/terminology.md
- .wwg/wiki/principles/*.md
- .wwg/workspace/current-task.md
- .wwg/governance/drift-guard.md
- README.md
- CHANGELOG.md

## Files Not Final Without Review

- .wwg/wiki/project-truth.md sections marked INFERRED, NEEDS_CONFIRMATION, CONFLICTING, or STALE
- .wwg/wiki/terminology.md canonical term candidates
- .wwg/reports/adoption-audit.md
