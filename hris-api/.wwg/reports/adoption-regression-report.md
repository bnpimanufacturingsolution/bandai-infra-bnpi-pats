# Adoption Regression Baseline Report

## Executive Summary

- Project classification: mixed (high)
- CI readiness: partial
- Test frameworks detected: 1
- Test commands detected: 26
- Existing tests detected: 87
- Regression gaps: 5

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

- mocha (high) Evidence: package.json: mocha

## Detected Test Commands

- lint: `eslint app/**/*.ts index.ts lib-entry.Qts` (package.json, medium)
- test: `mocha --require ts-node/register tests/**/*.spec.ts` (package.json, high)
- typecheck: `tsc --noEmit` (package.json, medium)
- test:tax: `ts-node scripts/test-tax-calculator.ts` (package.json, high)
- test:payroll: `ts-node scripts/test-payroll-calculation.ts` (package.json, high)
- test:bir: `ts-node scripts/test-bir-2316.ts` (package.json, high)
- test:bir-part4: `ts-node scripts/test-bir-part4.ts` (package.json, high)
- test:attendance-debug: `ts-node scripts/test-attendance-debug.ts` (package.json, high)
- test:attendance-metrics: `ts-node scripts/test-attendance-metrics.ts` (package.json, high)
- test:attendance-clock-in: `ts-node scripts/test-attendance-clock-in.ts` (package.json, high)
- check:attendance-status: `ts-node scripts/check-attendance-status.ts` (package.json, medium)
- test:payroll-attendance: `ts-node scripts/test-payroll-attendance.ts` (package.json, high)
- test:bulk-adjust-endpoint: `ts-node scripts/test-bulk-adjust-endpoint.ts` (package.json, high)
- test:bulk-adjust-function: `node -r ts-node/register scripts/test-bulk-adjust-function.ts` (package.json, high)
- test:generate-employee-payroll: `ts-node scripts/test-generate-employee-payroll.ts` (package.json, high)
- metrics:attendance: `ts-node scripts/test-attendance-all-metrics.ts` (package.json, medium)
- metrics:attendance:detailed: `ts-node scripts/test-attendance-all-metrics.ts --detailed` (package.json, medium)
- metrics:reports: `npx tsx scripts/test-attendance-metrics-reports.ts` (package.json, medium)
- metrics:reports:detailed: `npx tsx scripts/test-attendance-metrics-reports.ts --detailed` (package.json, medium)
- test:attendance-summary: `npx tsx scripts/test-attendance-summary.ts` (package.json, high)
- test:timekeeping: `ts-node scripts/test-timekeeping.ts` (package.json, high)
- test:org-chart: `npx tsx scripts/test-org-chart.ts` (package.json, high)
- test:workforce: `ts-node scripts/test-workforce.ts` (package.json, high)
- test:notification-debug: `ts-node scripts/test-notification-debug.ts` (package.json, high)
- test:document-workflow: `ts-node test-document-workflow.ts` (package.json, high)
- wwg:test-check: `npx @homedesk/wwg test-check` (package.json, medium)

## Existing Test Inventory

