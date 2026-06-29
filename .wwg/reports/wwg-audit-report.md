# WWG Audit Report

# WWG Adoption Audit

## Audit Summary

- Target: C:\Users\anoni\OneDrive\Desktop\PROJECT_TRUTH_HYPERV_FRESH
- Date: 2026-06-29
- Recommended adoption mode: infer
- Adoption readiness score: 100 / 100
- Confidence: HIGH
- Command: `wwg audit --existing`

## Evidence Reviewed

- README/docs: README.md, client-handover/node-health-appliance/README.md, data/import/README.md, docs/ARCHITECTURE.md, docs/BNPI_DESEC_CLOUDFLARE_TUNNEL_STATUS_20260629.md, docs/CLOUDFLARE_TRYCLOUDFLARE_TUNNEL_RUNBOOK.md, docs/DEVOPS_RUNBOOK.md, docs/DEV_CURRENT_GCP_VDI_PROOF_RESULT.md, docs/GAPS_AND_NEXT_GOALS.md, docs/GITOPS_CLIENT_ENV_SCALING.md, docs/GITOPS_GH_WATCH_RUNBOOK.md, docs/HEALTHCHECKS.md, docs/HYPERV_FINAL_ARTIFACT_AND_DAY2_REPAIR.md, docs/HYPERV_LAN_PROOF_20260622.md, docs/IMAGE_FORMATS.md, docs/INSTALLER_TEST_REPORT.md, docs/LOGIN_VISUAL_PROOF_SELF_LOOP_PROMPT.md, docs/OBSERVABILITY_PROOF_20260622.md, docs/OPERATIONS.md, docs/OVERNIGHT_DEVICE_EVENT_BRIDGE_DRY_RUN_PROMPT.md, docs/OVERNIGHT_DEV_CURRENT_GCP_VDI_PROOF_PROMPT.md, docs/OVERNIGHT_HARDCUTOVER_MINIO_DRIFT_REPAIR_PROMPT.md, docs/OVERNIGHT_HYPERV_HEALTH_PROOF_PROMPT.md, docs/OVERNIGHT_SOURCE_INPUTS_GCP_IMAGE_DRY_RUN_PROMPT.md, docs/OVERNIGHT_TERRAFORM_HYPERV_FRESH_REPO_PROMPT.md, docs/OVERNIGHT_VIRTUALBOX_GCP_APPLIANCE_PROOF_PROMPT.md, docs/OVERNIGHT_ZKTECO_PROJECT_TRUTH_BRIDGE_PROMPT.md, docs/OVERNIGHT_ZKTECO_RUNTIME_TRUTH_PROMPT.md, docs/SELF_HEALING_AND_DRIFT_RECOVERY.md, docs/SHORTCUTS.md, docs/TERRAFORM_HYPERV_ARCHITECTURE.md, docs/USER_JOURNEY_PROOF.md, docs/UZARO_CLOUDFLARE_CUTOVER_20260629.md, docs/V3_GCP_HYPERV_STORAGE_PROOF_20260625.md, docs/ZKTECO_RUNTIME_TRUTH.md, docs/architecture/onprem-vm-automation-and-observability.md, docs/dm-migration-workflow.md, hris-api/.wwg/governance/README.md, hris-api/.wwg/reports/README.md, hris-api/.wwg/wiki/principles/README.md
- Package/config files: app/package.json, appliance/zkteco-bridge/package.json, hris-api/generated/prisma-postgres/package.json, hris-api/generated/prisma/package.json, hris-api/package.json, hris-app/package.json, package.json
- Source folders: app
- Tests: hris-api/tests/attendance-action.helper.spec.ts, hris-api/tests/attendance-obligation.helper.spec.ts, hris-api/tests/attendance-realtime.helper.spec.ts, hris-api/tests/attendance-status-migration.spec.ts, hris-api/tests/auditLogger.spec.ts, hris-api/tests/auth-login-identifier.spec.ts, hris-api/tests/bulk-password.helper.spec.ts, hris-api/tests/database-backup.helper.spec.ts, hris-api/tests/db/isolated-db-fault.guard.spec.ts, hris-api/tests/db/isolated-db-faults.spec.ts, hris-api/tests/db/isolated-db.smoke.ts, hris-api/tests/db/isolated-prisma.integration.spec.ts, hris-api/tests/db/prepare-isolated-db.ts, hris-api/tests/db/schema-source-truth.contract.spec.ts, hris-api/tests/device-event-realtime.helper.spec.ts, hris-api/tests/device-health-zkteco.spec.ts, hris-api/tests/dm3-attendance-obligation-repair.helper.spec.ts, hris-api/tests/dm4-biometric-proof.spec.ts, hris-api/tests/document-field-validation.helper.spec.ts, hris-api/tests/employee-action-block.helper.spec.ts, hris-api/tests/employee-helper-credentials.spec.ts, hris-api/tests/employee-import.helper.spec.ts, hris-api/tests/employee-organization-reporting-query.contract.spec.ts, hris-api/tests/employee-schedule.helper.spec.ts, hris-api/tests/employeepayroll.snapshot-lock.contract.spec.ts, hris-api/tests/enterprise-csv-loader.spec.ts, hris-api/tests/enterprise-csv-sample-pack.spec.ts, hris-api/tests/enterprise-migration-dm-masterlist.spec.ts, hris-api/tests/enterprise-migration-dm-report.spec.ts, hris-api/tests/enterprise-migration-runner-env.spec.ts
- Deployment/config: .github/workflows/promote-gitops.yml, .github/workflows/validate.yml, app/Dockerfile, appliance/docker-compose.yml, appliance/zkteco-bridge/Dockerfile, hris-api/Dockerfile, hris-api/docker-compose.yml, hris-api/infrastructure/onprem/observability/docker-compose.yml, hris-app/Dockerfile, hris-app/firebase.json
- Existing agent/context files: .wwg/changelog/config.yml, .wwg/changelog/state.json, .wwg/readme/config.yml, .wwg/readme/state.json, AGENTS.md, hris-api/.wwg/workspace/AGENTS.md, hris-api/AGENTS.md, hris-app/.wwg/workspace/AGENTS.md, hris-app/AGENTS.md

