# WWG TEST ALIGNMENT: Regression Coverage Required

WWG STATUS: Regression / Test Failure
Truth Alignment Status: RED / Regression / Test Failure
EXECUTION GATE: Stop

## Plain-English Summary

A recent change appears to conflict with Project Truth, reintroduce a regression, weaken required verification, or touch a high-risk area without proper documentation.

Recommended decision:
Regression / Quality Repair

Why:
- Expected behavior tests are not satisfied by the detected weak/static tests.

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
- Summary: 8 test alignment issue(s) detected for Cart behavior, Onboarding behavior, Dashboard metrics, Auth/security, Persistence, Parsing/validation, API/client integration seam, Bug fix.

## Evidence

- Behavior areas: Cart behavior, Onboarding behavior, Dashboard metrics, Auth/security, Persistence, Parsing/validation, API/client integration seam, Bug fix
- Test files detected: 251
- Missing test findings: 1
- Weak-test findings: 7
- Regression coverage gaps: 0

## Test / Verification Status

- Behavior Changed: Cart behavior, Onboarding behavior, Dashboard metrics, Auth/security, Persistence, Parsing/validation, API/client integration seam, Bug fix
- Test Obligation: Regression Test Required
- Tests Found: .runtime/upstream-bnpi-pats-app-current-files/app/components/atoms/DataTable.test.tsx, .runtime/upstream-bnpi-pats-app-current-files/app/routes/employee/dashboard/TimesheetsTab.test.tsx, bnpi-pats-api/tests/attendance-action.helper.spec.ts, bnpi-pats-api/tests/attendance-backfill.service.spec.ts, bnpi-pats-api/tests/attendance-correction.service.spec.ts, bnpi-pats-api/tests/attendance-obligation.helper.spec.ts, bnpi-pats-api/tests/attendance-realtime.helper.spec.ts, bnpi-pats-api/tests/attendance-status-migration.spec.ts, bnpi-pats-api/tests/auditLogger.spec.ts, bnpi-pats-api/tests/auth-login-identifier.spec.ts, bnpi-pats-api/tests/bulk-password.helper.spec.ts, bnpi-pats-api/tests/cors-origin.contract.spec.ts, bnpi-pats-api/tests/database-backup.helper.spec.ts, bnpi-pats-api/tests/db/isolated-db-fault.guard.spec.ts, bnpi-pats-api/tests/db/isolated-db-faults.spec.ts, bnpi-pats-api/tests/db/isolated-prisma.integration.spec.ts, bnpi-pats-api/tests/db/schema-source-truth.contract.spec.ts, bnpi-pats-api/tests/device-event-realtime.helper.spec.ts, bnpi-pats-api/tests/device-health-zkteco.spec.ts, bnpi-pats-api/tests/device-user-api-contract.spec.ts, bnpi-pats-api/tests/device-user-event-resolver.spec.ts, bnpi-pats-api/tests/device-user-sync.helper.spec.ts, bnpi-pats-api/tests/dm3-attendance-obligation-repair.helper.spec.ts, bnpi-pats-api/tests/dm4-biometric-proof.spec.ts, bnpi-pats-api/tests/document-field-validation.helper.spec.ts, bnpi-pats-api/tests/employee-action-block.helper.spec.ts, bnpi-pats-api/tests/employee-helper-credentials.spec.ts, bnpi-pats-api/tests/employee-import.helper.spec.ts, bnpi-pats-api/tests/employee-organization-reporting-query.contract.spec.ts, bnpi-pats-api/tests/employee-schedule.helper.spec.ts, bnpi-pats-api/tests/employeepayroll.snapshot-lock.contract.spec.ts, bnpi-pats-api/tests/enterprise-csv-loader.spec.ts, bnpi-pats-api/tests/enterprise-csv-sample-pack.spec.ts, bnpi-pats-api/tests/enterprise-migration-dm-masterlist.spec.ts, bnpi-pats-api/tests/enterprise-migration-dm-report.spec.ts, bnpi-pats-api/tests/enterprise-migration-runner-env.spec.ts, bnpi-pats-api/tests/enterprise-migration-timesheet-quality.spec.ts, bnpi-pats-api/tests/enterprise-migration-validation-env.spec.ts, bnpi-pats-api/tests/enterprise-migration.service.spec.ts, bnpi-pats-api/tests/enterprise-organization-bootstrap.spec.ts, bnpi-pats-api/tests/enterprise-stage-package-scripts.spec.ts, bnpi-pats-api/tests/enterprise-stage-runner.spec.ts, bnpi-pats-api/tests/hikvision-callback.controller.spec.ts, bnpi-pats-api/tests/hikvision-dev-watcher-runtime.spec.ts, bnpi-pats-api/tests/hikvision-device-seed-default.spec.ts, bnpi-pats-api/tests/hikvision-endpoint-config.spec.ts, bnpi-pats-api/tests/hikvision-event-contract.helper.spec.ts, bnpi-pats-api/tests/import-service-contracts.spec.ts, bnpi-pats-api/tests/leave-session.helper.spec.ts, bnpi-pats-api/tests/leaveType.controller.spec.ts, bnpi-pats-api/tests/local-user-account.helper.spec.ts, bnpi-pats-api/tests/migration-enterprise.zod.spec.ts, bnpi-pats-api/tests/migration-script-safety.spec.ts, bnpi-pats-api/tests/migration-service-dry-run.spec.ts, bnpi-pats-api/tests/mongo-postgres-migration.spec.ts, bnpi-pats-api/tests/payroll-period-timesheet-lock.spec.ts, bnpi-pats-api/tests/payslip-pdf.helper.spec.ts, bnpi-pats-api/tests/prisma-datasource.helper.spec.ts, bnpi-pats-api/tests/query-builder-search-fields.spec.ts, bnpi-pats-api/tests/recruitment-runtime.helper.spec.ts, bnpi-pats-api/tests/request.zod.spec.ts, bnpi-pats-api/tests/role-derivation.spec.ts, bnpi-pats-api/tests/schedule-change-hr-approval.spec.ts, bnpi-pats-api/tests/schedule-normalization.helper.spec.ts, bnpi-pats-api/tests/section.controller.spec.ts, bnpi-pats-api/tests/security.middleware.spec.ts, bnpi-pats-api/tests/seed-and-qa-script-safety.spec.ts, bnpi-pats-api/tests/service-name-validation.spec.ts, bnpi-pats-api/tests/timekeeping.helper.spec.ts, bnpi-pats-api/tests/timesheet-backfill-source-truth.spec.ts, bnpi-pats-api/tests/timesheet-line-version.helper.spec.ts, bnpi-pats-api/tests/timesheet-reminder-notification.spec.ts, bnpi-pats-api/tests/timesheet-schedule-coverage-query.contract.spec.ts, bnpi-pats-api/tests/timesheet-submit-eligibility.spec.ts, bnpi-pats-api/tests/workflow-config.helper.spec.ts, bnpi-pats-api/tests/workforce-recruitment.helper.spec.ts, bnpi-pats-api/tests/wwg-regression-coverage.spec.ts, bnpi-pats-api/tests/wwg/app-module-contract.behavior.spec.ts, bnpi-pats-api/tests/wwg/core-utils.behavior.spec.ts, bnpi-pats-api/tests/wwg/formdata-validation.behavior.spec.ts, bnpi-pats-api/tests/wwg/function-coverage.explicit.spec.ts, bnpi-pats-api/tests/wwg/payroll-attendance.behavior.spec.ts, bnpi-pats-api/tests/wwg/request-workforce-cache-auth.behavior.spec.ts, bnpi-pats-api/tests/wwg/tax-timekeeping.behavior.spec.ts, bnpi-pats-api/tests/wwg/tenant-middleware.behavior.spec.ts, bnpi-pats-api/tests/zkteco-event-contract.helper.spec.ts, bnpi-pats-api/tests_legacy/WorkflowInstance.controller.spec.ts, bnpi-pats-api/tests_legacy/aduittrail.controller.spec.ts, bnpi-pats-api/tests_legacy/audittrail.controller.spec.ts, bnpi-pats-api/tests_legacy/calendar.controller.spec.ts, bnpi-pats-api/tests_legacy/calendarEvent.controller.spec.ts, bnpi-pats-api/tests_legacy/calendarItem.controller.spec.ts, bnpi-pats-api/tests_legacy/checklistTemplate.controller.spec.ts, bnpi-pats-api/tests_legacy/compensationhistory.controller.spec.ts, bnpi-pats-api/tests_legacy/controllers/applicant.controller.spec.ts, bnpi-pats-api/tests_legacy/controllers/attendance.controller.spec.ts, bnpi-pats-api/tests_legacy/controllers/auth.controller.spec.ts, bnpi-pats-api/tests_legacy/controllers/benefit.controller.spec.ts, bnpi-pats-api/tests_legacy/controllers/benefitType.controller.spec.ts, bnpi-pats-api/tests_legacy/controllers/boardingProcess.controller.spec.ts, bnpi-pats-api/tests_legacy/controllers/boardingTemplate.controller.spec.ts, bnpi-pats-api/tests_legacy/controllers/calculator.controller.spec.ts, bnpi-pats-api/tests_legacy/controllers/celebrations.controller.spec.ts, bnpi-pats-api/tests_legacy/controllers/checklistItem.controller.spec.ts, bnpi-pats-api/tests_legacy/controllers/dashboard.controller.spec.ts, bnpi-pats-api/tests_legacy/controllers/department.controller.spec.ts, bnpi-pats-api/tests_legacy/controllers/device.controller.spec.ts, bnpi-pats-api/tests_legacy/controllers/document.controller.spec.ts, bnpi-pats-api/tests_legacy/controllers/employee.controller.spec.ts, bnpi-pats-api/tests_legacy/controllers/employeeLoan.controller.spec.ts, bnpi-pats-api/tests_legacy/controllers/employeebenefit.controller.spec.ts, bnpi-pats-api/tests_legacy/controllers/employeepayroll.controller.spec.ts, bnpi-pats-api/tests_legacy/controllers/guide.controller.spec.ts, bnpi-pats-api/tests_legacy/controllers/job.controller.spec.ts, bnpi-pats-api/tests_legacy/controllers/level.controller.spec.ts, bnpi-pats-api/tests_legacy/controllers/loanType.controller.spec.ts, bnpi-pats-api/tests_legacy/controllers/note.controller.spec.ts, bnpi-pats-api/tests_legacy/controllers/notification.controller.spec.ts, bnpi-pats-api/tests_legacy/controllers/payrollperiod.controller.spec.ts, bnpi-pats-api/tests_legacy/controllers/person.controller.spec.ts, bnpi-pats-api/tests_legacy/controllers/position.controller.spec.ts, bnpi-pats-api/tests_legacy/controllers/request.controller.spec.ts, bnpi-pats-api/tests_legacy/controllers/requestTransaction.controller.spec.ts, bnpi-pats-api/tests_legacy/controllers/rule.controller.spec.ts, bnpi-pats-api/tests_legacy/controllers/scheduleOverride.controller.spec.ts, bnpi-pats-api/tests_legacy/controllers/shiftType.controller.spec.ts, bnpi-pats-api/tests_legacy/controllers/soalineitem.controller.spec.ts, bnpi-pats-api/tests_legacy/controllers/soaremittance.controller.spec.ts, bnpi-pats-api/tests_legacy/controllers/statementofaccount.controller.spec.ts, bnpi-pats-api/tests_legacy/controllers/template.controller.spec.ts, bnpi-pats-api/tests_legacy/controllers/timesheetline.controller.spec.ts, bnpi-pats-api/tests_legacy/controllers/workflowEngine.controller.spec.ts, bnpi-pats-api/tests_legacy/disciplinaryaction.controller.spec.ts, bnpi-pats-api/tests_legacy/exitInterview.controller.spec.ts, bnpi-pats-api/tests_legacy/flaky/employee-document-priority.helper.spec.ts, bnpi-pats-api/tests_legacy/flaky/payslip-pdf.helper.spec.ts, bnpi-pats-api/tests_legacy/flaky/scheduleOverride.upsert-create.spec.ts, bnpi-pats-api/tests_legacy/flaky/verifyToken.middleware.spec.ts, bnpi-pats-api/tests_legacy/holiday.controller.spec.ts, bnpi-pats-api/tests_legacy/leaveapplication.controller.spec.ts, bnpi-pats-api/tests_legacy/leavetype.controller.spec.ts, bnpi-pats-api/tests_legacy/offBoardingChecklist.controller.spec.ts, bnpi-pats-api/tests_legacy/payrollrecord.controller.spec.ts, bnpi-pats-api/tests_legacy/performance.controller.spec.ts, bnpi-pats-api/tests_legacy/performancereview.controller.spec.ts, bnpi-pats-api/tests_legacy/requestReviewer.controller.spec.ts, bnpi-pats-api/tests_legacy/requestStepExecution.controller.spec.ts, bnpi-pats-api/tests_legacy/requestWorkflow.controller.spec.ts, bnpi-pats-api/tests_legacy/resignation.controller.spec.ts, bnpi-pats-api/tests_legacy/role.controller.spec.ts, bnpi-pats-api/tests_legacy/routers/systemProvisioning.router.spec.ts, bnpi-pats-api/tests_legacy/scheduleTemplate.controller.spec.ts, bnpi-pats-api/tests_legacy/templateItem.controller.spec.ts, bnpi-pats-api/tests_legacy/workschedule.controller.spec.ts, bnpi-pats-api/tests_legacy/yearlyschedule.controller.spec.ts, bnpi-pats-app/app/components/atoms/CategoricalText.test.tsx, bnpi-pats-app/app/components/atoms/DataTable.test.tsx, bnpi-pats-app/app/components/atoms/ProfileInitialsAvatar.test.tsx, bnpi-pats-app/app/components/atoms/SummaryCard.test.tsx, bnpi-pats-app/app/components/atoms/TimesheetDayCell.test.tsx, bnpi-pats-app/app/components/atoms/index.test.ts, bnpi-pats-app/app/components/dashboards/shared/role-dashboard-shell.test.tsx, bnpi-pats-app/app/components/dashboards/shared/role-dashboard.config.test.ts, bnpi-pats-app/app/components/modals/JobRequisitionRequestModal.test.tsx, bnpi-pats-app/app/components/molecules/EmployeeTableCell.test.tsx, bnpi-pats-app/app/components/molecules/TimesheetCalendar.test.tsx, bnpi-pats-app/app/components/molecules/TimesheetCalendarApproval.test.tsx, bnpi-pats-app/app/components/molecules/TimesheetDayTooltipContent.test.tsx, bnpi-pats-app/app/components/molecules/TimesheetEmployeeCard.test.tsx, bnpi-pats-app/app/components/molecules/TimesheetHoursOverview.test.tsx, bnpi-pats-app/app/components/molecules/employee/EmploymentCompensationForm.test.tsx, bnpi-pats-app/app/components/organisms/TimesheetViewModal.test.tsx, bnpi-pats-app/app/components/organisms/hr/AttendanceFixModal.test.tsx, bnpi-pats-app/app/components/organisms/job-details-modal.test.tsx, bnpi-pats-app/app/components/organisms/job-lists.test.tsx, bnpi-pats-app/app/components/organisms/settings/WorkforceRecruitmentSettingsModule.test.tsx, bnpi-pats-app/app/components/shared/EmployeeList.test.tsx, bnpi-pats-app/app/components/templates/common/AttendanceDailyTrendSection.test.tsx, bnpi-pats-app/app/components/templates/common/attendance-management-template.test.tsx, bnpi-pats-app/app/components/templates/common/payroll-periods-template.test.tsx, bnpi-pats-app/app/components/templates/hr/benefit-types-template.test.tsx, bnpi-pats-app/app/lib/admin-migration-ui.test.ts, bnpi-pats-app/app/lib/api-client.test.ts, bnpi-pats-app/app/lib/api-url.helper.test.ts, bnpi-pats-app/app/lib/attendance-import-ui.test.ts, bnpi-pats-app/app/lib/ci-cd-quality-gates.test.ts, bnpi-pats-app/app/lib/data-table-state.test.ts, bnpi-pats-app/app/lib/device-events-page-contract.test.ts, bnpi-pats-app/app/lib/device-events-realtime-ui.test.ts, bnpi-pats-app/app/lib/hooks/useAttendances.test.tsx, bnpi-pats-app/app/lib/hooks/useMetrics.test.tsx, bnpi-pats-app/app/lib/hooks/useTeamAttendance.test.tsx, bnpi-pats-app/app/lib/hooks/useTimesheets.test.tsx, bnpi-pats-app/app/lib/import-progress-ui.test.ts, bnpi-pats-app/app/lib/repository-hygiene.test.ts, bnpi-pats-app/app/lib/runtime-api-base.test.ts, bnpi-pats-app/app/lib/test-obligation-policy.test.ts, bnpi-pats-app/app/lib/upload-url.test.ts, bnpi-pats-app/app/lib/utils/__tests__/report-scope.test.ts, bnpi-pats-app/app/lib/utils/__tests__/role-redirect.test.ts, bnpi-pats-app/app/lib/utils/attendance-threshold.test.ts, bnpi-pats-app/app/lib/utils/default-employee-password.test.ts, bnpi-pats-app/app/lib/utils/employee-form-draft-idb.test.ts, bnpi-pats-app/app/lib/utils/employee-import-preview-validation.test.ts, bnpi-pats-app/app/lib/utils/manpower-distribution-links.test.ts, bnpi-pats-app/app/lib/utils/report-export.test.ts, bnpi-pats-app/app/lib/utils/role-derivation.test.ts, bnpi-pats-app/app/lib/workforce-recruitment-coverage.test.ts, bnpi-pats-app/app/routes.test.ts, bnpi-pats-app/app/routes/admin/configuration/admin-categorical-fields.test.tsx, bnpi-pats-app/app/routes/admin/configuration/attendance.import-route.test.ts, bnpi-pats-app/app/routes/admin/configuration/attendance.test.tsx, bnpi-pats-app/app/routes/admin/configuration/calendar-items.test.tsx, bnpi-pats-app/app/routes/admin/configuration/departments.test.tsx, bnpi-pats-app/app/routes/admin/configuration/holidays.test.tsx, bnpi-pats-app/app/routes/admin/configuration/leave-types.test.tsx, bnpi-pats-app/app/routes/admin/configuration/levels.test.tsx, bnpi-pats-app/app/routes/admin/configuration/loan-types.test.tsx, bnpi-pats-app/app/routes/admin/configuration/migration.import-route.test.ts, bnpi-pats-app/app/routes/admin/configuration/positions.test.tsx, bnpi-pats-app/app/routes/admin/configuration/schedule-templates.test.tsx, bnpi-pats-app/app/routes/admin/configuration/sections.test.tsx, bnpi-pats-app/app/routes/admin/configuration/users.test.tsx, bnpi-pats-app/app/routes/admin/configuration/workflows.test.tsx, bnpi-pats-app/app/routes/admin/devices/device-user-ui-contract.test.ts, bnpi-pats-app/app/routes/employee/dashboard/TimesheetsTab.test.tsx, bnpi-pats-app/app/routes/hr/reports/tabs/AttendanceDailyTrendTab.test.tsx, bnpi-pats-app/app/routes/hr/settings/documents.test.tsx, bnpi-pats-app/app/routes/hr/time-corrections.test.ts, bnpi-pats-app/app/services/api-service.test.ts, bnpi-pats-app/app/services/attendance.service.test.ts, bnpi-pats-app/app/services/auth-service.test.ts, bnpi-pats-app/app/services/employee-payroll.service.test.ts, bnpi-pats-app/app/services/employees.service.test.ts, bnpi-pats-app/app/services/metrics.service.test.ts, bnpi-pats-app/app/services/requests.service.test.ts, bnpi-pats-app/app/services/timesheet.service.test.ts, bnpi-pats-app/app/services/timesheetline.service.test.ts, bnpi-pats-app/scripts/check-test-obligations.test.ts, bnpi-pats-app/tests/dm4-fresh-db-migration.e2e.spec.ts, bnpi-pats-app/tests/document-onboarding-real-scenario.spec.ts, bnpi-pats-app/tests/hr-tickets-accordion.spec.ts, bnpi-pats-app/tests/perf/hr-attendance.spec.ts, bnpi-pats-app/tests/smoke/admin-config-departments.spec.ts, bnpi-pats-app/tests/smoke/admin-device-events-sync-modal.spec.ts, bnpi-pats-app/tests/smoke/admin-device-sync-review.spec.ts, bnpi-pats-app/tests/smoke/hr-recruitment-jobs-manager.spec.ts, bnpi-pats-app/tests/smoke/project-truth-devcurrent-vbox-login.spec.ts, bnpi-pats-app/tests/smoke/public-jobs-flow.spec.ts, bnpi-pats-app/tests/unreachable-routes.test.ts, bnpi-pats-app/tests/unused-routes.test.ts
- Missing Tests: Expected behavior tests are not satisfied by the detected weak/static tests.
- Regression Coverage Needed: None detected.