- tests/attendance-obligation.helper.spec.ts (unit, medium)
- tests/auditLogger.spec.ts (unit, medium)
- tests/bulk-password.helper.spec.ts (unit, medium)
- tests/document-field-validation.helper.spec.ts (unit, medium)
- tests/employee-action-block.helper.spec.ts (unit, medium)
- tests/employee-helper-credentials.spec.ts (unit, medium)
- tests/leave-session.helper.spec.ts (unit, medium)
- tests/prisma-datasource.helper.spec.ts (unit, medium)
- tests/query-builder-search-fields.spec.ts (unit, medium)
- tests/request.zod.spec.ts (unit, medium)
- tests/role-derivation.spec.ts (unit, medium)
- tests/security.middleware.spec.ts (unit, medium)
- tests/service-name-validation.spec.ts (unit, medium)
- tests/timekeeping.helper.spec.ts (unit, medium)
- tests/timesheet-line-version.helper.spec.ts (unit, medium)
- tests/timesheet-submit-eligibility.spec.ts (unit, medium)
- tests/workflow-config.helper.spec.ts (unit, medium)
- tests/wwg-regression-coverage.spec.ts (unit, medium)
- tests_legacy/WorkflowInstance.controller.spec.ts (unit, medium)
- tests_legacy/aduittrail.controller.spec.ts (unit, medium)
- tests_legacy/audittrail.controller.spec.ts (unit, medium)
- tests_legacy/calendar.controller.spec.ts (unit, medium)
- tests_legacy/calendarEvent.controller.spec.ts (unit, medium)
- tests_legacy/calendarItem.controller.spec.ts (unit, medium)
- tests_legacy/checklistTemplate.controller.spec.ts (unit, medium)
- tests_legacy/compensationhistory.controller.spec.ts (unit, medium)
- tests_legacy/controllers/applicant.controller.spec.ts (unit, medium)
- tests_legacy/controllers/attendance.controller.spec.ts (unit, medium)
- tests_legacy/controllers/auth.controller.spec.ts (unit, medium)
- tests_legacy/controllers/benefit.controller.spec.ts (unit, medium)
- tests_legacy/controllers/benefitType.controller.spec.ts (unit, medium)
- tests_legacy/controllers/boardingProcess.controller.spec.ts (unit, medium)
- tests_legacy/controllers/boardingTemplate.controller.spec.ts (unit, medium)
- tests_legacy/controllers/calculator.controller.spec.ts (unit, medium)
- tests_legacy/controllers/celebrations.controller.spec.ts (unit, medium)
- tests_legacy/controllers/checklistItem.controller.spec.ts (unit, medium)
- tests_legacy/controllers/dashboard.controller.spec.ts (unit, medium)
- tests_legacy/controllers/department.controller.spec.ts (unit, medium)
- tests_legacy/controllers/device.controller.spec.ts (unit, medium)
- tests_legacy/controllers/document.controller.spec.ts (unit, medium)
- tests_legacy/controllers/employee.controller.spec.ts (unit, medium)
- tests_legacy/controllers/employeeLoan.controller.spec.ts (unit, medium)
- tests_legacy/controllers/employeebenefit.controller.spec.ts (unit, medium)
- tests_legacy/controllers/employeepayroll.controller.spec.ts (unit, medium)
- tests_legacy/controllers/guide.controller.spec.ts (unit, medium)
- tests_legacy/controllers/job.controller.spec.ts (unit, medium)
- tests_legacy/controllers/level.controller.spec.ts (unit, medium)
- tests_legacy/controllers/loanType.controller.spec.ts (unit, medium)
- tests_legacy/controllers/note.controller.spec.ts (unit, medium)
- tests_legacy/controllers/notification.controller.spec.ts (unit, medium)
- tests_legacy/controllers/payrollperiod.controller.spec.ts (unit, medium)
- tests_legacy/controllers/person.controller.spec.ts (unit, medium)
- tests_legacy/controllers/position.controller.spec.ts (unit, medium)
- tests_legacy/controllers/request.controller.spec.ts (unit, medium)
- tests_legacy/controllers/requestTransaction.controller.spec.ts (unit, medium)
- tests_legacy/controllers/rule.controller.spec.ts (unit, medium)
- tests_legacy/controllers/scheduleOverride.controller.spec.ts (unit, medium)
- tests_legacy/controllers/shiftType.controller.spec.ts (unit, medium)
- tests_legacy/controllers/soalineitem.controller.spec.ts (unit, medium)
- tests_legacy/controllers/soaremittance.controller.spec.ts (unit, medium)
- tests_legacy/controllers/statementofaccount.controller.spec.ts (unit, medium)
- tests_legacy/controllers/template.controller.spec.ts (unit, medium)
- tests_legacy/controllers/timesheetline.controller.spec.ts (unit, medium)
- tests_legacy/controllers/workflowEngine.controller.spec.ts (unit, medium)
- tests_legacy/disciplinaryaction.controller.spec.ts (unit, medium)
- tests_legacy/exitInterview.controller.spec.ts (unit, medium)
- tests_legacy/flaky/employee-document-priority.helper.spec.ts (unit, medium)
- tests_legacy/flaky/payslip-pdf.helper.spec.ts (unit, medium)
- tests_legacy/flaky/scheduleOverride.upsert-create.spec.ts (unit, medium)
- tests_legacy/flaky/verifyToken.middleware.spec.ts (unit, medium)
- tests_legacy/holiday.controller.spec.ts (unit, medium)
- tests_legacy/leaveapplication.controller.spec.ts (unit, medium)
- tests_legacy/leavetype.controller.spec.ts (unit, medium)
- tests_legacy/offBoardingChecklist.controller.spec.ts (unit, medium)
- tests_legacy/payrollrecord.controller.spec.ts (unit, medium)
- tests_legacy/performance.controller.spec.ts (unit, medium)
- tests_legacy/performancereview.controller.spec.ts (unit, medium)
- tests_legacy/requestReviewer.controller.spec.ts (unit, medium)
- tests_legacy/requestStepExecution.controller.spec.ts (unit, medium)
- tests_legacy/requestWorkflow.controller.spec.ts (unit, medium)
- tests_legacy/resignation.controller.spec.ts (unit, medium)
- tests_legacy/role.controller.spec.ts (unit, medium)
- tests_legacy/routers/systemProvisioning.router.spec.ts (unit, medium)
- tests_legacy/scheduleTemplate.controller.spec.ts (unit, medium)
- tests_legacy/templateItem.controller.spec.ts (unit, medium)
- tests_legacy/workschedule.controller.spec.ts (unit, medium)
- tests_legacy/yearlyschedule.controller.spec.ts (unit, medium)

