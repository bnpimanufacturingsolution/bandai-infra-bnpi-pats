# WWG TEST ALIGNMENT: Regression Coverage Required

WWG STATUS: Regression / Test Failure
Truth Alignment Status: RED / Regression / Test Failure
EXECUTION GATE: Stop

## Plain-English Summary

A recent change appears to conflict with Project Truth, reintroduce a regression, weaken required verification, or touch a high-risk area without proper documentation.

Recommended decision:
Regression / Quality Repair

Why:
- Behavior changed, but no changed test files were detected in git status.

## Recommended Next Step

Stop implementation and resolve the truth conflict, regression, or verification gap before continuing.

## Recommended Natural Prompt

Tell the agent: "Create regression tests for the fixed bug so it does not return."

## Backup CLI

wwg regression-check
wwg test-check

## Status

- Test obligation: Regression Test Required
- Alignment Level: RED / Regression / Test Failure
- Execution Gate: stop / Stop
- Summary: 1 test alignment issue(s) detected for Onboarding behavior, Auth/security, Parsing/validation, API/client integration seam.

## Evidence

- Behavior areas: Onboarding behavior, Auth/security, Parsing/validation, API/client integration seam
- Test files detected: 219
- Missing test findings: 1
- Weak-test findings: 0
- Regression coverage gaps: 0

## Test / Verification Status

