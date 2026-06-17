# WWG Audit Report

Status: STALE_SUPERSEDED_BY_CONTEXT_RECONCILIATION
Superseded on: 2026-05-25
Superseded by: `.wwg/wiki/project-truth.md`, `.wwg/wiki/project-truth-summary.md`, and `.wwg/reports/cross-repo-context-reconciliation.md`.
Note: This historical audit output contains stale auto-inferred Web3/eCommerce classification. Current canonical truth is HRIS backend API.

# WWG Adoption Audit

## Audit Summary

- Target: C:\Users\Renz\Documents\hris\hris-api
- Date: 2026-05-16
- Recommended adoption mode: infer
- Adoption readiness score: 100 / 100
- Confidence: HIGH
- Command: `wwg audit --target C:\Users\Renz\Documents\hris\hris-api`

## Evidence Reviewed

- README/docs: CHANGELOG.md, README.md, docs/API_EMPLOYEE_IMPORT.md, docs/APPROVAL_CHAIN_TEST_GUIDE.md, docs/ATTENDANCE_DATE_FIX.md, docs/ATTENDANCE_FLOW.md, docs/COLUMN_CONCAT_GUIDE.md, docs/CONSOLIDATED_SCHEMA.md, docs/CRON_SETUP.md, docs/Create a New Service Guide.md, docs/DASHBOARD_SETUP.md, docs/DEPLOYMENT_ARCHITECTURE.md, docs/DOCKER_SETUP.md, docs/EMPLOYEE_IMPORT_COLUMNS.md, docs/EMPLOYEE_MIGRATION_REUSABLE_GUIDE.md, docs/LOCAL_TAILSCALE_DEPLOY.md, docs/MD Files/MIGRATION_GUIDE.md, docs/MD Files/REFACTORING_SUMMARY.md, docs/MD Files/TAX_CALCULATOR_REFACTORING.md, docs/MD Files/auth-api.md, docs/MIGRATION_CSV_UPLOAD_TESTING.md, docs/MIGRATION_GUIDE.md, docs/MIGRATION_TO_SINGLE_TABLE.md, docs/PAYROLL_CYCLE_RULES_CONFIG.md, docs/PAYROLL_SCHEMA_DESIGN.md, docs/POSTGRES_MIGRATION_HANDOFF_2026-05-16.md, docs/POSTMAN_SETUP.md, docs/PRISMA_MONGODB_TO_POSTGRES_PLAN.md, docs/REDIS_SETUP.md, docs/REQUEST_WORKFLOW_GUIDE.md, docs/SCHEDULE_IMPORT_GUIDE.md, docs/SECURITY.md, docs/SECURITY_IMPLEMENTATION.md, docs/SINGLE_VS_SEPARATE_TABLES.md, docs/STATUS_API.md, docs/TIMESHEET_EDIT_PERMISSION_UI_OPTIONS.md, docs/TIMESHEET_EDIT_PERMISSION_WORKFLOW_PRD.md, docs/TIMESHEET_UNIFIED_REQUEST_WORKFLOW_PLAN.md, docs/WWG_TEST_CONVERSION_HANDOFF_2026-05-17.md, docs/grouping-functionality.md
- Package/config files: generated/prisma-postgres/package.json, generated/prisma/package.json, package.json
- Source folders: app, app/Rule, app/activityLogging, app/agency, app/applicant, app/attendance, app/auditLogging, app/auth, app/benefitType, app/boardingProcess, app/boardingTemplate, app/calculator, app/calendar-item, app/celebrations, app/checklistItem, app/cron, app/dashboard, app/department, app/device, app/docs, app/document, app/documentFolder, app/documentType, app/eligibility, app/employee, app/employeeBenefit, app/employeeDocuments, app/employeeLoan, app/employeeSchedule, app/employeepayroll
- Tests: tests/attendance-obligation.helper.spec.ts, tests/auditLogger.spec.ts, tests/bulk-password.helper.spec.ts, tests/document-field-validation.helper.spec.ts, tests/employee-action-block.helper.spec.ts, tests/employee-helper-credentials.spec.ts, tests/leave-session.helper.spec.ts, tests/prisma-datasource.helper.spec.ts, tests/query-builder-search-fields.spec.ts, tests/request.zod.spec.ts, tests/role-derivation.spec.ts, tests/security.middleware.spec.ts, tests/service-name-validation.spec.ts, tests/timekeeping.helper.spec.ts, tests/timesheet-line-version.helper.spec.ts, tests/timesheet-submit-eligibility.spec.ts, tests/workflow-config.helper.spec.ts, tests/wwg-regression-coverage.spec.ts, tests/wwg/app-module-contract.behavior.spec.ts, tests/wwg/core-utils.behavior.spec.ts, tests/wwg/formdata-validation.behavior.spec.ts, tests/wwg/function-coverage.explicit.spec.ts, tests/wwg/payroll-attendance.behavior.spec.ts, tests/wwg/request-workforce-cache-auth.behavior.spec.ts, tests/wwg/tax-timekeeping.behavior.spec.ts, tests/wwg/tenant-middleware.behavior.spec.ts, tests_legacy/WorkflowInstance.controller.spec.ts, tests_legacy/aduittrail.controller.spec.ts, tests_legacy/audittrail.controller.spec.ts, tests_legacy/calendar.controller.spec.ts
- Deployment/config: .github/workflows/deploy-local-tailscale.yml, .github/workflows/deploy.yml, .github/workflows/infra-validate.yml, .github/workflows/rollback.yml, Dockerfile, docker-compose.yml, exports/local-infra/docker-compose.yml, infrastructure/onprem/observability/docker-compose.yml
- Existing agent/context files: .wwg/changelog/config.yml, .wwg/changelog/state.json, .wwg/config/skill-manifest.yaml, .wwg/readme/config.yml, .wwg/readme/state.json, AGENTS.md, workspace/AGENTS.md

