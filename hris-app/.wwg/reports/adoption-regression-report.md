# Adoption Regression Baseline Report

## Executive Summary

- Project classification: mixed (high)
- CI readiness: partial
- Test frameworks detected: 2
- Test commands detected: 5
- Existing tests detected: 12
- Regression gaps: 8

Adoption may complete even when regression readiness is poor.
Missing tests are a regression readiness gap, not an adoption failure.
No executable tests were generated in this pass.
Existing source tests were not modified.

## Project Classification

- Type: mixed
- Confidence: high

- Package metadata was detected.
- Executable source files were detected.
- Source folders were detected by adoption analysis.
- Project structure artifacts were detected.
- Multiple documentation or process files were detected.
- Governance, runbook, report, or checklist artifacts were detected.
- Process or approval-oriented documents were detected.

## Detected Test Frameworks

- playwright (high) Evidence: package.json: @playwright/test; package.json: playwright; package.json script test:attendance-perf; playwright.config.ts
- vitest (high) Evidence: package.json: vitest; package.json script test:routes; package.json script test:unreachable; vitest.config.ts

## Detected Test Commands

- lint: `eslint . --fix` (package.json, medium)
- typecheck: `react-router typegen && tsc` (package.json, medium)
- test:routes: `vitest run tests/unused-routes.test.ts` (package.json, high)
- test:attendance-perf: `playwright test tests/perf/hr-attendance.spec.ts` (package.json, high)
- test:unreachable: `vitest run tests/unreachable-routes.test.ts` (package.json, high)

## Existing Test Inventory

- app/components/dashboards/shared/role-dashboard.config.test.ts (unit, medium)
- app/lib/utils/__tests__/report-scope.test.ts (unit, medium)
- app/lib/utils/__tests__/role-redirect.test.ts (unit, medium)
- app/lib/utils/default-employee-password.test.ts (unit, medium)
- app/lib/utils/employee-form-draft-idb.test.ts (unit, medium)
- app/lib/utils/employee-import-preview-validation.test.ts (unit, medium)
- app/lib/utils/role-derivation.test.ts (unit, medium)
- tests/document-onboarding-real-scenario.spec.ts (unit, medium)
- tests/hr-tickets-accordion.spec.ts (unit, medium)
- tests/perf/hr-attendance.spec.ts (unit, medium)
- tests/unreachable-routes.test.ts (unit, medium)
- tests/unused-routes.test.ts (unit, medium)

## Critical Behavior Inventory

- Core feature workflow: high (medium) Source: docs. Evidence: README.md: README headings or route files
- Main entry point behavior: high (high) Source: code. Evidence: .react-router/types/app/routes/hr/settings/+types/index.ts: entry point candidate; .react-router/types/app/routes/site/+types/index.ts: entry point candidate; app/components/atoms/index.ts: entry point candidate; app/components/atoms/settings/index.ts: entry point candidate; app/components/molecules/boarding-template/index.ts: entry point candidate; app/components/molecules/employee/index.ts: entry point candidate; app/components/molecules/hr-admin/index.ts: entry point candidate; app/components/molecules/hr-user/index.ts: entry point candidate; app/components/molecules/index.ts: entry point candidate; app/components/molecules/settings/index.ts: entry point candidate; app/components/molecules/shared/index.ts: entry point candidate; app/components/organisms/boarding-template/index.ts: entry point candidate
- Runtime/build behavior: medium (high) Source: scripts. Evidence: package.json: scripts
- Data persistence behavior: critical (high) Source: code. Evidence: mongoose: persistence indicator
- Auth and permission behavior: critical (high) Source: code. Evidence: class-variance-authority: auth/security indicator
- Payment behavior: critical (high) Source: code. Evidence: .react-router/types/app/routes/hr/+types/billings.$id.ts: payments/billing indicator
- Deployment/runtime readiness: medium (high) Source: config. Evidence: .github/workflows/firebase-hosting-develop.yml: deployment config; .github/workflows/firebase-hosting-merge.yml: deployment config; .github/workflows/firebase-hosting-pull-request.yml: deployment config; Dockerfile: deployment config; firebase.json: deployment config
- API route behavior: high (medium) Source: code. Evidence: .react-router/types/app/routes/+types/403.ts; .react-router/types/app/routes/+types/announcements.ts; .react-router/types/app/routes/+types/calendar.ts; .react-router/types/app/routes/+types/callback.ts; .react-router/types/app/routes/+types/dashboard.ts
- Configuration and environment behavior: medium (medium) Source: config. Evidence: Dockerfile; package.json; playwright.config.ts; tsconfig.json; vitest.config.ts
- Process and approval workflow: high (medium) Source: docs. Evidence: ATTENDANCE_APPROVAL.md; IMPLEMENTATION_CHECKLIST.md