## Observed Reality

- Product/app identity: CONFIRMED - project_truth_hyperv_fresh Evidence: package.json (package name)
- Product category: INFERRED - Web application Evidence: package/source (frontend framework or route folders detected)
- Tech stack: NEEDS_CONFIRMATION - NEEDS_CONFIRMATION Evidence: package/config (no known stack metadata detected)
- Runtime/build tools: CONFIRMED - test Evidence: package.json (scripts)
- Main entry points: CONFIRMED - index.js, app/server.js, appliance/zkteco-bridge/src/index.js, hris-api/app/Rule/index.ts, hris-api/app/activityLogging/index.ts, hris-api/app/agency/index.ts, hris-api/app/applicant/index.ts, hris-api/app/attendance/index.ts, hris-api/app/auditLogging/index.ts, hris-api/app/auth/index.ts, hris-api/app/benefitType/index.ts, hris-api/app/boardingProcess/index.ts, hris-api/app/boardingTemplate/index.ts Evidence: index.js (entry point candidate); app/server.js (entry point candidate); appliance/zkteco-bridge/src/index.js (entry point candidate); hris-api/app/Rule/index.ts (entry point candidate); hris-api/app/activityLogging/index.ts (entry point candidate); hris-api/app/agency/index.ts (entry point candidate); hris-api/app/applicant/index.ts (entry point candidate); hris-api/app/attendance/index.ts (entry point candidate); hris-api/app/auditLogging/index.ts (entry point candidate); hris-api/app/auth/index.ts (entry point candidate); hris-api/app/benefitType/index.ts (entry point candidate); hris-api/app/boardingProcess/index.ts (entry point candidate); hris-api/app/boardingTemplate/index.ts (entry point candidate)
- Main implemented features: INFERRED - Current Working Branch, Main Documents, Normal CLI Flow, VHDX Autopilot, Target Architecture, Target Repo Shape, Image Format Targets, Ownership Rules, app/server Evidence: README.md (README headings or route files)
- User roles/surfaces: INFERRED - user, owner, guest Evidence: README/source (role-like terms detected)
- Data persistence: CONFIRMED - hris-api/app/migration/dm3-migration.adapter.ts, hris-api/app/migration/dm3-workbook-import.service.ts, hris-api/app/migration/dm4-migration.adapter.ts, hris-api/app/migration/enterprise-migration.service.ts, hris-api/app/migration/index.ts, hris-api/app/migration/migration-dry-run.service.ts, hris-api/app/migration/migration-event.service.ts, hris-api/app/migration/migration-orchestrator.service.ts Evidence: hris-api/app/migration/dm3-migration.adapter.ts (persistence indicator)
- Auth/security: CONFIRMED - appliance/bin/project-truth-console-session-hook.sh, hris-api/.wwg/governance/security-review.md, hris-api/app/auth/auth.controller.ts, hris-api/app/auth/auth.router.ts, hris-api/app/auth/index.ts, hris-api/config/security.ts, hris-api/docs/MD Files/auth-api.md, hris-api/docs/SECURITY.md Evidence: appliance/bin/project-truth-console-session-hook.sh (auth/security indicator)
- Payments/billing: CONFIRMED - hris-app/.react-router/types/app/routes/hr/+types/billings.$id.ts, hris-app/.react-router/types/app/routes/hr/+types/billings.ts, hris-app/app/components/templates/common/billings-template.tsx, hris-app/app/lib/mock-soa-billings.ts, hris-app/app/routes/hr/billings.$id.tsx, hris-app/app/routes/hr/billings.tsx, hris-app/build/client/assets/billings-aJ54d_bS.js, hris-app/build/client/assets/billings._id-sRB6gk7r.js Evidence: hris-app/.react-router/types/app/routes/hr/+types/billings.$id.ts (payments/billing indicator)
- Deployment/runtime: CONFIRMED - .github/workflows/promote-gitops.yml, .github/workflows/validate.yml, app/Dockerfile, appliance/docker-compose.yml, appliance/zkteco-bridge/Dockerfile, hris-api/Dockerfile, hris-api/docker-compose.yml, hris-api/infrastructure/onprem/observability/docker-compose.yml, hris-app/Dockerfile, hris-app/firebase.json Evidence: .github/workflows/promote-gitops.yml (deployment config); .github/workflows/validate.yml (deployment config); app/Dockerfile (deployment config); appliance/docker-compose.yml (deployment config); appliance/zkteco-bridge/Dockerfile (deployment config); hris-api/Dockerfile (deployment config); hris-api/docker-compose.yml (deployment config); hris-api/infrastructure/onprem/observability/docker-compose.yml (deployment config); hris-app/Dockerfile (deployment config); hris-app/firebase.json (deployment config)

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