## Observed Reality

- Product/app identity: CONFIRMED - hris-api Evidence: package.json (package name)
- Product category: INFERRED - Web3 eCommerce prototype Evidence: README/source (Web3, commerce, cart/checkout, or crypto wallet terms detected)
- Tech stack: CONFIRMED - express, typescript, prisma, TypeScript Evidence: package/config (dependencies and config files)
- Runtime/build tools: CONFIRMED - predev, dev, prestart, start, lint, format, test, build, typecheck, prod, export-docs, prisma-docs, prisma-migrate, prisma-generate, prisma-format, prisma-seed, seed:holidays, seed:calculator, seed:defaults, seed:bulk-backdated-employees, seed:reset-demo-requests, seed:soa, prisma-reset, prisma-postgres:generate, prisma-postgres:push, migrate:mongo-to-postgres, verify:mongo-postgres-parity, apply-indexes, api-list, seed:eligibility, pan-seed, seed:pan, zod-generate, test:tax, test:payroll, example:tax, test:bir, test:bir-part4, generate:bir, migrate:documents, backfill:employee-documents, migrate:attendance-schedule, migrate:attendance-undertime-status, migrate:attendance-status-flags, migrate:payroll-cycle-rules, backfill:applicant-assigned-hr, backfill:applicant-assigned-hr:execute, test:attendance-debug, test:attendance-metrics, test:attendance-clock-in, check:attendance-status, test:payroll-attendance, test:bulk-adjust-endpoint, test:bulk-adjust-function, test:generate-employee-payroll, delete:employee, delete:all-employees, generate:timesheets, recalculate:attendance, backfill:attendance-computed, backfill:attendance-computed:execute, metrics:compliance, metrics:compliance:detailed, metrics:attendance, metrics:attendance:detailed, metrics:reports, metrics:reports:detailed, profile:attendance-metrics, test:attendance-summary, test:timekeeping, test:org-chart, test:workforce, test:notification-debug, test:document-workflow, generate:csv, qa:migration-post-actions, sync:deploy-secrets, sync:gcp-secrets, wwg:status, wwg:brief, wwg:audit, wwg:validate, wwg:reports, wwg:test-check, test:function-coverage, wwg:regression-check, wwg:task:start, wwg:task:end, wwg:task, infra:fmt:check, infra:validate, infra:plan Evidence: package.json (scripts)
- Main entry points: CONFIRMED - dist/lib-entry.js, app/Rule/index.ts, app/activityLogging/index.ts, app/agency/index.ts, app/applicant/index.ts, app/attendance/index.ts, app/auditLogging/index.ts, app/auth/index.ts, app/benefitType/index.ts, app/boardingProcess/index.ts, app/boardingTemplate/index.ts, app/calculator/index.ts, app/calendar-item/index.ts Evidence: dist/lib-entry.js (entry point candidate); app/Rule/index.ts (entry point candidate); app/activityLogging/index.ts (entry point candidate); app/agency/index.ts (entry point candidate); app/applicant/index.ts (entry point candidate); app/attendance/index.ts (entry point candidate); app/auditLogging/index.ts (entry point candidate); app/auth/index.ts (entry point candidate); app/benefitType/index.ts (entry point candidate); app/boardingProcess/index.ts (entry point candidate); app/boardingTemplate/index.ts (entry point candidate); app/calculator/index.ts (entry point candidate); app/calendar-item/index.ts (entry point candidate)
- Main implemented features: INFERRED - Quick Start, For Agents, Documentation, app/Rule/index, app/Rule/rule.controller, app/Rule/rule.router, app/activityLogging/activityLogging.controller, app/activityLogging/activityLogging.router, app/activityLogging/index, app/agency/agency.controller Evidence: README.md (README headings or route files)
- User roles/surfaces: INFERRED - admin, user, agent Evidence: README/source (role-like terms detected)
- Data persistence: CONFIRMED - ioredis, mongoose, @prisma/client, @types/ioredis, prisma, app/migration/index.ts, app/migration/migration.controller.ts, app/migration/migration.router.ts, app/migration/migration.service.ts, generated/prisma-postgres/schema.prisma, generated/prisma/default.d.ts, generated/prisma/default.js, generated/prisma/edge.d.ts Evidence: ioredis (persistence indicator)
- Auth/security: CONFIRMED - bcryptjs, app/auth/auth.controller.ts, app/auth/auth.router.ts, app/auth/index.ts, config/security.ts, docs/MD Files/auth-api.md, docs/SECURITY.md, docs/SECURITY_IMPLEMENTATION.md, docs/TIMESHEET_EDIT_PERMISSION_UI_OPTIONS.md Evidence: bcryptjs (auth/security indicator)
- Payments/billing: NEEDS_CONFIRMATION - No payments/billing implementation detected Evidence: repository scan (no payment/billing indicators)
- Deployment/runtime: CONFIRMED - .github/workflows/deploy-local-tailscale.yml, .github/workflows/deploy.yml, .github/workflows/infra-validate.yml, .github/workflows/rollback.yml, Dockerfile, docker-compose.yml, exports/local-infra/docker-compose.yml, infrastructure/onprem/observability/docker-compose.yml Evidence: .github/workflows/deploy-local-tailscale.yml (deployment config); .github/workflows/deploy.yml (deployment config); .github/workflows/infra-validate.yml (deployment config); .github/workflows/rollback.yml (deployment config); Dockerfile (deployment config); docker-compose.yml (deployment config); exports/local-infra/docker-compose.yml (deployment config); infrastructure/onprem/observability/docker-compose.yml (deployment config)