## Uncovered Behavior Inventory

- Core feature workflow: high (medium) - Detected tests do not obviously map to this behavior by path/name.
- Main entry point behavior: high (high) - Detected tests do not obviously map to this behavior by path/name.
- Runtime/build behavior: medium (high) - Detected tests do not obviously map to this behavior by path/name.
- Data persistence behavior: critical (high) - Detected tests do not obviously map to this behavior by path/name.
- Auth and permission behavior: critical (high) - Detected tests do not obviously map to this behavior by path/name.
- Payment behavior: critical (high) - Detected tests do not obviously map to this behavior by path/name.
- Deployment/runtime readiness: medium (high) - Detected tests do not obviously map to this behavior by path/name.
- Configuration and environment behavior: medium (medium) - Detected tests do not obviously map to this behavior by path/name.
- Process and approval workflow: high (medium) - Detected tests do not obviously map to this behavior by path/name.

## Regression Gaps

- HIGH Uncovered behavior: Core feature workflow: Detected tests do not obviously map to this behavior by path/name. Blocking adoption: false. Recommended action: Map this behavior to a report-first candidate before generating or editing executable tests.
- HIGH Uncovered behavior: Main entry point behavior: Detected tests do not obviously map to this behavior by path/name. Blocking adoption: false. Recommended action: Map this behavior to a report-first candidate before generating or editing executable tests.
- MEDIUM Uncovered behavior: Runtime/build behavior: Detected tests do not obviously map to this behavior by path/name. Blocking adoption: false. Recommended action: Map this behavior to a report-first candidate before generating or editing executable tests.
- CRITICAL Uncovered behavior: Data persistence behavior: Detected tests do not obviously map to this behavior by path/name. Blocking adoption: false. Recommended action: Map this behavior to a report-first candidate before generating or editing executable tests.
- CRITICAL Uncovered behavior: Auth and permission behavior: Detected tests do not obviously map to this behavior by path/name. Blocking adoption: false. Recommended action: Map this behavior to a report-first candidate before generating or editing executable tests.
- CRITICAL Uncovered behavior: Payment behavior: Detected tests do not obviously map to this behavior by path/name. Blocking adoption: false. Recommended action: Map this behavior to a report-first candidate before generating or editing executable tests.
- MEDIUM Uncovered behavior: Deployment/runtime readiness: Detected tests do not obviously map to this behavior by path/name. Blocking adoption: false. Recommended action: Map this behavior to a report-first candidate before generating or editing executable tests.
- MEDIUM Uncovered behavior: Configuration and environment behavior: Detected tests do not obviously map to this behavior by path/name. Blocking adoption: false. Recommended action: Map this behavior to a report-first candidate before generating or editing executable tests.

## Safe Report-First Test Candidates

- Smoke test candidate (mixed, report-first, advisory)
  - Target: .
  - Proposed check type: smoke
  - Inferred behavior: Confirm the application or package starts/builds at a minimal baseline.
  - Source evidence: .react-router/types/+register.ts; .react-router/types/+virtual.d.ts; .react-router/types/app/+types/root.ts; .react-router/types/app/components/templates/+types/hr-reviewer-template.ts; .react-router/types/app/layouts/+types/admin-layout.ts
  - Safe to generate executable test now: false
  - Recommended action: Identify the smallest safe smoke check before writing executable tests.
- API route test candidate (mixed, report-first, blocking)
  - Target: api/routes
  - Proposed check type: api-route
  - Inferred behavior: Confirm API routes handle success and failure paths.
  - Source evidence: .react-router/types/+register.ts; .react-router/types/+virtual.d.ts; .react-router/types/app/+types/root.ts; .react-router/types/app/components/templates/+types/hr-reviewer-template.ts; .react-router/types/app/layouts/+types/admin-layout.ts
  - Safe to generate executable test now: false
  - Recommended action: Draft route coverage from existing route files before generating tests.
- Auth/permission test candidate (mixed, report-first, blocking)
  - Target: auth
  - Proposed check type: auth-permission
  - Inferred behavior: Confirm access control and failure paths.
  - Source evidence: class-variance-authority: auth/security indicator
  - Safe to generate executable test now: false
  - Recommended action: Review auth boundaries before generating executable tests.
- Payment failure-path test candidate (mixed, report-first, blocking)
  - Target: payments
  - Proposed check type: failure-path
  - Inferred behavior: Confirm payment safe and failure states.
  - Source evidence: .react-router/types/app/routes/hr/+types/billings.$id.ts: payments/billing indicator
  - Safe to generate executable test now: false
  - Recommended action: Keep this report-first until production/payment boundaries are confirmed.
