# WWG Audit Report

# WWG Adoption Audit

## Audit Summary

- Target: C:\Users\Admin\Documents\Projects\BANDAI HRIS\hris-app
- Date: 2026-06-29
- Recommended adoption mode: infer
- Adoption readiness score: 95 / 100
- Confidence: HIGH
- Command: `wwg audit --target C:\Users\Admin\Documents\Projects\BANDAI HRIS\hris-app --upgrade-candidates`

## Evidence Reviewed

- README/docs: README.md, app/components/ui/README.md, app/lib/job-form-dialog/README.md, docs/archive/legacy-root-docs/ARCHITECTURE_JOB_APPLICATION_FORM.md, docs/archive/legacy-root-docs/ATOMIC_COMPONENTS.md, docs/archive/legacy-root-docs/ATTENDANCE_APPROVAL.md, docs/archive/legacy-root-docs/DEEP_LINKING_IMPLEMENTATION.md, docs/archive/legacy-root-docs/IMPLEMENTATION_CHECKLIST.md, docs/archive/legacy-root-docs/LEAVE_REQUEST_MODAL.md, docs/archive/legacy-root-docs/PDF_GENERATOR_README.md, docs/archive/legacy-root-docs/README.md, docs/archive/legacy-root-docs/REFACTORING-QUICK-START.md, docs/archive/legacy-root-docs/REFACTORING_PLAN.md, docs/archive/legacy-root-docs/route-analysis.md, docs/archive/legacy-root-docs/route-structure-proposal.md, docs/archive/legacy-root-docs/route-structure-suggestions.md, docs/attendance-correction-feature-summary.md, docs/attendance-fix-redesign-brief.md, docs/attendance-time-correction-context.md, docs/attendance-time-correction-implementation-plan.md, docs/attendance-ux-fixes-prompts/00-chain-plan.md, docs/attendance-ux-fixes-prompts/pass-1-discovery.md, docs/attendance-ux-fixes-prompts/pass-2-locked-cta-fix.md, docs/attendance-ux-fixes-prompts/pass-3-fix-attendance-discoverability.md, docs/attendance-ux-fixes-prompts/pass-4-status-control-and-copy.md, docs/attendance-ux-fixes-prompts/pass-5-comp-leave-and-overtime-reason.md, docs/attendance-ux-fixes-prompts/pass-6-validation-and-closeout.md, docs/design-audits/bandai-design-parity-report.md, docs/design-audits/bandai-design-report.md, docs/design-system.md, docs/employee-status-changes-eligibility.md, docs/phase-1-design-token-prompts/chain-run.md, docs/phase-1-design-token-prompts/pass-1.md, docs/phase-1-design-token-prompts/pass-2.md, docs/phase-1-design-token-prompts/pass-3.md, docs/phase-1-design-token-prompts/pass-4.md, docs/phase-1-design-token-prompts/pass-5.md, docs/phase-1-design-token-prompts/pass-6.md, docs/phase-1-design-token-prompts/source-plan.md, docs/phase-attendance-time-correction-prompts/chain-run.md
- Package/config files: package.json
- Source folders: app, app/assets, app/assets/forms, app/components, app/components/atoms, app/components/atoms/form, app/components/atoms/navigation, app/components/atoms/progress, app/components/atoms/settings, app/components/dashboards, app/components/dashboards/shared, app/components/dashboards/shared/cards, app/components/debug, app/components/examples, app/components/guards, app/components/modals, app/components/molecules, app/components/molecules/boarding-template, app/components/molecules/calendars, app/components/molecules/device, app/components/molecules/employee, app/components/molecules/form, app/components/molecules/guide, app/components/molecules/hr-admin, app/components/molecules/hr-public, app/components/molecules/hr-user, app/components/molecules/job-management, app/components/molecules/manager, app/components/molecules/settings, app/components/molecules/shared
- Tests: app/components/atoms/Card.test.tsx, app/components/atoms/CategoricalText.test.tsx, app/components/atoms/DataTable.test.tsx, app/components/atoms/ProfileInitialsAvatar.test.tsx, app/components/atoms/SummaryCard.test.tsx, app/components/atoms/TimesheetDayCell.test.tsx, app/components/atoms/index.test.ts, app/components/dashboards/shared/role-dashboard.config.test.ts, app/components/modals/JobRequisitionRequestModal.test.tsx, app/components/molecules/EmployeeTableCell.test.tsx, app/components/molecules/RequestReviewModal.test.tsx, app/components/molecules/TimesheetCalendar.test.tsx, app/components/molecules/TimesheetCalendarApproval.test.tsx, app/components/molecules/TimesheetDayTooltipContent.test.tsx, app/components/molecules/TimesheetEmployeeCard.test.tsx, app/components/molecules/TimesheetHoursOverview.test.tsx, app/components/molecules/employee/EmploymentCompensationForm.test.tsx, app/components/organisms/Sidebar.test.tsx, app/components/organisms/TimesheetViewModal.test.tsx, app/components/organisms/employee-detail/employment-details-tab.test.tsx, app/components/organisms/hr/AttendanceFixModal.test.tsx, app/components/organisms/job-details-modal.test.tsx, app/components/organisms/job-lists.test.tsx, app/components/organisms/settings/WorkforceRecruitmentSettingsModule.test.tsx, app/components/shared/EmployeeList.test.tsx, app/components/templates/common/ResignationFlowModal.test.tsx, app/components/templates/common/attendance-management-template.test.tsx, app/components/templates/common/payroll-periods-template.test.tsx, app/components/templates/hr/benefit-types-template.test.tsx, app/lib/admin-migration-ui.test.ts
- Deployment/config: .github/workflows/firebase-hosting-develop.yml, Dockerfile, firebase.json
- Existing agent/context files: .wwg/.gitignore, .wwg/changelog/config.yml, .wwg/changelog/state.json, .wwg/config/skill-manifest.yaml, .wwg/readme/config.yml, .wwg/readme/state.json, AGENTS.md, workspace/AGENTS.md