- Behavior Changed: Onboarding behavior, Auth/security, Parsing/validation, API/client integration seam
- Test Obligation: Regression Test Required
- Tests Found: hris-api/tests/attendance-action.helper.spec.ts, hris-api/tests/attendance-obligation.helper.spec.ts, hris-api/tests/attendance-realtime.helper.spec.ts, hris-api/tests/attendance-status-migration.spec.ts, hris-api/tests/auditLogger.spec.ts, hris-api/tests/auth-login-identifier.spec.ts, hris-api/tests/bulk-password.helper.spec.ts, hris-api/tests/cors-origin.contract.spec.ts, hris-api/tests/database-backup.helper.spec.ts, hris-api/tests/db/isolated-db-fault.guard.spec.ts, hris-api/tests/db/isolated-db-faults.spec.ts, hris-api/tests/db/isolated-prisma.integration.spec.ts, hris-api/tests/db/schema-source-truth.contract.spec.ts, hris-api/tests/device-event-realtime.helper.spec.ts, hris-api/tests/device-health-zkteco.spec.ts, hris-api/tests/dm3-attendance-obligation-repair.helper.spec.ts, hris-api/tests/dm4-biometric-proof.spec.ts, hris-api/tests/document-field-validation.helper.spec.ts, hris-api/tests/employee-action-block.helper.spec.ts, hris-api/tests/employee-helper-credentials.spec.ts, hris-api/tests/employee-import.helper.spec.ts, hris-api/tests/employee-organization-reporting-query.contract.spec.ts, hris-api/tests/employee-schedule.helper.spec.ts, hris-api/tests/employeepayroll.snapshot-lock.contract.spec.ts, hris-api/tests/enterprise-csv-loader.spec.ts, hris-api/tests/enterprise-csv-sample-pack.spec.ts, hris-api/tests/enterprise-migration-dm-masterlist.spec.ts, hris-api/tests/enterprise-migration-dm-report.spec.ts, hris-api/tests/enterprise-migration-runner-env.spec.ts, hris-api/tests/enterprise-migration-timesheet-quality.spec.ts, hris-api/tests/enterprise-migration-validation-env.spec.ts, hris-api/tests/enterprise-migration.service.spec.ts, hris-api/tests/enterprise-organization-bootstrap.spec.ts, hris-api/tests/enterprise-stage-package-scripts.spec.ts, hris-api/tests/enterprise-stage-runner.spec.ts, hris-api/tests/hikvision-device-seed-default.spec.ts, hris-api/tests/hikvision-endpoint-config.spec.ts, hris-api/tests/hikvision-event-contract.helper.spec.ts, hris-api/tests/import-service-contracts.spec.ts, hris-api/tests/leave-session.helper.spec.ts, hris-api/tests/leaveType.controller.spec.ts, hris-api/tests/local-user-account.helper.spec.ts, hris-api/tests/migration-enterprise.zod.spec.ts, hris-api/tests/migration-script-safety.spec.ts, hris-api/tests/migration-service-dry-run.spec.ts, hris-api/tests/mongo-postgres-migration.spec.ts, hris-api/tests/payroll-period-timesheet-lock.spec.ts, hris-api/tests/payslip-pdf.helper.spec.ts, hris-api/tests/prisma-datasource.helper.spec.ts, hris-api/tests/query-builder-search-fields.spec.ts, hris-api/tests/recruitment-runtime.helper.spec.ts, hris-api/tests/request.zod.spec.ts, hris-api/tests/role-derivation.spec.ts, hris-api/tests/schedule-change-hr-approval.spec.ts, hris-api/tests/schedule-normalization.helper.spec.ts, hris-api/tests/section.controller.spec.ts, hris-api/tests/security.middleware.spec.ts, hris-api/tests/seed-and-qa-script-safety.spec.ts, hris-api/tests/service-name-validation.spec.ts, hris-api/tests/timekeeping.helper.spec.ts, hris-api/tests/timesheet-backfill-source-truth.spec.ts, hris-api/tests/timesheet-line-version.helper.spec.ts, hris-api/tests/timesheet-reminder-notification.spec.ts, hris-api/tests/timesheet-schedule-coverage-query.contract.spec.ts, hris-api/tests/timesheet-submit-eligibility.spec.ts, hris-api/tests/workflow-config.helper.spec.ts, hris-api/tests/wwg-regression-coverage.spec.ts, hris-api/tests/wwg/app-module-contract.behavior.spec.ts, hris-api/tests/wwg/core-utils.behavior.spec.ts, hris-api/tests/wwg/formdata-validation.behavior.spec.ts, hris-api/tests/wwg/function-coverage.explicit.spec.ts, hris-api/tests/wwg/payroll-attendance.behavior.spec.ts, hris-api/tests/wwg/request-workforce-cache-auth.behavior.spec.ts, hris-api/tests/wwg/tax-timekeeping.behavior.spec.ts, hris-api/tests/wwg/tenant-middleware.behavior.spec.ts, hris-api/tests/zkteco-event-contract.helper.spec.ts, hris-api/tests_legacy/WorkflowInstance.controller.spec.ts, hris-api/tests_legacy/aduittrail.controller.spec.ts, hris-api/tests_legacy/audittrail.controller.spec.ts, hris-api/tests_legacy/calendar.controller.spec.ts, hris-api/tests_legacy/calendarEvent.controller.spec.ts, hris-api/tests_legacy/calendarItem.controller.spec.ts, hris-api/tests_legacy/checklistTemplate.controller.spec.ts, hris-api/tests_legacy/compensationhistory.controller.spec.ts, hris-api/tests_legacy/controllers/applicant.controller.spec.ts, hris-api/tests_legacy/controllers/attendance.controller.spec.ts, hris-api/tests_legacy/controllers/auth.controller.spec.ts, hris-api/tests_legacy/controllers/benefit.controller.spec.ts, hris-api/tests_legacy/controllers/benefitType.controller.spec.ts, hris-api/tests_legacy/controllers/boardingProcess.controller.spec.ts, hris-api/tests_legacy/controllers/boardingTemplate.controller.spec.ts, hris-api/tests_legacy/controllers/calculator.controller.spec.ts, hris-api/tests_legacy/controllers/celebrations.controller.spec.ts, hris-api/tests_legacy/controllers/checklistItem.controller.spec.ts, hris-api/tests_legacy/controllers/dashboard.controller.spec.ts, hris-api/tests_legacy/controllers/department.controller.spec.ts, hris-api/tests_legacy/controllers/device.controller.spec.ts, hris-api/tests_legacy/controllers/document.controller.spec.ts, hris-api/tests_legacy/controllers/employee.controller.spec.ts, hris-api/tests_legacy/controllers/employeeLoan.controller.spec.ts, hris-api/tests_legacy/controllers/employeebenefit.controller.spec.ts, hris-api/tests_legacy/controllers/employeepayroll.controller.spec.ts, hris-api/tests_legacy/controllers/guide.controller.spec.ts, hris-api/tests_legacy/controllers/job.controller.spec.ts, hris-api/tests_legacy/controllers/level.controller.spec.ts, hris-api/tests_legacy/controllers/loanType.controller.spec.ts, hris-api/tests_legacy/controllers/note.controller.spec.ts, hris-api/tests_legacy/controllers/notification.controller.spec.ts, hris-api/tests_legacy/controllers/payrollperiod.controller.spec.ts, hris-api/tests_legacy/controllers/person.controller.spec.ts, hris-api/tests_legacy/controllers/position.controller.spec.ts, hris-api/tests_legacy/controllers/request.controller.spec.ts, hris-api/tests_legacy/controllers/requestTransaction.controller.spec.ts, hris-api/tests_legacy/controllers/rule.controller.spec.ts, hris-api/tests_legacy/controllers/scheduleOverride.controller.spec.ts, hris-api/tests_legacy/controllers/shiftType.controller.spec.ts, hris-api/tests_legacy/controllers/soalineitem.controller.spec.ts, hris-api/tests_legacy/controllers/soaremittance.controller.spec.ts, hris-api/tests_legacy/controllers/statementofaccount.controller.spec.ts, hris-api/tests_legacy/controllers/template.controller.spec.ts, hris-api/tests_legacy/controllers/timesheetline.controller.spec.ts, hris-api/tests_legacy/controllers/workflowEngine.controller.spec.ts, hris-api/tests_legacy/disciplinaryaction.controller.spec.ts, hris-api/tests_legacy/exitInterview.controller.spec.ts, hris-api/tests_legacy/flaky/employee-document-priority.helper.spec.ts, hris-api/tests_legacy/flaky/payslip-pdf.helper.spec.ts, hris-api/tests_legacy/flaky/scheduleOverride.upsert-create.spec.ts, hris-api/tests_legacy/flaky/verifyToken.middleware.spec.ts, hris-api/tests_legacy/holiday.controller.spec.ts, hris-api/tests_legacy/leaveapplication.controller.spec.ts, hris-api/tests_legacy/leavetype.controller.spec.ts, hris-api/tests_legacy/offBoardingChecklist.controller.spec.ts, hris-api/tests_legacy/payrollrecord.controller.spec.ts, hris-api/tests_legacy/performance.controller.spec.ts, hris-api/tests_legacy/performancereview.controller.spec.ts, hris-api/tests_legacy/requestReviewer.controller.spec.ts, hris-api/tests_legacy/requestStepExecution.controller.spec.ts, hris-api/tests_legacy/requestWorkflow.controller.spec.ts, hris-api/tests_legacy/resignation.controller.spec.ts, hris-api/tests_legacy/role.controller.spec.ts, hris-api/tests_legacy/routers/systemProvisioning.router.spec.ts, hris-api/tests_legacy/scheduleTemplate.controller.spec.ts, hris-api/tests_legacy/templateItem.controller.spec.ts, hris-api/tests_legacy/workschedule.controller.spec.ts, hris-api/tests_legacy/yearlyschedule.controller.spec.ts, hris-app/app/components/atoms/CategoricalText.test.tsx, hris-app/app/components/atoms/DataTable.test.tsx, hris-app/app/components/atoms/ProfileInitialsAvatar.test.tsx, hris-app/app/components/atoms/SummaryCard.test.tsx, hris-app/app/components/atoms/TimesheetDayCell.test.tsx, hris-app/app/components/atoms/index.test.ts, hris-app/app/components/dashboards/shared/role-dashboard-shell.test.tsx, hris-app/app/components/dashboards/shared/role-dashboard.config.test.ts, hris-app/app/components/modals/JobRequisitionRequestModal.test.tsx, hris-app/app/components/molecules/TimesheetCalendar.test.tsx, hris-app/app/components/molecules/employee/EmploymentCompensationForm.test.tsx, hris-app/app/components/organisms/job-details-modal.test.tsx, hris-app/app/components/organisms/job-lists.test.tsx, hris-app/app/components/organisms/settings/WorkforceRecruitmentSettingsModule.test.tsx, hris-app/app/components/shared/EmployeeList.test.tsx, hris-app/app/components/templates/common/payroll-periods-template.test.tsx, hris-app/app/components/templates/hr/benefit-types-template.test.tsx, hris-app/app/lib/admin-migration-ui.test.ts, hris-app/app/lib/api-client.test.ts, hris-app/app/lib/api-url.helper.test.ts, hris-app/app/lib/attendance-import-ui.test.ts, hris-app/app/lib/ci-cd-quality-gates.test.ts, hris-app/app/lib/data-table-state.test.ts, hris-app/app/lib/device-events-realtime-ui.test.ts, hris-app/app/lib/import-progress-ui.test.ts, hris-app/app/lib/repository-hygiene.test.ts, hris-app/app/lib/runtime-api-base.test.ts, hris-app/app/lib/test-obligation-policy.test.ts, hris-app/app/lib/upload-url.test.ts, hris-app/app/lib/utils/__tests__/report-scope.test.ts, hris-app/app/lib/utils/__tests__/role-redirect.test.ts, hris-app/app/lib/utils/default-employee-password.test.ts, hris-app/app/lib/utils/employee-form-draft-idb.test.ts, hris-app/app/lib/utils/employee-import-preview-validation.test.ts, hris-app/app/lib/utils/manpower-distribution-links.test.ts, hris-app/app/lib/utils/report-export.test.ts, hris-app/app/lib/utils/role-derivation.test.ts, hris-app/app/lib/workforce-recruitment-coverage.test.ts, hris-app/app/routes.test.ts, hris-app/app/routes/admin/configuration/admin-categorical-fields.test.tsx, hris-app/app/routes/admin/configuration/attendance.import-route.test.ts, hris-app/app/routes/admin/configuration/attendance.test.tsx, hris-app/app/routes/admin/configuration/calendar-items.test.tsx, hris-app/app/routes/admin/configuration/departments.test.tsx, hris-app/app/routes/admin/configuration/holidays.test.tsx, hris-app/app/routes/admin/configuration/leave-types.test.tsx, hris-app/app/routes/admin/configuration/levels.test.tsx, hris-app/app/routes/admin/configuration/loan-types.test.tsx, hris-app/app/routes/admin/configuration/migration.import-route.test.ts, hris-app/app/routes/admin/configuration/positions.test.tsx, hris-app/app/routes/admin/configuration/schedule-templates.test.tsx, hris-app/app/routes/admin/configuration/sections.test.tsx, hris-app/app/routes/admin/configuration/users.test.tsx, hris-app/app/routes/admin/configuration/workflows.test.tsx, hris-app/app/routes/hr/settings/documents.test.tsx, hris-app/app/services/api-service.test.ts, hris-app/app/services/attendance.service.test.ts, hris-app/app/services/auth-service.test.ts, hris-app/app/services/employee-payroll.service.test.ts, hris-app/app/services/employees.service.test.ts, hris-app/app/services/metrics.service.test.ts, hris-app/app/services/requests.service.test.ts, hris-app/app/services/timesheetline.service.test.ts, hris-app/scripts/check-test-obligations.test.ts, hris-app/tests/dm4-fresh-db-migration.e2e.spec.ts, hris-app/tests/document-onboarding-real-scenario.spec.ts, hris-app/tests/hr-tickets-accordion.spec.ts, hris-app/tests/perf/hr-attendance.spec.ts, hris-app/tests/smoke/admin-config-departments.spec.ts, hris-app/tests/smoke/hr-recruitment-jobs-manager.spec.ts, hris-app/tests/smoke/project-truth-devcurrent-vbox-login.spec.ts, hris-app/tests/smoke/public-jobs-flow.spec.ts, hris-app/tests/unreachable-routes.test.ts, hris-app/tests/unused-routes.test.ts
- Missing Tests: Behavior changed, but no changed test files were detected in git status.
- Regression Coverage Needed: None detected.