## Critical Behavior Inventory

- Core feature workflow: high (medium) Source: docs. Evidence: README.md: README headings or route files
- Main entry point behavior: high (high) Source: code. Evidence: dist/lib-entry.js: entry point candidate; app/Rule/index.ts: entry point candidate; app/activityLogging/index.ts: entry point candidate; app/agency/index.ts: entry point candidate; app/applicant/index.ts: entry point candidate; app/attendance/index.ts: entry point candidate; app/auditLogging/index.ts: entry point candidate; app/auth/index.ts: entry point candidate; app/benefitType/index.ts: entry point candidate; app/boardingProcess/index.ts: entry point candidate; app/boardingTemplate/index.ts: entry point candidate; app/calculator/index.ts: entry point candidate; app/calendar-item/index.ts: entry point candidate
- Runtime/build behavior: medium (high) Source: scripts. Evidence: package.json: scripts
- Data persistence behavior: critical (high) Source: code. Evidence: ioredis: persistence indicator
- Auth and permission behavior: critical (high) Source: code. Evidence: bcryptjs: auth/security indicator
- Payment behavior: medium (low) Source: code. Evidence: repository scan: no payment/billing indicators
- Deployment/runtime readiness: medium (high) Source: config. Evidence: .github/workflows/deploy-local-tailscale.yml: deployment config; .github/workflows/deploy.yml: deployment config; .github/workflows/infra-validate.yml: deployment config; .github/workflows/rollback.yml: deployment config; Dockerfile: deployment config; docker-compose.yml: deployment config; exports/local-infra/docker-compose.yml: deployment config; infrastructure/onprem/observability/docker-compose.yml: deployment config
- API route behavior: high (medium) Source: code. Evidence: app/hikvision/controller/access.control.controller.ts; app/hikvision/controller/callback.controller.ts; app/hikvision/controller/users.controller.ts; app/hikvision/routes/access.control.router.ts; app/hikvision/routes/callback.router.ts
- Configuration and environment behavior: medium (medium) Source: config. Evidence: Dockerfile; docker-compose.yml; exports/local-infra/docker-compose.yml; generated/prisma-postgres/package.json; generated/prisma/package.json; infrastructure/onprem/observability/docker-compose.yml; package.json; tsconfig.json
- Process and approval workflow: high (medium) Source: docs. Evidence: .wwg/governance/human-approval-matrix.md; .wwg/governance/infrastructure-readiness-checklist.md; .wwg/governance/maintenance-review-checklist.md; .wwg/governance/project-readiness-checklist.md; .wwg/governance/recommendation-policy.md; .wwg/governance/release-checklist.md; .wwg/workspace/testing/manual-verification-checklist.md; .wwg/workspace/testing/non-technical-regression-checklist.md