## Observed Reality

- Product/app identity: CONFIRMED - react-app-template Evidence: package.json (package name)
- Product category: INFERRED - Web3 eCommerce prototype Evidence: README/source (Web3, commerce, cart/checkout, or crypto wallet terms detected)
- Tech stack: CONFIRMED - react, typescript, vite, tailwindcss, TypeScript Evidence: package/config (dependencies and config files)
- Runtime/build tools: CONFIRMED - build, dev, start, storybook, build-storybook, format, lint, lint:fix, typecheck, typecheck:test, test, test:unit, test:component, test:integration, test:migration:ui-quality, test:obligations, test:e2e, test:e2e:dm4-fresh-db, test:e2e:smoke, test:regression, test:ci, quality:ci, quality:strict, test:routes, test:attendance-perf, clean-routes, test:unreachable, clean-unreachable-routes, detect:duplicates, audit:admin-config-ui, audit:admin-config-ui:strict, audit:admin-config-patterns, audit:admin-config-patterns:strict, refactor:admin-config-patterns:dry-run, refactor:admin-config-patterns, refactor:routes:dry-run, refactor:routes, update:routes-config:dry-run, update:routes-config, delete:employee, delete:all-employees, gh:sync:deploy-config, unify-routes:dry-run, unify-routes, migrate-routes:dry-run, migrate-routes, backup-routes Evidence: package.json (scripts)
- Main entry points: CONFIRMED - .react-router/types/app/routes/site/+types/index.ts, .storybook/main.ts, app/components/atoms/index.ts, app/components/atoms/settings/index.ts, app/components/molecules/boarding-template/index.ts, app/components/molecules/employee/index.ts, app/components/molecules/hr-admin/index.ts, app/components/molecules/hr-user/index.ts, app/components/molecules/index.ts, app/components/molecules/settings/index.ts, app/components/molecules/shared/index.ts, app/components/organisms/boarding-template/index.ts Evidence: .react-router/types/app/routes/site/+types/index.ts (entry point candidate); .storybook/main.ts (entry point candidate); app/components/atoms/index.ts (entry point candidate); app/components/atoms/settings/index.ts (entry point candidate); app/components/molecules/boarding-template/index.ts (entry point candidate); app/components/molecules/employee/index.ts (entry point candidate); app/components/molecules/hr-admin/index.ts (entry point candidate); app/components/molecules/hr-user/index.ts (entry point candidate); app/components/molecules/index.ts (entry point candidate); app/components/molecules/settings/index.ts (entry point candidate); app/components/molecules/shared/index.ts (entry point candidate); app/components/organisms/boarding-template/index.ts (entry point candidate)
- Main implemented features: INFERRED - Scope, Quality Gates, Safety Notes, app/components/PdfFieldMapper, app/components/PdfGeneratorDemo, app/components/atoms/Alert, app/components/atoms/Avatar, app/components/atoms/Badge, app/components/atoms/Button, app/components/atoms/Card.test Evidence: README.md (README headings or route files)
- User roles/surfaces: INFERRED - admin, user, owner Evidence: README/source (role-like terms detected)
- Data persistence: CONFIRMED - mongoose, firebase-tools, app/lib/utils/employee-form-draft-idb.test.ts, app/lib/utils/employee-form-draft-idb.ts, app/lib/utils/import-persistence-idb.ts Evidence: mongoose (persistence indicator)
- Auth/security: CONFIRMED - class-variance-authority, firebase-tools, .react-router/types/app/layouts/+types/auth-layout.ts, .react-router/types/app/routes/auth/+types/login.ts, app/components/debug/AuthDebug.tsx, app/components/templates/AuthTemplate.tsx, app/contexts/auth-context.tsx, app/contexts/auth-provider.tsx, app/guards/auth-guard.tsx, app/layouts/auth-layout.tsx Evidence: class-variance-authority (auth/security indicator)
- Payments/billing: CONFIRMED - .react-router/types/app/routes/hr/+types/billings.$id.ts, .react-router/types/app/routes/hr/+types/billings.ts, app/components/templates/common/billings-template.tsx, app/lib/mock-soa-billings.ts, app/routes/hr/billings.$id.tsx, app/routes/hr/billings.tsx, build/client/assets/billings-CDRuR2s_.js, build/client/assets/billings._id-DVA5nnqp.js Evidence: .react-router/types/app/routes/hr/+types/billings.$id.ts (payments/billing indicator)
- Deployment/runtime: CONFIRMED - .github/workflows/firebase-hosting-develop.yml, Dockerfile, firebase.json Evidence: .github/workflows/firebase-hosting-develop.yml (deployment config); Dockerfile (deployment config); firebase.json (deployment config)

