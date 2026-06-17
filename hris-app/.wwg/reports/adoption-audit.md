# WWG Adoption Audit

Status: STALE_SUPERSEDED_BY_CURRENT_PROJECT_TRUTH
Superseded on: 2026-05-25
Superseded by: `.wwg/wiki/project-truth.md`, `.wwg/wiki/project-truth-summary.md`, and `.wwg/reports/cross-repo-context-reconciliation.md`.
Note: This historical adoption audit contains stale auto-inferred Web3/eCommerce classification. Current canonical truth is HRIS/workforce frontend app paired with `../hris-api`.

## Audit Summary

- Target: C:\Users\1biss\Documents\Projects\hris-app
- Date: 2026-05-15
- Recommended adoption mode: infer
- Adoption readiness score: 88 / 100
- Confidence: HIGH
- Command: `wwg adopt --mode infer`

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


## Observed Facts

- Observed facts are the current code/docs/config signals listed above.

## Inferred Truth

- Inferred truth was copied into `.wwg/wiki/project-truth.md` with status and evidence labels.

## Conflicts

- mock/demo vs production claims: CONFLICTING - Mock/demo and production/live language both appear in scanned text.

## Open Questions

- Confirm product category. Evidence: INFERRED: Web3 eCommerce prototype
- Confirm primary users and role names. Evidence: INFERRED: admin, user

## Recommended Follow-Up

- Review `.wwg/wiki/project-truth.md` and promote accepted inferred truth to confirmed truth.
- Resolve `NEEDS_CONFIRMATION`, `CONFLICTING`, and `STALE` items before major work.

Reports are reference history. `.wwg/wiki/project-truth.md` is the canonical current truth once reviewed and maintained.
