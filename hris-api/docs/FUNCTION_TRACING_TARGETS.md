# Function Tracing Targets

Use `@Trace` or `traceAsync()` on these paths first. Do not try to trace every method in the app; start with the functions that are most likely to hang, fail, or dominate latency.

## API Targets

Priority 1:

- [hris-api/app/auth/auth.controller.ts](/C:/uzaro/bandai-infra/hris-api/app/auth/auth.controller.ts)
  - `login`
  - `ssoLogin`
  - `getCurrentUser`
  - `validateHandoffToken`
  - `register`
  - `updatePassword`
- [hris-api/app/employee/employee.controller.ts](/C:/uzaro/bandai-infra/hris-api/app/employee/employee.controller.ts)
  - `getEmployees`
  - `getEmployeeById`
  - `createEmployee`
  - `createEmployeeWithAccount`
  - `updateEmployee`
  - `getTeamScheduleCalendar`
  - `createTeamScheduleCollection`
  - `applyTeamScheduleRotation`
  - `overrideTeamScheduleLedger`
- [hris-api/app/request/request.controller.ts](/C:/uzaro/bandai-infra/hris-api/app/request/request.controller.ts)
  - `getRequests`
  - `getRequestById`
  - `createRequest`
  - `updateRequest`
  - `approveRequest`
  - `cancelRequest`
  - `generateDocument`
  - `delegateStepToSupervisor`
  - `escalateToSupervisor`
  - `startOffboarding`

Priority 2:

- [hris-api/app/attendance/attendance-import.service.ts](/C:/uzaro/bandai-infra/hris-api/app/attendance/attendance-import.service.ts)
  - `createImportJob`
  - `updateJobProgress`
  - `importAttendanceRecord`
  - `getOvertimeFlagThresholdMinutes`
- [hris-api/app/payrollperiod/payroll-generation-job.service.ts](/C:/uzaro/bandai-infra/hris-api/app/payrollperiod/payroll-generation-job.service.ts)
  - `createJob`
  - `updateJob`
  - `getActiveJobForPeriod`
  - `requestStop`
  - `requestPause`
  - `markCompleted`
  - `markFailed`
- [hris-api/app/systemProvisioning/systemProvisioning.service.ts](/C:/uzaro/bandai-infra/hris-api/app/systemProvisioning/systemProvisioning.service.ts)
  - `getStatus`
  - `bootstrapAdmin`
  - `initialize`
  - `updateHrSettings`
  - `updateTimesheetSettings`
  - `updatePayrollSettings`
  - `updateLeaveSettings`
  - `activate`
- [hris-api/app/migration/migration-orchestrator.service.ts](/C:/uzaro/bandai-infra/hris-api/app/migration/migration-orchestrator.service.ts)
  - `run`
  - `runDryRun`
  - `reconcile`
  - `validate`

## App Targets

Priority 1:

- [hris-app/app/services/auth-service.ts](/C:/uzaro/bandai-infra/hris-app/app/services/auth-service.ts)
  - `login`
  - `ssoLogin`
  - `logout`
  - `getCurrentUser`
  - `validateHandoffToken`
  - `register`
  - `updatePassword`
- [hris-app/app/services/requests.service.ts](/C:/uzaro/bandai-infra/hris-app/app/services/requests.service.ts)
  - `getRequests`
  - `getRequestById`
  - `createRequest`
  - `updateRequest`
  - `approveRequest`
  - `cancelRequest`
  - `generateDocument`
  - `delegateStepToSupervisor`
  - `escalateToSupervisor`
  - `startOffboarding`
- [hris-app/app/services/employees.service.ts](/C:/uzaro/bandai-infra/hris-app/app/services/employees.service.ts)
  - `getEmployees`
  - `getEmployeeById`
  - `createEmployee`
  - `createEmployeeWithAccount`
  - `updateEmployee`
  - `getTeamScheduleCalendar`
  - `createTeamScheduleCollection`
  - `applyTeamScheduleRotation`
  - `overrideTeamScheduleLedger`

Priority 2:

- [hris-app/app/services/attendance.service.ts](/C:/uzaro/bandai-infra/hris-app/app/services/attendance.service.ts)
  - `getAttendances`
  - `createAttendanceCorrection`
  - `importAttendance`
  - `getAttendanceRecords`
  - `clockIn`
  - `clockOut`
  - `approveWeeklyAttendance`
  - `rejectWeeklyAttendance`
  - `approveAttendanceRequest`
  - `rejectAttendanceRequest`
- [hris-app/app/services/payroll.service.ts](/C:/uzaro/bandai-infra/hris-app/app/services/payroll.service.ts)
  - `getPayrollRecords`
  - `getPayrollRecord`
  - `generatePayroll`
  - `getPayrollSummary`
  - `updatePayrollStatus`
  - `downloadPayrollSlip`
  - `bulkUpdatePayrollStatus`
- [hris-app/app/services/employee-payroll.service.ts](/C:/uzaro/bandai-infra/hris-app/app/services/employee-payroll.service.ts)
  - `getEmployeePayrollRecords`
  - `getEmployeePayrollRecord`
  - `searchEmployeePayrollRecords`
  - `getEmployeePayrollSummary`
  - `importEmployeePayroll`
  - `generatePayslipPdf`
  - `uploadPayslipRelease`
  - `generatePayslipsForPeriod`
  - `releasePayslipsForPeriod`
  - `resetGeneratedPayrollBatch`
- [hris-app/app/services/system-provisioning.service.ts](/C:/uzaro/bandai-infra/hris-app/app/services/system-provisioning.service.ts)
  - `getStatus`
  - `bootstrapAdmin`
  - `updateHrSettings`
  - `uploadLogo`
  - `getPreview`
  - `initialize`
  - `getTimesheetSettings`
  - `updateTimesheetSettings`
  - `getPayrollSettings`
  - `updatePayrollSettings`
  - `getLeaveSettings`
  - `updateLeaveSettings`
  - `activate`
- [hris-app/app/services/request-workflow-runtime.service.ts](/C:/uzaro/bandai-infra/hris-app/app/services/request-workflow-runtime.service.ts)
  - `getStatusesByRequestType`
  - any async workflow resolution helper you want to correlate with request submission/approval latency

## What To Trace First

If you only trace a few functions, start with:

1. `auth.login`
2. `request.createRequest`
3. `request.approveRequest`
4. `employee.createEmployeeWithAccount`
5. `attendance.importAttendance`
6. `payroll.generatePayroll`

## Rule

- Trace business logic and multi-step async work.
- Do not trace React render functions.
- In the app, trace service methods and loaders/actions, not JSX components.
