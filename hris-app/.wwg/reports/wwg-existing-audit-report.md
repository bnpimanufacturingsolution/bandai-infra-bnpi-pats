# WWG Adoption Audit

Status: STALE_SUPERSEDED_BY_CURRENT_PROJECT_TRUTH
Superseded on: 2026-05-25
Superseded by: `.wwg/wiki/project-truth.md`, `.wwg/wiki/project-truth-summary.md`, and `.wwg/reports/cross-repo-context-reconciliation.md`.
Note: This historical adoption output contains stale auto-inferred Web3/eCommerce classification. Current canonical truth is HRIS/workforce frontend app paired with `../hris-api`.

## Audit Summary

- Target: C:\Users\1biss\Documents\Projects\hris-app
- Date: 2026-05-15
- Recommended adoption mode: infer
- Adoption readiness score: 88 / 100
- Confidence: HIGH
- Command: `wwg adopt --mode infer --apply --target C:\Users\1biss\Documents\Projects\hris-app`

## Evidence Reviewed

- README/docs: README.md, app/components/ui/README.md, app/lib/job-form-dialog/README.md, docs/employee-status-changes-eligibility.md, firebase/README.md
- Package/config files: package.json
- Source folders: app, app/assets, app/assets/forms, app/components, app/components/atoms, app/components/atoms/form, app/components/atoms/navigation, app/components/atoms/progress, app/components/atoms/settings, app/components/dashboards, app/components/dashboards/shared, app/components/dashboards/shared/cards, app/components/debug, app/components/examples, app/components/guards, app/components/modals, app/components/molecules, app/components/molecules/boarding-template, app/components/molecules/calendars, app/components/molecules/device, app/components/molecules/employee, app/components/molecules/form, app/components/molecules/guide, app/components/molecules/hr-admin, app/components/molecules/hr-public, app/components/molecules/hr-user, app/components/molecules/job-management, app/components/molecules/manager, app/components/molecules/settings, app/components/molecules/shared
- Tests: app/components/dashboards/shared/role-dashboard.config.test.ts, app/lib/utils/__tests__/report-scope.test.ts, app/lib/utils/__tests__/role-redirect.test.ts, app/lib/utils/default-employee-password.test.ts, app/lib/utils/employee-form-draft-idb.test.ts, app/lib/utils/employee-import-preview-validation.test.ts, app/lib/utils/role-derivation.test.ts, tests/document-onboarding-real-scenario.spec.ts, tests/hr-tickets-accordion.spec.ts, tests/perf/hr-attendance.spec.ts, tests/unreachable-routes.test.ts, tests/unused-routes.test.ts
- Deployment/config: .github/workflows/firebase-hosting-develop.yml, .github/workflows/firebase-hosting-merge.yml, .github/workflows/firebase-hosting-pull-request.yml, Dockerfile, firebase.json
- Existing agent/context files: None detected

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


## Legacy Registry Mapping Summary

Detected 16 artifact(s). Registry-first mode: conservative.

## Observed Facts

- Observed facts are listed in the audit sections above and are backed by README/docs, package/config, source, test, deployment, and agent/context evidence.

## Inferred Truth

- Inferred truth is labeled above and should be reviewed before it becomes confirmed canonical truth.

## Conflicts

- mock/demo vs production claims: CONFLICTING - Mock/demo and production/live language both appear in scanned text.

## Open Questions

- Confirm product category. Evidence: INFERRED: Web3 eCommerce prototype
- Confirm primary users and role names. Evidence: INFERRED: admin, user

## Recommended Follow-Up

- Run `wwg adopt --mode infer --target <project>` to populate initial WWG truth from evidence.
- Review `.wwg/wiki/project-truth.md` before treating inferred truth as confirmed.

Reports are reference history. `.wwg/wiki/project-truth.md` is the canonical current truth once reviewed and maintained.

## Adoption Readiness Score

Score: 53 / 105

### Strengths

- Governance or operations assets detected

### Gaps

- No root AGENTS.md detected
- No canonical context directory or file detected
- No maintenance matrix detected
- No WWG registry file

### Scoring Categories

| Category | Score | Reason |
|---|---:|---|
| agent instructions | 0 / 10 | Root agent policy not detected. |
| canonical context | 0 / 10 | No canonical context detected. |
| maintenance matrix | 0 / 10 | No maintenance matrix detected. |
| governance assets | 10 / 10 | Governance or operations assets detected. |
| skills/prompts | 0 / 5 | No skills or prompts detected. |
| public surface/discovery | 5 / 5 | Public surface or discovery assets detected. |
| project structure clarity | 0 / 10 | Implementation boundaries detected. |
| readme/docs quality | 10 / 10 | README or docs exist for product reality. |
| tests/checks | 10 / 10 | Tests or specs detected. |
| deployment config | 10 / 10 | Deployment/runtime config detected. |
| entry point clarity | 5 / 5 | Conventional entry points detected. |
| mock vs production boundaries | 3 / 5 | Mock/demo/sample signals detected and should be documented. |
| registry/readiness | 0 / 5 | No WWG registry file detected. |

### Recommended Adoption Mode

conservative

## Command

`wwg adopt --mode infer --apply --target C:\Users\1biss\Documents\Projects\hris-app`

## Repository Type Detected

existing-project

## Existing Artifacts Detected