## Uncovered Behavior Inventory

- Core feature workflow: high (medium) - Detected tests do not obviously map to this behavior by path/name.
- Main entry point behavior: high (high) - Detected tests do not obviously map to this behavior by path/name.
- Payment behavior: medium (low) - Detected tests do not obviously map to this behavior by path/name.
- Deployment/runtime readiness: medium (high) - Detected tests do not obviously map to this behavior by path/name.
- Configuration and environment behavior: medium (medium) - Detected tests do not obviously map to this behavior by path/name.

## Regression Gaps

- HIGH Uncovered behavior: Core feature workflow: Detected tests do not obviously map to this behavior by path/name. Blocking adoption: false. Recommended action: Map this behavior to a report-first candidate before generating or editing executable tests.
- HIGH Uncovered behavior: Main entry point behavior: Detected tests do not obviously map to this behavior by path/name. Blocking adoption: false. Recommended action: Map this behavior to a report-first candidate before generating or editing executable tests.
- MEDIUM Uncovered behavior: Payment behavior: Detected tests do not obviously map to this behavior by path/name. Blocking adoption: false. Recommended action: Map this behavior to a report-first candidate before generating or editing executable tests.
- MEDIUM Uncovered behavior: Deployment/runtime readiness: Detected tests do not obviously map to this behavior by path/name. Blocking adoption: false. Recommended action: Map this behavior to a report-first candidate before generating or editing executable tests.
- MEDIUM Uncovered behavior: Configuration and environment behavior: Detected tests do not obviously map to this behavior by path/name. Blocking adoption: false. Recommended action: Map this behavior to a report-first candidate before generating or editing executable tests.

## Safe Report-First Test Candidates

- Smoke test candidate (mixed, report-first, advisory)
  - Target: .
  - Proposed check type: smoke
  - Inferred behavior: Confirm the application or package starts/builds at a minimal baseline.
  - Source evidence: app/Rule/index.ts; app/Rule/rule.controller.ts; app/Rule/rule.router.ts; app/activityLogging/activityLogging.controller.ts; app/activityLogging/activityLogging.router.ts
  - Safe to generate executable test now: false
  - Recommended action: Identify the smallest safe smoke check before writing executable tests.
- API route test candidate (mixed, report-first, blocking)
  - Target: api/routes
  - Proposed check type: api-route
  - Inferred behavior: Confirm API routes handle success and failure paths.
  - Source evidence: app/Rule/index.ts; app/Rule/rule.controller.ts; app/Rule/rule.router.ts; app/activityLogging/activityLogging.controller.ts; app/activityLogging/activityLogging.router.ts
  - Safe to generate executable test now: false
  - Recommended action: Draft route coverage from existing route files before generating tests.
- Auth/permission test candidate (mixed, report-first, blocking)
  - Target: auth
  - Proposed check type: auth-permission
  - Inferred behavior: Confirm access control and failure paths.
  - Source evidence: bcryptjs: auth/security indicator
  - Safe to generate executable test now: false
  - Recommended action: Review auth boundaries before generating executable tests.
- Payment failure-path test candidate (mixed, report-first, blocking)
  - Target: payments
  - Proposed check type: failure-path
  - Inferred behavior: Confirm payment safe and failure states.
  - Source evidence: repository scan: no payment/billing indicators
  - Safe to generate executable test now: false
  - Recommended action: Keep this report-first until production/payment boundaries are confirmed.