## Inferred Truth

- Product identity: INFERRED - react-app-template Evidence: package.json (package name)
- Product category: INFERRED - Web3 eCommerce prototype Evidence: README/source (Web3, commerce, cart/checkout, or crypto wallet terms detected)
- Primary users: INFERRED - admin, user, owner Evidence: README/source (role-like terms detected)
- Core features: INFERRED - Scope, Quality Gates, Safety Notes, app/components/PdfFieldMapper, app/components/PdfGeneratorDemo, app/components/atoms/Alert, app/components/atoms/Avatar, app/components/atoms/Badge, app/components/atoms/Button, app/components/atoms/Card.test Evidence: README.md (README headings or route files)
- Architecture: INFERRED - source folders: app, app/assets, app/assets/forms, app/components, app/components/atoms, app/components/atoms/form, app/components/atoms/navigation, app/components/atoms/progress; package-managed runtime; TypeScript configuration Evidence: source/config (folders and package metadata)
- Safety/production boundaries: INFERRED - mock/demo crypto checkout and stablecoin wallet boundary, mock/demo behavior mentioned, demo behavior mentioned, mock/demo files detected, production-sensitive dependency detected Evidence: README/source/package (safety boundary indicators)

## Conflicts and Drift Risks

- README vs code: CONFIRMED - No direct issue detected by lightweight audit.
- UI/copy vs implementation: CONFIRMED - No direct issue detected by lightweight audit.
- package metadata vs actual stack: CONFIRMED - No direct issue detected by lightweight audit.
- mock/demo vs production claims: CONFLICTING - Mock/demo and production/live language both appear in scanned text. Recommendation: Separate demo boundaries from production claims in project truth and public docs.
- terminology drift: CONFIRMED - No direct issue detected by lightweight audit.
- stale/generated files: CONFIRMED - No direct issue detected by lightweight audit.
- missing tests/checks: CONFIRMED - No direct issue detected by lightweight audit.

## Open Questions

- Confirm product category. Why: Category affects profile selection, architecture defaults, and governance gates. Evidence: INFERRED: Web3 eCommerce prototype
- Confirm primary users and role names. Why: Roles affect permissions, UX, terminology, and task routing. Evidence: INFERRED: admin, user, owner

## Recommended Adoption Plan

- Recommended mode: infer
- Files WWG should create/update: `.wwg/wiki/project-truth.md`, `.wwg/wiki/terminology.md`, `.wwg/wiki/principles/README.md`, `.wwg/workspace/current-task.md`, `.wwg/governance/truth-capture.md`, `.wwg/governance/drift-guard.md`, `.wwg/reports/adoption-audit.md`, `AGENTS.md`.
- Follow-up actions: confirm inferred truth, resolve conflicts, answer open questions, and run `wwg validate --target <project>`.

Labels used: CONFIRMED, INFERRED, NEEDS_CONFIRMATION, CONFLICTING, STALE.


## Existing Project Adoption Note

Observed reality comes from code/docs/config. Inferred truth is not canonical until reviewed.

## Summary

critical: 0, high: 0, medium: 4, low: 12, info: 70

## Command