## Behavior Changed

- Onboarding behavior
- Auth/security
- Parsing/validation
- API/client integration seam

## Expected Tests

- Onboarding validation test
- Onboarding progress test
- Onboarding saved-state test
- Access control test
- Auth/security failure-state test
- Parsing valid-input test
- Parsing invalid-input test
- Validation edge-case test
- Client success-path test
- Client error-handling test

## Tests Found

- hris-api/tests/attendance-action.helper.spec.ts
- hris-api/tests/attendance-obligation.helper.spec.ts
- hris-api/tests/attendance-realtime.helper.spec.ts
- hris-api/tests/attendance-status-migration.spec.ts
- hris-api/tests/auditLogger.spec.ts
- hris-api/tests/auth-login-identifier.spec.ts
- hris-api/tests/bulk-password.helper.spec.ts
- hris-api/tests/cors-origin.contract.spec.ts
- hris-api/tests/database-backup.helper.spec.ts
- hris-api/tests/db/isolated-db-fault.guard.spec.ts
- hris-api/tests/db/isolated-db-faults.spec.ts
- hris-api/tests/db/isolated-prisma.integration.spec.ts
- hris-api/tests/db/schema-source-truth.contract.spec.ts
- hris-api/tests/device-event-realtime.helper.spec.ts
- hris-api/tests/device-health-zkteco.spec.ts
- hris-api/tests/dm3-attendance-obligation-repair.helper.spec.ts
- hris-api/tests/dm4-biometric-proof.spec.ts
- hris-api/tests/document-field-validation.helper.spec.ts
- hris-api/tests/employee-action-block.helper.spec.ts
- hris-api/tests/employee-helper-credentials.spec.ts
- hris-api/tests/employee-import.helper.spec.ts
- hris-api/tests/employee-organization-reporting-query.contract.spec.ts
- hris-api/tests/employee-schedule.helper.spec.ts
- hris-api/tests/employeepayroll.snapshot-lock.contract.spec.ts
- hris-api/tests/enterprise-csv-loader.spec.ts
- hris-api/tests/enterprise-csv-sample-pack.spec.ts
- hris-api/tests/enterprise-migration-dm-masterlist.spec.ts
- hris-api/tests/enterprise-migration-dm-report.spec.ts
- hris-api/tests/enterprise-migration-runner-env.spec.ts
- hris-api/tests/enterprise-migration-timesheet-quality.spec.ts
- hris-api/tests/enterprise-migration-validation-env.spec.ts
- hris-api/tests/enterprise-migration.service.spec.ts
- hris-api/tests/enterprise-organization-bootstrap.spec.ts
- hris-api/tests/enterprise-stage-package-scripts.spec.ts
- hris-api/tests/enterprise-stage-runner.spec.ts
- hris-api/tests/hikvision-device-seed-default.spec.ts
- hris-api/tests/hikvision-endpoint-config.spec.ts
- hris-api/tests/hikvision-event-contract.helper.spec.ts
- hris-api/tests/import-service-contracts.spec.ts
- hris-api/tests/leave-session.helper.spec.ts
- hris-api/tests/leaveType.controller.spec.ts
- hris-api/tests/local-user-account.helper.spec.ts
- hris-api/tests/migration-enterprise.zod.spec.ts
- hris-api/tests/migration-script-safety.spec.ts
- hris-api/tests/migration-service-dry-run.spec.ts
- hris-api/tests/mongo-postgres-migration.spec.ts
- hris-api/tests/payroll-period-timesheet-lock.spec.ts
- hris-api/tests/payslip-pdf.helper.spec.ts
- hris-api/tests/prisma-datasource.helper.spec.ts
- hris-api/tests/query-builder-search-fields.spec.ts
- hris-api/tests/recruitment-runtime.helper.spec.ts
- hris-api/tests/request.zod.spec.ts
- hris-api/tests/role-derivation.spec.ts
- hris-api/tests/schedule-change-hr-approval.spec.ts
- hris-api/tests/schedule-normalization.helper.spec.ts
- hris-api/tests/section.controller.spec.ts
- hris-api/tests/security.middleware.spec.ts
- hris-api/tests/seed-and-qa-script-safety.spec.ts
- hris-api/tests/service-name-validation.spec.ts
- hris-api/tests/timekeeping.helper.spec.ts
- hris-api/tests/timesheet-backfill-source-truth.spec.ts
- hris-api/tests/timesheet-line-version.helper.spec.ts
- hris-api/tests/timesheet-reminder-notification.spec.ts
- hris-api/tests/timesheet-schedule-coverage-query.contract.spec.ts
- hris-api/tests/timesheet-submit-eligibility.spec.ts
- hris-api/tests/workflow-config.helper.spec.ts
- hris-api/tests/wwg-regression-coverage.spec.ts
- hris-api/tests/wwg/app-module-contract.behavior.spec.ts
- hris-api/tests/wwg/core-utils.behavior.spec.ts
- hris-api/tests/wwg/formdata-validation.behavior.spec.ts
- hris-api/tests/wwg/function-coverage.explicit.spec.ts
- hris-api/tests/wwg/payroll-attendance.behavior.spec.ts
- hris-api/tests/wwg/request-workforce-cache-auth.behavior.spec.ts
- hris-api/tests/wwg/tax-timekeeping.behavior.spec.ts
- hris-api/tests/wwg/tenant-middleware.behavior.spec.ts
- hris-api/tests/zkteco-event-contract.helper.spec.ts
- hris-api/tests_legacy/WorkflowInstance.controller.spec.ts
- hris-api/tests_legacy/aduittrail.controller.spec.ts
- hris-api/tests_legacy/audittrail.controller.spec.ts
- hris-api/tests_legacy/calendar.controller.spec.ts
- hris-api/tests_legacy/calendarEvent.controller.spec.ts
- hris-api/tests_legacy/calendarItem.controller.spec.ts
- hris-api/tests_legacy/checklistTemplate.controller.spec.ts
- hris-api/tests_legacy/compensationhistory.controller.spec.ts
- hris-api/tests_legacy/controllers/applicant.controller.spec.ts
- hris-api/tests_legacy/controllers/attendance.controller.spec.ts
- hris-api/tests_legacy/controllers/auth.controller.spec.ts
- hris-api/tests_legacy/controllers/benefit.controller.spec.ts
- hris-api/tests_legacy/controllers/benefitType.controller.spec.ts
- hris-api/tests_legacy/controllers/boardingProcess.controller.spec.ts
- hris-api/tests_legacy/controllers/boardingTemplate.controller.spec.ts
- hris-api/tests_legacy/controllers/calculator.controller.spec.ts
- hris-api/tests_legacy/controllers/celebrations.controller.spec.ts
- hris-api/tests_legacy/controllers/checklistItem.controller.spec.ts
- hris-api/tests_legacy/controllers/dashboard.controller.spec.ts
- hris-api/tests_legacy/controllers/department.controller.spec.ts
- hris-api/tests_legacy/controllers/device.controller.spec.ts
- hris-api/tests_legacy/controllers/document.controller.spec.ts
- hris-api/tests_legacy/controllers/employee.controller.spec.ts
- hris-api/tests_legacy/controllers/employeeLoan.controller.spec.ts
- hris-api/tests_legacy/controllers/employeebenefit.controller.spec.ts
- hris-api/tests_legacy/controllers/employeepayroll.controller.spec.ts
- hris-api/tests_legacy/controllers/guide.controller.spec.ts
- hris-api/tests_legacy/controllers/job.controller.spec.ts
- hris-api/tests_legacy/controllers/level.controller.spec.ts
- hris-api/tests_legacy/controllers/loanType.controller.spec.ts
- hris-api/tests_legacy/controllers/note.controller.spec.ts
- hris-api/tests_legacy/controllers/notification.controller.spec.ts
- hris-api/tests_legacy/controllers/payrollperiod.controller.spec.ts
- hris-api/tests_legacy/controllers/person.controller.spec.ts
- hris-api/tests_legacy/controllers/position.controller.spec.ts
- hris-api/tests_legacy/controllers/request.controller.spec.ts
- hris-api/tests_legacy/controllers/requestTransaction.controller.spec.ts
- hris-api/tests_legacy/controllers/rule.controller.spec.ts
- hris-api/tests_legacy/controllers/scheduleOverride.controller.spec.ts
- hris-api/tests_legacy/controllers/shiftType.controller.spec.ts
- hris-api/tests_legacy/controllers/soalineitem.controller.spec.ts
- hris-api/tests_legacy/controllers/soaremittance.controller.spec.ts
- hris-api/tests_legacy/controllers/statementofaccount.controller.spec.ts
- hris-api/tests_legacy/controllers/template.controller.spec.ts
- hris-api/tests_legacy/controllers/timesheetline.controller.spec.ts
- hris-api/tests_legacy/controllers/workflowEngine.controller.spec.ts
- hris-api/tests_legacy/disciplinaryaction.controller.spec.ts
- hris-api/tests_legacy/exitInterview.controller.spec.ts
- hris-api/tests_legacy/flaky/employee-document-priority.helper.spec.ts
- hris-api/tests_legacy/flaky/payslip-pdf.helper.spec.ts
- hris-api/tests_legacy/flaky/scheduleOverride.upsert-create.spec.ts
- hris-api/tests_legacy/flaky/verifyToken.middleware.spec.ts
- hris-api/tests_legacy/holiday.controller.spec.ts
- hris-api/tests_legacy/leaveapplication.controller.spec.ts
- hris-api/tests_legacy/leavetype.controller.spec.ts
- hris-api/tests_legacy/offBoardingChecklist.controller.spec.ts
- hris-api/tests_legacy/payrollrecord.controller.spec.ts
- hris-api/tests_legacy/performance.controller.spec.ts
- hris-api/tests_legacy/performancereview.controller.spec.ts
- hris-api/tests_legacy/requestReviewer.controller.spec.ts
- hris-api/tests_legacy/requestStepExecution.controller.spec.ts
- hris-api/tests_legacy/requestWorkflow.controller.spec.ts
- hris-api/tests_legacy/resignation.controller.spec.ts
- hris-api/tests_legacy/role.controller.spec.ts
- hris-api/tests_legacy/routers/systemProvisioning.router.spec.ts
- hris-api/tests_legacy/scheduleTemplate.controller.spec.ts
- hris-api/tests_legacy/templateItem.controller.spec.ts
- hris-api/tests_legacy/workschedule.controller.spec.ts
- hris-api/tests_legacy/yearlyschedule.controller.spec.ts
- hris-app/app/components/atoms/CategoricalText.test.tsx
- hris-app/app/components/atoms/DataTable.test.tsx
- hris-app/app/components/atoms/ProfileInitialsAvatar.test.tsx
- hris-app/app/components/atoms/SummaryCard.test.tsx
- hris-app/app/components/atoms/TimesheetDayCell.test.tsx
- hris-app/app/components/atoms/index.test.ts
- hris-app/app/components/dashboards/shared/role-dashboard-shell.test.tsx
- hris-app/app/components/dashboards/shared/role-dashboard.config.test.ts
- hris-app/app/components/modals/JobRequisitionRequestModal.test.tsx
- hris-app/app/components/molecules/TimesheetCalendar.test.tsx
- hris-app/app/components/molecules/employee/EmploymentCompensationForm.test.tsx
- hris-app/app/components/organisms/job-details-modal.test.tsx
- hris-app/app/components/organisms/job-lists.test.tsx
- hris-app/app/components/organisms/settings/WorkforceRecruitmentSettingsModule.test.tsx
- hris-app/app/components/shared/EmployeeList.test.tsx
- hris-app/app/components/templates/common/payroll-periods-template.test.tsx
- hris-app/app/components/templates/hr/benefit-types-template.test.tsx
- hris-app/app/lib/admin-migration-ui.test.ts
- hris-app/app/lib/api-client.test.ts
- hris-app/app/lib/api-url.helper.test.ts
- hris-app/app/lib/attendance-import-ui.test.ts
- hris-app/app/lib/ci-cd-quality-gates.test.ts
- hris-app/app/lib/data-table-state.test.ts
- hris-app/app/lib/device-events-realtime-ui.test.ts
- hris-app/app/lib/import-progress-ui.test.ts
- hris-app/app/lib/repository-hygiene.test.ts
- hris-app/app/lib/runtime-api-base.test.ts
- hris-app/app/lib/test-obligation-policy.test.ts
- hris-app/app/lib/upload-url.test.ts
- hris-app/app/lib/utils/__tests__/report-scope.test.ts
- hris-app/app/lib/utils/__tests__/role-redirect.test.ts
- hris-app/app/lib/utils/default-employee-password.test.ts
- hris-app/app/lib/utils/employee-form-draft-idb.test.ts
- hris-app/app/lib/utils/employee-import-preview-validation.test.ts
- hris-app/app/lib/utils/manpower-distribution-links.test.ts
- hris-app/app/lib/utils/report-export.test.ts
- hris-app/app/lib/utils/role-derivation.test.ts
- hris-app/app/lib/workforce-recruitment-coverage.test.ts
- hris-app/app/routes.test.ts
- hris-app/app/routes/admin/configuration/admin-categorical-fields.test.tsx
- hris-app/app/routes/admin/configuration/attendance.import-route.test.ts
- hris-app/app/routes/admin/configuration/attendance.test.tsx
- hris-app/app/routes/admin/configuration/calendar-items.test.tsx
- hris-app/app/routes/admin/configuration/departments.test.tsx
- hris-app/app/routes/admin/configuration/holidays.test.tsx
- hris-app/app/routes/admin/configuration/leave-types.test.tsx
- hris-app/app/routes/admin/configuration/levels.test.tsx
- hris-app/app/routes/admin/configuration/loan-types.test.tsx
- hris-app/app/routes/admin/configuration/migration.import-route.test.ts
- hris-app/app/routes/admin/configuration/positions.test.tsx
- hris-app/app/routes/admin/configuration/schedule-templates.test.tsx
- hris-app/app/routes/admin/configuration/sections.test.tsx
- hris-app/app/routes/admin/configuration/users.test.tsx
- hris-app/app/routes/admin/configuration/workflows.test.tsx
- hris-app/app/routes/hr/settings/documents.test.tsx
- hris-app/app/services/api-service.test.ts
- hris-app/app/services/attendance.service.test.ts
- hris-app/app/services/auth-service.test.ts
- hris-app/app/services/employee-payroll.service.test.ts
- hris-app/app/services/employees.service.test.ts
- hris-app/app/services/metrics.service.test.ts
- hris-app/app/services/requests.service.test.ts
- hris-app/app/services/timesheetline.service.test.ts
- hris-app/scripts/check-test-obligations.test.ts
- hris-app/tests/dm4-fresh-db-migration.e2e.spec.ts
- hris-app/tests/document-onboarding-real-scenario.spec.ts
- hris-app/tests/hr-tickets-accordion.spec.ts
- hris-app/tests/perf/hr-attendance.spec.ts
- hris-app/tests/smoke/admin-config-departments.spec.ts
- hris-app/tests/smoke/hr-recruitment-jobs-manager.spec.ts
- hris-app/tests/smoke/project-truth-devcurrent-vbox-login.spec.ts
- hris-app/tests/smoke/public-jobs-flow.spec.ts
- hris-app/tests/unreachable-routes.test.ts
- hris-app/tests/unused-routes.test.ts

