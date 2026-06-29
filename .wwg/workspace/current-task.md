# Current Task

Status: Inferred adoption closeout. Review Project Truth and Terminology before treating adoption output as accepted truth.

## Task Summary

- Status: DONE
- Task mode: Existing Project Adoption
- User request:
  - Adopt this existing project into WWG using evidence from the current repository.

## Adoption Goal

Convert existing project reality into WWG canonical context without changing application source code unless explicitly requested.

## Evidence Sources Reviewed

- README/docs: README.md, client-handover/node-health-appliance/README.md, data/import/README.md, docs/ARCHITECTURE.md, docs/BNPI_DESEC_CLOUDFLARE_TUNNEL_STATUS_20260629.md, docs/CLOUDFLARE_TRYCLOUDFLARE_TUNNEL_RUNBOOK.md, docs/DEVOPS_RUNBOOK.md, docs/DEV_CURRENT_GCP_VDI_PROOF_RESULT.md, docs/GAPS_AND_NEXT_GOALS.md, docs/GITOPS_CLIENT_ENV_SCALING.md, docs/GITOPS_GH_WATCH_RUNBOOK.md, docs/HEALTHCHECKS.md, docs/HYPERV_FINAL_ARTIFACT_AND_DAY2_REPAIR.md, docs/HYPERV_LAN_PROOF_20260622.md, docs/IMAGE_FORMATS.md, docs/INSTALLER_TEST_REPORT.md, docs/LOGIN_VISUAL_PROOF_SELF_LOOP_PROMPT.md, docs/OBSERVABILITY_PROOF_20260622.md, docs/OPERATIONS.md, docs/OVERNIGHT_DEVICE_EVENT_BRIDGE_DRY_RUN_PROMPT.md, docs/OVERNIGHT_DEV_CURRENT_GCP_VDI_PROOF_PROMPT.md, docs/OVERNIGHT_HARDCUTOVER_MINIO_DRIFT_REPAIR_PROMPT.md, docs/OVERNIGHT_HYPERV_HEALTH_PROOF_PROMPT.md, docs/OVERNIGHT_SOURCE_INPUTS_GCP_IMAGE_DRY_RUN_PROMPT.md, docs/OVERNIGHT_TERRAFORM_HYPERV_FRESH_REPO_PROMPT.md, docs/OVERNIGHT_VIRTUALBOX_GCP_APPLIANCE_PROOF_PROMPT.md, docs/OVERNIGHT_ZKTECO_PROJECT_TRUTH_BRIDGE_PROMPT.md, docs/OVERNIGHT_ZKTECO_RUNTIME_TRUTH_PROMPT.md, docs/SELF_HEALING_AND_DRIFT_RECOVERY.md, docs/SHORTCUTS.md, docs/TERRAFORM_HYPERV_ARCHITECTURE.md, docs/USER_JOURNEY_PROOF.md, docs/UZARO_CLOUDFLARE_CUTOVER_20260629.md, docs/V3_GCP_HYPERV_STORAGE_PROOF_20260625.md, docs/ZKTECO_RUNTIME_TRUTH.md, docs/architecture/onprem-vm-automation-and-observability.md, docs/dm-migration-workflow.md, hris-api/.wwg/governance/README.md, hris-api/.wwg/reports/README.md, hris-api/.wwg/wiki/principles/README.md
- Package/config: app/package.json, appliance/zkteco-bridge/package.json, hris-api/generated/prisma-postgres/package.json, hris-api/generated/prisma/package.json, hris-api/package.json, hris-app/package.json, package.json
- Source folders: app
- Tests: hris-api/tests/attendance-action.helper.spec.ts, hris-api/tests/attendance-obligation.helper.spec.ts, hris-api/tests/attendance-realtime.helper.spec.ts, hris-api/tests/attendance-status-migration.spec.ts, hris-api/tests/auditLogger.spec.ts, hris-api/tests/auth-login-identifier.spec.ts, hris-api/tests/bulk-password.helper.spec.ts, hris-api/tests/database-backup.helper.spec.ts, hris-api/tests/db/isolated-db-fault.guard.spec.ts, hris-api/tests/db/isolated-db-faults.spec.ts, hris-api/tests/db/isolated-db.smoke.ts, hris-api/tests/db/isolated-prisma.integration.spec.ts, hris-api/tests/db/prepare-isolated-db.ts, hris-api/tests/db/schema-source-truth.contract.spec.ts, hris-api/tests/device-event-realtime.helper.spec.ts, hris-api/tests/device-health-zkteco.spec.ts, hris-api/tests/dm3-attendance-obligation-repair.helper.spec.ts, hris-api/tests/dm4-biometric-proof.spec.ts, hris-api/tests/document-field-validation.helper.spec.ts, hris-api/tests/employee-action-block.helper.spec.ts, hris-api/tests/employee-helper-credentials.spec.ts, hris-api/tests/employee-import.helper.spec.ts, hris-api/tests/employee-organization-reporting-query.contract.spec.ts, hris-api/tests/employee-schedule.helper.spec.ts, hris-api/tests/employeepayroll.snapshot-lock.contract.spec.ts, hris-api/tests/enterprise-csv-loader.spec.ts, hris-api/tests/enterprise-csv-sample-pack.spec.ts, hris-api/tests/enterprise-migration-dm-masterlist.spec.ts, hris-api/tests/enterprise-migration-dm-report.spec.ts, hris-api/tests/enterprise-migration-runner-env.spec.ts
- Deployment/config: .github/workflows/promote-gitops.yml, .github/workflows/validate.yml, app/Dockerfile, appliance/docker-compose.yml, appliance/zkteco-bridge/Dockerfile, hris-api/Dockerfile, hris-api/docker-compose.yml, hris-api/infrastructure/onprem/observability/docker-compose.yml, hris-app/Dockerfile, hris-app/firebase.json
- Existing agent/context files: AGENTS.md, hris-api/.wwg/workspace/AGENTS.md, hris-api/AGENTS.md, hris-app/.wwg/workspace/AGENTS.md, hris-app/AGENTS.md

## Truth Captured

- Product identity: project_truth_hyperv_fresh (INFERRED)
- Tech stack: NEEDS_CONFIRMATION (NEEDS_CONFIRMATION)
- Architecture: source folders: app (INFERRED)
- Terminology: flow, package, target, truth, architecture, autopilot, branch, cli, current, dockerfile, documents, format, fresh, goal, hyper
- Safety boundaries: mock/demo files detected (INFERRED)
- Open questions: 2

## Files Created or Updated

- `.wwg/wiki/project-truth.md`
- `.wwg/wiki/terminology.md`
- `.wwg/wiki/principles/README.md`
- `.wwg/governance/truth-capture.md`
- `.wwg/governance/drift-guard.md`
- `.wwg/reports/adoption-audit.md`
- `AGENTS.md`

## Follow-Up Needed

- Confirm inferred product identity/category
- Confirm canonical role names
- Resolve terminology conflicts
- Confirm production vs demo boundaries
- Add missing tests/checks if needed

## Close-Out Notes

- Truth Alignment Status: YELLOW
- Execution Gate: warn
- Test / verification plan: Adoption did not change app behavior; manual evidence review required.
- Drift status: LOW
- Adoption confidence: HIGH
- Remaining issues: Open questions require owner confirmation.
