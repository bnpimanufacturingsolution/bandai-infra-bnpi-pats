# Function Test Coverage Report

- Minimum test cases per exported function: 5
- Total exported functions scanned: 545
- Passing functions: 508
- Failing functions: 37

## Failing Functions

| Function | Source File | Test Files Matched | Test Cases Count |
|---|---|---:|---:|
| sectionModule | app/section/index.ts | 0 | 0 |
| resolveMigrationDm4SourceFiles | app/migration/migration-dry-run.service.ts | 0 | 0 |
| getMigrationStepRegistry | app/migration/migration-step-registry.ts | 0 | 0 |
| getMigrationStepPlan | app/migration/migration-step-registry.ts | 0 | 0 |
| leaveTypeModule | app/leaveType/index.ts | 0 | 0 |
| resolveLocalLoginUserByIdentifier | app/auth/auth.controller.ts | 1 | 4 |
| ensureDefaultLeaveTypes | helper/leave-policy.helper.ts | 0 | 0 |
| repairSeededDefaultLeaveTypePolicies | helper/leave-policy.helper.ts | 0 | 0 |
| removeSeededDefaultLeaveTypes | helper/leave-policy.helper.ts | 0 | 0 |
| selfRepairLeaveTypePoliciesFromLegacyConfig | helper/leave-policy.helper.ts | 0 | 0 |
| getExistingLeavePolicies | helper/leave-policy.helper.ts | 0 | 0 |
| isValidEmailAddress | helper/local-user-account.helper.ts | 0 | 0 |
| sanitizeUserNameSegment | helper/local-user-account.helper.ts | 0 | 0 |
| buildSafeUserName | helper/local-user-account.helper.ts | 1 | 2 |
| resolveMigrationDefaultPassword | helper/local-user-account.helper.ts | 1 | 2 |
| ensureLocalUserAccount | helper/local-user-account.helper.ts | 1 | 2 |
| publishTimesheetReminderNotification | helper/notification-dispatch.helper.ts | 1 | 2 |
| ensureUnlockedWorkbook | helper/payroll-reconciliation.helper.ts | 0 | 0 |
| parseBandaiPayrollWorkbook | helper/payroll-reconciliation.helper.ts | 0 | 0 |
| writeWorkbookPreviewMarkdown | helper/payroll-reconciliation.helper.ts | 0 | 0 |
| writeComparisonMarkdown | helper/payroll-reconciliation.helper.ts | 0 | 0 |
| writeJson | helper/payroll-reconciliation.helper.ts | 0 | 0 |
| writeText | helper/payroll-reconciliation.helper.ts | 0 | 0 |
| writeComparisonCsv | helper/payroll-reconciliation.helper.ts | 0 | 0 |
| isScheduleChangeRequestType | helper/schedule-change-workflow.helper.ts | 0 | 0 |
| isScheduleChangeWorkflowCode | helper/schedule-change-workflow.helper.ts | 0 | 0 |
| hasScheduleChangeWorkflowStepDrift | helper/schedule-change-workflow.helper.ts | 0 | 0 |
| calculateShiftHourFromSlots | helper/schedule-normalization.helper.ts | 1 | 3 |
| calculateShiftHour | helper/schedule-normalization.helper.ts | 1 | 3 |
| normalizeTemplatePatternDay | helper/schedule-normalization.helper.ts | 0 | 0 |
| calculateScheduleTemplateTotals | helper/schedule-normalization.helper.ts | 0 | 0 |
| normalizeShiftTypeTotals | helper/schedule-normalization.helper.ts | 0 | 0 |
| normalizeScheduleTemplateTotals | helper/schedule-normalization.helper.ts | 0 | 0 |
| normalizeTimesheetRulesConfig | helper/timesheet-config.helper.ts | 0 | 0 |
| mergeTimesheetConfigRules | helper/timesheet-config.helper.ts | 0 | 0 |
| apiDebugLoggingMiddleware | middleware/apiDebugLogging.ts | 0 | 0 |
| runWithDbRequestContext | config/database.ts | 0 | 0 |

## WWG Truth Synchronization

- Task mode: test-governance
- New truth detected: NO
- Wiki updated: NO / N/A
- Workspace updated: NO / N/A
- Governance review completed: YES
- Drift status: LOW
- Canonical files changed:
  - None by this report.
- Implementation discoveries synced:
  - Function-level coverage evidence recorded in this report.
- Remaining stale context:
  - Functions below threshold require additional tests or explicit owner waiver.