## Existing Project Adoption Note

Observed reality comes from code/docs/config. Inferred truth is not canonical until reviewed.

## Summary

critical: 0, high: 0, medium: 2, low: 18, info: 84

## Command

`wwg audit --existing`

## Target

.

## Repository Mode

existing-adopted-project

## Recommended Mode

conservative

## Missing Required Agent-Ready Artifacts

- None.

## Codex Compatibility Missing Artifacts

- None.

## Repository Type Detected

wwg-native-project

## Registry Present

true

## Principle Adoption / Readiness

- Principles folder present: yes
- Principles README present: yes
- Active principles found: yes
- Candidate principles found: yes
- Principle guidance in AGENTS.md: present
- Principle drift guidance in governance: present or not checked
- Recommended follow-up: Review candidate principles before marking active.

## Changelog Governance

- Found: no
- Last version: none detected
- Last date: none detected
- Unreleased present: no
- Weekly cadence detected: no
- Recommended next patch: 0.0.1
- Recommended action: Create a preview first with `wwg changelog generate --target . --from-git --weekly --dry-run`.
- Risk: low: missing project memory should be introduced through dry-run preview first.

## README Governance

- Found: yes
- Length: 183 lines
- Validation status: warn
- Bloat detected: no
- Phase/pass pollution: no
- Missing docs map: yes
- Missing agent routing: yes
- Recommended action: Run `wwg readme preview --target .` before applying any README update.

## Recommendation Capture

- Registry: missing
- Policy: missing
- Status: governance/template gap
- Notes: regenerate governance templates to restore recommendation capture. Audit does not fail merely because recommendations exist.

## Generated Project Upgrade Readiness

- Read-only: true
- Risk level: medium
- Safe additions: 2
- Safe updates: 1
- Merge/review required: 5
- Never-overwrite entries: 9
- Markdown report: .wwg/reports/generated-project-upgrade-review.md
- JSON report: .wwg/reports/generated-project-upgrade-review.json
- Candidate workflow: not requested
- Next step: Review safe additions and merge/review items before requesting an approved upgrade action.

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
  - CLI support: `wwg adopt --mode conservative --dry-run`
  - Evidence: `.wwg/governance/recommendation-registry.md`
- [x] Reports directory present (present)
  - Evidence: `.wwg/reports`
- [x] Root AGENTS.md present (present)
  - Evidence: `AGENTS.md`
- [ ] Test enforcement governance present (missing)
  - Agent action: Complete the missing WWG-owned structure before relying on the project as agent-ready.
  - CLI support: `wwg adopt --mode conservative --dry-run`
  - Evidence: `.wwg/governance/test-enforcement.md`
- [ ] Regression guardrail governance present (missing)
  - Agent action: Complete the missing WWG-owned structure before relying on the project as agent-ready.
  - CLI support: `wwg adopt --mode conservative --dry-run`
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
- [ ] Wizard onboarding available (available)
  - Reason: Wizard is shown only for onboarding, init, or adoption contexts.
  - Agent action: Use the Wizard only when the user wants guided setup.
  - CLI support: `wwg wizard`

### Recommended Next

- [ ] Complete Must Have readiness first (available)
  - Reason: 3 Must Have item(s) are missing.
  - Agent action: Do not treat Other Features as blockers until Must Have readiness is clear.
  - CLI support: `wwg maintain`

Agents should follow Must Have items first. Missing Other Features are not blockers unless the current task depends on them.

## Findings