- Persistence/migration check candidate (mixed, report-first, blocking)
  - Target: data
  - Proposed check type: persistence
  - Inferred behavior: Confirm stored data, migrations, and invalid data behavior.
  - Source evidence: ioredis: persistence indicator
  - Safe to generate executable test now: false
  - Recommended action: Confirm data ownership before creating executable tests.
- Configuration contract check candidate (mixed, report-first, advisory)
  - Target: config
  - Proposed check type: configuration
  - Inferred behavior: Confirm required config files and safe defaults.
  - Source evidence: Dockerfile; docker-compose.yml; exports/local-infra/docker-compose.yml; generated/prisma-postgres/package.json; generated/prisma/package.json; infrastructure/onprem/observability/docker-compose.yml; package.json; tsconfig.json
  - Safe to generate executable test now: false
  - Recommended action: Convert known-safe config expectations into checks later.
- Schema/contract test candidate (mixed, report-first, advisory)
  - Target: contracts
  - Proposed check type: schema-contract
  - Inferred behavior: Confirm data contracts, config contracts, or public interfaces do not drift.
  - Source evidence: app/Rule/index.ts; app/Rule/rule.controller.ts; app/Rule/rule.router.ts; app/activityLogging/activityLogging.controller.ts; app/activityLogging/activityLogging.router.ts
  - Safe to generate executable test now: false
  - Recommended action: Identify actual schemas/contracts before generating tests.
- Process regression checklist candidate (mixed, report-first, advisory)
  - Target: process
  - Proposed check type: process-checklist
  - Inferred behavior: Confirm documented process steps remain current.
  - Source evidence: .github/workflows/heirarchy.md; .github/workflows/mgiration-guide.md; .wwg/governance/README.md; .wwg/governance/audit-log.md; .wwg/governance/canonical-artifact-review.md; .wwg/governance/context-drift-detection.md; .wwg/governance/drift-detection.md; .wwg/governance/drift-guard.md
  - Safe to generate executable test now: false
  - Recommended action: Turn recurring process expectations into a review checklist.
- Document consistency check candidate (mixed, report-first, advisory)
  - Target: docs
  - Proposed check type: document-consistency
  - Inferred behavior: Confirm docs, policies, and handoff material do not contradict one another.
  - Source evidence: .github/workflows/heirarchy.md; .github/workflows/mgiration-guide.md; .wwg/governance/README.md; .wwg/governance/audit-log.md; .wwg/governance/canonical-artifact-review.md; .wwg/governance/context-drift-detection.md; .wwg/governance/drift-detection.md; .wwg/governance/drift-guard.md
  - Safe to generate executable test now: false
  - Recommended action: Review canonical ownership before automating doc checks.
- Approval-flow check candidate (mixed, report-first, blocking)
  - Target: approval
  - Proposed check type: approval-flow
  - Inferred behavior: Confirm sensitive changes have review and approval evidence.
  - Source evidence: .github/workflows/heirarchy.md; .github/workflows/mgiration-guide.md; .wwg/governance/README.md; .wwg/governance/audit-log.md; .wwg/governance/canonical-artifact-review.md; .wwg/governance/context-drift-detection.md; .wwg/governance/drift-detection.md; .wwg/governance/drift-guard.md
  - Safe to generate executable test now: false
  - Recommended action: Define approval evidence in governance before enforcement.
- Handoff completeness check candidate (mixed, report-first, advisory)
  - Target: handoff
  - Proposed check type: handoff-completeness
  - Inferred behavior: Confirm future agents have enough context to continue.
  - Source evidence: .github/workflows/heirarchy.md; .github/workflows/mgiration-guide.md; .wwg/governance/README.md; .wwg/governance/audit-log.md; .wwg/governance/canonical-artifact-review.md; .wwg/governance/context-drift-detection.md; .wwg/governance/drift-detection.md; .wwg/governance/drift-guard.md
  - Safe to generate executable test now: false
  - Recommended action: Use the candidate as manual review guidance first.
