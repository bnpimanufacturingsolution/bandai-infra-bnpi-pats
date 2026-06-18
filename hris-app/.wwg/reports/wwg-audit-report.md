# WWG Audit Report

Status: STALE_SUPERSEDED_BY_CURRENT_PROJECT_TRUTH
Superseded on: 2026-05-25
Superseded by: `.wwg/wiki/project-truth.md`, `.wwg/wiki/project-truth-summary.md`, and `.wwg/reports/cross-repo-context-reconciliation.md`.
Note: This historical audit output contains stale auto-inferred Web3/eCommerce classification. Current canonical truth is HRIS/workforce frontend app paired with `../hris-api`.

# WWG Adoption Audit

## Audit Summary

- Target: C:\Users\1biss\Documents\Projects\hris-app
- Date: 2026-05-15
- Recommended adoption mode: infer
- Adoption readiness score: 94 / 100
- Confidence: HIGH
- Command: `wwg audit --target C:\Users\1biss\Documents\Projects\hris-app`

## Evidence Reviewed

- README/docs: README.md, app/components/ui/README.md, app/lib/job-form-dialog/README.md, docs/employee-status-changes-eligibility.md, firebase/README.md, governance/README.md, wiki/principles/README.md
- Package/config files: package.json
- Source folders: app, app/assets, app/assets/forms, app/components, app/components/atoms, app/components/atoms/form, app/components/atoms/navigation, app/components/atoms/progress, app/components/atoms/settings, app/components/dashboards, app/components/dashboards/shared, app/components/dashboards/shared/cards, app/components/debug, app/components/examples, app/components/guards, app/components/modals, app/components/molecules, app/components/molecules/boarding-template, app/components/molecules/calendars, app/components/molecules/device, app/components/molecules/employee, app/components/molecules/form, app/components/molecules/guide, app/components/molecules/hr-admin, app/components/molecules/hr-public, app/components/molecules/hr-user, app/components/molecules/job-management, app/components/molecules/manager, app/components/molecules/settings, app/components/molecules/shared
- Tests: app/components/dashboards/shared/role-dashboard.config.test.ts, app/lib/utils/__tests__/report-scope.test.ts, app/lib/utils/__tests__/role-redirect.test.ts, app/lib/utils/default-employee-password.test.ts, app/lib/utils/employee-form-draft-idb.test.ts, app/lib/utils/employee-import-preview-validation.test.ts, app/lib/utils/role-derivation.test.ts, tests/document-onboarding-real-scenario.spec.ts, tests/hr-tickets-accordion.spec.ts, tests/perf/hr-attendance.spec.ts, tests/unreachable-routes.test.ts, tests/unused-routes.test.ts
- Deployment/config: .github/workflows/firebase-hosting-develop.yml, .github/workflows/firebase-hosting-merge.yml, .github/workflows/firebase-hosting-pull-request.yml, Dockerfile, firebase.json
- Existing agent/context files: .wwg/changelog/config.yml, .wwg/changelog/state.json, .wwg/readme/config.yml, .wwg/readme/state.json, AGENTS.md

## Observed Reality

