# WWG Adoption Audit

## Audit Summary

- Target: C:\Users\anoni\OneDrive\Desktop\PROJECT_TRUTH_HYPERV_FRESH
- Date: 2026-06-29
- Recommended adoption mode: infer
- Adoption readiness score: 99 / 100
- Confidence: HIGH
- Command: `wwg adopt --mode infer`

## Evidence Reviewed

- README/docs: README.md, client-handover/node-health-appliance/README.md, data/import/README.md, docs/ARCHITECTURE.md, docs/BNPI_DESEC_CLOUDFLARE_TUNNEL_STATUS_20260629.md, docs/CLOUDFLARE_TRYCLOUDFLARE_TUNNEL_RUNBOOK.md, docs/DEVOPS_RUNBOOK.md, docs/DEV_CURRENT_GCP_VDI_PROOF_RESULT.md, docs/GAPS_AND_NEXT_GOALS.md, docs/GITOPS_CLIENT_ENV_SCALING.md, docs/GITOPS_GH_WATCH_RUNBOOK.md, docs/HEALTHCHECKS.md, docs/HYPERV_FINAL_ARTIFACT_AND_DAY2_REPAIR.md, docs/HYPERV_LAN_PROOF_20260622.md, docs/IMAGE_FORMATS.md, docs/INSTALLER_TEST_REPORT.md, docs/LOGIN_VISUAL_PROOF_SELF_LOOP_PROMPT.md, docs/OBSERVABILITY_PROOF_20260622.md, docs/OPERATIONS.md, docs/OVERNIGHT_DEVICE_EVENT_BRIDGE_DRY_RUN_PROMPT.md, docs/OVERNIGHT_DEV_CURRENT_GCP_VDI_PROOF_PROMPT.md, docs/OVERNIGHT_HARDCUTOVER_MINIO_DRIFT_REPAIR_PROMPT.md, docs/OVERNIGHT_HYPERV_HEALTH_PROOF_PROMPT.md, docs/OVERNIGHT_SOURCE_INPUTS_GCP_IMAGE_DRY_RUN_PROMPT.md, docs/OVERNIGHT_TERRAFORM_HYPERV_FRESH_REPO_PROMPT.md, docs/OVERNIGHT_VIRTUALBOX_GCP_APPLIANCE_PROOF_PROMPT.md, docs/OVERNIGHT_ZKTECO_PROJECT_TRUTH_BRIDGE_PROMPT.md, docs/OVERNIGHT_ZKTECO_RUNTIME_TRUTH_PROMPT.md, docs/SELF_HEALING_AND_DRIFT_RECOVERY.md, docs/SHORTCUTS.md, docs/TERRAFORM_HYPERV_ARCHITECTURE.md, docs/USER_JOURNEY_PROOF.md, docs/UZARO_CLOUDFLARE_CUTOVER_20260629.md, docs/V3_GCP_HYPERV_STORAGE_PROOF_20260625.md, docs/ZKTECO_RUNTIME_TRUTH.md, docs/architecture/onprem-vm-automation-and-observability.md, docs/dm-migration-workflow.md, bnpi-pats-api/.wwg/governance/README.md, bnpi-pats-api/.wwg/reports/README.md, bnpi-pats-api/.wwg/wiki/principles/README.md
- Package/config files: app/package.json, appliance/zkteco-bridge/package.json, bnpi-pats-api/generated/prisma-postgres/package.json, bnpi-pats-api/generated/prisma/package.json, bnpi-pats-api/package.json, bnpi-pats-app/package.json, package.json
- Source folders: app
- Tests: bnpi-pats-api/tests/attendance-action.helper.spec.ts, bnpi-pats-api/tests/attendance-obligation.helper.spec.ts, bnpi-pats-api/tests/attendance-realtime.helper.spec.ts, bnpi-pats-api/tests/attendance-status-migration.spec.ts, bnpi-pats-api/tests/auditLogger.spec.ts, bnpi-pats-api/tests/auth-login-identifier.spec.ts, bnpi-pats-api/tests/bulk-password.helper.spec.ts, bnpi-pats-api/tests/database-backup.helper.spec.ts, bnpi-pats-api/tests/db/isolated-db-fault.guard.spec.ts, bnpi-pats-api/tests/db/isolated-db-faults.spec.ts, bnpi-pats-api/tests/db/isolated-db.smoke.ts, bnpi-pats-api/tests/db/isolated-prisma.integration.spec.ts, bnpi-pats-api/tests/db/prepare-isolated-db.ts, bnpi-pats-api/tests/db/schema-source-truth.contract.spec.ts, bnpi-pats-api/tests/device-event-realtime.helper.spec.ts, bnpi-pats-api/tests/device-health-zkteco.spec.ts, bnpi-pats-api/tests/dm3-attendance-obligation-repair.helper.spec.ts, bnpi-pats-api/tests/dm4-biometric-proof.spec.ts, bnpi-pats-api/tests/document-field-validation.helper.spec.ts, bnpi-pats-api/tests/employee-action-block.helper.spec.ts, bnpi-pats-api/tests/employee-helper-credentials.spec.ts, bnpi-pats-api/tests/employee-import.helper.spec.ts, bnpi-pats-api/tests/employee-organization-reporting-query.contract.spec.ts, bnpi-pats-api/tests/employee-schedule.helper.spec.ts, bnpi-pats-api/tests/employeepayroll.snapshot-lock.contract.spec.ts, bnpi-pats-api/tests/enterprise-csv-loader.spec.ts, bnpi-pats-api/tests/enterprise-csv-sample-pack.spec.ts, bnpi-pats-api/tests/enterprise-migration-dm-masterlist.spec.ts, bnpi-pats-api/tests/enterprise-migration-dm-report.spec.ts, bnpi-pats-api/tests/enterprise-migration-runner-env.spec.ts
- Deployment/config: .github/workflows/promote-gitops.yml, .github/workflows/validate.yml, app/Dockerfile, appliance/docker-compose.yml, appliance/zkteco-bridge/Dockerfile, bnpi-pats-api/Dockerfile, bnpi-pats-api/docker-compose.yml, bnpi-pats-api/infrastructure/onprem/observability/docker-compose.yml, bnpi-pats-app/Dockerfile, bnpi-pats-app/firebase.json
- Existing agent/context files: AGENTS.md, bnpi-pats-api/.wwg/workspace/AGENTS.md, bnpi-pats-api/AGENTS.md, bnpi-pats-app/.wwg/workspace/AGENTS.md, bnpi-pats-app/AGENTS.md

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


## Observed Facts

- Observed facts are the current code/docs/config signals listed above.

## Inferred Truth

- Inferred truth was copied into `.wwg/wiki/project-truth.md` with status and evidence labels.

## Conflicts

- package metadata vs actual stack: NEEDS_CONFIRMATION - JS/TS source detected without package dependencies.

## Open Questions

- Confirm product category. Evidence: INFERRED: Web application
- Confirm primary users and role names. Evidence: INFERRED: user, owner, guest

## Recommended Follow-Up

- Review `.wwg/wiki/project-truth.md` and promote accepted inferred truth to confirmed truth.
- Resolve `NEEDS_CONFIRMATION`, `CONFLICTING`, and `STALE` items before major work.

Reports are reference history. `.wwg/wiki/project-truth.md` is the canonical current truth once reviewed and maintained.