- MEDIUM recommended-changelog | category: existing-audit | evidence: likely | risk: medium | auto_fix_available: false | path: CHANGELOG.md - Recommended artifact is not currently mapped or detected. Recommendation: Create only in a later explicit adoption/init phase.
- MEDIUM recommended-evidence_standards | category: existing-audit | evidence: likely | risk: medium | auto_fix_available: false | path: governance/evidence-standards.md - Recommended artifact is not currently mapped or detected. Recommendation: Create only in a later explicit adoption/init phase.
- LOW canonical-context-policy-missing | category: policy-coverage | evidence: confirmed | risk: low | auto_fix_available: false | path: wiki-template/base/09-agent-context/canonical-context-policy.md - Expected policy or coverage artifact is missing. Recommendation: Restore the policy artifact or document an equivalent canonical source.
- LOW changelog-missing | category: changelog-governance | evidence: confirmed | risk: low | auto_fix_available: false | path: CHANGELOG.md - CHANGELOG.md is missing, so project memory and release subtext are not yet first-class. Recommendation: Run `wwg changelog generate --target . --from-git --weekly --dry-run` before creating one.
- LOW evidence-standards-missing | category: policy-coverage | evidence: confirmed | risk: low | auto_fix_available: false | path: governance-template/base/evidence-standards.md - Expected policy or coverage artifact is missing. Recommendation: Restore the policy artifact or document an equivalent canonical source.
- LOW generated-output-missing | category: generation-freshness | evidence: confirmed | risk: low | auto_fix_available: false | path: .wwg/workspace/context/project-context.md - Expected generated output is missing after WWG init/generation. Recommendation: Run the relevant generate or refresh command.
- LOW generated-output-missing | category: generation-freshness | evidence: confirmed | risk: low | auto_fix_available: false | path: .wwg/governance/quality-gates.md - Expected generated output is missing after WWG init/generation. Recommendation: Run the relevant generate or refresh command.
- LOW generated-output-missing | category: generation-freshness | evidence: confirmed | risk: low | auto_fix_available: false | path: .wwg/workspace/skills/skill-index.md - Expected generated output is missing after WWG init/generation. Recommendation: Run the relevant generate or refresh command.
- LOW gitignore-native-report-backups-missing | category: report-policy | evidence: confirmed | risk: low | auto_fix_available: false | path: .gitignore - Report policy expects `.wwg/reports/backups/` to be ignored. Recommendation: Add a narrow ignore rule for `.wwg/reports/backups/` or `.wwg/.gitignore` `reports/backups/`.
- LOW maintenance-matrix-missing | category: maintenance-matrix | evidence: confirmed | risk: low | auto_fix_available: false | path: wiki-template/base/12-maintenance/context-maintenance-matrix.md - Maintenance matrix artifact is missing. Recommendation: Add matrix coverage when this layer exists.
- LOW maintenance-matrix-missing | category: maintenance-matrix | evidence: confirmed | risk: low | auto_fix_available: false | path: workspace-template/base/context/context-maintenance-matrix.md - Maintenance matrix artifact is missing. Recommendation: Add matrix coverage when this layer exists.
- LOW maintenance-matrix-missing | category: maintenance-matrix | evidence: confirmed | risk: low | auto_fix_available: false | path: .wwg/wiki/12-maintenance/self-maintenance-loop.md - Maintenance matrix artifact is missing. Recommendation: Add matrix coverage when this layer exists.
- LOW public-discovery-review-missing | category: policy-coverage | evidence: confirmed | risk: low | auto_fix_available: false | path: governance-template/base/public-discovery-review.md - Expected policy or coverage artifact is missing. Recommendation: Restore the policy artifact or document an equivalent canonical source.
- LOW public-surface-review-missing | category: policy-coverage | evidence: confirmed | risk: low | auto_fix_available: false | path: governance-template/base/public-surface-review.md - Expected policy or coverage artifact is missing. Recommendation: Restore the policy artifact or document an equivalent canonical source.
- LOW readme-agent-routing-missing | category: readme-governance | evidence: confirmed | risk: low | auto_fix_available: false | path: README.md - WWG is present but README.md does not route agents to AGENTS.md and .wwg context. Recommendation: Add a short For Agents section.
- LOW readme-docs-map-missing | category: readme-governance | evidence: confirmed | risk: low | auto_fix_available: false | path: README.md - README.md is missing a documentation map. Recommendation: Add a concise Documentation section.
- LOW recommendation-policy-missing | category: recommendation-governance | evidence: confirmed | risk: low | auto_fix_available: false | path: .wwg/governance/recommendation-policy.md - Recommendation Policy is missing, so agents do not have local guidance for keeping recommendations out of active scope until review. Recommendation: Run `wwg generate-governance --target .` or restore `.wwg/governance/recommendation-policy.md` from the governance template.
- LOW recommendation-registry-missing | category: recommendation-governance | evidence: confirmed | risk: low | auto_fix_available: false | path: .wwg/governance/recommendation-registry.md - Recommendation Registry is missing, so useful out-of-scope future work has no governed capture location. Recommendation: Run `wwg generate-governance --target .` or restore `.wwg/governance/recommendation-registry.md` from the governance template.
- LOW runtime-monitoring-missing | category: policy-coverage | evidence: confirmed | risk: low | auto_fix_available: false | path: wiki-template/base/08-operations/monitoring.md - Expected policy or coverage artifact is missing. Recommendation: Restore the policy artifact or document an equivalent canonical source.
- LOW truth-conflict-policy-missing | category: policy-coverage | evidence: confirmed | risk: low | auto_fix_available: false | path: governance-template/base/truth-conflict-resolution.md - Expected policy or coverage artifact is missing. Recommendation: Restore the policy artifact or document an equivalent canonical source.
- INFO agent-ready-artifacts-present | category: agent-readiness | evidence: confirmed | risk: low | auto_fix_available: false - Agent-ready structure and evidence reports are present. Recommendation: No action required.
- INFO ambiguous-report-classification | category: report-policy | evidence: confirmed | risk: low | auto_fix_available: false - Some report-like files need human classification. Recommendation: Run `wwg reports --target .` and review the Ambiguous / Needs Review section.
- INFO candidate-principle-like-content | category: principles | evidence: likely | risk: low | auto_fix_available: false | path: AGENTS.md - Potential principle-like content was found outside the principles folder. Recommendation: Review whether this durable guidance should become a candidate Principle Brief; do not treat this as a critical error.
- INFO candidate-principle-like-content | category: principles | evidence: likely | risk: low | auto_fix_available: false | path: docs/dm-migration-workflow.md - Potential principle-like content was found outside the principles folder. Recommendation: Review whether this durable guidance should become a candidate Principle Brief; do not treat this as a critical error.
- INFO duplicate-concept-hint | category: duplicate-concepts | evidence: hypothesis | risk: low | auto_fix_available: false | path: hris-api/.wwg/workspace/context/context-maintenance-matrix.md - Multiple context-maintenance-matrix artifacts exist. Recommendation: Confirm this is intentional template/dogfood or source/generated separation.
- INFO generated-markers-balanced | category: generated-markers | evidence: unknown | risk: low | auto_fix_available: false - Generated marker pairs are balanced where present. Recommendation: Review and document the appropriate next step.
- INFO governance-detected | category: existing-audit | evidence: confirmed | risk: low | auto_fix_available: false - Detected 73 governance artifact(s). Recommendation: Reuse and register existing governance artifacts.
- INFO json-schemas-parse | category: schemas | evidence: unknown | risk: low | auto_fix_available: false - Parsed and compiled 0 JSON schema file(s). Recommendation: Review and document the appropriate next step.
- INFO maintenance-review-recommended | category: maintenance | evidence: confirmed | risk: low | auto_fix_available: false - This project shows maintenance drift signals. Run `wwg maintain --target <path>` to generate a structured maintenance review. Recommendation: Run `wwg maintain --target .` for a non-destructive maintenance recommendation report.
- INFO mapping-architecture_context | category: existing-audit | evidence: confirmed | risk: low | auto_fix_available: false | path: docs/ARCHITECTURE.md - Detected candidate for architecture_context. Recommendation: Register docs/ARCHITECTURE.md as architecture_context; do not duplicate it.
- INFO mapping-domain_context | category: existing-audit | evidence: confirmed | risk: low | auto_fix_available: false | path: hris-api/.wwg/workspace/context/domain-context.md - Detected candidate for domain_context. Recommendation: Register hris-api/.wwg/workspace/context/domain-context.md as domain_context; do not duplicate it.
- INFO mapping-maintenance_matrix | category: existing-audit | evidence: confirmed | risk: low | auto_fix_available: false | path: hris-api/.wwg/workspace/context/context-maintenance-matrix.md - Detected candidate for maintenance_matrix. Recommendation: Register hris-api/.wwg/workspace/context/context-maintenance-matrix.md as maintenance_matrix; do not duplicate it.
- INFO mapping-project_master_context | category: existing-audit | evidence: confirmed | risk: low | auto_fix_available: false | path: hris-api/.wwg/workspace/context/project-context.md - Detected candidate for project_master_context. Recommendation: Register hris-api/.wwg/workspace/context/project-context.md as project_master_context; do not duplicate it.
- INFO mapping-public_discovery_context | category: existing-audit | evidence: confirmed | risk: low | auto_fix_available: false | path: hris-api/.wwg/workspace/prompts/public-discovery-maintenance.md - Detected candidate for public_discovery_context. Recommendation: Register hris-api/.wwg/workspace/prompts/public-discovery-maintenance.md as public_discovery_context; do not duplicate it.
- INFO mapping-root_agents | category: existing-audit | evidence: confirmed | risk: low | auto_fix_available: false | path: AGENTS.md - Detected candidate for root_agents. Recommendation: Register AGENTS.md as root_agents; do not duplicate it.
- INFO mapping-runtime_context | category: existing-audit | evidence: confirmed | risk: low | auto_fix_available: false | path: docs/CLOUDFLARE_TRYCLOUDFLARE_TUNNEL_RUNBOOK.md - Detected candidate for runtime_context. Recommendation: Register docs/CLOUDFLARE_TRYCLOUDFLARE_TUNNEL_RUNBOOK.md as runtime_context; do not duplicate it.
- INFO markdown-readable | category: markdown | evidence: unknown | risk: low | auto_fix_available: false - Markdown files are non-empty and readable. Recommendation: Review and document the appropriate next step.
- INFO principle-files-present | category: principles | evidence: confirmed | risk: low | auto_fix_available: false | path: .wwg/wiki/principles - Principle-like files found: 1. Recommendation: Add Principle Briefs only when durable guidance is explicit.
- INFO project-registry-valid | category: registry | evidence: unknown | risk: low | auto_fix_available: false | path: .wwg/config/wwg.project.yaml - WWG project registry parses and matches the registry schema. Recommendation: Review and document the appropriate next step.
- INFO public-surface-artifact | category: existing-audit | evidence: confirmed | risk: low | auto_fix_available: false | path: .wwg/changelog/config.yml - Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact | category: existing-audit | evidence: confirmed | risk: low | auto_fix_available: false | path: .wwg/changelog/state.json - Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact | category: existing-audit | evidence: confirmed | risk: low | auto_fix_available: false | path: hris-api/.wwg/changelog/config.yml - Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact | category: existing-audit | evidence: confirmed | risk: low | auto_fix_available: false | path: hris-api/.wwg/changelog/state.json - Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact | category: existing-audit | evidence: confirmed | risk: low | auto_fix_available: false | path: hris-api/.wwg/reports/changelog-bump-recommendation.md - Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact | category: existing-audit | evidence: confirmed | risk: low | auto_fix_available: false | path: hris-api/.wwg/reports/changelog-preview.md - Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact | category: existing-audit | evidence: confirmed | risk: low | auto_fix_available: false | path: hris-api/.wwg/reports/wwg-changelog-handoff.md - Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact | category: existing-audit | evidence: confirmed | risk: low | auto_fix_available: false | path: hris-api/CHANGELOG.md - Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact | category: existing-audit | evidence: confirmed | risk: approval-gated | auto_fix_available: false | path: hris-api/scripts/generate-bnpi-dm3-supporting-imports.cjs - Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact | category: existing-audit | evidence: confirmed | risk: low | auto_fix_available: false | path: hris-api/scripts/update-hikvision-metadata.ts - Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact | category: existing-audit | evidence: confirmed | risk: approval-gated | auto_fix_available: false | path: hris-api/tests/support/db-fault-invariants.ts - Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact | category: existing-audit | evidence: confirmed | risk: approval-gated | auto_fix_available: false | path: hris-api/tests/support/isolated-db-fault.guard.ts - Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact | category: existing-audit | evidence: confirmed | risk: approval-gated | auto_fix_available: false | path: hris-api/tests/support/isolated-prisma-client.ts - Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact | category: existing-audit | evidence: confirmed | risk: approval-gated | auto_fix_available: false | path: hris-app/.react-router/types/app/routes/legal/+types/privacy-policy.ts - Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact | category: existing-audit | evidence: confirmed | risk: approval-gated | auto_fix_available: false | path: hris-app/.react-router/types/app/routes/legal/+types/terms-of-use.ts - Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact | category: existing-audit | evidence: confirmed | risk: approval-gated | auto_fix_available: false | path: hris-app/.react-router/types/app/routes/support/+types/faq.ts - Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact | category: existing-audit | evidence: confirmed | risk: approval-gated | auto_fix_available: false | path: hris-app/.react-router/types/app/routes/support/+types/help-desk.ts - Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact | category: existing-audit | evidence: confirmed | risk: low | auto_fix_available: false | path: hris-app/.wwg/changelog/config.yml - Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact | category: existing-audit | evidence: confirmed | risk: low | auto_fix_available: false | path: hris-app/.wwg/changelog/state.json - Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact | category: existing-audit | evidence: confirmed | risk: low | auto_fix_available: false | path: hris-app/.wwg/reports/changelog-bump-recommendation.md - Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact | category: existing-audit | evidence: confirmed | risk: low | auto_fix_available: false | path: hris-app/.wwg/reports/changelog-preview.md - Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact | category: existing-audit | evidence: confirmed | risk: low | auto_fix_available: false | path: hris-app/.wwg/reports/wwg-changelog-handoff.md - Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact | category: existing-audit | evidence: confirmed | risk: approval-gated | auto_fix_available: false | path: hris-app/app/routes/legal/privacy-policy.tsx - Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact | category: existing-audit | evidence: confirmed | risk: approval-gated | auto_fix_available: false | path: hris-app/app/routes/legal/terms-of-use.tsx - Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact | category: existing-audit | evidence: confirmed | risk: approval-gated | auto_fix_available: false | path: hris-app/app/routes/support/faq.tsx - Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact | category: existing-audit | evidence: confirmed | risk: approval-gated | auto_fix_available: false | path: hris-app/app/routes/support/help-desk.tsx - Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact | category: existing-audit | evidence: confirmed | risk: approval-gated | auto_fix_available: false | path: hris-app/build/client/assets/privacy-policy-DKziWBt5.js - Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact | category: existing-audit | evidence: confirmed | risk: approval-gated | auto_fix_available: false | path: hris-app/build/client/assets/terms-of-use-BXeUTGd2.js - Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact | category: existing-audit | evidence: confirmed | risk: low | auto_fix_available: false | path: terraform-hyperv/.terraform/providers/registry.terraform.io/taliesins/hyperv/1.2.1/windows_amd64/CHANGELOG.md - Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact | category: existing-audit | evidence: confirmed | risk: approval-gated | auto_fix_available: false | path: vendor/zkteco-sdk/obj/Debug/net48/ZKTecoStandalone.exe.withSupportedRuntime.config - Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact | category: existing-audit | evidence: confirmed | risk: approval-gated | auto_fix_available: false | path: vendor/zkteco-sdk/obj/x86/Debug/net48/ZKTecoStandalone.exe.withSupportedRuntime.config - Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-detected | category: existing-audit | evidence: confirmed | risk: low | auto_fix_available: false - Detected 31 public surface/public discovery artifact(s). Recommendation: Map existing public discovery sources before proposing new ones.
- INFO readme-detected | category: readme-governance | evidence: confirmed | risk: low | auto_fix_available: false | path: README.md - README.md was detected at 183 lines. Recommendation: Validate it with `wwg readme validate --target .`.
- INFO root-agents-detected | category: existing-audit | evidence: confirmed | risk: low | auto_fix_available: false | path: AGENTS.md - Root agent instructions were detected. Recommendation: Map this file as canonical_artifacts.root_agents.
- INFO runtime-skill-candidates-not-generated | category: runtime-skill-candidates | evidence: confirmed | risk: low | auto_fix_available: false | path: .wwg/reports/runtime-skill-candidates.json - Runtime skill candidate contract: not generated. Recommendation: No action required. Candidate artifacts are optional and absence is valid.
- INFO skill-manifest-absent | category: skill-manifest | evidence: confirmed | risk: low | auto_fix_available: false | path: .wwg/config/skill-manifest.yaml - Skill Manifest is not present. This remains valid for backward compatibility. Recommendation: Run `wwg refresh-skills --target .` when you want WWG to generate project skill state.
- INFO structure-present | category: repository-structure | evidence: confirmed | risk: low | auto_fix_available: false - Expected structure is present for existing-adopted-project. Recommendation: No action required.
- INFO template-boundary-scope-skipped | category: template-boundary | evidence: confirmed | risk: low | auto_fix_available: false - Template asset boundary checks apply only to WWG template repositories. Recommendation: No action required.
- INFO todo-fixme-tbd-detected | category: todo-usage | evidence: confirmed | risk: low | auto_fix_available: false | path: hris-api/.wwg/governance/regression-guardrail-catalog.md - TODO/FIXME/TBD marker detected. Recommendation: Confirm whether this is intentional tracked work or convert it into a report/follow-up.
- INFO todo-fixme-tbd-detected | category: todo-usage | evidence: confirmed | risk: low | auto_fix_available: false | path: hris-api/.wwg/reports/context-skill-quality.json - TODO/FIXME/TBD marker detected. Recommendation: Confirm whether this is intentional tracked work or convert it into a report/follow-up.
- INFO todo-fixme-tbd-detected | category: todo-usage | evidence: confirmed | risk: low | auto_fix_available: false | path: hris-api/.wwg/reports/context-skill-quality.md - TODO/FIXME/TBD marker detected. Recommendation: Confirm whether this is intentional tracked work or convert it into a report/follow-up.
- INFO todo-fixme-tbd-detected | category: todo-usage | evidence: confirmed | risk: low | auto_fix_available: false | path: hris-api/.wwg/reports/wwg-agent-handoff.json - TODO/FIXME/TBD marker detected. Recommendation: Confirm whether this is intentional tracked work or convert it into a report/follow-up.
- INFO todo-fixme-tbd-detected | category: todo-usage | evidence: confirmed | risk: low | auto_fix_available: false | path: hris-api/.wwg/reports/wwg-agent-handoff.md - TODO/FIXME/TBD marker detected. Recommendation: Confirm whether this is intentional tracked work or convert it into a report/follow-up.
- INFO todo-fixme-tbd-detected | category: todo-usage | evidence: confirmed | risk: low | auto_fix_available: false | path: hris-api/.wwg/reports/wwg-audit-report.json - TODO/FIXME/TBD marker detected. Recommendation: Confirm whether this is intentional tracked work or convert it into a report/follow-up.
- INFO todo-fixme-tbd-detected | category: todo-usage | evidence: confirmed | risk: low | auto_fix_available: false | path: hris-api/.wwg/reports/wwg-audit-report.md - TODO/FIXME/TBD marker detected. Recommendation: Confirm whether this is intentional tracked work or convert it into a report/follow-up.
- INFO todo-fixme-tbd-detected | category: todo-usage | evidence: confirmed | risk: low | auto_fix_available: false | path: hris-api/.wwg/reports/wwg-doctor-report.json - TODO/FIXME/TBD marker detected. Recommendation: Confirm whether this is intentional tracked work or convert it into a report/follow-up.
- INFO todo-fixme-tbd-detected | category: todo-usage | evidence: confirmed | risk: low | auto_fix_available: false | path: hris-api/.wwg/reports/wwg-doctor-report.md - TODO/FIXME/TBD marker detected. Recommendation: Confirm whether this is intentional tracked work or convert it into a report/follow-up.
- INFO todo-fixme-tbd-detected | category: todo-usage | evidence: confirmed | risk: low | auto_fix_available: false | path: hris-api/.wwg/reports/wwg-handoff-to-codex.json - TODO/FIXME/TBD marker detected. Recommendation: Confirm whether this is intentional tracked work or convert it into a report/follow-up.
- INFO todo-fixme-tbd-detected | category: todo-usage | evidence: confirmed | risk: low | auto_fix_available: false | path: hris-api/.wwg/reports/wwg-handoff-to-codex.md - TODO/FIXME/TBD marker detected. Recommendation: Confirm whether this is intentional tracked work or convert it into a report/follow-up.
- INFO todo-fixme-tbd-detected | category: todo-usage | evidence: confirmed | risk: low | auto_fix_available: false | path: hris-api/.wwg/workspace/AGENTS.md - TODO/FIXME/TBD marker detected. Recommendation: Confirm whether this is intentional tracked work or convert it into a report/follow-up.
- INFO todo-fixme-tbd-detected | category: todo-usage | evidence: confirmed | risk: low | auto_fix_available: false | path: hris-api/app/attendance/attendance.controller.ts - TODO/FIXME/TBD marker detected. Recommendation: Confirm whether this is intentional tracked work or convert it into a report/follow-up.
- INFO todo-fixme-tbd-detected | category: todo-usage | evidence: confirmed | risk: low | auto_fix_available: false | path: hris-api/generated/prisma-postgres/runtime/library.d.ts - TODO/FIXME/TBD marker detected. Recommendation: Confirm whether this is intentional tracked work or convert it into a report/follow-up.
- INFO todo-fixme-tbd-detected | category: todo-usage | evidence: confirmed | risk: low | auto_fix_available: false | path: hris-api/generated/prisma/runtime/library.d.ts - TODO/FIXME/TBD marker detected. Recommendation: Confirm whether this is intentional tracked work or convert it into a report/follow-up.
- INFO todo-fixme-tbd-detected | category: todo-usage | evidence: confirmed | risk: low | auto_fix_available: false | path: hris-api/helper/employee-to-bir2316.ts - TODO/FIXME/TBD marker detected. Recommendation: Confirm whether this is intentional tracked work or convert it into a report/follow-up.
- INFO todo-fixme-tbd-detected | category: todo-usage | evidence: confirmed | risk: low | auto_fix_available: false | path: hris-app/.wwg/governance/regression-guardrail-catalog.md - TODO/FIXME/TBD marker detected. Recommendation: Confirm whether this is intentional tracked work or convert it into a report/follow-up.
- INFO todo-fixme-tbd-detected | category: todo-usage | evidence: confirmed | risk: low | auto_fix_available: false | path: hris-app/.wwg/reports/context-skill-quality.json - TODO/FIXME/TBD marker detected. Recommendation: Confirm whether this is intentional tracked work or convert it into a report/follow-up.
- INFO todo-fixme-tbd-detected | category: todo-usage | evidence: confirmed | risk: low | auto_fix_available: false | path: hris-app/.wwg/reports/context-skill-quality.md - TODO/FIXME/TBD marker detected. Recommendation: Confirm whether this is intentional tracked work or convert it into a report/follow-up.
- INFO todo-fixme-tbd-detected | category: todo-usage | evidence: confirmed | risk: low | auto_fix_available: false | path: hris-app/.wwg/reports/wwg-agent-handoff.json - TODO/FIXME/TBD marker detected. Recommendation: Confirm whether this is intentional tracked work or convert it into a report/follow-up.
- INFO todo-fixme-tbd-detected | category: todo-usage | evidence: confirmed | risk: low | auto_fix_available: false | path: hris-app/.wwg/reports/wwg-agent-handoff.md - TODO/FIXME/TBD marker detected. Recommendation: Confirm whether this is intentional tracked work or convert it into a report/follow-up.
- INFO todo-fixme-tbd-detected | category: todo-usage | evidence: confirmed | risk: low | auto_fix_available: false | path: hris-app/.wwg/reports/wwg-audit-report.json - TODO/FIXME/TBD marker detected. Recommendation: Confirm whether this is intentional tracked work or convert it into a report/follow-up.
- INFO todo-fixme-tbd-detected | category: todo-usage | evidence: confirmed | risk: low | auto_fix_available: false | path: hris-app/.wwg/reports/wwg-audit-report.md - TODO/FIXME/TBD marker detected. Recommendation: Confirm whether this is intentional tracked work or convert it into a report/follow-up.
- INFO todo-fixme-tbd-detected | category: todo-usage | evidence: confirmed | risk: low | auto_fix_available: false | path: hris-app/.wwg/reports/wwg-handoff-to-codex.json - TODO/FIXME/TBD marker detected. Recommendation: Confirm whether this is intentional tracked work or convert it into a report/follow-up.
- INFO todo-fixme-tbd-detected | category: todo-usage | evidence: confirmed | risk: low | auto_fix_available: false | path: hris-app/.wwg/reports/wwg-handoff-to-codex.md - TODO/FIXME/TBD marker detected. Recommendation: Confirm whether this is intentional tracked work or convert it into a report/follow-up.
- INFO wwg-principles-valid | category: general | evidence: unknown | risk: low | auto_fix_available: false - Principles folder and lightweight Principle Brief checks passed. Recommendation: Review and document the appropriate next step.
- INFO yaml-files-parse | category: schemas | evidence: unknown | risk: low | auto_fix_available: false - Parsed 1 YAML file(s). Recommendation: Review and document the appropriate next step.

## Audit Areas

- repository structure
- layer boundaries
- template-vs-dogfood boundary
- registry validity
- selected profiles
- principles folder and Principle Brief frontmatter
- workspace/governance/context/skill freshness
- generated markers
- maintenance matrix coverage
- canonical context policy
- truth conflict policy
- evidence standards
- public surface and discovery
- runtime/evidence/monitoring
- scoped AGENTS.md policy
- recommendation governance
- schemas
- reports
- TODO/FIXME/TBD usage
- empty markdown
- duplicate concept hints

## WWG Truth Synchronization

- Task mode: audit
- New truth detected: NO
- Wiki updated: NO / N/A
- Workspace updated: NO
- Governance review completed: YES
- Drift status: LOW
- Canonical files changed:
  - None by audit.
- Implementation discoveries synced:
  - None by audit; review findings before promoting observations to project truth.
- Remaining stale context:
  - Review medium-or-higher findings above.

## Next Steps

- wwg validate
- wwg audit --existing
- wwg brief