- Persistence/migration check candidate (mixed, report-first, blocking)
  - Target: data
  - Proposed check type: persistence
  - Inferred behavior: Confirm stored data, migrations, and invalid data behavior.
  - Source evidence: mongoose: persistence indicator
  - Safe to generate executable test now: false
  - Recommended action: Confirm data ownership before creating executable tests.
- Configuration contract check candidate (mixed, report-first, advisory)
  - Target: config
  - Proposed check type: configuration
  - Inferred behavior: Confirm required config files and safe defaults.
  - Source evidence: Dockerfile; package.json; playwright.config.ts; tsconfig.json; vitest.config.ts
  - Safe to generate executable test now: false
  - Recommended action: Convert known-safe config expectations into checks later.
- Schema/contract test candidate (mixed, report-first, advisory)
  - Target: contracts
  - Proposed check type: schema-contract
  - Inferred behavior: Confirm data contracts, config contracts, or public interfaces do not drift.
  - Source evidence: .react-router/types/+register.ts; .react-router/types/+virtual.d.ts; .react-router/types/app/+types/root.ts; .react-router/types/app/components/templates/+types/hr-reviewer-template.ts; .react-router/types/app/layouts/+types/admin-layout.ts
  - Safe to generate executable test now: false
  - Recommended action: Identify actual schemas/contracts before generating tests.
- Process regression checklist candidate (mixed, report-first, advisory)
  - Target: process
  - Proposed check type: process-checklist
  - Inferred behavior: Confirm documented process steps remain current.
  - Source evidence: .github/pull_request_template.md; .impeccable.md; ARCHITECTURE_JOB_APPLICATION_FORM.md; ATOMIC_COMPONENTS.md; ATTENDANCE_APPROVAL.md; DEEP_LINKING_IMPLEMENTATION.md; DOCUMENTATION_INDEX.md; IMPLEMENTATION_CHECKLIST.md
  - Safe to generate executable test now: false
  - Recommended action: Turn recurring process expectations into a review checklist.
- Document consistency check candidate (mixed, report-first, advisory)
  - Target: docs
  - Proposed check type: document-consistency
  - Inferred behavior: Confirm docs, policies, and handoff material do not contradict one another.
  - Source evidence: .github/pull_request_template.md; .impeccable.md; ARCHITECTURE_JOB_APPLICATION_FORM.md; ATOMIC_COMPONENTS.md; ATTENDANCE_APPROVAL.md; DEEP_LINKING_IMPLEMENTATION.md; DOCUMENTATION_INDEX.md; IMPLEMENTATION_CHECKLIST.md
  - Safe to generate executable test now: false
  - Recommended action: Review canonical ownership before automating doc checks.
- Approval-flow check candidate (mixed, report-first, blocking)
  - Target: approval
  - Proposed check type: approval-flow
  - Inferred behavior: Confirm sensitive changes have review and approval evidence.
  - Source evidence: .github/pull_request_template.md; .impeccable.md; ARCHITECTURE_JOB_APPLICATION_FORM.md; ATOMIC_COMPONENTS.md; ATTENDANCE_APPROVAL.md; DEEP_LINKING_IMPLEMENTATION.md; DOCUMENTATION_INDEX.md; IMPLEMENTATION_CHECKLIST.md
  - Safe to generate executable test now: false
  - Recommended action: Define approval evidence in governance before enforcement.
- Handoff completeness check candidate (mixed, report-first, advisory)
  - Target: handoff
  - Proposed check type: handoff-completeness
  - Inferred behavior: Confirm future agents have enough context to continue.
  - Source evidence: .github/pull_request_template.md; .impeccable.md; ARCHITECTURE_JOB_APPLICATION_FORM.md; ATOMIC_COMPONENTS.md; ATTENDANCE_APPROVAL.md; DEEP_LINKING_IMPLEMENTATION.md; DOCUMENTATION_INDEX.md; IMPLEMENTATION_CHECKLIST.md
  - Safe to generate executable test now: false
  - Recommended action: Use the candidate as manual review guidance first.
- Operational readiness check candidate (mixed, report-first, advisory)
  - Target: operations
  - Proposed check type: operational-readiness
  - Inferred behavior: Confirm runbooks, ownership, and release readiness are reviewed.
  - Source evidence: .github/pull_request_template.md; .impeccable.md; ARCHITECTURE_JOB_APPLICATION_FORM.md; ATOMIC_COMPONENTS.md; ATTENDANCE_APPROVAL.md; DEEP_LINKING_IMPLEMENTATION.md; DOCUMENTATION_INDEX.md; IMPLEMENTATION_CHECKLIST.md
  - Safe to generate executable test now: false
  - Recommended action: Keep report-first until owners confirm operational truth.