- Operational readiness check candidate (mixed, report-first, advisory)
  - Target: operations
  - Proposed check type: operational-readiness
  - Inferred behavior: Confirm runbooks, ownership, and release readiness are reviewed.
  - Source evidence: .github/workflows/heirarchy.md; .github/workflows/mgiration-guide.md; .wwg/governance/README.md; .wwg/governance/audit-log.md; .wwg/governance/canonical-artifact-review.md; .wwg/governance/context-drift-detection.md; .wwg/governance/drift-detection.md; .wwg/governance/drift-guard.md
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
- Payment behavior regression candidate (mixed, report-first, advisory)
  - Target: Payment behavior
  - Proposed check type: critical-workflow
  - Inferred behavior: Confirm payment behavior remains covered as the project changes.
  - Source evidence: Detected tests do not obviously map to this behavior by path/name.
  - Safe to generate executable test now: false
  - Recommended action: Map this candidate to concrete evidence before generating executable tests.
- Deployment/runtime readiness regression candidate (mixed, report-first, advisory)
  - Target: Deployment/runtime readiness
  - Proposed check type: critical-workflow
  - Inferred behavior: Confirm deployment/runtime readiness remains covered as the project changes.
  - Source evidence: Detected tests do not obviously map to this behavior by path/name.
  - Safe to generate executable test now: false
  - Recommended action: Map this candidate to concrete evidence before generating executable tests.
- Configuration and environment behavior regression candidate (mixed, report-first, advisory)
  - Target: Configuration and environment behavior
  - Proposed check type: critical-workflow
  - Inferred behavior: Confirm configuration and environment behavior remains covered as the project changes.
  - Source evidence: Detected tests do not obviously map to this behavior by path/name.
  - Safe to generate executable test now: false
  - Recommended action: Map this candidate to concrete evidence before generating executable tests.

## Technical Verification Path

- Run detected command(s): lint: eslint app/**/*.ts index.ts lib-entry.Qts; test: mocha --require ts-node/register tests/**/*.spec.ts; typecheck: tsc --noEmit; test:tax: ts-node scripts/test-tax-calculator.ts; test:payroll: ts-node scripts/test-payroll-calculation.ts; test:bir: ts-node scripts/test-bir-2316.ts; test:bir-part4: ts-node scripts/test-bir-part4.ts; test:attendance-debug: ts-node scripts/test-attendance-debug.ts; test:attendance-metrics: ts-node scripts/test-attendance-metrics.ts; test:attendance-clock-in: ts-node scripts/test-attendance-clock-in.ts; check:attendance-status: ts-node scripts/check-attendance-status.ts; test:payroll-attendance: ts-node scripts/test-payroll-attendance.ts; test:bulk-adjust-endpoint: ts-node scripts/test-bulk-adjust-endpoint.ts; test:bulk-adjust-function: node -r ts-node/register scripts/test-bulk-adjust-function.ts; test:generate-employee-payroll: ts-node scripts/test-generate-employee-payroll.ts; metrics:attendance: ts-node scripts/test-attendance-all-metrics.ts; metrics:attendance:detailed: ts-node scripts/test-attendance-all-metrics.ts --detailed; metrics:reports: npx tsx scripts/test-attendance-metrics-reports.ts; metrics:reports:detailed: npx tsx scripts/test-attendance-metrics-reports.ts --detailed; test:attendance-summary: npx tsx scripts/test-attendance-summary.ts; test:timekeeping: ts-node scripts/test-timekeeping.ts; test:org-chart: npx tsx scripts/test-org-chart.ts; test:workforce: ts-node scripts/test-workforce.ts; test:notification-debug: ts-node scripts/test-notification-debug.ts; test:document-workflow: ts-node test-document-workflow.ts; wwg:test-check: npx @homedesk/wwg test-check
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

- 2 high/critical behavior(s) are not mapped to detected tests.

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