## Missing Tests

- Behavior changed, but no changed test files were detected in git status.

## Weak Tests

- None.

## Regression Coverage Needed

- None.

## Test Plan

- Behavior changed:
  - Onboarding behavior
  - Auth/security
  - Parsing/validation
  - API/client integration seam
- Unit tests added/updated:
  - hris-api/tests/attendance-action.helper.spec.ts
  - hris-api/tests/attendance-obligation.helper.spec.ts
  - hris-api/tests/attendance-realtime.helper.spec.ts
  - hris-api/tests/attendance-status-migration.spec.ts
  - hris-api/tests/auditLogger.spec.ts
  - hris-api/tests/auth-login-identifier.spec.ts
  - hris-api/tests/bulk-password.helper.spec.ts
  - hris-api/tests/cors-origin.contract.spec.ts
  - hris-api/tests/database-backup.helper.spec.ts
  - hris-api/tests/db/isolated-db-fault.guard.spec.ts
  - hris-api/tests/db/isolated-db-faults.spec.ts
  - hris-api/tests/db/isolated-prisma.integration.spec.ts
  - hris-api/tests/db/schema-source-truth.contract.spec.ts
  - hris-api/tests/device-event-realtime.helper.spec.ts
  - hris-api/tests/device-health-zkteco.spec.ts
  - hris-api/tests/dm3-attendance-obligation-repair.helper.spec.ts
  - hris-api/tests/dm4-biometric-proof.spec.ts
  - hris-api/tests/document-field-validation.helper.spec.ts
  - hris-api/tests/employee-action-block.helper.spec.ts
  - hris-api/tests/employee-helper-credentials.spec.ts
  - hris-api/tests/employee-import.helper.spec.ts
  - hris-api/tests/employee-organization-reporting-query.contract.spec.ts
  - hris-api/tests/employee-schedule.helper.spec.ts
  - hris-api/tests/employeepayroll.snapshot-lock.contract.spec.ts
  - hris-api/tests/enterprise-csv-loader.spec.ts
  - hris-api/tests/enterprise-csv-sample-pack.spec.ts
  - hris-api/tests/enterprise-migration-dm-masterlist.spec.ts
  - hris-api/tests/enterprise-migration-dm-report.spec.ts
  - hris-api/tests/enterprise-migration-runner-env.spec.ts
  - hris-api/tests/enterprise-migration-timesheet-quality.spec.ts
  - hris-api/tests/enterprise-migration-validation-env.spec.ts
  - hris-api/tests/enterprise-migration.service.spec.ts
  - hris-api/tests/enterprise-organization-bootstrap.spec.ts
  - hris-api/tests/enterprise-stage-package-scripts.spec.ts
  - hris-api/tests/enterprise-stage-runner.spec.ts
  - hris-api/tests/hikvision-device-seed-default.spec.ts
  - hris-api/tests/hikvision-endpoint-config.spec.ts
  - hris-api/tests/hikvision-event-contract.helper.spec.ts
  - hris-api/tests/import-service-contracts.spec.ts
  - hris-api/tests/leave-session.helper.spec.ts
  - hris-api/tests/leaveType.controller.spec.ts
  - hris-api/tests/local-user-account.helper.spec.ts
  - hris-api/tests/migration-enterprise.zod.spec.ts
  - hris-api/tests/migration-script-safety.spec.ts
  - hris-api/tests/migration-service-dry-run.spec.ts
  - hris-api/tests/mongo-postgres-migration.spec.ts
  - hris-api/tests/payroll-period-timesheet-lock.spec.ts
  - hris-api/tests/payslip-pdf.helper.spec.ts
  - hris-api/tests/prisma-datasource.helper.spec.ts
  - hris-api/tests/query-builder-search-fields.spec.ts
  - hris-api/tests/recruitment-runtime.helper.spec.ts
  - hris-api/tests/request.zod.spec.ts
  - hris-api/tests/role-derivation.spec.ts
  - hris-api/tests/schedule-change-hr-approval.spec.ts
  - hris-api/tests/schedule-normalization.helper.spec.ts
  - hris-api/tests/section.controller.spec.ts
  - hris-api/tests/security.middleware.spec.ts
  - hris-api/tests/seed-and-qa-script-safety.spec.ts
  - hris-api/tests/service-name-validation.spec.ts
  - hris-api/tests/timekeeping.helper.spec.ts
  - hris-api/tests/timesheet-backfill-source-truth.spec.ts
  - hris-api/tests/timesheet-line-version.helper.spec.ts
  - hris-api/tests/timesheet-reminder-notification.spec.ts
  - hris-api/tests/timesheet-schedule-coverage-query.contract.spec.ts
  - hris-api/tests/timesheet-submit-eligibility.spec.ts
  - hris-api/tests/workflow-config.helper.spec.ts
  - hris-api/tests/wwg-regression-coverage.spec.ts
  - hris-api/tests/wwg/app-module-contract.behavior.spec.ts
  - hris-api/tests/wwg/core-utils.behavior.spec.ts
  - hris-api/tests/wwg/formdata-validation.behavior.spec.ts
  - hris-api/tests/wwg/function-coverage.explicit.spec.ts
  - hris-api/tests/wwg/payroll-attendance.behavior.spec.ts
  - hris-api/tests/wwg/request-workforce-cache-auth.behavior.spec.ts
  - hris-api/tests/wwg/tax-timekeeping.behavior.spec.ts
  - hris-api/tests/wwg/tenant-middleware.behavior.spec.ts
  - hris-api/tests/zkteco-event-contract.helper.spec.ts
  - hris-api/tests_legacy/WorkflowInstance.controller.spec.ts
  - hris-api/tests_legacy/aduittrail.controller.spec.ts
  - hris-api/tests_legacy/audittrail.controller.spec.ts
  - hris-api/tests_legacy/calendar.controller.spec.ts
  - hris-api/tests_legacy/calendarEvent.controller.spec.ts
  - hris-api/tests_legacy/calendarItem.controller.spec.ts
  - hris-api/tests_legacy/checklistTemplate.controller.spec.ts
  - hris-api/tests_legacy/compensationhistory.controller.spec.ts
  - hris-api/tests_legacy/controllers/applicant.controller.spec.ts
  - hris-api/tests_legacy/controllers/attendance.controller.spec.ts
  - hris-api/tests_legacy/controllers/auth.controller.spec.ts
  - hris-api/tests_legacy/controllers/benefit.controller.spec.ts
  - hris-api/tests_legacy/controllers/benefitType.controller.spec.ts
  - hris-api/tests_legacy/controllers/boardingProcess.controller.spec.ts
  - hris-api/tests_legacy/controllers/boardingTemplate.controller.spec.ts
  - hris-api/tests_legacy/controllers/calculator.controller.spec.ts
  - hris-api/tests_legacy/controllers/celebrations.controller.spec.ts
  - hris-api/tests_legacy/controllers/checklistItem.controller.spec.ts
  - hris-api/tests_legacy/controllers/dashboard.controller.spec.ts
  - hris-api/tests_legacy/controllers/department.controller.spec.ts
  - hris-api/tests_legacy/controllers/device.controller.spec.ts
  - hris-api/tests_legacy/controllers/document.controller.spec.ts
  - hris-api/tests_legacy/controllers/employee.controller.spec.ts
  - hris-api/tests_legacy/controllers/employeeLoan.controller.spec.ts
  - hris-api/tests_legacy/controllers/employeebenefit.controller.spec.ts
  - hris-api/tests_legacy/controllers/employeepayroll.controller.spec.ts
  - hris-api/tests_legacy/controllers/guide.controller.spec.ts
  - hris-api/tests_legacy/controllers/job.controller.spec.ts
  - hris-api/tests_legacy/controllers/level.controller.spec.ts
  - hris-api/tests_legacy/controllers/loanType.controller.spec.ts
  - hris-api/tests_legacy/controllers/note.controller.spec.ts
  - hris-api/tests_legacy/controllers/notification.controller.spec.ts
  - hris-api/tests_legacy/controllers/payrollperiod.controller.spec.ts
  - hris-api/tests_legacy/controllers/person.controller.spec.ts
  - hris-api/tests_legacy/controllers/position.controller.spec.ts
  - hris-api/tests_legacy/controllers/request.controller.spec.ts
  - hris-api/tests_legacy/controllers/requestTransaction.controller.spec.ts
  - hris-api/tests_legacy/controllers/rule.controller.spec.ts
  - hris-api/tests_legacy/controllers/scheduleOverride.controller.spec.ts
  - hris-api/tests_legacy/controllers/shiftType.controller.spec.ts
  - hris-api/tests_legacy/controllers/soalineitem.controller.spec.ts
  - hris-api/tests_legacy/controllers/soaremittance.controller.spec.ts
  - hris-api/tests_legacy/controllers/statementofaccount.controller.spec.ts
  - hris-api/tests_legacy/controllers/template.controller.spec.ts
  - hris-api/tests_legacy/controllers/timesheetline.controller.spec.ts
  - hris-api/tests_legacy/controllers/workflowEngine.controller.spec.ts
  - hris-api/tests_legacy/disciplinaryaction.controller.spec.ts
  - hris-api/tests_legacy/exitInterview.controller.spec.ts
  - hris-api/tests_legacy/flaky/employee-document-priority.helper.spec.ts
  - hris-api/tests_legacy/flaky/payslip-pdf.helper.spec.ts
  - hris-api/tests_legacy/flaky/scheduleOverride.upsert-create.spec.ts
  - hris-api/tests_legacy/flaky/verifyToken.middleware.spec.ts
  - hris-api/tests_legacy/holiday.controller.spec.ts
  - hris-api/tests_legacy/leaveapplication.controller.spec.ts
  - hris-api/tests_legacy/leavetype.controller.spec.ts
  - hris-api/tests_legacy/offBoardingChecklist.controller.spec.ts
  - hris-api/tests_legacy/payrollrecord.controller.spec.ts
  - hris-api/tests_legacy/performance.controller.spec.ts
  - hris-api/tests_legacy/performancereview.controller.spec.ts
  - hris-api/tests_legacy/requestReviewer.controller.spec.ts
  - hris-api/tests_legacy/requestStepExecution.controller.spec.ts
  - hris-api/tests_legacy/requestWorkflow.controller.spec.ts
  - hris-api/tests_legacy/resignation.controller.spec.ts
  - hris-api/tests_legacy/role.controller.spec.ts
  - hris-api/tests_legacy/routers/systemProvisioning.router.spec.ts
  - hris-api/tests_legacy/scheduleTemplate.controller.spec.ts
  - hris-api/tests_legacy/templateItem.controller.spec.ts
  - hris-api/tests_legacy/workschedule.controller.spec.ts
  - hris-api/tests_legacy/yearlyschedule.controller.spec.ts
  - hris-app/app/components/atoms/CategoricalText.test.tsx
  - hris-app/app/components/atoms/DataTable.test.tsx
  - hris-app/app/components/atoms/ProfileInitialsAvatar.test.tsx
  - hris-app/app/components/atoms/SummaryCard.test.tsx
  - hris-app/app/components/atoms/TimesheetDayCell.test.tsx
  - hris-app/app/components/atoms/index.test.ts
  - hris-app/app/components/dashboards/shared/role-dashboard-shell.test.tsx
  - hris-app/app/components/dashboards/shared/role-dashboard.config.test.ts
  - hris-app/app/components/modals/JobRequisitionRequestModal.test.tsx
  - hris-app/app/components/molecules/TimesheetCalendar.test.tsx
  - hris-app/app/components/molecules/employee/EmploymentCompensationForm.test.tsx
  - hris-app/app/components/organisms/job-details-modal.test.tsx
  - hris-app/app/components/organisms/job-lists.test.tsx
  - hris-app/app/components/organisms/settings/WorkforceRecruitmentSettingsModule.test.tsx
  - hris-app/app/components/shared/EmployeeList.test.tsx
  - hris-app/app/components/templates/common/payroll-periods-template.test.tsx
  - hris-app/app/components/templates/hr/benefit-types-template.test.tsx
  - hris-app/app/lib/admin-migration-ui.test.ts
  - hris-app/app/lib/api-client.test.ts
  - hris-app/app/lib/api-url.helper.test.ts
  - hris-app/app/lib/attendance-import-ui.test.ts
  - hris-app/app/lib/ci-cd-quality-gates.test.ts
  - hris-app/app/lib/data-table-state.test.ts
  - hris-app/app/lib/device-events-realtime-ui.test.ts
  - hris-app/app/lib/import-progress-ui.test.ts
  - hris-app/app/lib/repository-hygiene.test.ts
  - hris-app/app/lib/runtime-api-base.test.ts
  - hris-app/app/lib/test-obligation-policy.test.ts
  - hris-app/app/lib/upload-url.test.ts
  - hris-app/app/lib/utils/__tests__/report-scope.test.ts
  - hris-app/app/lib/utils/__tests__/role-redirect.test.ts
  - hris-app/app/lib/utils/default-employee-password.test.ts
  - hris-app/app/lib/utils/employee-form-draft-idb.test.ts
  - hris-app/app/lib/utils/employee-import-preview-validation.test.ts
  - hris-app/app/lib/utils/manpower-distribution-links.test.ts
  - hris-app/app/lib/utils/report-export.test.ts
  - hris-app/app/lib/utils/role-derivation.test.ts
  - hris-app/app/lib/workforce-recruitment-coverage.test.ts
  - hris-app/app/routes.test.ts
  - hris-app/app/routes/admin/configuration/admin-categorical-fields.test.tsx
  - hris-app/app/routes/admin/configuration/attendance.import-route.test.ts
  - hris-app/app/routes/admin/configuration/attendance.test.tsx
  - hris-app/app/routes/admin/configuration/calendar-items.test.tsx
  - hris-app/app/routes/admin/configuration/departments.test.tsx
  - hris-app/app/routes/admin/configuration/holidays.test.tsx
  - hris-app/app/routes/admin/configuration/leave-types.test.tsx
  - hris-app/app/routes/admin/configuration/levels.test.tsx
  - hris-app/app/routes/admin/configuration/loan-types.test.tsx
  - hris-app/app/routes/admin/configuration/migration.import-route.test.ts
  - hris-app/app/routes/admin/configuration/positions.test.tsx
  - hris-app/app/routes/admin/configuration/schedule-templates.test.tsx
  - hris-app/app/routes/admin/configuration/sections.test.tsx
  - hris-app/app/routes/admin/configuration/users.test.tsx
  - hris-app/app/routes/admin/configuration/workflows.test.tsx
  - hris-app/app/routes/hr/settings/documents.test.tsx
  - hris-app/app/services/api-service.test.ts
  - hris-app/app/services/attendance.service.test.ts
  - hris-app/app/services/auth-service.test.ts
  - hris-app/app/services/employee-payroll.service.test.ts
  - hris-app/app/services/employees.service.test.ts
  - hris-app/app/services/metrics.service.test.ts
  - hris-app/app/services/requests.service.test.ts
  - hris-app/app/services/timesheetline.service.test.ts
  - hris-app/scripts/check-test-obligations.test.ts
  - hris-app/tests/dm4-fresh-db-migration.e2e.spec.ts
  - hris-app/tests/document-onboarding-real-scenario.spec.ts
  - hris-app/tests/hr-tickets-accordion.spec.ts
  - hris-app/tests/perf/hr-attendance.spec.ts
  - hris-app/tests/smoke/admin-config-departments.spec.ts
  - hris-app/tests/smoke/hr-recruitment-jobs-manager.spec.ts
  - hris-app/tests/smoke/project-truth-devcurrent-vbox-login.spec.ts
  - hris-app/tests/smoke/public-jobs-flow.spec.ts
  - hris-app/tests/unreachable-routes.test.ts
  - hris-app/tests/unused-routes.test.ts
- Regression tests added/updated:
  - hris-api/tests/auth-login-identifier.spec.ts
  - hris-api/tests/wwg-regression-coverage.spec.ts
  - hris-api/tests/wwg/request-workforce-cache-auth.behavior.spec.ts
  - hris-api/tests_legacy/controllers/auth.controller.spec.ts
  - hris-app/app/services/auth-service.test.ts
- Manual verification:
  - Not detected by this report-first check.
- Test command run:
  - Not run by `test-check`; run the project test command after adding or updating tests.
- Result:
  - RED / Regression / Test Failure
- If no tests were added, reason:
  - No documented test exception detected.

## Recommended Next Step

Tell the agent: "Create regression tests for the fixed bug so it does not return."

## Backup CLI

- wwg regression-check
- wwg test-check

## Safety

- Report-first only.
- No implementation, tests, Project Truth, or governance files were rewritten.
- Weak-test findings are heuristic and should be reviewed against actual behavior coverage.