## Behavior Changed

- Cart behavior
- Onboarding behavior
- Dashboard metrics
- Auth/security
- Persistence
- Parsing/validation
- API/client integration seam
- Bug fix

## Expected Tests

- Cart add test
- Cart remove test
- Cart quantity test
- Cart total calculation test
- Onboarding validation test
- Onboarding progress test
- Onboarding saved-state test
- Dashboard calculation test
- Dashboard empty-state test
- Access control test
- Auth/security failure-state test
- Persistence load test
- Persistence save test
- Persistence migration test
- Invalid persisted data test
- Parsing valid-input test
- Parsing invalid-input test
- Validation edge-case test
- Client success-path test
- Client error-handling test
- Regression test reproducing the bug before the fix

## Tests Found

- .runtime/upstream-bnpi-pats-app-current-files/app/components/atoms/DataTable.test.tsx
- .runtime/upstream-bnpi-pats-app-current-files/app/routes/employee/dashboard/TimesheetsTab.test.tsx
- bnpi-pats-api/tests/attendance-action.helper.spec.ts
- bnpi-pats-api/tests/attendance-backfill.service.spec.ts
- bnpi-pats-api/tests/attendance-correction.service.spec.ts
- bnpi-pats-api/tests/attendance-obligation.helper.spec.ts
- bnpi-pats-api/tests/attendance-realtime.helper.spec.ts
- bnpi-pats-api/tests/attendance-status-migration.spec.ts
- bnpi-pats-api/tests/auditLogger.spec.ts
- bnpi-pats-api/tests/auth-login-identifier.spec.ts
- bnpi-pats-api/tests/bulk-password.helper.spec.ts
- bnpi-pats-api/tests/cors-origin.contract.spec.ts
- bnpi-pats-api/tests/database-backup.helper.spec.ts
- bnpi-pats-api/tests/db/isolated-db-fault.guard.spec.ts
- bnpi-pats-api/tests/db/isolated-db-faults.spec.ts
- bnpi-pats-api/tests/db/isolated-prisma.integration.spec.ts
- bnpi-pats-api/tests/db/schema-source-truth.contract.spec.ts
- bnpi-pats-api/tests/device-event-realtime.helper.spec.ts
- bnpi-pats-api/tests/device-health-zkteco.spec.ts
- bnpi-pats-api/tests/device-user-api-contract.spec.ts
- bnpi-pats-api/tests/device-user-event-resolver.spec.ts
- bnpi-pats-api/tests/device-user-sync.helper.spec.ts
- bnpi-pats-api/tests/dm3-attendance-obligation-repair.helper.spec.ts
- bnpi-pats-api/tests/dm4-biometric-proof.spec.ts
- bnpi-pats-api/tests/document-field-validation.helper.spec.ts
- bnpi-pats-api/tests/employee-action-block.helper.spec.ts
- bnpi-pats-api/tests/employee-helper-credentials.spec.ts
- bnpi-pats-api/tests/employee-import.helper.spec.ts
- bnpi-pats-api/tests/employee-organization-reporting-query.contract.spec.ts
- bnpi-pats-api/tests/employee-schedule.helper.spec.ts
- bnpi-pats-api/tests/employeepayroll.snapshot-lock.contract.spec.ts
- bnpi-pats-api/tests/enterprise-csv-loader.spec.ts
- bnpi-pats-api/tests/enterprise-csv-sample-pack.spec.ts
- bnpi-pats-api/tests/enterprise-migration-dm-masterlist.spec.ts
- bnpi-pats-api/tests/enterprise-migration-dm-report.spec.ts
- bnpi-pats-api/tests/enterprise-migration-runner-env.spec.ts
- bnpi-pats-api/tests/enterprise-migration-timesheet-quality.spec.ts
- bnpi-pats-api/tests/enterprise-migration-validation-env.spec.ts
- bnpi-pats-api/tests/enterprise-migration.service.spec.ts
- bnpi-pats-api/tests/enterprise-organization-bootstrap.spec.ts
- bnpi-pats-api/tests/enterprise-stage-package-scripts.spec.ts
- bnpi-pats-api/tests/enterprise-stage-runner.spec.ts
- bnpi-pats-api/tests/hikvision-callback.controller.spec.ts
- bnpi-pats-api/tests/hikvision-dev-watcher-runtime.spec.ts
- bnpi-pats-api/tests/hikvision-device-seed-default.spec.ts
- bnpi-pats-api/tests/hikvision-endpoint-config.spec.ts
- bnpi-pats-api/tests/hikvision-event-contract.helper.spec.ts
- bnpi-pats-api/tests/import-service-contracts.spec.ts
- bnpi-pats-api/tests/leave-session.helper.spec.ts
- bnpi-pats-api/tests/leaveType.controller.spec.ts
- bnpi-pats-api/tests/local-user-account.helper.spec.ts
- bnpi-pats-api/tests/migration-enterprise.zod.spec.ts
- bnpi-pats-api/tests/migration-script-safety.spec.ts
- bnpi-pats-api/tests/migration-service-dry-run.spec.ts
- bnpi-pats-api/tests/mongo-postgres-migration.spec.ts
- bnpi-pats-api/tests/payroll-period-timesheet-lock.spec.ts
- bnpi-pats-api/tests/payslip-pdf.helper.spec.ts
- bnpi-pats-api/tests/prisma-datasource.helper.spec.ts
- bnpi-pats-api/tests/query-builder-search-fields.spec.ts
- bnpi-pats-api/tests/recruitment-runtime.helper.spec.ts
- bnpi-pats-api/tests/request.zod.spec.ts
- bnpi-pats-api/tests/role-derivation.spec.ts
- bnpi-pats-api/tests/schedule-change-hr-approval.spec.ts
- bnpi-pats-api/tests/schedule-normalization.helper.spec.ts
- bnpi-pats-api/tests/section.controller.spec.ts
- bnpi-pats-api/tests/security.middleware.spec.ts
- bnpi-pats-api/tests/seed-and-qa-script-safety.spec.ts
- bnpi-pats-api/tests/service-name-validation.spec.ts
- bnpi-pats-api/tests/timekeeping.helper.spec.ts
- bnpi-pats-api/tests/timesheet-backfill-source-truth.spec.ts
- bnpi-pats-api/tests/timesheet-line-version.helper.spec.ts
- bnpi-pats-api/tests/timesheet-reminder-notification.spec.ts
- bnpi-pats-api/tests/timesheet-schedule-coverage-query.contract.spec.ts
- bnpi-pats-api/tests/timesheet-submit-eligibility.spec.ts
- bnpi-pats-api/tests/workflow-config.helper.spec.ts
- bnpi-pats-api/tests/workforce-recruitment.helper.spec.ts
- bnpi-pats-api/tests/wwg-regression-coverage.spec.ts
- bnpi-pats-api/tests/wwg/app-module-contract.behavior.spec.ts
- bnpi-pats-api/tests/wwg/core-utils.behavior.spec.ts
- bnpi-pats-api/tests/wwg/formdata-validation.behavior.spec.ts
- bnpi-pats-api/tests/wwg/function-coverage.explicit.spec.ts
- bnpi-pats-api/tests/wwg/payroll-attendance.behavior.spec.ts
- bnpi-pats-api/tests/wwg/request-workforce-cache-auth.behavior.spec.ts
- bnpi-pats-api/tests/wwg/tax-timekeeping.behavior.spec.ts
- bnpi-pats-api/tests/wwg/tenant-middleware.behavior.spec.ts
- bnpi-pats-api/tests/zkteco-event-contract.helper.spec.ts
- bnpi-pats-api/tests_legacy/WorkflowInstance.controller.spec.ts
- bnpi-pats-api/tests_legacy/aduittrail.controller.spec.ts
- bnpi-pats-api/tests_legacy/audittrail.controller.spec.ts
- bnpi-pats-api/tests_legacy/calendar.controller.spec.ts
- bnpi-pats-api/tests_legacy/calendarEvent.controller.spec.ts
- bnpi-pats-api/tests_legacy/calendarItem.controller.spec.ts
- bnpi-pats-api/tests_legacy/checklistTemplate.controller.spec.ts
- bnpi-pats-api/tests_legacy/compensationhistory.controller.spec.ts
- bnpi-pats-api/tests_legacy/controllers/applicant.controller.spec.ts
- bnpi-pats-api/tests_legacy/controllers/attendance.controller.spec.ts
- bnpi-pats-api/tests_legacy/controllers/auth.controller.spec.ts
- bnpi-pats-api/tests_legacy/controllers/benefit.controller.spec.ts
- bnpi-pats-api/tests_legacy/controllers/benefitType.controller.spec.ts
- bnpi-pats-api/tests_legacy/controllers/boardingProcess.controller.spec.ts
- bnpi-pats-api/tests_legacy/controllers/boardingTemplate.controller.spec.ts
- bnpi-pats-api/tests_legacy/controllers/calculator.controller.spec.ts
- bnpi-pats-api/tests_legacy/controllers/celebrations.controller.spec.ts
- bnpi-pats-api/tests_legacy/controllers/checklistItem.controller.spec.ts
- bnpi-pats-api/tests_legacy/controllers/dashboard.controller.spec.ts
- bnpi-pats-api/tests_legacy/controllers/department.controller.spec.ts
- bnpi-pats-api/tests_legacy/controllers/device.controller.spec.ts
- bnpi-pats-api/tests_legacy/controllers/document.controller.spec.ts
- bnpi-pats-api/tests_legacy/controllers/employee.controller.spec.ts
- bnpi-pats-api/tests_legacy/controllers/employeeLoan.controller.spec.ts
- bnpi-pats-api/tests_legacy/controllers/employeebenefit.controller.spec.ts
- bnpi-pats-api/tests_legacy/controllers/employeepayroll.controller.spec.ts
- bnpi-pats-api/tests_legacy/controllers/guide.controller.spec.ts
- bnpi-pats-api/tests_legacy/controllers/job.controller.spec.ts
- bnpi-pats-api/tests_legacy/controllers/level.controller.spec.ts
- bnpi-pats-api/tests_legacy/controllers/loanType.controller.spec.ts
- bnpi-pats-api/tests_legacy/controllers/note.controller.spec.ts
- bnpi-pats-api/tests_legacy/controllers/notification.controller.spec.ts
- bnpi-pats-api/tests_legacy/controllers/payrollperiod.controller.spec.ts
- bnpi-pats-api/tests_legacy/controllers/person.controller.spec.ts
- bnpi-pats-api/tests_legacy/controllers/position.controller.spec.ts
- bnpi-pats-api/tests_legacy/controllers/request.controller.spec.ts
- bnpi-pats-api/tests_legacy/controllers/requestTransaction.controller.spec.ts
- bnpi-pats-api/tests_legacy/controllers/rule.controller.spec.ts
- bnpi-pats-api/tests_legacy/controllers/scheduleOverride.controller.spec.ts
- bnpi-pats-api/tests_legacy/controllers/shiftType.controller.spec.ts
- bnpi-pats-api/tests_legacy/controllers/soalineitem.controller.spec.ts
- bnpi-pats-api/tests_legacy/controllers/soaremittance.controller.spec.ts
- bnpi-pats-api/tests_legacy/controllers/statementofaccount.controller.spec.ts
- bnpi-pats-api/tests_legacy/controllers/template.controller.spec.ts
- bnpi-pats-api/tests_legacy/controllers/timesheetline.controller.spec.ts
- bnpi-pats-api/tests_legacy/controllers/workflowEngine.controller.spec.ts
- bnpi-pats-api/tests_legacy/disciplinaryaction.controller.spec.ts
- bnpi-pats-api/tests_legacy/exitInterview.controller.spec.ts
- bnpi-pats-api/tests_legacy/flaky/employee-document-priority.helper.spec.ts
- bnpi-pats-api/tests_legacy/flaky/payslip-pdf.helper.spec.ts
- bnpi-pats-api/tests_legacy/flaky/scheduleOverride.upsert-create.spec.ts
- bnpi-pats-api/tests_legacy/flaky/verifyToken.middleware.spec.ts
- bnpi-pats-api/tests_legacy/holiday.controller.spec.ts
- bnpi-pats-api/tests_legacy/leaveapplication.controller.spec.ts
- bnpi-pats-api/tests_legacy/leavetype.controller.spec.ts
- bnpi-pats-api/tests_legacy/offBoardingChecklist.controller.spec.ts
- bnpi-pats-api/tests_legacy/payrollrecord.controller.spec.ts
- bnpi-pats-api/tests_legacy/performance.controller.spec.ts
- bnpi-pats-api/tests_legacy/performancereview.controller.spec.ts
- bnpi-pats-api/tests_legacy/requestReviewer.controller.spec.ts
- bnpi-pats-api/tests_legacy/requestStepExecution.controller.spec.ts
- bnpi-pats-api/tests_legacy/requestWorkflow.controller.spec.ts
- bnpi-pats-api/tests_legacy/resignation.controller.spec.ts
- bnpi-pats-api/tests_legacy/role.controller.spec.ts
- bnpi-pats-api/tests_legacy/routers/systemProvisioning.router.spec.ts
- bnpi-pats-api/tests_legacy/scheduleTemplate.controller.spec.ts
- bnpi-pats-api/tests_legacy/templateItem.controller.spec.ts
- bnpi-pats-api/tests_legacy/workschedule.controller.spec.ts
- bnpi-pats-api/tests_legacy/yearlyschedule.controller.spec.ts
- bnpi-pats-app/app/components/atoms/CategoricalText.test.tsx
- bnpi-pats-app/app/components/atoms/DataTable.test.tsx
- bnpi-pats-app/app/components/atoms/ProfileInitialsAvatar.test.tsx
- bnpi-pats-app/app/components/atoms/SummaryCard.test.tsx
- bnpi-pats-app/app/components/atoms/TimesheetDayCell.test.tsx
- bnpi-pats-app/app/components/atoms/index.test.ts
- bnpi-pats-app/app/components/dashboards/shared/role-dashboard-shell.test.tsx
- bnpi-pats-app/app/components/dashboards/shared/role-dashboard.config.test.ts
- bnpi-pats-app/app/components/modals/JobRequisitionRequestModal.test.tsx
- bnpi-pats-app/app/components/molecules/EmployeeTableCell.test.tsx
- bnpi-pats-app/app/components/molecules/TimesheetCalendar.test.tsx
- bnpi-pats-app/app/components/molecules/TimesheetCalendarApproval.test.tsx
- bnpi-pats-app/app/components/molecules/TimesheetDayTooltipContent.test.tsx
- bnpi-pats-app/app/components/molecules/TimesheetEmployeeCard.test.tsx
- bnpi-pats-app/app/components/molecules/TimesheetHoursOverview.test.tsx
- bnpi-pats-app/app/components/molecules/employee/EmploymentCompensationForm.test.tsx
- bnpi-pats-app/app/components/organisms/TimesheetViewModal.test.tsx
- bnpi-pats-app/app/components/organisms/hr/AttendanceFixModal.test.tsx
- bnpi-pats-app/app/components/organisms/job-details-modal.test.tsx
- bnpi-pats-app/app/components/organisms/job-lists.test.tsx
- bnpi-pats-app/app/components/organisms/settings/WorkforceRecruitmentSettingsModule.test.tsx
- bnpi-pats-app/app/components/shared/EmployeeList.test.tsx
- bnpi-pats-app/app/components/templates/common/AttendanceDailyTrendSection.test.tsx
- bnpi-pats-app/app/components/templates/common/attendance-management-template.test.tsx
- bnpi-pats-app/app/components/templates/common/payroll-periods-template.test.tsx
- bnpi-pats-app/app/components/templates/hr/benefit-types-template.test.tsx
- bnpi-pats-app/app/lib/admin-migration-ui.test.ts
- bnpi-pats-app/app/lib/api-client.test.ts
- bnpi-pats-app/app/lib/api-url.helper.test.ts
- bnpi-pats-app/app/lib/attendance-import-ui.test.ts
- bnpi-pats-app/app/lib/ci-cd-quality-gates.test.ts
- bnpi-pats-app/app/lib/data-table-state.test.ts
- bnpi-pats-app/app/lib/device-events-page-contract.test.ts
- bnpi-pats-app/app/lib/device-events-realtime-ui.test.ts
- bnpi-pats-app/app/lib/hooks/useAttendances.test.tsx
- bnpi-pats-app/app/lib/hooks/useMetrics.test.tsx
- bnpi-pats-app/app/lib/hooks/useTeamAttendance.test.tsx
- bnpi-pats-app/app/lib/hooks/useTimesheets.test.tsx
- bnpi-pats-app/app/lib/import-progress-ui.test.ts
- bnpi-pats-app/app/lib/repository-hygiene.test.ts
- bnpi-pats-app/app/lib/runtime-api-base.test.ts
- bnpi-pats-app/app/lib/test-obligation-policy.test.ts
- bnpi-pats-app/app/lib/upload-url.test.ts
- bnpi-pats-app/app/lib/utils/__tests__/report-scope.test.ts
- bnpi-pats-app/app/lib/utils/__tests__/role-redirect.test.ts
- bnpi-pats-app/app/lib/utils/attendance-threshold.test.ts
- bnpi-pats-app/app/lib/utils/default-employee-password.test.ts
- bnpi-pats-app/app/lib/utils/employee-form-draft-idb.test.ts
- bnpi-pats-app/app/lib/utils/employee-import-preview-validation.test.ts
- bnpi-pats-app/app/lib/utils/manpower-distribution-links.test.ts
- bnpi-pats-app/app/lib/utils/report-export.test.ts
- bnpi-pats-app/app/lib/utils/role-derivation.test.ts
- bnpi-pats-app/app/lib/workforce-recruitment-coverage.test.ts
- bnpi-pats-app/app/routes.test.ts
- bnpi-pats-app/app/routes/admin/configuration/admin-categorical-fields.test.tsx
- bnpi-pats-app/app/routes/admin/configuration/attendance.import-route.test.ts
- bnpi-pats-app/app/routes/admin/configuration/attendance.test.tsx
- bnpi-pats-app/app/routes/admin/configuration/calendar-items.test.tsx
- bnpi-pats-app/app/routes/admin/configuration/departments.test.tsx
- bnpi-pats-app/app/routes/admin/configuration/holidays.test.tsx
- bnpi-pats-app/app/routes/admin/configuration/leave-types.test.tsx
- bnpi-pats-app/app/routes/admin/configuration/levels.test.tsx
- bnpi-pats-app/app/routes/admin/configuration/loan-types.test.tsx
- bnpi-pats-app/app/routes/admin/configuration/migration.import-route.test.ts
- bnpi-pats-app/app/routes/admin/configuration/positions.test.tsx
- bnpi-pats-app/app/routes/admin/configuration/schedule-templates.test.tsx
- bnpi-pats-app/app/routes/admin/configuration/sections.test.tsx
- bnpi-pats-app/app/routes/admin/configuration/users.test.tsx
- bnpi-pats-app/app/routes/admin/configuration/workflows.test.tsx
- bnpi-pats-app/app/routes/admin/devices/device-user-ui-contract.test.ts
- bnpi-pats-app/app/routes/employee/dashboard/TimesheetsTab.test.tsx
- bnpi-pats-app/app/routes/hr/reports/tabs/AttendanceDailyTrendTab.test.tsx
- bnpi-pats-app/app/routes/hr/settings/documents.test.tsx
- bnpi-pats-app/app/routes/hr/time-corrections.test.ts
- bnpi-pats-app/app/services/api-service.test.ts
- bnpi-pats-app/app/services/attendance.service.test.ts
- bnpi-pats-app/app/services/auth-service.test.ts
- bnpi-pats-app/app/services/employee-payroll.service.test.ts
- bnpi-pats-app/app/services/employees.service.test.ts
- bnpi-pats-app/app/services/metrics.service.test.ts
- bnpi-pats-app/app/services/requests.service.test.ts
- bnpi-pats-app/app/services/timesheet.service.test.ts
- bnpi-pats-app/app/services/timesheetline.service.test.ts
- bnpi-pats-app/scripts/check-test-obligations.test.ts
- bnpi-pats-app/tests/dm4-fresh-db-migration.e2e.spec.ts
- bnpi-pats-app/tests/document-onboarding-real-scenario.spec.ts
- bnpi-pats-app/tests/hr-tickets-accordion.spec.ts
- bnpi-pats-app/tests/perf/hr-attendance.spec.ts
- bnpi-pats-app/tests/smoke/admin-config-departments.spec.ts
- bnpi-pats-app/tests/smoke/admin-device-events-sync-modal.spec.ts
- bnpi-pats-app/tests/smoke/admin-device-sync-review.spec.ts
- bnpi-pats-app/tests/smoke/hr-recruitment-jobs-manager.spec.ts
- bnpi-pats-app/tests/smoke/project-truth-devcurrent-vbox-login.spec.ts
- bnpi-pats-app/tests/smoke/public-jobs-flow.spec.ts
- bnpi-pats-app/tests/unreachable-routes.test.ts
- bnpi-pats-app/tests/unused-routes.test.ts