## Inferred Truth

- Product identity: INFERRED - hris-api Evidence: package.json (package name)
- Product category: INFERRED - Web3 eCommerce prototype Evidence: README/source (Web3, commerce, cart/checkout, or crypto wallet terms detected)
- Primary users: INFERRED - admin, user, agent Evidence: README/source (role-like terms detected)
- Core features: INFERRED - Quick Start, For Agents, Documentation, app/Rule/index, app/Rule/rule.controller, app/Rule/rule.router, app/activityLogging/activityLogging.controller, app/activityLogging/activityLogging.router, app/activityLogging/index, app/agency/agency.controller Evidence: README.md (README headings or route files)
- Architecture: INFERRED - source folders: app, app/Rule, app/activityLogging, app/agency, app/applicant, app/attendance, app/auditLogging, app/auth; package-managed runtime; TypeScript configuration Evidence: source/config (folders and package metadata)
- Safety/production boundaries: INFERRED - mock/demo files detected Evidence: README/source/package (safety boundary indicators)

## Conflicts and Drift Risks

- README vs code: CONFIRMED - No direct issue detected by lightweight audit.
- UI/copy vs implementation: CONFIRMED - No direct issue detected by lightweight audit.
- package metadata vs actual stack: CONFIRMED - No direct issue detected by lightweight audit.
- mock/demo vs production claims: CONFIRMED - No direct issue detected by lightweight audit.
- terminology drift: CONFIRMED - No direct issue detected by lightweight audit.
- stale/generated files: CONFIRMED - No direct issue detected by lightweight audit.
- missing tests/checks: CONFIRMED - No direct issue detected by lightweight audit.

