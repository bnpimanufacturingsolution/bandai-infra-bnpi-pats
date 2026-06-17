# WWG Adoption Truth Handoff

## Purpose

Review inferred adoption truth before treating populated Wiki files as accepted canonical project truth.

## Target

.

## Source Evidence Inspected

- README.md
- app/components/ui/README.md
- app/lib/job-form-dialog/README.md
- docs/employee-status-changes-eligibility.md
- firebase/README.md
- package.json
- app
- app/assets
- app/assets/forms
- app/components
- app/components/atoms
- app/components/atoms/form
- app/components/atoms/navigation
- app/components/atoms/progress
- app/components/atoms/settings
- app/components/dashboards
- app/components/dashboards/shared
- app/components/dashboards/shared/cards
- app/components/debug
- app/components/examples
- app/components/guards
- app/components/modals
- app/components/molecules
- app/components/molecules/boarding-template
- app/components/molecules/calendars
- app/components/molecules/device
- app/components/molecules/employee
- app/components/molecules/form
- app/components/molecules/guide
- app/components/molecules/hr-admin
- app/components/molecules/hr-public
- app/components/molecules/hr-user
- app/components/molecules/job-management
- app/components/molecules/manager
- app/components/molecules/settings
- app/components/molecules/shared
- app/components/dashboards/shared/role-dashboard.config.test.ts
- app/lib/utils/__tests__/report-scope.test.ts
- app/lib/utils/__tests__/role-redirect.test.ts
- app/lib/utils/default-employee-password.test.ts
- app/lib/utils/employee-form-draft-idb.test.ts
- app/lib/utils/employee-import-preview-validation.test.ts
- app/lib/utils/role-derivation.test.ts
- tests/document-onboarding-real-scenario.spec.ts
- tests/hr-tickets-accordion.spec.ts
- tests/perf/hr-attendance.spec.ts
- tests/unreachable-routes.test.ts
- tests/unused-routes.test.ts
- .github/workflows/firebase-hosting-develop.yml
- .github/workflows/firebase-hosting-merge.yml
- .github/workflows/firebase-hosting-pull-request.yml
- Dockerfile
- firebase.json
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
- Readiness score: 88 / 100
- Inferred product identity: react-app-template
- Open questions: 2
- Conflicts: 1
- Status: Inferred from repository evidence. Requires human/agent review before becoming accepted project truth.

## Gaps / Unknowns

- Confirm product category.
- Confirm primary users and role names.
- mock/demo vs production claims: CONFLICTING - Separate demo boundaries from production claims in project truth and public docs.

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