## Missing Tests

- Expected behavior tests are not satisfied by the detected weak/static tests.

## Weak Tests

- bnpi-pats-api/tests/attendance-action.helper.spec.ts: appears to check file existence, static structure, static copy, or build smoke without behavior assertions.
- bnpi-pats-api/tests/db/schema-source-truth.contract.spec.ts: appears to check file existence, static structure, static copy, or build smoke without behavior assertions.
- bnpi-pats-api/tests/device-user-api-contract.spec.ts: appears to check file existence, static structure, static copy, or build smoke without behavior assertions.
- bnpi-pats-api/tests/employee-organization-reporting-query.contract.spec.ts: appears to check file existence, static structure, static copy, or build smoke without behavior assertions.
- bnpi-pats-api/tests/hikvision-dev-watcher-runtime.spec.ts: appears to check file existence, static structure, static copy, or build smoke without behavior assertions.
- bnpi-pats-api/tests/timesheet-line-version.helper.spec.ts: appears to check file existence, static structure, static copy, or build smoke without behavior assertions.
- Recent reports mention smoke/static/file-existence testing while behavior changed.

## Regression Coverage Needed

- None.

## Test Plan

- Behavior changed:
  - Cart behavior
  - Onboarding behavior
  - Dashboard metrics
  - Auth/security
  - Persistence
  - Parsing/validation
  - API/client integration seam
  - Bug fix