- Core feature workflow regression candidate (mixed, report-first, blocking)
  - Target: Core feature workflow
  - Proposed check type: critical-workflow
  - Inferred behavior: Confirm core feature workflow remains covered as the project changes.
  - Source evidence: Detected tests do not obviously map to this behavior by path/name.
  - Safe to generate executable test now: false
  - Recommended action: Map this candidate to concrete evidence before generating executable tests.
- Main entry point behavior regression candidate (mixed, report-first, blocking)
  - Target: Main entry point behavior
  - Proposed check type: critical-workflow
  - Inferred behavior: Confirm main entry point behavior remains covered as the project changes.
  - Source evidence: Detected tests do not obviously map to this behavior by path/name.
  - Safe to generate executable test now: false
  - Recommended action: Map this candidate to concrete evidence before generating executable tests.
- Runtime/build behavior regression candidate (mixed, report-first, advisory)
  - Target: Runtime/build behavior
  - Proposed check type: critical-workflow
  - Inferred behavior: Confirm runtime/build behavior remains covered as the project changes.
  - Source evidence: Detected tests do not obviously map to this behavior by path/name.
  - Safe to generate executable test now: false
  - Recommended action: Map this candidate to concrete evidence before generating executable tests.
- Data persistence behavior regression candidate (mixed, report-first, blocking)
  - Target: Data persistence behavior
  - Proposed check type: critical-workflow
  - Inferred behavior: Confirm data persistence behavior remains covered as the project changes.
  - Source evidence: Detected tests do not obviously map to this behavior by path/name.
  - Safe to generate executable test now: false
  - Recommended action: Map this candidate to concrete evidence before generating executable tests.
- Auth and permission behavior regression candidate (mixed, report-first, blocking)
  - Target: Auth and permission behavior
  - Proposed check type: critical-workflow
  - Inferred behavior: Confirm auth and permission behavior remains covered as the project changes.
  - Source evidence: Detected tests do not obviously map to this behavior by path/name.
  - Safe to generate executable test now: false
  - Recommended action: Map this candidate to concrete evidence before generating executable tests.

## Technical Verification Path

- Run detected command(s): lint: eslint . --fix; typecheck: react-router typegen && tsc; test:routes: vitest run tests/unused-routes.test.ts; test:attendance-perf: playwright test tests/perf/hr-attendance.spec.ts; test:unreachable: vitest run tests/unreachable-routes.test.ts
- Map detected tests to critical behaviors.
- Prioritize critical workflows, failure paths, configuration, schema/contract, auth, persistence, and deployment checks where applicable.

## Non-Technical Verification Path

- Review process, policy, runbook, and handoff documents for consistency.
- Define approval-flow and stakeholder review checkpoints for changes that are not software-testable.
- Record checklist results in reports before treating non-technical readiness as complete.

## Mixed-Project Verification Path

- Pair technical test commands with process and approval checklist review.
- Trace each critical behavior to either executable coverage or a manual/process evidence path.
- Start with: Core feature workflow, Main entry point behavior, Runtime/build behavior, Data persistence behavior, Auth and permission behavior.

## CI Readiness

- Status: partial

### Reasons

- Some test/check evidence exists, but readiness gaps remain.

### Strict Blocking Reasons

- 6 high/critical behavior(s) are not mapped to detected tests.

## Recommended Next Actions

- Review this baseline before claiming regression readiness.
- Confirm critical behavior inventory with the project owner.
- Treat missing tests/checks as a readiness backlog, not an adoption failure.
- Choose the project test framework and command before generating executable tests.
- Create manual/process regression checklists for non-technical workflows.
- Use a later maintain/status/CI pass to refresh or enforce this baseline.

## Safety Notes

- Adoption may complete even when regression readiness is poor.
- Missing tests are a regression readiness gap, not an adoption failure.
- No executable tests were generated in this pass.
- Existing source tests were not modified.
- All safe test candidates are report-first and require human or agent review before executable tests are created.

## WWG Truth Synchronization

- Task mode: existing-project adoption regression baseline
- New truth detected: YES
- Wiki updated: NO / N/A
- Workspace updated: NO
- Governance review completed: YES
- Drift status: LOW
- Canonical files changed:
  - None by this report.
- Implementation discoveries synced:
  - Existing test and regression readiness signals were captured in this report-first baseline.
- Remaining stale context:
  - Review readiness gaps and safe report-first candidates before claiming regression readiness.