- Product/app identity: CONFIRMED - react-app-template Evidence: package.json (package name)
- Product category: INFERRED - Web3 eCommerce prototype Evidence: README/source (Web3, commerce, cart/checkout, or crypto wallet terms detected)
- Tech stack: CONFIRMED - react, typescript, vite, tailwindcss, TypeScript Evidence: package/config (dependencies and config files)
- Runtime/build tools: CONFIRMED - build, dev, start, format, lint, typecheck, test:routes, test:attendance-perf, clean-routes, test:unreachable, clean-unreachable-routes, detect:duplicates, refactor:routes:dry-run, refactor:routes, update:routes-config:dry-run, update:routes-config, delete:employee, delete:all-employees, gh:sync:deploy-config, unify-routes:dry-run, unify-routes, migrate-routes:dry-run, migrate-routes, backup-routes Evidence: package.json (scripts)
- Main entry points: CONFIRMED - .react-router/types/app/routes/hr/settings/+types/index.ts, .react-router/types/app/routes/site/+types/index.ts, app/components/atoms/index.ts, app/components/atoms/settings/index.ts, app/components/molecules/boarding-template/index.ts, app/components/molecules/employee/index.ts, app/components/molecules/hr-admin/index.ts, app/components/molecules/hr-user/index.ts, app/components/molecules/index.ts, app/components/molecules/settings/index.ts, app/components/molecules/shared/index.ts, app/components/organisms/boarding-template/index.ts Evidence: .react-router/types/app/routes/hr/settings/+types/index.ts (entry point candidate); .react-router/types/app/routes/site/+types/index.ts (entry point candidate); app/components/atoms/index.ts (entry point candidate); app/components/atoms/settings/index.ts (entry point candidate); app/components/molecules/boarding-template/index.ts (entry point candidate); app/components/molecules/employee/index.ts (entry point candidate); app/components/molecules/hr-admin/index.ts (entry point candidate); app/components/molecules/hr-user/index.ts (entry point candidate); app/components/molecules/index.ts (entry point candidate); app/components/molecules/settings/index.ts (entry point candidate); app/components/molecules/shared/index.ts (entry point candidate); app/components/organisms/boarding-template/index.ts (entry point candidate)
- Main implemented features: INFERRED - Features, Getting Started, Available Scripts, Project Structure, app/components/PdfFieldMapper, app/components/PdfGeneratorDemo, app/components/atoms/Alert, app/components/atoms/Avatar, app/components/atoms/Badge, app/components/atoms/Button Evidence: README.md (README headings or route files)
- User roles/surfaces: INFERRED - admin, user Evidence: README/source (role-like terms detected)
- Data persistence: CONFIRMED - mongoose, firebase-tools, app/lib/utils/employee-form-draft-idb.test.ts, app/lib/utils/employee-form-draft-idb.ts, app/lib/utils/import-persistence-idb.ts Evidence: mongoose (persistence indicator)
- Auth/security: CONFIRMED - class-variance-authority, firebase-tools, .react-router/types/app/layouts/+types/auth-layout.ts, .react-router/types/app/routes/auth/+types/login.ts, app/components/debug/AuthDebug.tsx, app/components/templates/AuthTemplate.tsx, app/contexts/auth-context.tsx, app/contexts/auth-provider.tsx, app/guards/auth-guard.tsx, app/layouts/auth-layout.tsx Evidence: class-variance-authority (auth/security indicator)
- Payments/billing: CONFIRMED - .react-router/types/app/routes/hr/+types/billings.$id.ts, .react-router/types/app/routes/hr/+types/billings.ts, app/components/templates/common/billings-template.tsx, app/lib/mock-soa-billings.ts, app/routes/hr/billings.$id.tsx, app/routes/hr/billings.tsx Evidence: .react-router/types/app/routes/hr/+types/billings.$id.ts (payments/billing indicator)
- Deployment/runtime: CONFIRMED - .github/workflows/firebase-hosting-develop.yml, .github/workflows/firebase-hosting-merge.yml, .github/workflows/firebase-hosting-pull-request.yml, Dockerfile, firebase.json Evidence: .github/workflows/firebase-hosting-develop.yml (deployment config); .github/workflows/firebase-hosting-merge.yml (deployment config); .github/workflows/firebase-hosting-pull-request.yml (deployment config); Dockerfile (deployment config); firebase.json (deployment config)

## Inferred Truth

- Product identity: INFERRED - react-app-template Evidence: package.json (package name)
- Product category: INFERRED - Web3 eCommerce prototype Evidence: README/source (Web3, commerce, cart/checkout, or crypto wallet terms detected)
- Primary users: INFERRED - admin, user Evidence: README/source (role-like terms detected)
- Core features: INFERRED - Features, Getting Started, Available Scripts, Project Structure, app/components/PdfFieldMapper, app/components/PdfGeneratorDemo, app/components/atoms/Alert, app/components/atoms/Avatar, app/components/atoms/Badge, app/components/atoms/Button Evidence: README.md (README headings or route files)
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
- Confirm primary users and role names. Why: Roles affect permissions, UX, terminology, and task routing. Evidence: INFERRED: admin, user

## Recommended Adoption Plan

- Recommended mode: infer
- Files WWG should create/update: `.wwg/wiki/project-truth.md`, `.wwg/wiki/terminology.md`, `.wwg/wiki/principles/README.md`, `.wwg/workspace/current-task.md`, `.wwg/governance/truth-capture.md`, `.wwg/governance/drift-guard.md`, `.wwg/reports/adoption-audit.md`, `AGENTS.md`.
- Follow-up actions: confirm inferred truth, resolve conflicts, answer open questions, and run `wwg validate --target <project>`.