- Unit tests added/updated:
  - .runtime/upstream-bnpi-pats-app-current-files/app/components/atoms/DataTable.test.tsx
  - .runtime/upstream-bnpi-pats-app-current-files/app/routes/employee/dashboard/TimesheetsTab.test.tsx
  - bnpi-pats-api/tests/attendance-action.helper.spec.ts
  - bnpi-pats-api/tests/attendance-backfill.service.spec.ts
  - bnpi-pats-api/tests/attendance-correction.service.spec.ts
  - bnpi-pats-api/tests/attendance-obligation.helper.spec.ts
  - bnpi-pats-api/tests/attendance-realtime.helper.spec.ts
  - bnpi-pats-api/tests/attendance-status-migration.spec.ts
  - bnpi-pats-api/tests/auditLogger.spec.ts
  - bnpi-pats-api/tests/auth-login-identifier.spec.ts
  - bnpi-pats-api/tests/bulk-password.helper.spec.ts
  - bnpi-pats-api/tests/cors-origin.contract.spec.ts
  - bnpi-pats-api/tests/database-backup.helper.spec.ts
  - bnpi-pats-api/tests/db/isolated-db-fault.guard.spec.ts
  - bnpi-pats-api/tests/db/isolated-db-faults.spec.ts
  - bnpi-pats-api/tests/db/isolated-prisma.integration.spec.ts
  - bnpi-pats-api/tests/db/schema-source-truth.contract.spec.ts
  - bnpi-pats-api/tests/device-event-realtime.helper.spec.ts
  - bnpi-pats-api/tests/device-health-zkteco.spec.ts
  - bnpi-pats-api/tests/device-user-api-contract.spec.ts
  - bnpi-pats-api/tests/device-user-event-resolver.spec.ts
  - bnpi-pats-api/tests/device-user-sync.helper.spec.ts
  - bnpi-pats-api/tests/dm3-attendance-obligation-repair.helper.spec.ts
  - bnpi-pats-api/tests/dm4-biometric-proof.spec.ts
  - bnpi-pats-api/tests/document-field-validation.helper.spec.ts
  - bnpi-pats-api/tests/employee-action-block.helper.spec.ts
  - bnpi-pats-api/tests/employee-helper-credentials.spec.ts
  - bnpi-pats-api/tests/employee-import.helper.spec.ts
  - bnpi-pats-api/tests/employee-organization-reporting-query.contract.spec.ts
  - bnpi-pats-api/tests/employee-schedule.helper.spec.ts
  - bnpi-pats-api/tests/employeepayroll.snapshot-lock.contract.spec.ts
  - bnpi-pats-api/tests/enterprise-csv-loader.spec.ts
  - bnpi-pats-api/tests/enterprise-csv-sample-pack.spec.ts
  - bnpi-pats-api/tests/enterprise-migration-dm-masterlist.spec.ts
  - bnpi-pats-api/tests/enterprise-migration-dm-report.spec.ts
  - bnpi-pats-api/tests/enterprise-migration-runner-env.spec.ts
  - bnpi-pats-api/tests/enterprise-migration-timesheet-quality.spec.ts
  - bnpi-pats-api/tests/enterprise-migration-validation-env.spec.ts
  - bnpi-pats-api/tests/enterprise-migration.service.spec.ts
  - bnpi-pats-api/tests/enterprise-organization-bootstrap.spec.ts
  - bnpi-pats-api/tests/enterprise-stage-package-scripts.spec.ts
  - bnpi-pats-api/tests/enterprise-stage-runner.spec.ts
  - bnpi-pats-api/tests/hikvision-callback.controller.spec.ts
  - bnpi-pats-api/tests/hikvision-dev-watcher-runtime.spec.ts
  - bnpi-pats-api/tests/hikvision-device-seed-default.spec.ts
  - bnpi-pats-api/tests/hikvision-endpoint-config.spec.ts
  - bnpi-pats-api/tests/hikvision-event-contract.helper.spec.ts
  - bnpi-pats-api/tests/import-service-contracts.spec.ts
  - bnpi-pats-api/tests/leave-session.helper.spec.ts
  - bnpi-pats-api/tests/leaveType.controller.spec.ts
  - bnpi-pats-api/tests/local-user-account.helper.spec.ts
  - bnpi-pats-api/tests/migration-enterprise.zod.spec.ts
  - bnpi-pats-api/tests/migration-script-safety.spec.ts
  - bnpi-pats-api/tests/migration-service-dry-run.spec.ts
  - bnpi-pats-api/tests/mongo-postgres-migration.spec.ts
  - bnpi-pats-api/tests/payroll-period-timesheet-lock.spec.ts
  - bnpi-pats-api/tests/payslip-pdf.helper.spec.ts
  - bnpi-pats-api/tests/prisma-datasource.helper.spec.ts
  - bnpi-pats-api/tests/query-builder-search-fields.spec.ts
  - bnpi-pats-api/tests/recruitment-runtime.helper.spec.ts
  - bnpi-pats-api/tests/request.zod.spec.ts
  - bnpi-pats-api/tests/role-derivation.spec.ts
  - bnpi-pats-api/tests/schedule-change-hr-approval.spec.ts
  - bnpi-pats-api/tests/schedule-normalization.helper.spec.ts
  - bnpi-pats-api/tests/section.controller.spec.ts
  - bnpi-pats-api/tests/security.middleware.spec.ts
  - bnpi-pats-api/tests/seed-and-qa-script-safety.spec.ts
  - bnpi-pats-api/tests/service-name-validation.spec.ts
  - bnpi-pats-api/tests/timekeeping.helper.spec.ts
  - bnpi-pats-api/tests/timesheet-backfill-source-truth.spec.ts
  - bnpi-pats-api/tests/timesheet-line-version.helper.spec.ts
  - bnpi-pats-api/tests/timesheet-reminder-notification.spec.ts
  - bnpi-pats-api/tests/timesheet-schedule-coverage-query.contract.spec.ts
  - bnpi-pats-api/tests/timesheet-submit-eligibility.spec.ts
  - bnpi-pats-api/tests/workflow-config.helper.spec.ts
  - bnpi-pats-api/tests/workforce-recruitment.helper.spec.ts
  - bnpi-pats-api/tests/wwg-regression-coverage.spec.ts
  - bnpi-pats-api/tests/wwg/app-module-contract.behavior.spec.ts
  - bnpi-pats-api/tests/wwg/core-utils.behavior.spec.ts
  - bnpi-pats-api/tests/wwg/formdata-validation.behavior.spec.ts
  - bnpi-pats-api/tests/wwg/function-coverage.explicit.spec.ts
  - bnpi-pats-api/tests/wwg/payroll-attendance.behavior.spec.ts
  - bnpi-pats-api/tests/wwg/request-workforce-cache-auth.behavior.spec.ts
  - bnpi-pats-api/tests/wwg/tax-timekeeping.behavior.spec.ts
  - bnpi-pats-api/tests/wwg/tenant-middleware.behavior.spec.ts
  - bnpi-pats-api/tests/zkteco-event-contract.helper.spec.ts
  - bnpi-pats-api/tests_legacy/WorkflowInstance.controller.spec.ts
  - bnpi-pats-api/tests_legacy/aduittrail.controller.spec.ts
  - bnpi-pats-api/tests_legacy/audittrail.controller.spec.ts
  - bnpi-pats-api/tests_legacy/calendar.controller.spec.ts
  - bnpi-pats-api/tests_legacy/calendarEvent.controller.spec.ts
  - bnpi-pats-api/tests_legacy/calendarItem.controller.spec.ts
  - bnpi-pats-api/tests_legacy/checklistTemplate.controller.spec.ts
  - bnpi-pats-api/tests_legacy/compensationhistory.controller.spec.ts
  - bnpi-pats-api/tests_legacy/controllers/applicant.controller.spec.ts
  - bnpi-pats-api/tests_legacy/controllers/attendance.controller.spec.ts
  - bnpi-pats-api/tests_legacy/controllers/auth.controller.spec.ts
  - bnpi-pats-api/tests_legacy/controllers/benefit.controller.spec.ts
  - bnpi-pats-api/tests_legacy/controllers/benefitType.controller.spec.ts
  - bnpi-pats-api/tests_legacy/controllers/boardingProcess.controller.spec.ts
  - bnpi-pats-api/tests_legacy/controllers/boardingTemplate.controller.spec.ts
  - bnpi-pats-api/tests_legacy/controllers/calculator.controller.spec.ts
  - bnpi-pats-api/tests_legacy/controllers/celebrations.controller.spec.ts
  - bnpi-pats-api/tests_legacy/controllers/checklistItem.controller.spec.ts
  - bnpi-pats-api/tests_legacy/controllers/dashboard.controller.spec.ts
  - bnpi-pats-api/tests_legacy/controllers/department.controller.spec.ts
  - bnpi-pats-api/tests_legacy/controllers/device.controller.spec.ts
  - bnpi-pats-api/tests_legacy/controllers/document.controller.spec.ts
  - bnpi-pats-api/tests_legacy/controllers/employee.controller.spec.ts
  - bnpi-pats-api/tests_legacy/controllers/employeeLoan.controller.spec.ts
  - bnpi-pats-api/tests_legacy/controllers/employeebenefit.controller.spec.ts
  - bnpi-pats-api/tests_legacy/controllers/employeepayroll.controller.spec.ts
  - bnpi-pats-api/tests_legacy/controllers/guide.controller.spec.ts
  - bnpi-pats-api/tests_legacy/controllers/job.controller.spec.ts
  - bnpi-pats-api/tests_legacy/controllers/level.controller.spec.ts
  - bnpi-pats-api/tests_legacy/controllers/loanType.controller.spec.ts
  - bnpi-pats-api/tests_legacy/controllers/note.controller.spec.ts
  - bnpi-pats-api/tests_legacy/controllers/notification.controller.spec.ts
  - bnpi-pats-api/tests_legacy/controllers/payrollperiod.controller.spec.ts
  - bnpi-pats-api/tests_legacy/controllers/person.controller.spec.ts
  - bnpi-pats-api/tests_legacy/controllers/position.controller.spec.ts
  - bnpi-pats-api/tests_legacy/controllers/request.controller.spec.ts
  - bnpi-pats-api/tests_legacy/controllers/requestTransaction.controller.spec.ts
  - bnpi-pats-api/tests_legacy/controllers/rule.controller.spec.ts
  - bnpi-pats-api/tests_legacy/controllers/scheduleOverride.controller.spec.ts
  - bnpi-pats-api/tests_legacy/controllers/shiftType.controller.spec.ts
  - bnpi-pats-api/tests_legacy/controllers/soalineitem.controller.spec.ts
  - bnpi-pats-api/tests_legacy/controllers/soaremittance.controller.spec.ts
  - bnpi-pats-api/tests_legacy/controllers/statementofaccount.controller.spec.ts
  - bnpi-pats-api/tests_legacy/controllers/template.controller.spec.ts
  - bnpi-pats-api/tests_legacy/controllers/timesheetline.controller.spec.ts
  - bnpi-pats-api/tests_legacy/controllers/workflowEngine.controller.spec.ts
  - bnpi-pats-api/tests_legacy/disciplinaryaction.controller.spec.ts
  - bnpi-pats-api/tests_legacy/exitInterview.controller.spec.ts
  - bnpi-pats-api/tests_legacy/flaky/employee-document-priority.helper.spec.ts
  - bnpi-pats-api/tests_legacy/flaky/payslip-pdf.helper.spec.ts
  - bnpi-pats-api/tests_legacy/flaky/scheduleOverride.upsert-create.spec.ts
  - bnpi-pats-api/tests_legacy/flaky/verifyToken.middleware.spec.ts
  - bnpi-pats-api/tests_legacy/holiday.controller.spec.ts
  - bnpi-pats-api/tests_legacy/leaveapplication.controller.spec.ts
  - bnpi-pats-api/tests_legacy/leavetype.controller.spec.ts
  - bnpi-pats-api/tests_legacy/offBoardingChecklist.controller.spec.ts
  - bnpi-pats-api/tests_legacy/payrollrecord.controller.spec.ts
  - bnpi-pats-api/tests_legacy/performance.controller.spec.ts
  - bnpi-pats-api/tests_legacy/performancereview.controller.spec.ts
  - bnpi-pats-api/tests_legacy/requestReviewer.controller.spec.ts
  - bnpi-pats-api/tests_legacy/requestStepExecution.controller.spec.ts
  - bnpi-pats-api/tests_legacy/requestWorkflow.controller.spec.ts
  - bnpi-pats-api/tests_legacy/resignation.controller.spec.ts
  - bnpi-pats-api/tests_legacy/role.controller.spec.ts
  - bnpi-pats-api/tests_legacy/routers/systemProvisioning.router.spec.ts
  - bnpi-pats-api/tests_legacy/scheduleTemplate.controller.spec.ts
  - bnpi-pats-api/tests_legacy/templateItem.controller.spec.ts
  - bnpi-pats-api/tests_legacy/workschedule.controller.spec.ts
  - bnpi-pats-api/tests_legacy/yearlyschedule.controller.spec.ts
  - bnpi-pats-app/app/components/atoms/CategoricalText.test.tsx
  - bnpi-pats-app/app/components/atoms/DataTable.test.tsx
  - bnpi-pats-app/app/components/atoms/ProfileInitialsAvatar.test.tsx
  - bnpi-pats-app/app/components/atoms/SummaryCard.test.tsx
  - bnpi-pats-app/app/components/atoms/TimesheetDayCell.test.tsx
  - bnpi-pats-app/app/components/atoms/index.test.ts
  - bnpi-pats-app/app/components/dashboards/shared/role-dashboard-shell.test.tsx
  - bnpi-pats-app/app/components/dashboards/shared/role-dashboard.config.test.ts
  - bnpi-pats-app/app/components/modals/JobRequisitionRequestModal.test.tsx
  - bnpi-pats-app/app/components/molecules/EmployeeTableCell.test.tsx
  - bnpi-pats-app/app/components/molecules/TimesheetCalendar.test.tsx
  - bnpi-pats-app/app/components/molecules/TimesheetCalendarApproval.test.tsx
  - bnpi-pats-app/app/components/molecules/TimesheetDayTooltipContent.test.tsx
  - bnpi-pats-app/app/components/molecules/TimesheetEmployeeCard.test.tsx
  - bnpi-pats-app/app/components/molecules/TimesheetHoursOverview.test.tsx
  - bnpi-pats-app/app/components/molecules/employee/EmploymentCompensationForm.test.tsx
  - bnpi-pats-app/app/components/organisms/TimesheetViewModal.test.tsx
  - bnpi-pats-app/app/components/organisms/hr/AttendanceFixModal.test.tsx
  - bnpi-pats-app/app/components/organisms/job-details-modal.test.tsx
  - bnpi-pats-app/app/components/organisms/job-lists.test.tsx
  - bnpi-pats-app/app/components/organisms/settings/WorkforceRecruitmentSettingsModule.test.tsx
  - bnpi-pats-app/app/components/shared/EmployeeList.test.tsx
  - bnpi-pats-app/app/components/templates/common/AttendanceDailyTrendSection.test.tsx
  - bnpi-pats-app/app/components/templates/common/attendance-management-template.test.tsx
  - bnpi-pats-app/app/components/templates/common/payroll-periods-template.test.tsx
  - bnpi-pats-app/app/components/templates/hr/benefit-types-template.test.tsx
  - bnpi-pats-app/app/lib/admin-migration-ui.test.ts
  - bnpi-pats-app/app/lib/api-client.test.ts
  - bnpi-pats-app/app/lib/api-url.helper.test.ts
  - bnpi-pats-app/app/lib/attendance-import-ui.test.ts
  - bnpi-pats-app/app/lib/ci-cd-quality-gates.test.ts
  - bnpi-pats-app/app/lib/data-table-state.test.ts
  - bnpi-pats-app/app/lib/device-events-page-contract.test.ts
  - bnpi-pats-app/app/lib/device-events-realtime-ui.test.ts
  - bnpi-pats-app/app/lib/hooks/useAttendances.test.tsx
  - bnpi-pats-app/app/lib/hooks/useMetrics.test.tsx
  - bnpi-pats-app/app/lib/hooks/useTeamAttendance.test.tsx
  - bnpi-pats-app/app/lib/hooks/useTimesheets.test.tsx
  - bnpi-pats-app/app/lib/import-progress-ui.test.ts
  - bnpi-pats-app/app/lib/repository-hygiene.test.ts
  - bnpi-pats-app/app/lib/runtime-api-base.test.ts
  - bnpi-pats-app/app/lib/test-obligation-policy.test.ts
  - bnpi-pats-app/app/lib/upload-url.test.ts
  - bnpi-pats-app/app/lib/utils/__tests__/report-scope.test.ts
  - bnpi-pats-app/app/lib/utils/__tests__/role-redirect.test.ts
  - bnpi-pats-app/app/lib/utils/attendance-threshold.test.ts
  - bnpi-pats-app/app/lib/utils/default-employee-password.test.ts
  - bnpi-pats-app/app/lib/utils/employee-form-draft-idb.test.ts
  - bnpi-pats-app/app/lib/utils/employee-import-preview-validation.test.ts
  - bnpi-pats-app/app/lib/utils/manpower-distribution-links.test.ts
  - bnpi-pats-app/app/lib/utils/report-export.test.ts
  - bnpi-pats-app/app/lib/utils/role-derivation.test.ts
  - bnpi-pats-app/app/lib/workforce-recruitment-coverage.test.ts
  - bnpi-pats-app/app/routes.test.ts
  - bnpi-pats-app/app/routes/admin/configuration/admin-categorical-fields.test.tsx
  - bnpi-pats-app/app/routes/admin/configuration/attendance.import-route.test.ts
  - bnpi-pats-app/app/routes/admin/configuration/attendance.test.tsx
  - bnpi-pats-app/app/routes/admin/configuration/calendar-items.test.tsx
  - bnpi-pats-app/app/routes/admin/configuration/departments.test.tsx
  - bnpi-pats-app/app/routes/admin/configuration/holidays.test.tsx
  - bnpi-pats-app/app/routes/admin/configuration/leave-types.test.tsx
  - bnpi-pats-app/app/routes/admin/configuration/levels.test.tsx
  - bnpi-pats-app/app/routes/admin/configuration/loan-types.test.tsx
  - bnpi-pats-app/app/routes/admin/configuration/migration.import-route.test.ts
  - bnpi-pats-app/app/routes/admin/configuration/positions.test.tsx
  - bnpi-pats-app/app/routes/admin/configuration/schedule-templates.test.tsx
  - bnpi-pats-app/app/routes/admin/configuration/sections.test.tsx
  - bnpi-pats-app/app/routes/admin/configuration/users.test.tsx
  - bnpi-pats-app/app/routes/admin/configuration/workflows.test.tsx
  - bnpi-pats-app/app/routes/admin/devices/device-user-ui-contract.test.ts
  - bnpi-pats-app/app/routes/employee/dashboard/TimesheetsTab.test.tsx
  - bnpi-pats-app/app/routes/hr/reports/tabs/AttendanceDailyTrendTab.test.tsx
  - bnpi-pats-app/app/routes/hr/settings/documents.test.tsx
  - bnpi-pats-app/app/routes/hr/time-corrections.test.ts
  - bnpi-pats-app/app/services/api-service.test.ts
  - bnpi-pats-app/app/services/attendance.service.test.ts
  - bnpi-pats-app/app/services/auth-service.test.ts
  - bnpi-pats-app/app/services/employee-payroll.service.test.ts
  - bnpi-pats-app/app/services/employees.service.test.ts
  - bnpi-pats-app/app/services/metrics.service.test.ts
  - bnpi-pats-app/app/services/requests.service.test.ts
  - bnpi-pats-app/app/services/timesheet.service.test.ts
  - bnpi-pats-app/app/services/timesheetline.service.test.ts
  - bnpi-pats-app/scripts/check-test-obligations.test.ts
  - bnpi-pats-app/tests/dm4-fresh-db-migration.e2e.spec.ts
  - bnpi-pats-app/tests/document-onboarding-real-scenario.spec.ts
  - bnpi-pats-app/tests/hr-tickets-accordion.spec.ts
  - bnpi-pats-app/tests/perf/hr-attendance.spec.ts
  - bnpi-pats-app/tests/smoke/admin-config-departments.spec.ts
  - bnpi-pats-app/tests/smoke/admin-device-events-sync-modal.spec.ts
  - bnpi-pats-app/tests/smoke/admin-device-sync-review.spec.ts
  - bnpi-pats-app/tests/smoke/hr-recruitment-jobs-manager.spec.ts
  - bnpi-pats-app/tests/smoke/project-truth-devcurrent-vbox-login.spec.ts
  - bnpi-pats-app/tests/smoke/public-jobs-flow.spec.ts
  - bnpi-pats-app/tests/unreachable-routes.test.ts
  - bnpi-pats-app/tests/unused-routes.test.ts
- Regression tests added/updated:
  - bnpi-pats-api/tests/auth-login-identifier.spec.ts
  - bnpi-pats-api/tests/wwg-regression-coverage.spec.ts
  - bnpi-pats-api/tests/wwg/request-workforce-cache-auth.behavior.spec.ts
  - bnpi-pats-api/tests_legacy/controllers/auth.controller.spec.ts
  - bnpi-pats-app/app/services/auth-service.test.ts
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