| Existing artifact | Classification | Suggested WWG role | Confidence |
|---|---|---|---|
| .github/workflows | project structure | runtime_context | medium |
| .github/workflows | project structure | impact_zone | medium |
| .react-router/types/app/routes/admin/+types/audit-logs.ts | governance artifact | audit_log | medium |
| .react-router/types/app/routes/legal/+types/privacy-policy.ts | public surface | approval_gated_public_messaging | medium |
| .react-router/types/app/routes/legal/+types/terms-of-use.ts | public surface | approval_gated_public_messaging | medium |
| .react-router/types/app/routes/support/+types/faq.ts | public surface | approval_gated_public_messaging | medium |
| .react-router/types/app/routes/support/+types/help-desk.ts | public surface | approval_gated_public_messaging | medium |
| app/routes/admin/audit-logs.tsx | governance artifact | audit_log | medium |
| app/routes/legal/privacy-policy.tsx | public surface | approval_gated_public_messaging | medium |
| app/routes/legal/terms-of-use.tsx | public surface | approval_gated_public_messaging | medium |
| app/routes/support/faq.tsx | public surface | approval_gated_public_messaging | medium |
| app/routes/support/help-desk.tsx | public surface | approval_gated_public_messaging | medium |
| app/services/audit-logs.service.ts | governance artifact | audit_log | medium |
| build/client/assets/privacy-policy-CNE0q99c.js | public surface | approval_gated_public_messaging | medium |
| build/client/assets/terms-of-use-qn4NvFW0.js | public surface | approval_gated_public_messaging | medium |
| Dockerfile | runtime structure | runtime_context | medium |

## Findings by Evidence Level

### confirmed

- MEDIUM root-agents-missing: evidence=confirmed risk=medium No root AGENTS.md file was detected. Recommendation: Consider a root agent policy after registry-first adoption.
- INFO governance-detected: evidence=confirmed risk=low Detected 3 governance artifact(s). Recommendation: Reuse and register existing governance artifacts.
- INFO public-surface-artifact (.react-router/types/app/routes/legal/+types/privacy-policy.ts): evidence=confirmed risk=approval-gated Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact (.react-router/types/app/routes/legal/+types/terms-of-use.ts): evidence=confirmed risk=approval-gated Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact (.react-router/types/app/routes/support/+types/faq.ts): evidence=confirmed risk=approval-gated Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact (.react-router/types/app/routes/support/+types/help-desk.ts): evidence=confirmed risk=approval-gated Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact (app/routes/legal/privacy-policy.tsx): evidence=confirmed risk=approval-gated Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact (app/routes/legal/terms-of-use.tsx): evidence=confirmed risk=approval-gated Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact (app/routes/support/faq.tsx): evidence=confirmed risk=approval-gated Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact (app/routes/support/help-desk.tsx): evidence=confirmed risk=approval-gated Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact (build/client/assets/privacy-policy-CNE0q99c.js): evidence=confirmed risk=approval-gated Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-artifact (build/client/assets/terms-of-use-qn4NvFW0.js): evidence=confirmed risk=approval-gated Public surface or discovery artifact detected. Recommendation: Treat public/trust messaging changes as approval-gated when content is customer-facing.
- INFO public-surface-detected: evidence=confirmed risk=low Detected 10 public surface/public discovery artifact(s). Recommendation: Map existing public discovery sources before proposing new ones.

### likely

- MEDIUM recommended-changelog (CHANGELOG.md): evidence=likely risk=medium Recommended artifact is not currently mapped or detected. Recommendation: Create only in a later explicit adoption/init phase.
- MEDIUM recommended-evidence_standards (governance/evidence-standards.md): evidence=likely risk=medium Recommended artifact is not currently mapped or detected. Recommendation: Create only in a later explicit adoption/init phase.
- MEDIUM recommended-maintenance_matrix (docs/ai-context/context-maintenance-matrix.md): evidence=likely risk=medium Recommended artifact is not currently mapped or detected. Recommendation: Create only in a later explicit adoption/init phase.
- MEDIUM recommended-project_master_context (docs/ai-context/project-context.md): evidence=likely risk=medium Recommended artifact is not currently mapped or detected. Recommendation: Create only in a later explicit adoption/init phase.
- MEDIUM recommended-public_discovery_context (docs/ai-context/public-discovery-context.md): evidence=likely risk=medium Recommended artifact is not currently mapped or detected. Recommendation: Create only in a later explicit adoption/init phase.
- LOW recommended-project_registry (wwg.project.yaml): evidence=likely risk=low Recommended artifact is not currently mapped or detected. Recommendation: Create via conservative adopt apply.

### hypotheses

- No findings.

### unknowns/gaps

- No findings.

## Suggested WWG Mappings

- No mappings inferred.

## Recommended Artifacts

- project_registry: wwg.project.yaml
- changelog: CHANGELOG.md
- project_master_context: docs/ai-context/project-context.md
- maintenance_matrix: docs/ai-context/context-maintenance-matrix.md
- evidence_standards: governance/evidence-standards.md
- public_discovery_context: docs/ai-context/public-discovery-context.md

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

- project_registry
- changelog
- project_master_context
- maintenance_matrix
- evidence_standards
- public_discovery_context

## Public Surface Findings

- INFO public-surface-detected: evidence=confirmed risk=low Detected 10 public surface/public discovery artifact(s). Recommendation: Map existing public discovery sources before proposing new ones.

## Governance Findings

- INFO governance-detected: evidence=confirmed risk=low Detected 3 governance artifact(s). Recommendation: Reuse and register existing governance artifacts.

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