## Open Questions

- Confirm product category. Why: Category affects profile selection, architecture defaults, and governance gates. Evidence: INFERRED: Web3 eCommerce prototype
- Confirm primary users and role names. Why: Roles affect permissions, UX, terminology, and task routing. Evidence: INFERRED: admin, user, agent
- Confirm payments/billing boundary. Why: Payments and billing are approval-sensitive. Evidence: NEEDS_CONFIRMATION: No payments/billing implementation detected

## Recommended Adoption Plan

- Recommended mode: infer
- Files WWG should create/update: `.wwg/wiki/project-truth.md`, `.wwg/wiki/terminology.md`, `.wwg/wiki/principles/README.md`, `.wwg/workspace/current-task.md`, `.wwg/governance/truth-capture.md`, `.wwg/governance/drift-guard.md`, `.wwg/reports/adoption-audit.md`, `AGENTS.md`.
- Follow-up actions: confirm inferred truth, resolve conflicts, answer open questions, and run `wwg validate --target <project>`.

Labels used: CONFIRMED, INFERRED, NEEDS_CONFIRMATION, CONFLICTING, STALE.


## Existing Project Adoption Note

Observed reality comes from code/docs/config. Inferred truth is not canonical until reviewed.

## Summary

critical: 0, high: 0, medium: 0, low: 0, info: 62

## Command

`wwg audit --target C:\Users\Renz\Documents\hris\hris-api`

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

- Found: yes
- Last version: none detected
- Last date: none detected
- Unreleased present: yes
- Weekly cadence detected: no
- Recommended next patch: 0.0.1
- Recommended action: Preserve the existing changelog and run `wwg changelog preview --target . --from-git --weekly` before any generated update.
- Risk: low: preserve existing history.

## README Governance

- Found: yes
- Length: 46 lines
- Validation status: warn
- Bloat detected: no
- Phase/pass pollution: no
- Missing docs map: no
- Missing agent routing: no
- Recommended action: Run `wwg readme preview --target .` before applying any README update.

## Recommendation Capture

- Registry: `.wwg/governance/recommendation-registry.md`
- Policy: `.wwg/governance/recommendation-policy.md`
- Status: available
- Notes: Recommendation capture is available; audit did not parse, score, promote, or validate recommendation contents.

## Generated Project Upgrade Readiness

- Read-only: true
- Risk level: medium
- Safe additions: 0
- Safe updates: 1
- Merge/review required: 8
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

- None detected.

### Recommended Next

- [ ] Continue from WWG truth and current task (available)
  - Reason: No relevant optional readiness gaps were detected.
  - Agent action: Proceed within the user's requested scope and keep the truth loop synchronized.
  - CLI support: `wwg brief`

Agents should follow Must Have items first. Missing Other Features are not blockers unless the current task depends on them.

## Findings