`wwg audit --target C:\Users\Admin\Documents\Projects\BANDAI HRIS\hris-app --upgrade-candidates`

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
- Length: 59 lines
- Validation status: warn
- Bloat detected: no
- Phase/pass pollution: no
- Missing docs map: yes
- Missing agent routing: yes
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
- Candidate workflow: generated
- Applied changes: 0
- Candidate surfaces: 0
- Merge guidance items: 8
- Candidate report: .wwg/reports/generated-project-upgrade-candidates.md
- Merge guidance report: .wwg/reports/generated-project-merge-guidance.md
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

- [ ] Changelog missing (missing)
  - Reason: Package, product, or git history signals make release memory relevant.
  - Agent action: Prepare or review release narrative before treating changelog wording as final.
  - CLI support: `wwg changelog generate --from-git --weekly --dry-run`
  - Evidence: `CHANGELOG.md`
- [ ] GitHub publishing readiness not checked (available)
  - Reason: Git or GitHub context exists.
  - Agent action: Do not publish without explicit approval; review readiness and secret safety first.
  - CLI support: `wwg publish github --dry-run`
  - Evidence: `.git`, `.github`, `package.json repository`
- [ ] Doctor/self-heal available for repairable issues (available)
  - Reason: Repairable WWG-owned issues were detected by the current command.
  - Agent action: Use doctor for deterministic WWG-owned repair; keep semantic truth review-only.
  - CLI support: `wwg doctor --apply`
- [ ] Actual template version drift (available)
  - Reason: Workspace template_version is lower than installed WWG/template (0.6.0 -> 0.6.6). Run upgrade check before applying.
  - Agent action: Review a migration plan before applying upgrade changes.
  - CLI support: `wwg upgrade --check`
  - Evidence: `wwg.template_version`, `installed WWG/template version`, `.wwg/reports/generated-project-upgrade-review.md`

### Recommended Next

- [ ] Review relevant Other Features (available)
  - Reason: Only detected gaps or context-relevant actions are shown.
  - Agent action: Treat recommendations as scoped support, not permission to expand the current task.
  - CLI support: `wwg brief`

Agents should follow Must Have items first. Missing Other Features are not blockers unless the current task depends on them.

## Findings