Labels used: CONFIRMED, INFERRED, NEEDS_CONFIRMATION, CONFLICTING, STALE.


## Existing Project Adoption Note

Observed reality comes from code/docs/config. Inferred truth is not canonical until reviewed.

## Summary

critical: 0, high: 0, medium: 9, low: 16, info: 50

## Command

`wwg audit --target C:\Users\1biss\Documents\Projects\hris-app`

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
- Length: 52 lines
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
- Safe additions: 2
- Safe updates: 0
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
- [ ] Audit can run (available)
  - Reason: Run audit when structural or governance confidence matters.
  - CLI support: `wwg audit`
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
  - Agent action: Inspect repair reports before applying fixes.
  - CLI support: `wwg doctor`

### Recommended Next

- [ ] Review relevant Other Features (available)
  - Reason: Only detected gaps or context-relevant actions are shown.
  - Agent action: Treat recommendations as scoped support, not permission to expand the current task.
  - CLI support: `wwg brief`

Agents should follow Must Have items first. Missing Other Features are not blockers unless the current task depends on them.

## Findings

- MEDIUM recommended-changelog | category: existing-audit | evidence: likely | risk: medium | auto_fix_available: false | path: CHANGELOG.md - Recommended artifact is not currently mapped or detected. Recommendation: Create only in a later explicit adoption/init phase.
- MEDIUM recommended-maintenance_matrix | category: existing-audit | evidence: likely | risk: medium | auto_fix_available: false | path: docs/ai-context/context-maintenance-matrix.md - Recommended artifact is not currently mapped or detected. Recommendation: Create only in a later explicit adoption/init phase.
- MEDIUM recommended-public_discovery_context | category: existing-audit | evidence: likely | risk: medium | auto_fix_available: false | path: docs/ai-context/public-discovery-context.md - Recommended artifact is not currently mapped or detected. Recommendation: Create only in a later explicit adoption/init phase.
- MEDIUM registry-report-missing | category: generation-freshness | evidence: confirmed | risk: low | auto_fix_available: true | path: .wwg/reports/wwg-generate-workspace-report.md - Registry references missing report generate_workspace. Recommendation: Run the related command or remove the stale report reference through a safe registry update.
- MEDIUM registry-report-missing | category: generation-freshness | evidence: confirmed | risk: low | auto_fix_available: true | path: .wwg/reports/wwg-refresh-context-report.md - Registry references missing report refresh_context. Recommendation: Run the related command or remove the stale report reference through a safe registry update.
- MEDIUM registry-report-missing | category: generation-freshness | evidence: confirmed | risk: low | auto_fix_available: true | path: .wwg/reports/wwg-refresh-skills-report.md - Registry references missing report refresh_skills. Recommendation: Run the related command or remove the stale report reference through a safe registry update.
- MEDIUM registry-report-missing | category: generation-freshness | evidence: confirmed | risk: low | auto_fix_available: true | path: .wwg/reports/wwg-infra-plan-report.md - Registry references missing report infra_plan. Recommendation: Run the related command or remove the stale report reference through a safe registry update.
- MEDIUM registry-report-missing | category: generation-freshness | evidence: confirmed | risk: low | auto_fix_available: true | path: .wwg/reports/wwg-env-example-report.md - Registry references missing report env_example. Recommendation: Run the related command or remove the stale report reference through a safe registry update.
- MEDIUM report-index-missing | category: report-policy | evidence: confirmed | risk: medium | auto_fix_available: false | path: .wwg/reports/README.md - .wwg/reports exists without its promoted report index. Recommendation: Add `.wwg/reports/README.md` before claiming native report policy readiness.
- LOW agent-readiness-report-missing | category: agent-readiness | evidence: confirmed | risk: low | auto_fix_available: true | path: .wwg/reports/wwg-audit-report.md - Validation or audit evidence report is missing. Recommendation: Run validate and audit before claiming agent readiness.
- LOW canonical-context-policy-missing | category: policy-coverage | evidence: confirmed | risk: low | auto_fix_available: false | path: wiki-template/base/09-agent-context/canonical-context-policy.md - Expected policy or coverage artifact is missing. Recommendation: Restore the policy artifact or document an equivalent canonical source.
- LOW changelog-missing | category: changelog-governance | evidence: confirmed | risk: low | auto_fix_available: false | path: CHANGELOG.md - CHANGELOG.md is missing, so project memory and release subtext are not yet first-class. Recommendation: Run `wwg changelog generate --target . --from-git --weekly --dry-run` before creating one.
- LOW evidence-standards-missing | category: policy-coverage | evidence: confirmed | risk: low | auto_fix_available: false | path: governance-template/base/evidence-standards.md - Expected policy or coverage artifact is missing. Recommendation: Restore the policy artifact or document an equivalent canonical source.
- LOW generated-output-missing | category: generation-freshness | evidence: confirmed | risk: low | auto_fix_available: false | path: .wwg/workspace/context/project-context.md - Expected generated output is missing after WWG init/generation. Recommendation: Run the relevant generate or refresh command.
- LOW generated-output-missing | category: generation-freshness | evidence: confirmed | risk: low | auto_fix_available: false | path: .wwg/workspace/skills/skill-index.md - Expected generated output is missing after WWG init/generation. Recommendation: Run the relevant generate or refresh command.
- LOW gitignore-native-report-backups-missing | category: report-policy | evidence: confirmed | risk: low | auto_fix_available: false | path: .gitignore - Report policy expects `.wwg/reports/backups/` to be ignored. Recommendation: Add a narrow ignore rule for `.wwg/reports/backups/` or `.wwg/.gitignore` `reports/backups/`.
- LOW maintenance-matrix-missing | category: maintenance-matrix | evidence: confirmed | risk: low | auto_fix_available: false | path: wiki-template/base/12-maintenance/context-maintenance-matrix.md - Maintenance matrix artifact is missing. Recommendation: Add matrix coverage when this layer exists.
- LOW maintenance-matrix-missing | category: maintenance-matrix | evidence: confirmed | risk: low | auto_fix_available: false | path: workspace-template/base/context/context-maintenance-matrix.md - Maintenance matrix artifact is missing. Recommendation: Add matrix coverage when this layer exists.
- LOW maintenance-matrix-missing | category: maintenance-matrix | evidence: confirmed | risk: low | auto_fix_available: false | path: .wwg/wiki/12-maintenance/self-maintenance-loop.md - Maintenance matrix artifact is missing. Recommendation: Add matrix coverage when this layer exists.
- LOW public-discovery-review-missing | category: policy-coverage | evidence: confirmed | risk: low | auto_fix_available: false | path: governance-template/base/public-discovery-review.md - Expected policy or coverage artifact is missing. Recommendation: Restore the policy artifact or document an equivalent canonical source.
- LOW public-surface-review-missing | category: policy-coverage | evidence: confirmed | risk: low | auto_fix_available: false | path: governance-template/base/public-surface-review.md - Expected policy or coverage artifact is missing. Recommendation: Restore the policy artifact or document an equivalent canonical source.
- LOW readme-agent-routing-missing | category: readme-governance | evidence: confirmed | risk: low | auto_fix_available: false | path: README.md - WWG is present but README.md does not route agents to AGENTS.md and .wwg context. Recommendation: Add a short For Agents section.
- LOW readme-docs-map-missing | category: readme-governance | evidence: confirmed | risk: low | auto_fix_available: false | path: README.md - README.md is missing a documentation map. Recommendation: Add a concise Documentation section.
- LOW runtime-monitoring-missing | category: policy-coverage | evidence: confirmed | risk: low | auto_fix_available: false | path: wiki-template/base/08-operations/monitoring.md - Expected policy or coverage artifact is missing. Recommendation: Restore the policy artifact or document an equivalent canonical source.
- LOW truth-conflict-policy-missing | category: policy-coverage | evidence: confirmed | risk: low | auto_fix_available: false | path: governance-template/base/truth-conflict-resolution.md - Expected policy or coverage artifact is missing. Recommendation: Restore the policy artifact or document an equivalent canonical source.
- INFO ambiguous-report-classification | category: report-policy | evidence: confirmed | risk: low | auto_fix_available: false - Some report-like files need human classification. Recommendation: Run `wwg reports --target .` and review the Ambiguous / Needs Review section.
- INFO candidate-principle-like-content | category: principles | evidence: likely | risk: low | auto_fix_available: false | path: AGENTS.md - Potential principle-like content was found outside the principles folder. Recommendation: Review whether this durable guidance should become a candidate Principle Brief; do not treat this as a critical error.
- INFO duplicate-concepts-clear | category: duplicate-concepts | evidence: confirmed | risk: low | auto_fix_available: false - No duplicate concept hints detected beyond normal WWG structure. Recommendation: No action required.
- INFO generated-markers-balanced | category: generated-markers | evidence: unknown | risk: low | auto_fix_available: false - Generated marker pairs are balanced where present. Recommendation: Review and document the appropriate next step.
- INFO governance-detected | category: existing-audit | evidence: confirmed | risk: low | auto_fix_available: false - Detected 25 governance artifact(s). Recommendation: Reuse and register existing governance artifacts.
- INFO json-schemas-parse | category: schemas | evidence: unknown | risk: low | auto_fix_available: false - Parsed and compiled 0 JSON schema file(s). Recommendation: Review and document the appropriate next step.
- INFO maintenance-review-recommended | category: maintenance | evidence: confirmed | risk: low | auto_fix_available: false - This project shows maintenance drift signals. Run `wwg maintain --target <path>` to generate a structured maintenance review. Recommendation: Run `wwg maintain --target .` for a non-destructive maintenance recommendation report.
- INFO mapping-project_master_context | category: existing-audit | evidence: confirmed | risk: low | auto_fix_available: false | path: governance/context-drift-detection.md - Detected candidate for project_master_context. Recommendation: Register governance/context-drift-detection.md as project_master_context; do not duplicate it.
- INFO mapping-root_agents | category: existing-audit | evidence: confirmed | risk: low | auto_fix_available: false | path: AGENTS.md - Detected candidate for root_agents. Recommendation: Register AGENTS.md as root_agents; do not duplicate it.
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
- INFO public-surface-artifact | category: existing-audit | evidence: confirmed | risk: approval-gated | auto_fix_available: false | path: build/client/assets/privacy-policy-CNE0q99c.js - Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact | category: existing-audit | evidence: confirmed | risk: approval-gated | auto_fix_available: false | path: build/client/assets/terms-of-use-qn4NvFW0.js - Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact | category: existing-audit | evidence: confirmed | risk: low | auto_fix_available: false | path: reports/changelog-bump-recommendation.md - Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact | category: existing-audit | evidence: confirmed | risk: low | auto_fix_available: false | path: reports/changelog-preview.md - Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact | category: existing-audit | evidence: confirmed | risk: low | auto_fix_available: false | path: reports/wwg-changelog-handoff.md - Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-detected | category: existing-audit | evidence: confirmed | risk: low | auto_fix_available: false - Detected 15 public surface/public discovery artifact(s). Recommendation: Map existing public discovery sources before proposing new ones.
- INFO readme-detected | category: readme-governance | evidence: confirmed | risk: low | auto_fix_available: false | path: README.md - README.md was detected at 52 lines. Recommendation: Validate it with `wwg readme validate --target .`.
- INFO recommendation-governance-present | category: recommendation-governance | evidence: confirmed | risk: low | auto_fix_available: false | path: .wwg/governance/recommendation-registry.md - Recommendation capture is available through the Governance registry and policy. Recommendation: Use the registry for useful future work discovered by agents, audits, maintenance runs, or closeouts; do not promote recommendations automatically.
- INFO root-agents-detected | category: existing-audit | evidence: confirmed | risk: low | auto_fix_available: false | path: AGENTS.md - Root agent instructions were detected. Recommendation: Map this file as canonical_artifacts.root_agents.
- INFO runtime-skill-candidates-not-generated | category: runtime-skill-candidates | evidence: confirmed | risk: low | auto_fix_available: false | path: .wwg/reports/runtime-skill-candidates.json - Runtime skill candidate contract: not generated. Recommendation: No action required. Candidate artifacts are optional and absence is valid.
- INFO skill-manifest-absent | category: skill-manifest | evidence: confirmed | risk: low | auto_fix_available: false | path: .wwg/config/skill-manifest.yaml - Skill Manifest is not present. This remains valid for backward compatibility. Recommendation: Run `wwg refresh-skills --target .` when you want WWG to generate project skill state.
- INFO structure-present | category: repository-structure | evidence: confirmed | risk: low | auto_fix_available: false - Expected structure is present for existing-adopted-project. Recommendation: No action required.
- INFO template-boundary-scope-skipped | category: template-boundary | evidence: confirmed | risk: low | auto_fix_available: false - Template asset boundary checks apply only to WWG template repositories. Recommendation: No action required.
- INFO todo-fixme-tbd-detected | category: todo-usage | evidence: confirmed | risk: low | auto_fix_available: false | path: app/lib/document-request-handler.ts - TODO/FIXME/TBD marker detected. Recommendation: Confirm whether this is intentional tracked work or convert it into a report/follow-up.
- INFO todo-fixme-tbd-detected | category: todo-usage | evidence: confirmed | risk: low | auto_fix_available: false | path: app/lib/employee-to-bir2316.ts - TODO/FIXME/TBD marker detected. Recommendation: Confirm whether this is intentional tracked work or convert it into a report/follow-up.
- INFO todo-fixme-tbd-detected | category: todo-usage | evidence: confirmed | risk: low | auto_fix_available: false | path: app/lib/hooks/useEmployees.ts - TODO/FIXME/TBD marker detected. Recommendation: Confirm whether this is intentional tracked work or convert it into a report/follow-up.
- INFO todo-fixme-tbd-detected | category: todo-usage | evidence: confirmed | risk: low | auto_fix_available: false | path: app/services/attendance-approval.service.ts - TODO/FIXME/TBD marker detected. Recommendation: Confirm whether this is intentional tracked work or convert it into a report/follow-up.
- INFO todo-fixme-tbd-detected | category: todo-usage | evidence: confirmed | risk: low | auto_fix_available: false | path: build/client/assets/TextLayer-BhDlSm80.js - TODO/FIXME/TBD marker detected. Recommendation: Confirm whether this is intentional tracked work or convert it into a report/follow-up.
- INFO todo-fixme-tbd-detected | category: todo-usage | evidence: confirmed | risk: low | auto_fix_available: false | path: build/client/assets/face-api.esm-CT-VR31B.js - TODO/FIXME/TBD marker detected. Recommendation: Confirm whether this is intentional tracked work or convert it into a report/follow-up.
- INFO todo-fixme-tbd-detected | category: todo-usage | evidence: confirmed | risk: low | auto_fix_available: false | path: governance/regression-guardrail-catalog.md - TODO/FIXME/TBD marker detected. Recommendation: Confirm whether this is intentional tracked work or convert it into a report/follow-up.
- INFO todo-fixme-tbd-detected | category: todo-usage | evidence: confirmed | risk: low | auto_fix_available: false | path: reports/context-skill-quality.json - TODO/FIXME/TBD marker detected. Recommendation: Confirm whether this is intentional tracked work or convert it into a report/follow-up.
- INFO todo-fixme-tbd-detected | category: todo-usage | evidence: confirmed | risk: low | auto_fix_available: false | path: reports/context-skill-quality.md - TODO/FIXME/TBD marker detected. Recommendation: Confirm whether this is intentional tracked work or convert it into a report/follow-up.
- INFO todo-fixme-tbd-detected | category: todo-usage | evidence: confirmed | risk: low | auto_fix_available: false | path: reports/wwg-agent-handoff.json - TODO/FIXME/TBD marker detected. Recommendation: Confirm whether this is intentional tracked work or convert it into a report/follow-up.
- INFO todo-fixme-tbd-detected | category: todo-usage | evidence: confirmed | risk: low | auto_fix_available: false | path: reports/wwg-agent-handoff.md - TODO/FIXME/TBD marker detected. Recommendation: Confirm whether this is intentional tracked work or convert it into a report/follow-up.
- INFO todo-fixme-tbd-detected | category: todo-usage | evidence: confirmed | risk: low | auto_fix_available: false | path: reports/wwg-handoff-to-codex.json - TODO/FIXME/TBD marker detected. Recommendation: Confirm whether this is intentional tracked work or convert it into a report/follow-up.
- INFO todo-fixme-tbd-detected | category: todo-usage | evidence: confirmed | risk: low | auto_fix_available: false | path: reports/wwg-handoff-to-codex.md - TODO/FIXME/TBD marker detected. Recommendation: Confirm whether this is intentional tracked work or convert it into a report/follow-up.
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