- INFO agent-ready-artifacts-present | category: agent-readiness | evidence: confirmed | risk: low | auto_fix_available: false - Agent-ready structure and evidence reports are present. Recommendation: No action required.
- INFO ambiguous-report-classification | category: report-policy | evidence: confirmed | risk: low | auto_fix_available: false - Some report-like files need human classification. Recommendation: Run `wwg reports --target .` and review the Ambiguous / Needs Review section.
- INFO candidate-principle-like-content | category: principles | evidence: likely | risk: low | auto_fix_available: false | path: AGENTS.md - Potential principle-like content was found outside the principles folder. Recommendation: Review whether this durable guidance should become a candidate Principle Brief; do not treat this as a critical error.
- INFO candidate-principle-like-content | category: principles | evidence: likely | risk: low | auto_fix_available: false | path: workspace/AGENTS.md - Potential principle-like content was found outside the principles folder. Recommendation: Review whether this durable guidance should become a candidate Principle Brief; do not treat this as a critical error.
- INFO candidate-principle-like-content | category: principles | evidence: likely | risk: low | auto_fix_available: false | path: workspace/context/architecture-context.md - Potential principle-like content was found outside the principles folder. Recommendation: Review whether this durable guidance should become a candidate Principle Brief; do not treat this as a critical error.
- INFO candidate-principle-like-content | category: principles | evidence: likely | risk: low | auto_fix_available: false | path: workspace/context/governance-context.md - Potential principle-like content was found outside the principles folder. Recommendation: Review whether this durable guidance should become a candidate Principle Brief; do not treat this as a critical error.
- INFO candidate-principle-like-content | category: principles | evidence: likely | risk: low | auto_fix_available: false | path: workspace/context/ux-context.md - Potential principle-like content was found outside the principles folder. Recommendation: Review whether this durable guidance should become a candidate Principle Brief; do not treat this as a critical error.
- INFO changelog-detected | category: changelog-governance | evidence: confirmed | risk: low | auto_fix_available: false | path: CHANGELOG.md - CHANGELOG.md was detected. Last version: none. Recommendation: Preserve it during adoption and validate it with `wwg changelog validate --target .`.
- INFO duplicate-concept-hint | category: duplicate-concepts | evidence: hypothesis | risk: low | auto_fix_available: false | path: wiki-template/base/12-maintenance/context-maintenance-matrix.md - Multiple context-maintenance-matrix artifacts exist. Recommendation: Confirm this is intentional template/dogfood or source/generated separation.
- INFO generated-markers-balanced | category: generated-markers | evidence: unknown | risk: low | auto_fix_available: false - Generated marker pairs are balanced where present. Recommendation: Review and document the appropriate next step.
- INFO generation-freshness-clear | category: generation-freshness | evidence: confirmed | risk: low | auto_fix_available: false - Registry/report freshness checks did not find obvious drift. Recommendation: No action required.
- INFO governance-detected | category: existing-audit | evidence: confirmed | risk: low | auto_fix_available: false - Detected 29 governance artifact(s). Recommendation: Reuse and register existing governance artifacts.
- INFO json-schemas-parse | category: schemas | evidence: unknown | risk: low | auto_fix_available: false - Parsed and compiled 0 JSON schema file(s). Recommendation: Review and document the appropriate next step.
- INFO maintenance-matrix-coverage-present | category: maintenance-matrix | evidence: confirmed | risk: low | auto_fix_available: false - Maintenance matrix coverage includes Phase 1/2 concepts or equivalent wording. Recommendation: No action required.
- INFO maintenance-review-recommended | category: maintenance | evidence: confirmed | risk: low | auto_fix_available: false - This project shows maintenance drift signals. Run `wwg maintain --target <path>` to generate a structured maintenance review. Recommendation: Run `wwg maintain --target .` for a non-destructive maintenance recommendation report.
- INFO mapping-architecture_context | category: existing-audit | evidence: confirmed | risk: low | auto_fix_available: false | path: workspace/context/architecture-context.md - Detected candidate for architecture_context. Recommendation: Register workspace/context/architecture-context.md as architecture_context; do not duplicate it.
- INFO mapping-changelog | category: existing-audit | evidence: confirmed | risk: low | auto_fix_available: false | path: CHANGELOG.md - Detected candidate for changelog. Recommendation: Register CHANGELOG.md as changelog; do not duplicate it.
- INFO mapping-domain_context | category: existing-audit | evidence: confirmed | risk: low | auto_fix_available: false | path: workspace/context/domain-context.md - Detected candidate for domain_context. Recommendation: Register workspace/context/domain-context.md as domain_context; do not duplicate it.
- INFO mapping-maintenance_matrix | category: existing-audit | evidence: confirmed | risk: low | auto_fix_available: false | path: workspace-template/base/context/context-maintenance-matrix.md - Detected candidate for maintenance_matrix. Recommendation: Register workspace-template/base/context/context-maintenance-matrix.md as maintenance_matrix; do not duplicate it.
- INFO mapping-project_master_context | category: existing-audit | evidence: confirmed | risk: low | auto_fix_available: false | path: workspace/context/project-context.md - Detected candidate for project_master_context. Recommendation: Register workspace/context/project-context.md as project_master_context; do not duplicate it.
- INFO mapping-public_discovery_context | category: existing-audit | evidence: confirmed | risk: low | auto_fix_available: false | path: workspace/prompts/public-discovery-maintenance.md - Detected candidate for public_discovery_context. Recommendation: Register workspace/prompts/public-discovery-maintenance.md as public_discovery_context; do not duplicate it.
- INFO mapping-root_agents | category: existing-audit | evidence: confirmed | risk: low | auto_fix_available: false | path: AGENTS.md - Detected candidate for root_agents. Recommendation: Register AGENTS.md as root_agents; do not duplicate it.
- INFO mapping-runtime_context | category: existing-audit | evidence: confirmed | risk: low | auto_fix_available: false | path: wiki-template/base/08-operations/monitoring.md - Detected candidate for runtime_context. Recommendation: Register wiki-template/base/08-operations/monitoring.md as runtime_context; do not duplicate it.
- INFO markdown-readable | category: markdown | evidence: unknown | risk: low | auto_fix_available: false - Markdown files are non-empty and readable. Recommendation: Review and document the appropriate next step.
- INFO policy-coverage-present | category: policy-coverage | evidence: confirmed | risk: low | auto_fix_available: false - Canonical context, truth conflict, evidence, public surface, discovery, runtime, and scoped AGENTS policy coverage is present. Recommendation: No action required.
- INFO principle-files-present | category: principles | evidence: confirmed | risk: low | auto_fix_available: false | path: .wwg/wiki/principles - Principle-like files found: 1. Recommendation: Add Principle Briefs only when durable guidance is explicit.
- INFO project-registry-valid | category: registry | evidence: unknown | risk: low | auto_fix_available: false | path: .wwg/config/wwg.project.yaml - WWG project registry parses and matches the registry schema. Recommendation: Review and document the appropriate next step.
- INFO public-surface-artifact | category: existing-audit | evidence: confirmed | risk: low | auto_fix_available: false | path: .wwg/changelog/config.yml - Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact | category: existing-audit | evidence: confirmed | risk: low | auto_fix_available: false | path: .wwg/changelog/state.json - Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact | category: existing-audit | evidence: confirmed | risk: low | auto_fix_available: false | path: CHANGELOG.md - Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact | category: existing-audit | evidence: confirmed | risk: low | auto_fix_available: false | path: reports/changelog-bump-recommendation.md - Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact | category: existing-audit | evidence: confirmed | risk: low | auto_fix_available: false | path: reports/changelog-preview.md - Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact | category: existing-audit | evidence: confirmed | risk: low | auto_fix_available: false | path: reports/wwg-changelog-handoff.md - Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact | category: existing-audit | evidence: confirmed | risk: low | auto_fix_available: false | path: scripts/update-hikvision-metadata.ts - Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-detected | category: existing-audit | evidence: confirmed | risk: low | auto_fix_available: false - Detected 7 public surface/public discovery artifact(s). Recommendation: Map existing public discovery sources before proposing new ones.
- INFO readme-detected | category: readme-governance | evidence: confirmed | risk: low | auto_fix_available: false | path: README.md - README.md was detected at 46 lines. Recommendation: Validate it with `wwg readme validate --target .`.
- INFO recommendation-governance-present | category: recommendation-governance | evidence: confirmed | risk: low | auto_fix_available: false | path: .wwg/governance/recommendation-registry.md - Recommendation capture is available through the Governance registry and policy. Recommendation: Use the registry for useful future work discovered by agents, audits, maintenance runs, or closeouts; do not promote recommendations automatically.
- INFO root-agents-detected | category: existing-audit | evidence: confirmed | risk: low | auto_fix_available: false | path: AGENTS.md - Root agent instructions were detected. Recommendation: Map this file as canonical_artifacts.root_agents.
- INFO runtime-skill-candidates-valid | category: runtime-skill-candidates | evidence: confirmed | risk: low | auto_fix_available: false | path: .wwg/reports/runtime-skill-candidates.json - Runtime skill candidate contract: present, valid, candidate-only. Recommendation: Treat this artifact as candidate-only metadata. WWG did not activate runtime skills.
- INFO skill-copy-policy-current | category: skill-manifest | evidence: confirmed | risk: low | auto_fix_available: false | path: .wwg/config/skill-manifest.yaml - Governed skill copy policy: 5 compatibility-core skills are copied or referenced as allowed, and compatibility-domain skills are reference-only for new projects. Recommendation: Legacy copied skill cleanup: clean. Recommended/reference-only skills are not active runtime skills.
- INFO skill-manifest-present | category: skill-manifest | evidence: confirmed | risk: low | auto_fix_available: false | path: .wwg/config/skill-manifest.yaml - Skill policy: manifest present, no policy violations. Skill materialization: 5 copied, 11 referenced, 0 local, 0 none. Recommended skills: 10. Enabled core skills: 6. Disabled skills: 0. Recommendation: No action required.
- INFO skill-nondev-reference-recommendations | category: skill-manifest | evidence: confirmed | risk: low | auto_fix_available: false | path: .wwg/config/skill-manifest.yaml - Recommended Creative/Business skills: business.business-brief, business.decision-memo, business.sop-writing, creative.storytelling. Recommendation: These recommendations are reference-only. WWG did not copy skill files or activate runtime skills; Vorter remains responsible for future runtime activation.
- INFO structure-present | category: repository-structure | evidence: confirmed | risk: low | auto_fix_available: false - Expected structure is present for existing-adopted-project. Recommendation: No action required.
- INFO template-boundary-scope-skipped | category: template-boundary | evidence: confirmed | risk: low | auto_fix_available: false - Template asset boundary checks apply only to WWG template repositories. Recommendation: No action required.
- INFO todo-fixme-tbd-detected | category: todo-usage | evidence: confirmed | risk: low | auto_fix_available: false | path: app/attendance/attendance.controller.ts - TODO/FIXME/TBD marker detected. Recommendation: Confirm whether this is intentional tracked work or convert it into a report/follow-up.
- INFO todo-fixme-tbd-detected | category: todo-usage | evidence: confirmed | risk: low | auto_fix_available: false | path: generated/prisma-postgres/runtime/library.d.ts - TODO/FIXME/TBD marker detected. Recommendation: Confirm whether this is intentional tracked work or convert it into a report/follow-up.
- INFO todo-fixme-tbd-detected | category: todo-usage | evidence: confirmed | risk: low | auto_fix_available: false | path: generated/prisma/runtime/library.d.ts - TODO/FIXME/TBD marker detected. Recommendation: Confirm whether this is intentional tracked work or convert it into a report/follow-up.
- INFO todo-fixme-tbd-detected | category: todo-usage | evidence: confirmed | risk: low | auto_fix_available: false | path: governance/regression-guardrail-catalog.md - TODO/FIXME/TBD marker detected. Recommendation: Confirm whether this is intentional tracked work or convert it into a report/follow-up.
- INFO todo-fixme-tbd-detected | category: todo-usage | evidence: confirmed | risk: low | auto_fix_available: false | path: helper/employee-to-bir2316.ts - TODO/FIXME/TBD marker detected. Recommendation: Confirm whether this is intentional tracked work or convert it into a report/follow-up.
- INFO todo-fixme-tbd-detected | category: todo-usage | evidence: confirmed | risk: low | auto_fix_available: false | path: reports/context-skill-quality.json - TODO/FIXME/TBD marker detected. Recommendation: Confirm whether this is intentional tracked work or convert it into a report/follow-up.
- INFO todo-fixme-tbd-detected | category: todo-usage | evidence: confirmed | risk: low | auto_fix_available: false | path: reports/context-skill-quality.md - TODO/FIXME/TBD marker detected. Recommendation: Confirm whether this is intentional tracked work or convert it into a report/follow-up.
- INFO todo-fixme-tbd-detected | category: todo-usage | evidence: confirmed | risk: low | auto_fix_available: false | path: reports/wwg-agent-handoff.json - TODO/FIXME/TBD marker detected. Recommendation: Confirm whether this is intentional tracked work or convert it into a report/follow-up.
- INFO todo-fixme-tbd-detected | category: todo-usage | evidence: confirmed | risk: low | auto_fix_available: false | path: reports/wwg-agent-handoff.md - TODO/FIXME/TBD marker detected. Recommendation: Confirm whether this is intentional tracked work or convert it into a report/follow-up.
- INFO todo-fixme-tbd-detected | category: todo-usage | evidence: confirmed | risk: low | auto_fix_available: false | path: reports/wwg-audit-report.json - TODO/FIXME/TBD marker detected. Recommendation: Confirm whether this is intentional tracked work or convert it into a report/follow-up.
- INFO todo-fixme-tbd-detected | category: todo-usage | evidence: confirmed | risk: low | auto_fix_available: false | path: reports/wwg-audit-report.md - TODO/FIXME/TBD marker detected. Recommendation: Confirm whether this is intentional tracked work or convert it into a report/follow-up.
- INFO todo-fixme-tbd-detected | category: todo-usage | evidence: confirmed | risk: low | auto_fix_available: false | path: reports/wwg-doctor-report.json - TODO/FIXME/TBD marker detected. Recommendation: Confirm whether this is intentional tracked work or convert it into a report/follow-up.
- INFO todo-fixme-tbd-detected | category: todo-usage | evidence: confirmed | risk: low | auto_fix_available: false | path: reports/wwg-doctor-report.md - TODO/FIXME/TBD marker detected. Recommendation: Confirm whether this is intentional tracked work or convert it into a report/follow-up.
- INFO todo-fixme-tbd-detected | category: todo-usage | evidence: confirmed | risk: low | auto_fix_available: false | path: reports/wwg-handoff-to-codex.json - TODO/FIXME/TBD marker detected. Recommendation: Confirm whether this is intentional tracked work or convert it into a report/follow-up.
- INFO todo-fixme-tbd-detected | category: todo-usage | evidence: confirmed | risk: low | auto_fix_available: false | path: reports/wwg-handoff-to-codex.md - TODO/FIXME/TBD marker detected. Recommendation: Confirm whether this is intentional tracked work or convert it into a report/follow-up.
- INFO todo-fixme-tbd-detected | category: todo-usage | evidence: confirmed | risk: low | auto_fix_available: false | path: workspace/AGENTS.md - TODO/FIXME/TBD marker detected. Recommendation: Confirm whether this is intentional tracked work or convert it into a report/follow-up.
- INFO wwg-principles-valid | category: general | evidence: unknown | risk: low | auto_fix_available: false - Principles folder and lightweight Principle Brief checks passed. Recommendation: Review and document the appropriate next step.
- INFO yaml-files-parse | category: schemas | evidence: unknown | risk: low | auto_fix_available: false - Parsed 2 YAML file(s). Recommendation: Review and document the appropriate next step.

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
- Drift status: NONE
- Canonical files changed:
  - None by audit.
- Implementation discoveries synced:
  - None by audit; review findings before promoting observations to project truth.
- Remaining stale context:
  - None requiring immediate truth synchronization.

## Next Steps

- wwg validate
- wwg audit --existing
- wwg brief