- MEDIUM recommended-changelog | category: existing-audit | evidence: likely | risk: medium | auto_fix_available: false | path: CHANGELOG.md - Recommended artifact is not currently mapped or detected. Recommendation: Create only in a later explicit adoption/init phase.
- MEDIUM registry-report-missing | category: generation-freshness | evidence: confirmed | risk: low | auto_fix_available: true | path: .wwg/reports/wwg-refresh-skills-report.md - Registry references missing report refresh_skills. Recommendation: Run the related command or remove the stale report reference through a safe registry update.
- MEDIUM registry-report-missing | category: generation-freshness | evidence: confirmed | risk: low | auto_fix_available: true | path: .wwg/reports/wwg-infra-plan-report.md - Registry references missing report infra_plan. Recommendation: Run the related command or remove the stale report reference through a safe registry update.
- MEDIUM registry-report-missing | category: generation-freshness | evidence: confirmed | risk: low | auto_fix_available: true | path: .wwg/reports/wwg-env-example-report.md - Registry references missing report env_example. Recommendation: Run the related command or remove the stale report reference through a safe registry update.
- LOW canonical-context-policy-missing | category: policy-coverage | evidence: confirmed | risk: low | auto_fix_available: false | path: wiki-template/base/09-agent-context/canonical-context-policy.md - Expected policy or coverage artifact is missing. Recommendation: Restore the policy artifact or document an equivalent canonical source.
- LOW changelog-missing | category: changelog-governance | evidence: confirmed | risk: low | auto_fix_available: false | path: CHANGELOG.md - CHANGELOG.md is missing, so project memory and release subtext are not yet first-class. Recommendation: Run `wwg changelog generate --target . --from-git --weekly --dry-run` before creating one.
- LOW evidence-standards-missing | category: policy-coverage | evidence: confirmed | risk: low | auto_fix_available: false | path: governance-template/base/evidence-standards.md - Expected policy or coverage artifact is missing. Recommendation: Restore the policy artifact or document an equivalent canonical source.
- LOW maintenance-matrix-missing | category: maintenance-matrix | evidence: confirmed | risk: low | auto_fix_available: false | path: wiki-template/base/12-maintenance/context-maintenance-matrix.md - Maintenance matrix artifact is missing. Recommendation: Add matrix coverage when this layer exists.
- LOW maintenance-matrix-missing | category: maintenance-matrix | evidence: confirmed | risk: low | auto_fix_available: false | path: workspace-template/base/context/context-maintenance-matrix.md - Maintenance matrix artifact is missing. Recommendation: Add matrix coverage when this layer exists.
- LOW maintenance-matrix-missing | category: maintenance-matrix | evidence: confirmed | risk: low | auto_fix_available: false | path: .wwg/wiki/12-maintenance/self-maintenance-loop.md - Maintenance matrix artifact is missing. Recommendation: Add matrix coverage when this layer exists.
- LOW public-discovery-review-missing | category: policy-coverage | evidence: confirmed | risk: low | auto_fix_available: false | path: governance-template/base/public-discovery-review.md - Expected policy or coverage artifact is missing. Recommendation: Restore the policy artifact or document an equivalent canonical source.
- LOW public-surface-review-missing | category: policy-coverage | evidence: confirmed | risk: low | auto_fix_available: false | path: governance-template/base/public-surface-review.md - Expected policy or coverage artifact is missing. Recommendation: Restore the policy artifact or document an equivalent canonical source.
- LOW readme-agent-routing-missing | category: readme-governance | evidence: confirmed | risk: low | auto_fix_available: false | path: README.md - WWG is present but README.md does not route agents to AGENTS.md and .wwg context. Recommendation: Add a short For Agents section.
- LOW readme-docs-map-missing | category: readme-governance | evidence: confirmed | risk: low | auto_fix_available: false | path: README.md - README.md is missing a documentation map. Recommendation: Add a concise Documentation section.
- LOW runtime-monitoring-missing | category: policy-coverage | evidence: confirmed | risk: low | auto_fix_available: false | path: wiki-template/base/08-operations/monitoring.md - Expected policy or coverage artifact is missing. Recommendation: Restore the policy artifact or document an equivalent canonical source.
- LOW truth-conflict-policy-missing | category: policy-coverage | evidence: confirmed | risk: low | auto_fix_available: false | path: governance-template/base/truth-conflict-resolution.md - Expected policy or coverage artifact is missing. Recommendation: Restore the policy artifact or document an equivalent canonical source.
- INFO agent-ready-artifacts-present | category: agent-readiness | evidence: confirmed | risk: low | auto_fix_available: false - Agent-ready structure and evidence reports are present. Recommendation: No action required.
- INFO ambiguous-report-classification | category: report-policy | evidence: confirmed | risk: low | auto_fix_available: false - Some report-like files need human classification. Recommendation: Run `wwg reports --target .` and review the Ambiguous / Needs Review section.
- INFO candidate-principle-like-content | category: principles | evidence: likely | risk: low | auto_fix_available: false | path: AGENTS.md - Potential principle-like content was found outside the principles folder. Recommendation: Review whether this durable guidance should become a candidate Principle Brief; do not treat this as a critical error.
- INFO candidate-principle-like-content | category: principles | evidence: likely | risk: low | auto_fix_available: false | path: docs/archive/legacy-root-docs/REFACTORING_PLAN.md - Potential principle-like content was found outside the principles folder. Recommendation: Review whether this durable guidance should become a candidate Principle Brief; do not treat this as a critical error.
- INFO candidate-principle-like-content | category: principles | evidence: likely | risk: low | auto_fix_available: false | path: docs/archive/legacy-root-docs/route-structure-suggestions.md - Potential principle-like content was found outside the principles folder. Recommendation: Review whether this durable guidance should become a candidate Principle Brief; do not treat this as a critical error.
- INFO candidate-principle-like-content | category: principles | evidence: likely | risk: low | auto_fix_available: false | path: workspace/AGENTS.md - Potential principle-like content was found outside the principles folder. Recommendation: Review whether this durable guidance should become a candidate Principle Brief; do not treat this as a critical error.
- INFO candidate-principle-like-content | category: principles | evidence: likely | risk: low | auto_fix_available: false | path: workspace/context/architecture-context.md - Potential principle-like content was found outside the principles folder. Recommendation: Review whether this durable guidance should become a candidate Principle Brief; do not treat this as a critical error.
- INFO candidate-principle-like-content | category: principles | evidence: likely | risk: low | auto_fix_available: false | path: workspace/context/governance-context.md - Potential principle-like content was found outside the principles folder. Recommendation: Review whether this durable guidance should become a candidate Principle Brief; do not treat this as a critical error.
- INFO candidate-principle-like-content | category: principles | evidence: likely | risk: low | auto_fix_available: false | path: workspace/context/project-context.md - Potential principle-like content was found outside the principles folder. Recommendation: Review whether this durable guidance should become a candidate Principle Brief; do not treat this as a critical error.
- INFO candidate-principle-like-content | category: principles | evidence: likely | risk: low | auto_fix_available: false | path: workspace/context/ux-context.md - Potential principle-like content was found outside the principles folder. Recommendation: Review whether this durable guidance should become a candidate Principle Brief; do not treat this as a critical error.
- INFO duplicate-concept-hint | category: duplicate-concepts | evidence: hypothesis | risk: low | auto_fix_available: false | path: wiki/12-maintenance/context-maintenance-matrix.md - Multiple context-maintenance-matrix artifacts exist. Recommendation: Confirm this is intentional template/dogfood or source/generated separation.
- INFO generated-markers-balanced | category: generated-markers | evidence: unknown | risk: low | auto_fix_available: false - Generated marker pairs are balanced where present. Recommendation: Review and document the appropriate next step.
- INFO governance-detected | category: existing-audit | evidence: confirmed | risk: low | auto_fix_available: false - Detected 33 governance artifact(s). Recommendation: Reuse and register existing governance artifacts.
- INFO json-schemas-parse | category: schemas | evidence: unknown | risk: low | auto_fix_available: false - Parsed and compiled 0 JSON schema file(s). Recommendation: Review and document the appropriate next step.
- INFO maintenance-review-recommended | category: maintenance | evidence: confirmed | risk: low | auto_fix_available: false - This project shows maintenance drift signals. Run `wwg maintain --target <path>` to generate a structured maintenance review. Recommendation: Run `wwg maintain --target .` for a non-destructive maintenance recommendation report.
- INFO mapping-architecture_context | category: existing-audit | evidence: confirmed | risk: low | auto_fix_available: false | path: workspace/context/architecture-context.md - Detected candidate for architecture_context. Recommendation: Register workspace/context/architecture-context.md as architecture_context; do not duplicate it.
- INFO mapping-domain_context | category: existing-audit | evidence: confirmed | risk: low | auto_fix_available: false | path: workspace/context/domain-context.md - Detected candidate for domain_context. Recommendation: Register workspace/context/domain-context.md as domain_context; do not duplicate it.
- INFO mapping-maintenance_matrix | category: existing-audit | evidence: confirmed | risk: low | auto_fix_available: false | path: wiki/12-maintenance/context-maintenance-matrix.md - Detected candidate for maintenance_matrix. Recommendation: Register wiki/12-maintenance/context-maintenance-matrix.md as maintenance_matrix; do not duplicate it.
- INFO mapping-project_master_context | category: existing-audit | evidence: confirmed | risk: low | auto_fix_available: false | path: workspace/context/project-context.md - Detected candidate for project_master_context. Recommendation: Register workspace/context/project-context.md as project_master_context; do not duplicate it.
- INFO mapping-public_discovery_context | category: existing-audit | evidence: confirmed | risk: low | auto_fix_available: false | path: docs/attendance-ux-fixes-prompts/pass-6-validation-and-closeout.md - Detected candidate for public_discovery_context. Recommendation: Register docs/attendance-ux-fixes-prompts/pass-6-validation-and-closeout.md as public_discovery_context; do not duplicate it.
- INFO mapping-root_agents | category: existing-audit | evidence: confirmed | risk: low | auto_fix_available: false | path: AGENTS.md - Detected candidate for root_agents. Recommendation: Register AGENTS.md as root_agents; do not duplicate it.
- INFO mapping-runtime_context | category: existing-audit | evidence: confirmed | risk: low | auto_fix_available: false | path: workspace/prompts/runtime-infrastructure.md - Detected candidate for runtime_context. Recommendation: Register workspace/prompts/runtime-infrastructure.md as runtime_context; do not duplicate it.
- INFO markdown-readable | category: markdown | evidence: unknown | risk: low | auto_fix_available: false - Markdown files are non-empty and readable. Recommendation: Review and document the appropriate next step.
- INFO principle-files-present | category: principles | evidence: confirmed | risk: low | auto_fix_available: false | path: .wwg/wiki/principles - No Principle Brief files beyond README were found. Recommendation: Add Principle Briefs only when durable guidance is explicit.
- INFO project-registry-valid | category: registry | evidence: unknown | risk: low | auto_fix_available: false | path: .wwg/config/wwg.project.yaml - WWG project registry parses and matches the registry schema. Recommendation: Review and document the appropriate next step.
- INFO public-surface-artifact | category: existing-audit | evidence: confirmed | risk: approval-gated | auto_fix_available: false | path: .react-router/types/app/routes/legal/+types/privacy-policy.ts - Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact | category: existing-audit | evidence: confirmed | risk: approval-gated | auto_fix_available: false | path: .react-router/types/app/routes/legal/+types/terms-of-use.ts - Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact | category: existing-audit | evidence: confirmed | risk: approval-gated | auto_fix_available: false | path: .react-router/types/app/routes/support/+types/faq.ts - Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact | category: existing-audit | evidence: confirmed | risk: approval-gated | auto_fix_available: false | path: .react-router/types/app/routes/support/+types/help-desk.ts - Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact | category: existing-audit | evidence: confirmed | risk: low | auto_fix_available: false | path: .wwg/changelog/config.yml - Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact | category: existing-audit | evidence: confirmed | risk: low | auto_fix_available: false | path: .wwg/changelog/state.json - Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact | category: existing-audit | evidence: confirmed | risk: approval-gated | auto_fix_available: false | path: app/routes/legal/privacy-policy.tsx - Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact | category: existing-audit | evidence: confirmed | risk: approval-gated | auto_fix_available: false | path: app/routes/legal/terms-of-use.tsx - Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact | category: existing-audit | evidence: confirmed | risk: approval-gated | auto_fix_available: false | path: app/routes/support/faq.tsx - Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact | category: existing-audit | evidence: confirmed | risk: approval-gated | auto_fix_available: false | path: app/routes/support/help-desk.tsx - Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact | category: existing-audit | evidence: confirmed | risk: approval-gated | auto_fix_available: false | path: build/client/assets/privacy-policy-1bKaJarF.js - Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact | category: existing-audit | evidence: confirmed | risk: approval-gated | auto_fix_available: false | path: build/client/assets/terms-of-use-CtEaByp2.js - Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact | category: existing-audit | evidence: confirmed | risk: low | auto_fix_available: false | path: docs/attendance-ux-fixes-prompts/pass-6-validation-and-closeout.md - Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact | category: existing-audit | evidence: confirmed | risk: low | auto_fix_available: false | path: reports/changelog-bump-recommendation.md - Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact | category: existing-audit | evidence: confirmed | risk: low | auto_fix_available: false | path: reports/changelog-preview.md - Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact | category: existing-audit | evidence: confirmed | risk: low | auto_fix_available: false | path: reports/wwg-changelog-handoff.md - Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-detected | category: existing-audit | evidence: confirmed | risk: low | auto_fix_available: false - Detected 16 public surface/public discovery artifact(s). Recommendation: Map existing public discovery sources before proposing new ones.
- INFO readme-detected | category: readme-governance | evidence: confirmed | risk: low | auto_fix_available: false | path: README.md - README.md was detected at 59 lines. Recommendation: Validate it with `wwg readme validate --target .`.
- INFO recommendation-governance-present | category: recommendation-governance | evidence: confirmed | risk: low | auto_fix_available: false | path: .wwg/governance/recommendation-registry.md - Recommendation capture is available through the Governance registry and policy. Recommendation: Use the registry for useful future work discovered by agents, audits, maintenance runs, or closeouts; do not promote recommendations automatically.
- INFO root-agents-detected | category: existing-audit | evidence: confirmed | risk: low | auto_fix_available: false | path: AGENTS.md - Root agent instructions were detected. Recommendation: Map this file as canonical_artifacts.root_agents.
- INFO runtime-skill-candidates-not-generated | category: runtime-skill-candidates | evidence: confirmed | risk: low | auto_fix_available: false | path: .wwg/reports/runtime-skill-candidates.json - Runtime skill candidate contract: not generated. Recommendation: No action required. Candidate artifacts are optional and absence is valid.
- INFO skill-copy-policy-current | category: skill-manifest | evidence: confirmed | risk: low | auto_fix_available: false | path: .wwg/config/skill-manifest.yaml - Governed skill copy policy: 5 compatibility-core skills are copied or referenced as allowed, and compatibility-domain skills are reference-only for new projects. Recommendation: Legacy copied skill cleanup: clean. Recommended/reference-only skills are not active runtime skills.
- INFO skill-manifest-present | category: skill-manifest | evidence: confirmed | risk: low | auto_fix_available: false | path: .wwg/config/skill-manifest.yaml - Skill policy: manifest present, no policy violations. Skill materialization: 5 copied, 14 referenced, 0 local, 0 none. Recommended skills: 13. Enabled core skills: 6. Disabled skills: 0. Recommendation: No action required.
- INFO skill-nondev-reference-recommendations | category: skill-manifest | evidence: confirmed | risk: low | auto_fix_available: false | path: .wwg/config/skill-manifest.yaml - Recommended Creative/Business skills: business.business-brief, business.decision-memo, business.sop-writing, creative.pitch-deck, creative.storytelling. Recommendation: These recommendations are reference-only. WWG did not copy skill files or activate runtime skills; Vorter remains responsible for future runtime activation.
- INFO structure-present | category: repository-structure | evidence: confirmed | risk: low | auto_fix_available: false - Expected structure is present for existing-adopted-project. Recommendation: No action required.
- INFO template-boundary-scope-skipped | category: template-boundary | evidence: confirmed | risk: low | auto_fix_available: false - Template asset boundary checks apply only to WWG template repositories. Recommendation: No action required.
- INFO todo-fixme-tbd-detected | category: todo-usage | evidence: confirmed | risk: low | auto_fix_available: false | path: app/lib/document-request-handler.ts - TODO/FIXME/TBD marker detected. Recommendation: Confirm whether this is intentional tracked work or convert it into a report/follow-up.
- INFO todo-fixme-tbd-detected | category: todo-usage | evidence: confirmed | risk: low | auto_fix_available: false | path: app/lib/employee-to-bir2316.ts - TODO/FIXME/TBD marker detected. Recommendation: Confirm whether this is intentional tracked work or convert it into a report/follow-up.
- INFO todo-fixme-tbd-detected | category: todo-usage | evidence: confirmed | risk: low | auto_fix_available: false | path: app/lib/hooks/useEmployees.ts - TODO/FIXME/TBD marker detected. Recommendation: Confirm whether this is intentional tracked work or convert it into a report/follow-up.
- INFO todo-fixme-tbd-detected | category: todo-usage | evidence: confirmed | risk: low | auto_fix_available: false | path: app/services/attendance-approval.service.ts - TODO/FIXME/TBD marker detected. Recommendation: Confirm whether this is intentional tracked work or convert it into a report/follow-up.
- INFO todo-fixme-tbd-detected | category: todo-usage | evidence: confirmed | risk: low | auto_fix_available: false | path: build/client/assets/TextLayer-DadAq-po.js - TODO/FIXME/TBD marker detected. Recommendation: Confirm whether this is intentional tracked work or convert it into a report/follow-up.
- INFO todo-fixme-tbd-detected | category: todo-usage | evidence: confirmed | risk: low | auto_fix_available: false | path: build/client/assets/employee._id-H-WtRzKk.js - TODO/FIXME/TBD marker detected. Recommendation: Confirm whether this is intentional tracked work or convert it into a report/follow-up.
- INFO todo-fixme-tbd-detected | category: todo-usage | evidence: confirmed | risk: low | auto_fix_available: false | path: build/client/assets/face-api.esm-CT-VR31B.js - TODO/FIXME/TBD marker detected. Recommendation: Confirm whether this is intentional tracked work or convert it into a report/follow-up.
- INFO todo-fixme-tbd-detected | category: todo-usage | evidence: confirmed | risk: low | auto_fix_available: false | path: governance/regression-guardrail-catalog.md - TODO/FIXME/TBD marker detected. Recommendation: Confirm whether this is intentional tracked work or convert it into a report/follow-up.
- INFO todo-fixme-tbd-detected | category: todo-usage | evidence: confirmed | risk: low | auto_fix_available: false | path: reports/context-skill-quality.json - TODO/FIXME/TBD marker detected. Recommendation: Confirm whether this is intentional tracked work or convert it into a report/follow-up.
- INFO todo-fixme-tbd-detected | category: todo-usage | evidence: confirmed | risk: low | auto_fix_available: false | path: reports/context-skill-quality.md - TODO/FIXME/TBD marker detected. Recommendation: Confirm whether this is intentional tracked work or convert it into a report/follow-up.
- INFO todo-fixme-tbd-detected | category: todo-usage | evidence: confirmed | risk: low | auto_fix_available: false | path: reports/wwg-agent-handoff.json - TODO/FIXME/TBD marker detected. Recommendation: Confirm whether this is intentional tracked work or convert it into a report/follow-up.
- INFO todo-fixme-tbd-detected | category: todo-usage | evidence: confirmed | risk: low | auto_fix_available: false | path: reports/wwg-agent-handoff.md - TODO/FIXME/TBD marker detected. Recommendation: Confirm whether this is intentional tracked work or convert it into a report/follow-up.
- INFO todo-fixme-tbd-detected | category: todo-usage | evidence: confirmed | risk: low | auto_fix_available: false | path: reports/wwg-audit-report.json - TODO/FIXME/TBD marker detected. Recommendation: Confirm whether this is intentional tracked work or convert it into a report/follow-up.
- INFO todo-fixme-tbd-detected | category: todo-usage | evidence: confirmed | risk: low | auto_fix_available: false | path: reports/wwg-audit-report.md - TODO/FIXME/TBD marker detected. Recommendation: Confirm whether this is intentional tracked work or convert it into a report/follow-up.
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
