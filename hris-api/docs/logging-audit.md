# HRIS API — Logging Coverage Audit

> Generated: 2026-06-29 | Controllers: 63 | Mapped endpoints: 476

## Executive Summary

| Metric | Count |
|--------|------:|
| Total controllers | 63 |
| Total mapped endpoints | 476 |
| Controllers with any logging | 52 |
| Controllers with zero logging | 11 |
| Endpoints with activity + audit | 145 |
| Endpoints with activity only | 75 |
| Endpoints with audit only | 1 |
| Endpoints with delegated logging | 1 |
| Endpoints with domain audit (TerminationAuditLog) | 6 |
| Endpoints with no standard logging | 255 |

Overall endpoint logging coverage (any type): **48%** (228/476)

## How Logging Works

Logging is **manual per handler** — no global middleware, decorator, or interceptor.

| Utility | File | Storage |
|---------|------|---------|
| `logActivity()` | `utils/activityLogger.ts` | `ActivityLogging` |
| `logAudit()` | `utils/auditLogger.ts` | `AuditLogging` |
| `logAuthEvent()` | `app/auth/auth.controller.ts` | via `logAudit()` |
| `logEmployeeCreation()` | `helper/employee.helper.ts` | both loggers |
| `terminationAuditLog.create()` | `app/termination/termination.controller.ts` | `TerminationAuditLog` |

**Audit skip rules:** `logAudit()` skips GET/HEAD/OPTIONS requests and `READ` actions.

**Constants:** `config/constant.ts` → `config.ACTIVITY_LOG.*` and `config.AUDIT_LOG.*`

## Per-Controller Endpoint Coverage

### activityLogging / activityLogging

- **File:** `app/activityLogging/activityLogging.controller.ts`
- **Base path:** `/api/activityLogging`
- **Endpoints:** 5 mapped, 0 with logging

| HTTP | Route | Handler | Activity | Audit | Domain | Notes |
|------|-------|---------|:--------:|:-----:|:------:|-------|
| GET | `/api/activityLogging/` | getAll | No | No | No | — |
| GET | `/api/activityLogging/:id` | getById | No | No | No | — |
| POST | `/api/activityLogging/` | create | No | No | No | — |
| PATCH | `/api/activityLogging/:id` | update | No | No | No | — |
| DELETE | `/api/activityLogging/:id` | remove | No | No | No | — |

### agency / agency

- **File:** `app/agency/agency.controller.ts`
- **Base path:** `/api/agency`
- **Endpoints:** 7 mapped, 7 with logging

| HTTP | Route | Handler | Activity | Audit | Domain | Notes |
|------|-------|---------|:--------:|:-----:|:------:|-------|
| GET | `/api/agency/` | getAll | Yes | No | No | activity-only on read |
| GET | `/api/agency/:id` | getById | Yes | No | No | activity-only on read |
| GET | `/api/agency/generate-code` | generateCode | Yes | No | No | activity-only on read |
| POST | `/api/agency/` | create | Yes | Yes | No | — |
| POST | `/api/agency/import` | importFromXLSX | Yes | Yes | No | — |
| PATCH | `/api/agency/:id` | update | Yes | Yes | No | — |
| DELETE | `/api/agency/:id` | remove | Yes | Yes | No | — |

### applicant / applicant

- **File:** `app/applicant/applicant.controller.ts`
- **Base path:** `/api/applicant`
- **Endpoints:** 11 mapped, 11 with logging

| HTTP | Route | Handler | Activity | Audit | Domain | Notes |
|------|-------|---------|:--------:|:-----:|:------:|-------|
| GET | `/api/applicant/` | getAll | Yes | No | No | activity-only on read |
| GET | `/api/applicant/:id` | getById | Yes | No | No | activity-only on read |
| GET | `/api/applicant/:id/activities` | getActivities | Yes | No | No | activity-only on read |
| GET | `/api/applicant/:id/attachments` | getAttachments | Yes | No | No | activity-only on read |
| POST | `/api/applicant/` | create | Yes | Yes | No | — |
| POST | `/api/applicant/:id/action` | action | Yes | Yes | No | — |
| POST | `/api/applicant/:id/activities` | createActivity | Yes | Yes | No | — |
| POST | `/api/applicant/:id/attachments` | uploadAttachment | Yes | Yes | No | — |
| PATCH | `/api/applicant/:id` | update | Yes | Yes | No | — |
| DELETE | `/api/applicant/:id` | remove | Yes | Yes | No | — |
| DELETE | `/api/applicant/:id/attachments/:attachmentId` | removeAttachment | Yes | Yes | No | — |

<details><summary>Unmapped handlers</summary>

| Handler | Activity | Audit | Domain |
|---------|:--------:|:-----:|:------:|
| getActingEmployeeId | No | No | No |
| resolveJobLink | No | No | No |
| invalidateApplicantCaches | No | No | No |

</details>

### attendance / attendance

- **File:** `app/attendance/attendance.controller.ts`
- **Base path:** `/api/attendance`
- **Endpoints:** 11 mapped, 3 with logging

| HTTP | Route | Handler | Activity | Audit | Domain | Notes |
|------|-------|---------|:--------:|:-----:|:------:|-------|
| GET | `/api/attendance/` | getAll | No | No | No | — |
| GET | `/api/attendance/:id` | getById | No | No | No | — |
| GET | `/api/attendance/import/progress/:jobId` | getImportProgress | No | No | No | — |
| GET | `/api/attendance/summary` | getTimekeepingSummary | No | No | No | — |
| POST | `/api/attendance/` | create | Yes | Yes | No | — |
| POST | `/api/attendance/backfill` | createBackfill | Yes | Yes | No | — |
| POST | `/api/attendance/corrections` | createCorrection | No | Yes | No | audit-only |
| POST | `/api/attendance/import` | importFromXLSX | No | No | No | — |
| POST | `/api/attendance/uzaro/import` | importFromUzaroXLSX | No | No | No | — |
| PATCH | `/api/attendance/:id` | update | No | No | No | — |
| DELETE | `/api/attendance/:id` | remove | No | No | No | — |

### auditLogging / auditLogging

- **File:** `app/auditLogging/auditLogging.controller.ts`
- **Base path:** `/api/auditLogging`
- **Endpoints:** 5 mapped, 0 with logging

| HTTP | Route | Handler | Activity | Audit | Domain | Notes |
|------|-------|---------|:--------:|:-----:|:------:|-------|
| GET | `/api/auditLogging/` | getAll | No | No | No | — |
| GET | `/api/auditLogging/:id` | getById | No | No | No | — |
| POST | `/api/auditLogging/` | create | No | No | No | — |
| PATCH | `/api/auditLogging/:id` | update | No | No | No | — |
| DELETE | `/api/auditLogging/:id` | remove | No | No | No | — |

### auth / auth

- **File:** `app/auth/auth.controller.ts`
- **Base path:** `/api/auth`
- **Endpoints:** 13 mapped, 13 with logging

| HTTP | Route | Handler | Activity | Audit | Domain | Notes |
|------|-------|---------|:--------:|:-----:|:------:|-------|
| GET | `/api/auth/me` | getCurrentUser | Yes | No | No | activity-only on read |
| GET | `/api/auth/roles` | getRoles | Yes | No | No | activity-only on read |
| GET | `/api/auth/users` | getUsers | Yes | No | No | activity-only on read |
| GET | `/api/auth/users/:id` | getUserById | Yes | No | No | activity-only on read |
| POST | `/api/auth/login` | login | Yes | Yes | No | — |
| POST | `/api/auth/logout` | logout | Yes | Yes | No | — |
| POST | `/api/auth/users` | createUser | Yes | Yes | No | — |
| PATCH | `/api/auth/change-password` | changePassword | Yes | Yes | No | — |
| PATCH | `/api/auth/me/avatar` | updateCurrentUserAvatar | Yes | Yes | No | — |
| PATCH | `/api/auth/update-password` | changePassword | Yes | Yes | No | — |
| PATCH | `/api/auth/users/:id` | updateUser | Yes | Yes | No | — |
| PATCH | `/api/auth/users/:id/reset-password` | resetUserPassword | Yes | Yes | No | — |
| DELETE | `/api/auth/users/:id` | deleteUser | Yes | Yes | No | — |

<details><summary>Unmapped handlers</summary>

| Handler | Activity | Audit | Domain |
|---------|:--------:|:-----:|:------:|
| uploadUserAvatarFile | No | No | No |
| fetchWithTimeout | No | No | No |
| fetchIdpRoles | No | No | No |
| loadLocalUserProfile | No | No | No |
| resolveLocalLoginUserByIdentifier | No | No | No |
| resolveAuditActorContext | No | No | No |
| logAuthEvent | Yes | Yes | No |

</details>

### benefitType / benefitType

- **File:** `app/benefitType/benefitType.controller.ts`
- **Base path:** `/api/benefitType`
- **Endpoints:** 6 mapped, 1 with logging

| HTTP | Route | Handler | Activity | Audit | Domain | Notes |
|------|-------|---------|:--------:|:-----:|:------:|-------|
| GET | `/api/benefitType/` | getAll | No | No | No | — |
| GET | `/api/benefitType/:id` | getById | No | No | No | — |
| POST | `/api/benefitType/` | create | Yes | Yes | No | — |
| POST | `/api/benefitType/import` | importFromFile | No | No | No | — |
| PATCH | `/api/benefitType/:id` | update | No | No | No | — |
| DELETE | `/api/benefitType/:id` | remove | No | No | No | — |

### boardingProcess / boardingProcess

- **File:** `app/boardingProcess/boardingProcess.controller.ts`
- **Base path:** `/api/boardingProcess`
- **Endpoints:** 5 mapped, 1 with logging

| HTTP | Route | Handler | Activity | Audit | Domain | Notes |
|------|-------|---------|:--------:|:-----:|:------:|-------|
| GET | `/api/boardingProcess/` | getAll | No | No | No | — |
| GET | `/api/boardingProcess/:id` | getById | No | No | No | — |
| POST | `/api/boardingProcess/` | create | Yes | Yes | No | — |
| PATCH | `/api/boardingProcess/:id` | update | No | No | No | — |
| DELETE | `/api/boardingProcess/:id` | remove | No | No | No | — |

### boardingTemplate / boardingtemplate

- **File:** `app/boardingTemplate/boardingtemplate.controller.ts`
- **Base path:** `/api/boardingTemplate`
- **Endpoints:** 5 mapped, 1 with logging

| HTTP | Route | Handler | Activity | Audit | Domain | Notes |
|------|-------|---------|:--------:|:-----:|:------:|-------|
| GET | `/api/boardingTemplate/` | getAll | No | No | No | — |
| GET | `/api/boardingTemplate/:id` | getById | No | No | No | — |
| POST | `/api/boardingTemplate/` | create | Yes | Yes | No | — |
| PATCH | `/api/boardingTemplate/:id` | update | No | No | No | — |
| DELETE | `/api/boardingTemplate/:id` | remove | No | No | No | — |

### calculator / calculator

- **File:** `app/calculator/calculator.controller.ts`
- **Base path:** `/api/calculator`
- **Endpoints:** 5 mapped, 1 with logging

| HTTP | Route | Handler | Activity | Audit | Domain | Notes |
|------|-------|---------|:--------:|:-----:|:------:|-------|
| GET | `/api/calculator/` | getAll | No | No | No | — |
| GET | `/api/calculator/:id` | getById | No | No | No | — |
| POST | `/api/calculator/` | create | Yes | Yes | No | — |
| PATCH | `/api/calculator/:id` | update | No | No | No | — |
| DELETE | `/api/calculator/:id` | remove | No | No | No | — |

### calendar-item / calendar-item

- **File:** `app/calendar-item/calendar-item.controller.ts`
- **Base path:** `/api/calendar-item`
- **Endpoints:** 7 mapped, 1 with logging

| HTTP | Route | Handler | Activity | Audit | Domain | Notes |
|------|-------|---------|:--------:|:-----:|:------:|-------|
| GET | `/api/calendar-item/` | getAll | No | No | No | — |
| GET | `/api/calendar-item/:id` | getById | No | No | No | — |
| GET | `/api/calendar-item/public/kiosk` | getPublicKiosk | No | No | No | — |
| POST | `/api/calendar-item/` | create | Yes | Yes | No | — |
| POST | `/api/calendar-item/import` | importFromXLSX | No | No | No | — |
| PATCH | `/api/calendar-item/:id` | update | No | No | No | — |
| DELETE | `/api/calendar-item/:id` | remove | No | No | No | — |

<details><summary>Unmapped handlers</summary>

| Handler | Activity | Audit | Domain |
|---------|:--------:|:-----:|:------:|
| recomputeHolidayObligations | No | No | No |
| recomputeHolidayObligationsForMutation | No | No | No |

</details>

### celebrations / celebrations

- **File:** `app/celebrations/celebrations.controller.ts`
- **Base path:** `/api/celebrations`
- **Endpoints:** 2 mapped, 0 with logging

| HTTP | Route | Handler | Activity | Audit | Domain | Notes |
|------|-------|---------|:--------:|:-----:|:------:|-------|
| GET | `/api/celebrations/birthdays` | getBirthdays | No | No | No | — |
| GET | `/api/celebrations/public/birthdays` | getPublicBirthdays | No | No | No | — |

<details><summary>Unmapped handlers</summary>

| Handler | Activity | Audit | Domain |
|---------|:--------:|:-----:|:------:|
| getEmployeeBirthdays | No | No | No |
| getChildBirthdays | No | No | No |
| buildBirthdaySuccessPayload | No | No | No |

</details>

### checklistItem / checklistItem

- **File:** `app/checklistItem/checklistItem.controller.ts`
- **Base path:** `/api/checklistItem`
- **Endpoints:** 5 mapped, 1 with logging

| HTTP | Route | Handler | Activity | Audit | Domain | Notes |
|------|-------|---------|:--------:|:-----:|:------:|-------|
| GET | `/api/checklistItem/` | getAll | No | No | No | — |
| GET | `/api/checklistItem/:id` | getById | No | No | No | — |
| POST | `/api/checklistItem/` | create | Yes | Yes | No | — |
| PATCH | `/api/checklistItem/:id` | update | No | No | No | — |
| DELETE | `/api/checklistItem/:id` | remove | No | No | No | — |

### dashboard / dashboard

- **File:** `app/dashboard/dashboard.controller.ts`
- **Base path:** `/api/dashboard`
- **Endpoints:** 8 mapped, 0 with logging

| HTTP | Route | Handler | Activity | Audit | Domain | Notes |
|------|-------|---------|:--------:|:-----:|:------:|-------|
| GET | `/api/dashboard/action-needed` | getActionNeeded | No | No | No | — |
| GET | `/api/dashboard/attendance-trends` | getAttendanceTrends | No | No | No | — |
| GET | `/api/dashboard/chart-themes` | getChartThemes | No | No | No | — |
| GET | `/api/dashboard/custom-metrics` | getCustomMetrics | No | No | No | — |
| GET | `/api/dashboard/employee-stats-by-department` | getEmployeeStatsByDepartment | No | No | No | — |
| GET | `/api/dashboard/overview` | getOverview | No | No | No | — |
| GET | `/api/dashboard/payroll-analytics` | getPayrollAnalytics | No | No | No | — |
| GET | `/api/dashboard/performance-metrics` | getPerformanceMetrics | No | No | No | — |

### department / department

- **File:** `app/department/department.controller.ts`
- **Base path:** `/api/department`
- **Endpoints:** 7 mapped, 1 with logging

| HTTP | Route | Handler | Activity | Audit | Domain | Notes |
|------|-------|---------|:--------:|:-----:|:------:|-------|
| GET | `/api/department/` | getAll | No | No | No | — |
| GET | `/api/department/:id` | getById | No | No | No | — |
| GET | `/api/department/generate-code` | generateCode | No | No | No | — |
| POST | `/api/department/` | create | Yes | Yes | No | — |
| POST | `/api/department/import` | importFromXLSX | No | No | No | — |
| PATCH | `/api/department/:id` | update | No | No | No | — |
| DELETE | `/api/department/:id` | remove | No | No | No | — |

<details><summary>Unmapped handlers</summary>

| Handler | Activity | Audit | Domain |
|---------|:--------:|:-----:|:------:|
| attachDepartmentSchedules | No | No | No |
| attachDepartmentSchedulesList | No | No | No |

</details>

### device / device

- **File:** `app/device/device.controller.ts`
- **Base path:** `/api/device`
- **Endpoints:** 9 mapped, 3 with logging

| HTTP | Route | Handler | Activity | Audit | Domain | Notes |
|------|-------|---------|:--------:|:-----:|:------:|-------|
| GET | `/api/device/` | getAll | No | No | No | — |
| GET | `/api/device/:id` | getById | No | No | No | — |
| GET | `/api/device/:id/health` | getDeviceHealth | No | No | No | — |
| GET | `/api/device/events` | getEvents | No | No | No | — |
| GET | `/api/device/events/item/:eventId` | getEventById | No | No | No | saved-event details deeplink; uncached |
| POST | `/api/device/` | create | Yes | Yes | No | — |
| POST | `/api/device/enroll` | enrollDeviceUser | Yes | No | No | activity-only |
| POST | `/api/device/enroll/import` | importDeviceEnrollment | Yes | No | No | activity-only |
| PATCH | `/api/device/:id` | update | No | No | No | — |
| DELETE | `/api/device/:id` | remove | No | No | No | — |

<details><summary>Unmapped handlers</summary>

| Handler | Activity | Audit | Domain |
|---------|:--------:|:-----:|:------:|
| resolveEmployeeForUser | No | No | No |

</details>

### docs / docs

- **File:** `app/docs/docs.controller.ts`
- **Base path:** `/api/docs`
- **Endpoints:** 4 mapped, 0 with logging

| HTTP | Route | Handler | Activity | Audit | Domain | Notes |
|------|-------|---------|:--------:|:-----:|:------:|-------|
| GET | `/api/docs/api-list` | exportDocs | No | No | No | — |
| GET | `/api/docs/iml` | generateIml | No | No | No | — |
| GET | `/api/docs/postman` | getPostman | No | No | No | — |
| GET | `/api/docs/swagger` | getSwagger | No | No | No | — |

### document / document

- **File:** `app/document/document.controller.ts`
- **Base path:** `/api/document`
- **Endpoints:** 5 mapped, 1 with logging

| HTTP | Route | Handler | Activity | Audit | Domain | Notes |
|------|-------|---------|:--------:|:-----:|:------:|-------|
| GET | `/api/document/` | getAll | No | No | No | — |
| GET | `/api/document/:id` | getById | No | No | No | — |
| POST | `/api/document/` | create | Yes | Yes | No | — |
| PATCH | `/api/document/:id` | update | No | No | No | — |
| DELETE | `/api/document/:id` | remove | No | No | No | — |

### documentFolder / documentFolder

- **File:** `app/documentFolder/documentFolder.controller.ts`
- **Base path:** `/api/`
- **Endpoints:** 4 mapped, 4 with logging

| HTTP | Route | Handler | Activity | Audit | Domain | Notes |
|------|-------|---------|:--------:|:-----:|:------:|-------|
| GET | `/api/employee/:employeeId` | getAllByEmployee | Yes | No | No | activity-only on read |
| POST | `/api/` | create | Yes | Yes | No | — |
| PATCH | `/api/:id` | update | Yes | Yes | No | — |
| DELETE | `/api/:id` | remove | Yes | Yes | No | — |

### documentType / documentType

- **File:** `app/documentType/documentType.controller.ts`
- **Base path:** `/api/`
- **Endpoints:** 5 mapped, 5 with logging

| HTTP | Route | Handler | Activity | Audit | Domain | Notes |
|------|-------|---------|:--------:|:-----:|:------:|-------|
| GET | `/api/document-type` | getAll | Yes | No | No | activity-only on read |
| GET | `/api/document-type/:id` | getById | Yes | No | No | activity-only on read |
| POST | `/api/document-type` | create | Yes | Yes | No | — |
| PATCH | `/api/document-type/:id` | update | Yes | Yes | No | — |
| DELETE | `/api/document-type/:id` | remove | Yes | Yes | No | — |

### employee / employee

- **File:** `app/employee/employee.controller.ts`
- **Base path:** `/api/employee`
- **Endpoints:** 35 mapped, 28 with logging

| HTTP | Route | Handler | Activity | Audit | Domain | Notes |
|------|-------|---------|:--------:|:-----:|:------:|-------|
| GET | `/api/employee/` | getAll | Yes | No | No | activity-only on read |
| GET | `/api/employee/:id` | getById | Yes | No | No | activity-only on read |
| GET | `/api/employee/:id/attendance` | getAttendanceRecords | Yes | No | No | activity-only on read |
| GET | `/api/employee/:id/attendance/:attendanceId` | getAttendanceById | Yes | No | No | activity-only on read |
| GET | `/api/employee/:id/attendance/today` | getTodayAttendance | Yes | No | No | activity-only on read |
| GET | `/api/employee/:id/department` | getEmployeeDepartment | Yes | No | No | activity-only on read |
| GET | `/api/employee/:id/document-priorities` | getDocumentPriorities | Yes | No | No | activity-only on read |
| GET | `/api/employee/:id/managed-departments` | getManagedDepartments | Yes | No | No | activity-only on read |
| GET | `/api/employee/:id/managed-departments/:departmentId` | getManagedDepartmentById | Yes | No | No | activity-only on read |
| GET | `/api/employee/:id/schedules` | getEmployeeSchedules | Yes | No | No | activity-only on read |
| GET | `/api/employee/by-role` | getEmployeesByUserRole | Yes | No | No | activity-only on read |
| GET | `/api/employee/import/progress/:jobId` | getImportProgress | No | No | No | — |
| GET | `/api/employee/team/schedule-calendar` | getTeamScheduleCalendar | Yes | No | No | activity-only on read |
| GET | `/api/employee/team/schedule-calendar-grid` | getTeamScheduleCalendarGrid | Yes | No | No | activity-only on read |
| GET | `/api/employee/team/schedule-collections` | getTeamScheduleCollections | Yes | No | No | activity-only on read |
| POST | `/api/employee/` | create | Yes | Yes | No | delegated via logEmployeeCreation helper |
| POST | `/api/employee/:id/attendance` | markAttendance | Yes | Yes | No | — |
| POST | `/api/employee/:id/schedules/set-active` | setActiveEmployeeSchedule | Yes | Yes | No | — |
| POST | `/api/employee/:id/upload-document` | uploadDocument | Yes | Yes | No | — |
| POST | `/api/employee/import` | importEmployees | Yes | Yes | No | — |
| POST | `/api/employee/reserve-id` | reserveEmployeeId | Yes | No | No | activity-only |
| POST | `/api/employee/team/schedule-collections` | createTeamScheduleCollection | No | No | No | — |
| POST | `/api/employee/team/schedule-ledger/apply-rotation` | applyTeamScheduleLedgerRotation | No | No | No | — |
| PATCH | `/api/employee/:id` | update | Yes | Yes | No | — |
| PATCH | `/api/employee/:id/attendance/:attendanceId` | updateAttendance | Yes | Yes | No | — |
| PATCH | `/api/employee/:id/schedules/:entryId/deactivate` | deactivateEmployeeSchedule | Yes | Yes | No | — |
| PATCH | `/api/employee/documents/:documentId/review` | reviewDocument | Yes | Yes | No | — |
| PATCH | `/api/employee/documents/:documentNumber` | updateDocument | Yes | Yes | No | — |
| PATCH | `/api/employee/team/schedule-collections/:collectionId` | updateTeamScheduleCollection | No | No | No | — |
| PATCH | `/api/employee/team/schedule-collections/:collectionId/archive` | archiveTeamScheduleCollection | No | No | No | — |
| PATCH | `/api/employee/team/schedule-ledger/override` | overrideTeamScheduleLedger | No | No | No | — |
| DELETE | `/api/employee/:id` | remove | Yes | Yes | No | — |
| DELETE | `/api/employee/:id/attendance/:attendanceId` | deleteAttendance | Yes | Yes | No | — |
| DELETE | `/api/employee/:id/attendance/debug/today` | debugDeleteTodayAttendance | No | No | No | — |
| DELETE | `/api/employee/documents/:documentNumber` | deleteDocument | Yes | Yes | No | — |

<details><summary>Unmapped handlers</summary>

| Handler | Activity | Audit | Domain |
|---------|:--------:|:-----:|:------:|
| uploadEmployeeAvatarFile | No | No | No |
| normalizeAndValidateAgencyAssignment | No | No | No |
| findEmployeeDocumentByLookupValue | No | No | No |
| logEmployeeDocumentConfigurationAudit | No | Yes | No |
| invalidateEmployeeDocumentCaches | No | No | No |
| findMatchingDocumentType | No | No | No |
| syncEmployeeDocuments | No | No | No |
| validateEmployeeDocumentsAgainstConfiguredTypes | No | No | No |
| resolveActor | No | No | No |
| getManagedDepartmentIds | No | No | No |
| getDirectReportDepartmentIds | No | No | No |
| getOvertimeFlagThresholdMinutes | No | No | No |
| run | No | No | No |

</details>

### employeeBenefit / employeeBenefit

- **File:** `app/employeeBenefit/employeeBenefit.controller.ts`
- **Base path:** `/api/employeeBenefit`
- **Endpoints:** 6 mapped, 1 with logging

| HTTP | Route | Handler | Activity | Audit | Domain | Notes |
|------|-------|---------|:--------:|:-----:|:------:|-------|
| GET | `/api/employeeBenefit/` | getAll | No | No | No | — |
| GET | `/api/employeeBenefit/:id` | getById | No | No | No | — |
| POST | `/api/employeeBenefit/` | create | Yes | Yes | No | — |
| POST | `/api/employeeBenefit/import` | importBenefits | No | No | No | — |
| PATCH | `/api/employeeBenefit/:id` | update | No | No | No | — |
| DELETE | `/api/employeeBenefit/:id` | remove | No | No | No | — |

### employeeDocuments / employeeDocuments

- **File:** `app/employeeDocuments/employeeDocuments.controller.ts`
- **Base path:** `/api/`
- **Endpoints:** 2 mapped, 0 with logging

| HTTP | Route | Handler | Activity | Audit | Domain | Notes |
|------|-------|---------|:--------:|:-----:|:------:|-------|
| GET | `/api/approvals` | getApprovals | No | No | No | — |
| GET | `/api/review-events` | getReviewEvents | No | No | No | — |

<details><summary>Unmapped handlers</summary>

| Handler | Activity | Audit | Domain |
|---------|:--------:|:-----:|:------:|
| buildActorLookup | No | No | No |

</details>

### employeeLoan / employeeLoan

- **File:** `app/employeeLoan/employeeLoan.controller.ts`
- **Base path:** `/api/employeeLoan`
- **Endpoints:** 5 mapped, 1 with logging

| HTTP | Route | Handler | Activity | Audit | Domain | Notes |
|------|-------|---------|:--------:|:-----:|:------:|-------|
| GET | `/api/employeeLoan/` | getAll | No | No | No | — |
| GET | `/api/employeeLoan/:id` | getById | No | No | No | — |
| POST | `/api/employeeLoan/` | create | Yes | Yes | No | — |
| PATCH | `/api/employeeLoan/:id` | update | No | No | No | — |
| DELETE | `/api/employeeLoan/:id` | remove | No | No | No | — |

### employeepayroll / employeepayroll

- **File:** `app/employeepayroll/employeepayroll.controller.ts`
- **Base path:** `/api/employeePayroll`
- **Endpoints:** 14 mapped, 14 with logging

| HTTP | Route | Handler | Activity | Audit | Domain | Notes |
|------|-------|---------|:--------:|:-----:|:------:|-------|
| GET | `/api/employeePayroll/` | getAll | Yes | No | No | activity-only on read |
| GET | `/api/employeePayroll/:id` | getById | Yes | No | No | activity-only on read |
| GET | `/api/employeePayroll/:id/breakdown` | getBreakdown | Yes | Yes | No | audit call present (may be skipped for GET) |
| GET | `/api/employeePayroll/:id/payslip` | generatePayslipPdf | Yes | No | No | activity-only; **live PDF** from payroll + `payrollSourceDetails` (enrollment breakdown), not stored-file-only |
| POST | `/api/employeePayroll/` | create | Yes | Yes | No | — |
| POST | `/api/employeePayroll/:id/payment-issue` | flagPayrollPaymentIssue | Yes | Yes | No | — |
| POST | `/api/employeePayroll/debug/reset-generated-payrolls` | resetGeneratedPayrolls | Yes | Yes | No | — |
| POST | `/api/employeePayroll/import` | importFromXLSX | Yes | Yes | No | — |
| POST | `/api/employeePayroll/period/:payrollPeriodId/payslip-release/attachment` | uploadPayslipReleaseAttachment | Yes | Yes | No | — |
| POST | `/api/employeePayroll/period/:payrollPeriodId/payslip-release/generate-payslips` | generatePayslipsForPeriod | Yes | Yes | No | — |
| POST | `/api/employeePayroll/period/:payrollPeriodId/payslip-release/release` | releasePayslipsForPeriod | Yes | Yes | No | — |
| POST | `/api/employeePayroll/period/:payrollPeriodId/publish` | publishPayrollPeriod | Yes | Yes | No | — |
| PATCH | `/api/employeePayroll/:id` | update | Yes | Yes | No | — |
| DELETE | `/api/employeePayroll/:id` | remove | Yes | Yes | No | — |

### employeeSchedule / employeeSchedule

- **File:** `app/employeeSchedule/employeeSchedule.controller.ts`
- **Base path:** `/api/`
- **Endpoints:** 5 mapped, 5 with logging

| HTTP | Route | Handler | Activity | Audit | Domain | Notes |
|------|-------|---------|:--------:|:-----:|:------:|-------|
| GET | `/api/employee-schedules` | getAll | Yes | No | No | activity-only on read |
| GET | `/api/employees/:id/schedule` | getEmployeeCalendar | Yes | No | No | activity-only on read |
| GET | `/api/employees/:id/schedule/pre` | getEmployeeCalendarPre | Yes | No | No | activity-only on read |
| POST | `/api/employee-schedules` | create | Yes | Yes | No | — |
| PATCH | `/api/employee-schedules/:id` | update | Yes | Yes | No | — |

<details><summary>Unmapped handlers</summary>

| Handler | Activity | Audit | Domain |
|---------|:--------:|:-----:|:------:|
| buildCalendarDays | No | No | No |

</details>

### guide / guide

- **File:** `app/guide/guide.controller.ts`
- **Base path:** `/api/guide`
- **Endpoints:** 5 mapped, 1 with logging

| HTTP | Route | Handler | Activity | Audit | Domain | Notes |
|------|-------|---------|:--------:|:-----:|:------:|-------|
| GET | `/api/guide/` | getAll | No | No | No | — |
| GET | `/api/guide/:id` | getById | No | No | No | — |
| POST | `/api/guide/` | create | Yes | Yes | No | — |
| PATCH | `/api/guide/:id` | update | No | No | No | — |
| DELETE | `/api/guide/:id` | remove | No | No | No | — |

### hikvision / controller / access.control

- **File:** `app/hikvision/controller/access.control.controller.ts`
- **Base path:** `/api/hikvision/access-control`
- **Endpoints:** 19 mapped, 0 with logging

| HTTP | Route | Handler | Activity | Audit | Domain | Notes |
|------|-------|---------|:--------:|:-----:|:------:|-------|
| GET | `/api/hikvision/access-control/acs-event-total-num` | getAcsEventTotalNum | No | No | No | — |
| GET | `/api/hikvision/access-control/acs-event-total-num/capabilities` | getAcsEventTotalNumCapabilities | No | No | No | — |
| GET | `/api/hikvision/access-control/acs-events/capabilities` | getAcsEventCapabilities | No | No | No | — |
| GET | `/api/hikvision/access-control/acs-work-status` | getAcsWorkStatus | No | No | No | — |
| GET | `/api/hikvision/access-control/acs-work-status/capabilities` | getAcsWorkStatusCapabilities | No | No | No | — |
| GET | `/api/hikvision/access-control/storage-config` | getStorageConfig | No | No | No | — |
| GET | `/api/hikvision/access-control/storage-config/capabilities` | getStorageConfigCapabilities | No | No | No | — |
| GET | `/api/hikvision/access-control/user-info-detail/delete-process` | getUserInfoDetailDeleteProcess | No | No | No | — |
| GET | `/api/hikvision/access-control/user-info-detail/delete/capabilities` | getUserInfoDetailDeleteCapabilities | No | No | No | — |
| GET | `/api/hikvision/access-control/user-info/capabilities` | getUserInfoCapabilities | No | No | No | — |
| GET | `/api/hikvision/access-control/user-info/count` | getUserInfoCount | No | No | No | — |
| POST | `/api/hikvision/access-control/acs-events` | getAcsEvents | No | No | No | — |
| POST | `/api/hikvision/access-control/user-info/record` | recordUserInfo | No | No | No | — |
| POST | `/api/hikvision/access-control/user-info/search` | searchUserInfo | No | No | No | — |
| PUT | `/api/hikvision/access-control/storage-config` | updateStorageConfig | No | No | No | — |
| PUT | `/api/hikvision/access-control/user-info-detail/delete` | deleteUserInfoDetail | No | No | No | — |
| PUT | `/api/hikvision/access-control/user-info/delete` | deleteUserInfo | No | No | No | — |
| PUT | `/api/hikvision/access-control/user-info/modify` | modifyUserInfo | No | No | No | — |
| PUT | `/api/hikvision/access-control/user-info/setup` | setUpUserInfo | No | No | No | — |

<details><summary>Unmapped handlers</summary>

| Handler | Activity | Audit | Domain |
|---------|:--------:|:-----:|:------:|
| enrichAcsEventsWithEmployees | No | No | No |
| syncAcsEventsToDeviceAttendance | No | No | No |

</details>

### hikvision / controller / callback

- **File:** `app/hikvision/controller/callback.controller.ts`
- **Base path:** `/api/hikvision/callback`
- **Endpoints:** 1 mapped, 0 with logging

| HTTP | Route | Handler | Activity | Audit | Domain | Notes |
|------|-------|---------|:--------:|:-----:|:------:|-------|
| POST | `/api/hikvision/callback/` | handleCallback | No | No | No | — |

<details><summary>Unmapped handlers</summary>

| Handler | Activity | Audit | Domain |
|---------|:--------:|:-----:|:------:|
| getOvertimeFlagThresholdMinutes | No | No | No |
| resolveCallbackDevice | No | No | No |
| saveInitialDeviceEvent | No | No | No |
| updateDeviceEventStatus | No | No | No |

</details>

### hikvision / controller / users

- **File:** `app/hikvision/controller/users.controller.ts`
- **Base path:** `/api/hikvision/users`
- **Endpoints:** 17 mapped, 0 with logging

| HTTP | Route | Handler | Activity | Audit | Domain | Notes |
|------|-------|---------|:--------:|:-----:|:------:|-------|
| GET | `/api/hikvision/users/` | listUsers | No | No | No | — |
| GET | `/api/hikvision/users/:id` | getUserById | No | No | No | — |
| GET | `/api/hikvision/users/:id/permissions` | getUserPermissions | No | No | No | — |
| GET | `/api/hikvision/users/:id/permissions/local` | getUserLocalPermission | No | No | No | — |
| GET | `/api/hikvision/users/:id/permissions/remote` | getUserRemotePermission | No | No | No | — |
| GET | `/api/hikvision/users/capabilities/admin` | getAdminCapabilities | No | No | No | — |
| GET | `/api/hikvision/users/capabilities/operator` | getOperatorCapabilities | No | No | No | — |
| GET | `/api/hikvision/users/capabilities/viewer` | getViewerCapabilities | No | No | No | — |
| GET | `/api/hikvision/users/check` | checkUser | No | No | No | — |
| GET | `/api/hikvision/users/permissions` | listUserPermissions | No | No | No | — |
| POST | `/api/hikvision/users/` | createUser | No | No | No | — |
| PUT | `/api/hikvision/users/:id` | updateUser | No | No | No | — |
| PUT | `/api/hikvision/users/:id/permissions` | updateUserPermissionById | No | No | No | — |
| PUT | `/api/hikvision/users/:id/permissions/local` | updateUserLocalPermission | No | No | No | — |
| PUT | `/api/hikvision/users/:id/permissions/remote` | updateUserRemotePermission | No | No | No | — |
| PUT | `/api/hikvision/users/permissions` | updateUserPermissions | No | No | No | — |
| DELETE | `/api/hikvision/users/:id` | deleteUser | No | No | No | — |

### job / job

- **File:** `app/job/job.controller.ts`
- **Base path:** `/api/job`
- **Endpoints:** 5 mapped, 1 with logging

| HTTP | Route | Handler | Activity | Audit | Domain | Notes |
|------|-------|---------|:--------:|:-----:|:------:|-------|
| GET | `/api/job/` | getAll | No | No | No | — |
| GET | `/api/job/:id` | getById | No | No | No | — |
| POST | `/api/job/` | create | Yes | Yes | No | — |
| PATCH | `/api/job/:id` | update | No | No | No | — |
| DELETE | `/api/job/:id` | remove | No | No | No | — |

<details><summary>Unmapped handlers</summary>

| Handler | Activity | Audit | Domain |
|---------|:--------:|:-----:|:------:|
| resolveJobRecruitmentScope | No | No | No |
| assertJobHeadcountCapacity | No | No | No |

</details>

### leaveSetting / leaveSetting

- **File:** `app/leaveSetting/leaveSetting.controller.ts`
- **Base path:** `/api/leave-settings`
- **Endpoints:** 2 mapped, 2 with logging

| HTTP | Route | Handler | Activity | Audit | Domain | Notes |
|------|-------|---------|:--------:|:-----:|:------:|-------|
| GET | `/api/leave-settings/` | getAll | Yes | No | No | activity-only on read |
| PATCH | `/api/leave-settings/:leaveType` | update | Yes | Yes | No | — |

### leaveType / leaveType

- **File:** `app/leaveType/leaveType.controller.ts`
- **Base path:** `/api/leaveType`
- **Endpoints:** 6 mapped, 1 with logging

| HTTP | Route | Handler | Activity | Audit | Domain | Notes |
|------|-------|---------|:--------:|:-----:|:------:|-------|
| GET | `/api/leaveType/` | getAll | No | No | No | — |
| GET | `/api/leaveType/:id` | getById | No | No | No | — |
| POST | `/api/leaveType/` | create | Yes | Yes | No | — |
| POST | `/api/leaveType/import` | importFromXLSX | No | No | No | — |
| PATCH | `/api/leaveType/:id` | update | No | No | No | — |
| DELETE | `/api/leaveType/:id` | remove | No | No | No | — |

### level / level

- **File:** `app/level/level.controller.ts`
- **Base path:** `/api/level`
- **Endpoints:** 6 mapped, 1 with logging

| HTTP | Route | Handler | Activity | Audit | Domain | Notes |
|------|-------|---------|:--------:|:-----:|:------:|-------|
| GET | `/api/level/` | getAll | No | No | No | — |
| GET | `/api/level/:id` | getById | No | No | No | — |
| POST | `/api/level/` | create | Yes | Yes | No | — |
| POST | `/api/level/import` | importFromXLSX | No | No | No | — |
| PATCH | `/api/level/:id` | update | No | No | No | — |
| DELETE | `/api/level/:id` | remove | No | No | No | — |

### loanType / loanType

- **File:** `app/loanType/loanType.controller.ts`
- **Base path:** `/api/loanType`
- **Endpoints:** 6 mapped, 1 with logging

| HTTP | Route | Handler | Activity | Audit | Domain | Notes |
|------|-------|---------|:--------:|:-----:|:------:|-------|
| GET | `/api/loanType/` | getAll | No | No | No | — |
| GET | `/api/loanType/:id` | getById | No | No | No | — |
| POST | `/api/loanType/` | create | Yes | Yes | No | — |
| POST | `/api/loanType/import` | importFromFile | No | No | No | — |
| PATCH | `/api/loanType/:id` | update | No | No | No | — |
| DELETE | `/api/loanType/:id` | remove | No | No | No | — |

### metrics / metrics

- **File:** `app/metrics/metrics.controller.ts`
- **Base path:** `/api/metrics`
- **Endpoints:** 2 mapped, 1 with logging

| HTTP | Route | Handler | Activity | Audit | Domain | Notes |
|------|-------|---------|:--------:|:-----:|:------:|-------|
| GET | `/api/metrics/actions` | getActionMetrics | No | No | No | — |
| POST | `/api/metrics/` | getMetrics | Yes | No | No | activity-only |

### migration / migration

- **File:** `app/migration/migration.controller.ts`
- **Base path:** `/api/migration`
- **Endpoints:** 33 mapped, 25 with logging

| HTTP | Route | Handler | Activity | Audit | Domain | Notes |
|------|-------|---------|:--------:|:-----:|:------:|-------|
| GET | `/api/migration/dm3/employee-post-actions/jobs/:jobId` | getDm3EmployeePostActionsJob | No | No | No | — |
| GET | `/api/migration/hierarchy` | hierarchy | Yes | No | No | activity-only on read |
| GET | `/api/migration/runs/:runId` | getMigrationRun | Yes | No | No | activity-only on read |
| GET | `/api/migration/runs/:runId/events` | getMigrationRunEvents | Yes | No | No | activity-only on read |
| GET | `/api/migration/runs/:runId/progress` | getMigrationRunProgress | No | No | No | — |
| GET | `/api/migration/runs/:runId/reconciliation-report` | downloadMigrationRunReconciliationReport | Yes | No | No | activity-only on read |
| GET | `/api/migration/runs/:runId/report.xlsx` | downloadMigrationRunReconciliationReport | Yes | No | No | activity-only on read |
| GET | `/api/migration/runs/active` | getActiveMigrationRun | No | No | No | — |
| GET | `/api/migration/runs/latest` | getLatestMigrationRun | Yes | No | No | activity-only on read |
| GET | `/api/migration/source-inputs` | getSourceInputs | Yes | No | No | activity-only on read |
| GET | `/api/migration/source-inputs/:sourceId/download` | downloadSourceInput | Yes | No | No | activity-only on read |
| GET | `/api/migration/stats` | stats | Yes | No | No | activity-only on read |
| GET | `/api/migration/workbook-audit/latest` | getWorkbookAuditLatest | Yes | No | No | activity-only on read |
| GET | `/api/migration/workbook-template/:fileName` | downloadWorkbookTemplate | Yes | No | No | activity-only on read |
| POST | `/api/migration/dm3/finalize-employee-import` | finalizeDm3EmployeeImport | Yes | Yes | No | — |
| POST | `/api/migration/dm3/import-employee-benefits-loans` | importDm3EmployeeBenefitsLoans | No | No | No | — |
| POST | `/api/migration/dm3/import-employee-documents` | importDm3EmployeeDocuments | No | No | No | — |
| POST | `/api/migration/dm3/import-employee-schedules` | importDm3EmployeeSchedules | No | No | No | — |
| POST | `/api/migration/dm3/import-opening-leave-balances` | importDm3OpeningLeaveBalances | No | No | No | — |
| POST | `/api/migration/dm3/import-reporting-lines` | importDm3ReportingLines | No | No | No | — |
| POST | `/api/migration/dm3/recover-employee-post-actions` | recoverDm3EmployeePostActions | Yes | Yes | No | — |
| POST | `/api/migration/dm4/resolve-source-workbooks` | resolveDm4SourceWorkbooks | Yes | No | No | activity-only |
| POST | `/api/migration/dry-run` | dryRun | Yes | Yes | No | — |
| POST | `/api/migration/execute` | execute | Yes | Yes | No | — |
| POST | `/api/migration/extract-sources` | extractSources | Yes | No | No | activity-only |
| POST | `/api/migration/runs` | startMigrationRun | Yes | Yes | No | — |
| POST | `/api/migration/runs/:runId/recover` | recoverMigrationRun | Yes | Yes | No | — |
| POST | `/api/migration/runs/:runId/rerun` | rerunMigrationRun | Yes | Yes | No | — |
| POST | `/api/migration/runs/dry-run` | dryRunMigrationRun | Yes | Yes | No | — |
| POST | `/api/migration/test-credentials-email` | testCredentialsEmail | Yes | Yes | No | — |
| POST | `/api/migration/transform-sources` | transformSources | Yes | No | No | activity-only |
| POST | `/api/migration/upload-csv` | uploadCsv | Yes | Yes | No | — |
| POST | `/api/migration/workbook-audit` | workbookAudit | Yes | Yes | No | — |

<details><summary>Unmapped handlers</summary>

| Handler | Activity | Audit | Domain |
|---------|:--------:|:-----:|:------:|
| runDm3PostActionsJob | No | No | No |

</details>

### note / note

- **File:** `app/note/note.controller.ts`
- **Base path:** `/api/note`
- **Endpoints:** 5 mapped, 1 with logging

| HTTP | Route | Handler | Activity | Audit | Domain | Notes |
|------|-------|---------|:--------:|:-----:|:------:|-------|
| GET | `/api/note/` | getAll | No | No | No | — |
| GET | `/api/note/:id` | getById | No | No | No | — |
| POST | `/api/note/` | create | Yes | Yes | No | — |
| PATCH | `/api/note/:id` | update | No | No | No | — |
| DELETE | `/api/note/:id` | remove | No | No | No | — |

### notification / notification

- **File:** `app/notification/notification.controller.ts`
- **Base path:** `/api/notification`
- **Endpoints:** 6 mapped, 1 with logging

| HTTP | Route | Handler | Activity | Audit | Domain | Notes |
|------|-------|---------|:--------:|:-----:|:------:|-------|
| GET | `/api/notification/` | getAll | No | No | No | — |
| GET | `/api/notification/:id` | getById | No | No | No | — |
| POST | `/api/notification/` | create | Yes | Yes | No | — |
| POST | `/api/notification/:id/mark-read` | markAsRead | No | No | No | — |
| PATCH | `/api/notification/:id` | update | No | No | No | — |
| DELETE | `/api/notification/:id` | remove | No | No | No | — |

### payrollperiod / payrollperiod

- **File:** `app/payrollperiod/payrollperiod.controller.ts`
- **Base path:** `/api/payrollPeriod`
- **Endpoints:** 16 mapped, 15 with logging

| HTTP | Route | Handler | Activity | Audit | Domain | Notes |
|------|-------|---------|:--------:|:-----:|:------:|-------|
| GET | `/api/payrollPeriod/` | getAll | Yes | No | No | activity-only on read |
| GET | `/api/payrollPeriod/:id` | getById | Yes | No | No | activity-only on read |
| GET | `/api/payrollPeriod/:id/generate-timesheet/preview` | previewTimesheetPayroll | Yes | No | No | activity-only on read; dry-run may include non-APPROVED timesheets as estimate-only (2026-08-12); Start Payroll still APPROVED-only |
| GET | `/api/payrollPeriod/:id/generate-timesheet/progress` | getActiveTimesheetGenerationProgress | Yes | No | No | activity-only on read |
| GET | `/api/payrollPeriod/config` | getConfig | Yes | No | No | activity-only on read |
| GET | `/api/payrollPeriod/generate-timesheet/progress/:jobId` | getTimesheetGenerationProgress | No | No | No | — |
| POST | `/api/payrollPeriod/` | create | Yes | Yes | No | — |
| POST | `/api/payrollPeriod/:id/generate` | generatePayroll | Yes | Yes | No | — |
| POST | `/api/payrollPeriod/:id/generate-timesheet` | generateTimesheetPayroll | Yes | Yes | No | — |
| POST | `/api/payrollPeriod/:id/generate-timesheet/pause` | requestPauseTimesheetPayroll | Yes | Yes | No | — |
| POST | `/api/payrollPeriod/:id/generate-timesheet/stop` | requestStopTimesheetPayroll | Yes | Yes | No | — |
| POST | `/api/payrollPeriod/bulk-adjust` | bulkAdjust | Yes | Yes | No | — |
| POST | `/api/payrollPeriod/bulk-generate` | bulkGenerate | Yes | Yes | No | — |
| PATCH | `/api/payrollPeriod/:id` | update | Yes | Yes | No | — |
| PATCH | `/api/payrollPeriod/config` | updateConfig | Yes | Yes | No | — |
| DELETE | `/api/payrollPeriod/:id` | remove | Yes | Yes | No | — |

<details><summary>Unmapped handlers</summary>

| Handler | Activity | Audit | Domain |
|---------|:--------:|:-----:|:------:|
| getOrCreatePayrollCycleConfig | No | No | No |
| getHolidayDateKeys | No | No | No |
| getDefaultCalculatorId | No | No | No |

</details>

### person / person

- **File:** `app/person/person.controller.ts`
- **Base path:** `/api/person`
- **Endpoints:** 5 mapped, 1 with logging

| HTTP | Route | Handler | Activity | Audit | Domain | Notes |
|------|-------|---------|:--------:|:-----:|:------:|-------|
| GET | `/api/person/` | getAll | No | No | No | — |
| GET | `/api/person/:id` | getById | No | No | No | — |
| POST | `/api/person/` | create | Yes | Yes | No | — |
| PATCH | `/api/person/:id` | update | No | No | No | — |
| DELETE | `/api/person/:id` | remove | No | No | No | — |

<details><summary>Unmapped handlers</summary>

| Handler | Activity | Audit | Domain |
|---------|:--------:|:-----:|:------:|
| updateUserMetadata | Yes | Yes | No |

</details>

### position / position

- **File:** `app/position/position.controller.ts`
- **Base path:** `/api/position`
- **Endpoints:** 7 mapped, 1 with logging

| HTTP | Route | Handler | Activity | Audit | Domain | Notes |
|------|-------|---------|:--------:|:-----:|:------:|-------|
| GET | `/api/position/` | getAll | No | No | No | — |
| GET | `/api/position/:id` | getById | No | No | No | — |
| GET | `/api/position/generate-code` | generateCode | No | No | No | — |
| POST | `/api/position/` | create | Yes | Yes | No | — |
| POST | `/api/position/import` | importFromXLSX | No | No | No | — |
| PATCH | `/api/position/:id` | update | No | No | No | — |
| DELETE | `/api/position/:id` | remove | No | No | No | — |

### report / report

- **File:** `app/report/report.controller.ts`
- **Base path:** `/api/reports`
- **Endpoints:** 2 mapped, 0 with logging

| HTTP | Route | Handler | Activity | Audit | Domain | Notes |
|------|-------|---------|:--------:|:-----:|:------:|-------|
| GET | `/api/reports/bir/2316` | downloadBir2316 | No | No | No | — |
| GET | `/api/reports/manpower-distribution/reference` | getManpowerDistributionReference | No | No | No | — |

### request / request

- **File:** `app/request/request.controller.ts`
- **Base path:** `/api/request`
- **Endpoints:** 12 mapped, 4 with logging

| HTTP | Route | Handler | Activity | Audit | Domain | Notes |
|------|-------|---------|:--------:|:-----:|:------:|-------|
| GET | `/api/request/` | getAll | Yes | No | No | activity-only on read |
| GET | `/api/request/:id` | getById | No | No | No | — |
| GET | `/api/request/statuses/:requestType` | getStatusesByType | No | No | No | — |
| POST | `/api/request/` | create | Yes | Yes | No | — |
| POST | `/api/request/:id/approval` | approval | Yes | Yes | No | — |
| POST | `/api/request/:id/delegate-step` | delegateStep | No | No | No | — |
| POST | `/api/request/:id/escalate-step` | escalateStep | No | No | No | — |
| POST | `/api/request/:id/generate-document` | generateDocument | No | No | No | — |
| POST | `/api/request/:id/start-offboarding` | startOffboarding | Yes | No | No | activity-only |
| PATCH | `/api/request/:id` | update | No | No | No | — |
| PATCH | `/api/request/:id/cancel` | cancel | No | No | No | — |
| DELETE | `/api/request/:id` | remove | No | No | No | — |

<details><summary>Unmapped handlers</summary>

| Handler | Activity | Audit | Domain |
|---------|:--------:|:-----:|:------:|
| isEmployeeInReportingTree | No | No | No |
| generateRequestCode | Yes | Yes | No |
| syncTimesheetSubmissionDecision | No | No | No |
| getActingEmployeeId | No | No | No |
| validateLeaveRequestAgainstPolicyOrThrow | No | No | No |
| validateLeaveDatesAgainstScheduleOrThrow | No | No | No |
| applyAttendanceCorrectionApprovalSideEffects | No | No | No |
| applyTimeAdjustmentApprovalSideEffects | No | No | No |
| applyLeaveApprovalSideEffects | No | No | No |
| processApprovalSideEffects | No | No | No |

</details>

### requestTransaction / requestTransaction

- **File:** `app/requestTransaction/requestTransaction.controller.ts`
- **Base path:** `/api/requestTransaction`
- **Endpoints:** 5 mapped, 1 with logging

| HTTP | Route | Handler | Activity | Audit | Domain | Notes |
|------|-------|---------|:--------:|:-----:|:------:|-------|
| GET | `/api/requestTransaction/` | getAll | No | No | No | — |
| GET | `/api/requestTransaction/:id` | getById | No | No | No | — |
| POST | `/api/requestTransaction/` | create | Yes | Yes | No | — |
| PATCH | `/api/requestTransaction/:id` | update | No | No | No | — |
| DELETE | `/api/requestTransaction/:id` | remove | No | No | No | — |

### Rule / rule

- **File:** `app/Rule/rule.controller.ts`
- **Base path:** `/api/Rule`
- **Endpoints:** 5 mapped, 1 with logging

| HTTP | Route | Handler | Activity | Audit | Domain | Notes |
|------|-------|---------|:--------:|:-----:|:------:|-------|
| GET | `/api/Rule/` | getAll | No | No | No | — |
| GET | `/api/Rule/:id` | getById | No | No | No | — |
| POST | `/api/Rule/` | create | Yes | Yes | No | — |
| PATCH | `/api/Rule/:id` | update | No | No | No | — |
| DELETE | `/api/Rule/:id` | remove | No | No | No | — |

### scheduleOverride / scheduleOverride

- **File:** `app/scheduleOverride/scheduleOverride.controller.ts`
- **Base path:** `/api/scheduleOverride`
- **Endpoints:** 5 mapped, 1 with logging

| HTTP | Route | Handler | Activity | Audit | Domain | Notes |
|------|-------|---------|:--------:|:-----:|:------:|-------|
| GET | `/api/scheduleOverride/` | getAll | No | No | No | — |
| GET | `/api/scheduleOverride/:id` | getById | No | No | No | — |
| POST | `/api/scheduleOverride/` | create | Yes | Yes | No | — |
| PATCH | `/api/scheduleOverride/:id` | update | No | No | No | — |
| DELETE | `/api/scheduleOverride/:id` | remove | No | No | No | — |

<details><summary>Unmapped handlers</summary>

| Handler | Activity | Audit | Domain |
|---------|:--------:|:-----:|:------:|
| enrichScheduleOverridesWithShiftChange | No | No | No |

</details>

### scheduleTemplate / scheduleScheduleTemplate

- **File:** `app/scheduleTemplate/scheduleScheduleTemplate.controller.ts`
- **Base path:** `/api/scheduleTemplate`
- **Endpoints:** 8 mapped, 2 with logging

| HTTP | Route | Handler | Activity | Audit | Domain | Notes |
|------|-------|---------|:--------:|:-----:|:------:|-------|
| GET | `/api/scheduleTemplate/` | getAll | No | No | No | — |
| GET | `/api/scheduleTemplate/:id` | getById | No | No | No | — |
| GET | `/api/scheduleTemplate/generate-code` | generateCode | No | No | No | — |
| POST | `/api/scheduleTemplate/` | create | Yes | Yes | No | — |
| POST | `/api/scheduleTemplate/:id/duplicate` | duplicate | Yes | Yes | No | — |
| POST | `/api/scheduleTemplate/import` | importFromXLSX | No | No | No | — |
| PATCH | `/api/scheduleTemplate/:id` | update | No | No | No | — |
| DELETE | `/api/scheduleTemplate/:id` | remove | No | No | No | — |

### section / section

- **File:** `app/section/section.controller.ts`
- **Base path:** `/api/section`
- **Endpoints:** 7 mapped, 1 with logging

| HTTP | Route | Handler | Activity | Audit | Domain | Notes |
|------|-------|---------|:--------:|:-----:|:------:|-------|
| GET | `/api/section/` | getAll | No | No | No | — |
| GET | `/api/section/:id` | getById | No | No | No | — |
| GET | `/api/section/generate-code` | generateCode | No | No | No | — |
| POST | `/api/section/` | create | Yes | Yes | No | — |
| POST | `/api/section/import` | importFromXLSX | No | No | No | — |
| PATCH | `/api/section/:id` | update | No | No | No | — |
| DELETE | `/api/section/:id` | remove | No | No | No | — |

<details><summary>Unmapped handlers</summary>

| Handler | Activity | Audit | Domain |
|---------|:--------:|:-----:|:------:|
| assertScheduleTemplateInOrganization | No | No | No |

</details>

### shiftType / shiftType

- **File:** `app/shiftType/shiftType.controller.ts`
- **Base path:** `/api/shiftType`
- **Endpoints:** 7 mapped, 1 with logging

| HTTP | Route | Handler | Activity | Audit | Domain | Notes |
|------|-------|---------|:--------:|:-----:|:------:|-------|
| GET | `/api/shiftType/` | getAll | No | No | No | — |
| GET | `/api/shiftType/:id` | getById | No | No | No | — |
| GET | `/api/shiftType/generate-code` | generateCode | No | No | No | — |
| POST | `/api/shiftType/` | create | Yes | Yes | No | — |
| POST | `/api/shiftType/import` | importFromXLSX | No | No | No | — |
| PATCH | `/api/shiftType/:id` | update | No | No | No | — |
| DELETE | `/api/shiftType/:id` | remove | No | No | No | — |

<details><summary>Unmapped handlers</summary>

| Handler | Activity | Audit | Domain |
|---------|:--------:|:-----:|:------:|
| ensureBnpiDefaultScheduleTemplate | No | No | No |

</details>

### soalineitem / soalineitem

- **File:** `app/soalineitem/soalineitem.controller.ts`
- **Base path:** `/api/soalineitem`
- **Endpoints:** 5 mapped, 1 with logging

| HTTP | Route | Handler | Activity | Audit | Domain | Notes |
|------|-------|---------|:--------:|:-----:|:------:|-------|
| GET | `/api/soalineitem/` | getAll | No | No | No | — |
| GET | `/api/soalineitem/:id` | getById | No | No | No | — |
| POST | `/api/soalineitem/` | create | Yes | Yes | No | — |
| PATCH | `/api/soalineitem/:id` | update | No | No | No | — |
| DELETE | `/api/soalineitem/:id` | remove | No | No | No | — |

<details><summary>Unmapped handlers</summary>

| Handler | Activity | Audit | Domain |
|---------|:--------:|:-----:|:------:|
| recalculateStatementOfAccountTotals | No | No | No |

</details>

### soaremittance / soaremittance

- **File:** `app/soaremittance/soaremittance.controller.ts`
- **Base path:** `/api/soaremittance`
- **Endpoints:** 5 mapped, 1 with logging

| HTTP | Route | Handler | Activity | Audit | Domain | Notes |
|------|-------|---------|:--------:|:-----:|:------:|-------|
| GET | `/api/soaremittance/` | getAll | No | No | No | — |
| GET | `/api/soaremittance/:id` | getById | No | No | No | — |
| POST | `/api/soaremittance/` | create | Yes | Yes | No | — |
| PATCH | `/api/soaremittance/:id` | update | No | No | No | — |
| DELETE | `/api/soaremittance/:id` | remove | No | No | No | — |

### statementofaccount / statementofaccount

- **File:** `app/statementofaccount/statementofaccount.controller.ts`
- **Base path:** `/api/statementofaccount`
- **Endpoints:** 5 mapped, 1 with logging

| HTTP | Route | Handler | Activity | Audit | Domain | Notes |
|------|-------|---------|:--------:|:-----:|:------:|-------|
| GET | `/api/statementofaccount/` | getAll | No | No | No | — |
| GET | `/api/statementofaccount/:id` | getById | No | No | No | — |
| POST | `/api/statementofaccount/` | create | Yes | Yes | No | — |
| PATCH | `/api/statementofaccount/:id` | update | No | No | No | — |
| DELETE | `/api/statementofaccount/:id` | remove | No | No | No | — |

### status / status

- **File:** `app/status/status.controller.ts`
- **Base path:** `/api/`
- **Endpoints:** 0 mapped, 0 with logging

_No router mappings found._

### systemProvisioning / systemProvisioning

- **File:** `app/systemProvisioning/systemProvisioning.controller.ts`
- **Base path:** `/api/system-provisioning`
- **Endpoints:** 13 mapped, 13 with logging

| HTTP | Route | Handler | Activity | Audit | Domain | Notes |
|------|-------|---------|:--------:|:-----:|:------:|-------|
| GET | `/api/system-provisioning/leave-settings` | getLeaveSettings | Yes | No | No | activity-only on read |
| GET | `/api/system-provisioning/payroll-settings` | getPayrollSettings | Yes | No | No | activity-only on read |
| GET | `/api/system-provisioning/preview` | getPreview | Yes | No | No | activity-only on read |
| GET | `/api/system-provisioning/status` | getStatus | Yes | No | No | activity-only on read |
| GET | `/api/system-provisioning/timesheet-settings` | getTimesheetSettings | Yes | No | No | activity-only on read |
| POST | `/api/system-provisioning/activate` | activate | Yes | Yes | No | — |
| POST | `/api/system-provisioning/bootstrap-admin` | bootstrapAdmin | Yes | Yes | No | — |
| POST | `/api/system-provisioning/initialize` | initialize | Yes | Yes | No | — |
| POST | `/api/system-provisioning/logo` | uploadLogo | Yes | Yes | No | — |
| PATCH | `/api/system-provisioning/hr-settings` | updateHrSettings | Yes | Yes | No | — |
| PATCH | `/api/system-provisioning/leave-settings` | updateLeaveSettings | Yes | Yes | No | — |
| PATCH | `/api/system-provisioning/payroll-settings` | updatePayrollSettings | Yes | Yes | No | — |
| PATCH | `/api/system-provisioning/timesheet-settings` | updateTimesheetSettings | Yes | Yes | No | — |

<details><summary>Unmapped handlers</summary>

| Handler | Activity | Audit | Domain |
|---------|:--------:|:-----:|:------:|
| touchProvisioningStep | No | No | No |
| updateProvisioningState | No | No | No |
| getOrCreatePayrollCycleConfig | No | No | No |
| ensureDefaultCalculator | No | No | No |
| ensureLocalOrganization | No | No | No |
| resolveProvisioningOrganization | No | No | No |
| listAdminUsers | No | No | No |
| getProvisioningSnapshot | No | No | No |

</details>

### template / template

- **File:** `app/template/template.controller.ts`
- **Base path:** `/api/template`
- **Endpoints:** 5 mapped, 5 with logging

| HTTP | Route | Handler | Activity | Audit | Domain | Notes |
|------|-------|---------|:--------:|:-----:|:------:|-------|
| GET | `/api/template/` | getAll | Yes | No | No | activity-only on read |
| GET | `/api/template/:id` | getById | Yes | No | No | activity-only on read |
| POST | `/api/template/` | create | Yes | Yes | No | — |
| PATCH | `/api/template/:id` | update | Yes | Yes | No | — |
| DELETE | `/api/template/:id` | remove | Yes | Yes | No | — |

### templateItem / templateItem

- **File:** `app/templateItem/templateItem.controller.ts`
- **Base path:** `/api/templateItem`
- **Endpoints:** 6 mapped, 2 with logging

| HTTP | Route | Handler | Activity | Audit | Domain | Notes |
|------|-------|---------|:--------:|:-----:|:------:|-------|
| GET | `/api/templateItem/` | getAll | No | No | No | — |
| GET | `/api/templateItem/:id` | getById | No | No | No | — |
| POST | `/api/templateItem/` | create | Yes | Yes | No | — |
| POST | `/api/templateItem/bulk` | bulkCreate | Yes | Yes | No | — |
| PATCH | `/api/templateItem/:id` | update | No | No | No | — |
| DELETE | `/api/templateItem/:id` | remove | No | No | No | — |

### termination / termination

- **File:** `app/termination/termination.controller.ts`
- **Base path:** `/api/termination`
- **Endpoints:** 10 mapped, 10 with logging

| HTTP | Route | Handler | Activity | Audit | Domain | Notes |
|------|-------|---------|:--------:|:-----:|:------:|-------|
| GET | `/api/termination/` | getAll | Yes | No | No | activity-only on read |
| GET | `/api/termination/:id` | getById | Yes | No | No | activity-only on read |
| POST | `/api/termination/` | create | Yes | Yes | Yes | domain-specific TerminationAuditLog |
| POST | `/api/termination/:id/complete` | complete | Yes | Yes | Yes | domain-specific TerminationAuditLog |
| POST | `/api/termination/:id/hr-director-approval` | hrDirectorApproval | Yes | Yes | Yes | domain-specific TerminationAuditLog |
| POST | `/api/termination/:id/legal-approval` | legalApproval | Yes | Yes | Yes | domain-specific TerminationAuditLog |
| POST | `/api/termination/:id/start-processing` | startProcessing | Yes | Yes | Yes | domain-specific TerminationAuditLog |
| POST | `/api/termination/:id/submit` | submit | Yes | Yes | Yes | domain-specific TerminationAuditLog |
| PATCH | `/api/termination/:id` | update | Yes | Yes | No | — |
| DELETE | `/api/termination/:id` | remove | Yes | Yes | No | — |

### timesheet / timesheet

- **File:** `app/timesheet/timesheet.controller.ts`
- **Base path:** `/api/timesheet`
- **Endpoints:** 19 mapped, 8 with logging

| HTTP | Route | Handler | Activity | Audit | Domain | Notes |
|------|-------|---------|:--------:|:-----:|:------:|-------|
| GET | `/api/timesheet/` | getAll | No | No | No | — |
| GET | `/api/timesheet/:id` | getById | No | No | No | — |
| GET | `/api/timesheet/config` | getConfig | No | No | No | — |
| GET | `/api/timesheet/view` | view | No | No | No | — |
| POST | `/api/timesheet/` | create | Yes | Yes | No | — |
| POST | `/api/timesheet/:id/action` | action | Yes | Yes | No | — |
| POST | `/api/timesheet/:id/edit-permission/consume` | consumeEditPermission | No | No | No | — |
| POST | `/api/timesheet/:id/edit-permission/request` | requestEditPermission | No | No | No | — |
| POST | `/api/timesheet/:id/edit-permission/review` | reviewEditPermission | No | No | No | — |
| POST | `/api/timesheet/:id/reminder` | sendReminder | Yes | No | No | activity-only |
| POST | `/api/timesheet/current-period-repair` | repairCurrentPeriodCoverage | No | No | No | — |
| POST | `/api/timesheet/edit-permission/request-current` | requestCurrentEditPermission | No | No | No | — |
| POST | `/api/timesheet/ensure-period-drafts` | ensurePeriodDrafts | No | No | No | — |
| POST | `/api/timesheet/lock-period` | lockPeriodTimesheets | Yes | No | No | activity-only |
| POST | `/api/timesheet/normalize-breakdown-preview` | normalizeBreakdownPreview | No | No | No | — |
| POST | `/api/timesheet/submit` | submit | Yes | Yes | No | — |
| PATCH | `/api/timesheet/:id` | update | Yes | Yes | No | — |
| PATCH | `/api/timesheet/config` | updateConfig | Yes | Yes | No | — |
| DELETE | `/api/timesheet/:id` | remove | Yes | Yes | No | — |

<details><summary>Unmapped handlers</summary>

| Handler | Activity | Audit | Domain |
|---------|:--------:|:-----:|:------:|
| findTimesheetLock | No | No | No |
| enrichTimesheetBreakdownWithRevisionSummary | No | No | No |
| getApprovedEditedDaysSummary | No | No | No |
| normalizeBreakdownForPersistence | No | No | No |
| injectNightShiftIntoBreakdown | No | No | No |
| generateRequestCode | No | No | No |
| getActingEmployeeId | No | No | No |
| enrichTimesheetPermissionDisplay | No | No | No |
| invalidateTimesheetCaches | No | No | No |
| resolvePayrollPeriod | No | No | No |
| resolveTimesheetWorkflow | No | No | No |
| assertEditingPolicyEnabled | No | No | No |
| createEditPermissionRequestForTimesheet | No | No | No |
| getLatestTimesheetSubmissionRequest | No | No | No |
| createOrReuseTimesheetSubmissionRequest | No | No | No |
| applySubmissionRequestReview | No | No | No |

</details>

### timesheetline / timesheetline

- **File:** `app/timesheetline/timesheetline.controller.ts`
- **Base path:** `/api/timesheetline`
- **Endpoints:** 5 mapped, 1 with logging

| HTTP | Route | Handler | Activity | Audit | Domain | Notes |
|------|-------|---------|:--------:|:-----:|:------:|-------|
| GET | `/api/timesheetline/` | getAll | No | No | No | — |
| GET | `/api/timesheetline/:id` | getById | No | No | No | — |
| POST | `/api/timesheetline/` | create | Yes | Yes | No | — |
| PATCH | `/api/timesheetline/:id` | update | No | No | No | — |
| DELETE | `/api/timesheetline/:id` | remove | No | No | No | — |

### workflowConfig / workflowConfig

- **File:** `app/workflowConfig/workflowConfig.controller.ts`
- **Base path:** `/api/workflow-config`
- **Endpoints:** 7 mapped, 7 with logging

| HTTP | Route | Handler | Activity | Audit | Domain | Notes |
|------|-------|---------|:--------:|:-----:|:------:|-------|
| GET | `/api/workflow-config/` | getAll | Yes | No | No | activity-only on read |
| GET | `/api/workflow-config/:code` | getByCode | Yes | No | No | activity-only on read |
| POST | `/api/workflow-config/` | create | Yes | Yes | No | — |
| POST | `/api/workflow-config/:code/reset` | reset | Yes | Yes | No | — |
| POST | `/api/workflow-config/initialize-defaults` | initializeDefaults | Yes | Yes | No | — |
| PATCH | `/api/workflow-config/:code` | update | Yes | Yes | No | — |
| DELETE | `/api/workflow-config/:code` | remove | Yes | Yes | No | — |

<details><summary>Unmapped handlers</summary>

| Handler | Activity | Audit | Domain |
|---------|:--------:|:-----:|:------:|
| resolveOrganization | No | No | No |

</details>

### workflowEngine / workflowEngine

- **File:** `app/workflowEngine/workflowEngine.controller.ts`
- **Base path:** `/api/workflowEngine`
- **Endpoints:** 5 mapped, 3 with logging

| HTTP | Route | Handler | Activity | Audit | Domain | Notes |
|------|-------|---------|:--------:|:-----:|:------:|-------|
| GET | `/api/workflowEngine/` | getAll | No | No | No | — |
| GET | `/api/workflowEngine/:id` | getById | No | No | No | — |
| POST | `/api/workflowEngine/` | create | Yes | Yes | No | — |
| PATCH | `/api/workflowEngine/:id` | update | Yes | Yes | No | — |
| DELETE | `/api/workflowEngine/:id` | remove | Yes | Yes | No | — |

### workforceRecruitmentSetting / workforceRecruitmentSetting

- **File:** `app/workforceRecruitmentSetting/workforceRecruitmentSetting.controller.ts`
- **Base path:** `/api/workforce-recruitment-setting`
- **Endpoints:** 3 mapped, 3 with logging

| HTTP | Route | Handler | Activity | Audit | Domain | Notes |
|------|-------|---------|:--------:|:-----:|:------:|-------|
| GET | `/api/workforce-recruitment-setting/` | getSettings | Yes | No | No | activity-only on read |
| GET | `/api/workforce-recruitment-setting/request-context` | getRequestContext | Yes | No | No | activity-only on read |
| PATCH | `/api/workforce-recruitment-setting/` | updateSettings | Yes | Yes | No | — |

<details><summary>Unmapped handlers</summary>

| Handler | Activity | Audit | Domain |
|---------|:--------:|:-----:|:------:|
| ensureProvisioningOrganization | No | No | No |
| resolveOrganization | No | No | No |

</details>

## Controllers With Zero Logging

**11 controllers** have no `logActivity`, `logAudit`, delegated, or domain audit calls:

- **activityLogging / activityLogging** (5 endpoints) — `app/activityLogging/activityLogging.controller.ts`
- **auditLogging / auditLogging** (5 endpoints) — `app/auditLogging/auditLogging.controller.ts`
- **celebrations / celebrations** (2 endpoints) — `app/celebrations/celebrations.controller.ts`
- **dashboard / dashboard** (8 endpoints) — `app/dashboard/dashboard.controller.ts`
- **docs / docs** (4 endpoints) — `app/docs/docs.controller.ts`
- **employeeDocuments / employeeDocuments** (2 endpoints) — `app/employeeDocuments/employeeDocuments.controller.ts`
- **hikvision / controller / access.control** (19 endpoints) — `app/hikvision/controller/access.control.controller.ts`
- **hikvision / controller / callback** (1 endpoints) — `app/hikvision/controller/callback.controller.ts`
- **hikvision / controller / users** (17 endpoints) — `app/hikvision/controller/users.controller.ts`
- **report / report** (2 endpoints) — `app/report/report.controller.ts`
- **status / status** (0 endpoints) — `app/status/status.controller.ts`

## Partial Coverage Highlights

### Create-only logging modules

- benefitType / benefitType
- boardingProcess / boardingProcess
- boardingTemplate / boardingtemplate
- calculator / calculator
- calendar-item / calendar-item
- checklistItem / checklistItem
- department / department
- document / document
- employeeBenefit / employeeBenefit
- employeeLoan / employeeLoan
- guide / guide
- job / job
- leaveType / leaveType
- level / level
- loanType / loanType
- note / note
- notification / notification
- person / person
- position / position
- requestTransaction / requestTransaction
- Rule / rule
- scheduleOverride / scheduleOverride
- section / section
- shiftType / shiftType
- soalineitem / soalineitem
- soaremittance / soaremittance
- statementofaccount / statementofaccount
- timesheetline / timesheetline

### High-risk unlogged mutations (sample)

**migration / migration** — 5 unlogged mutation(s):
- POST `/api/migration/dm3/import-employee-benefits-loans` (importDm3EmployeeBenefitsLoans)
- POST `/api/migration/dm3/import-employee-documents` (importDm3EmployeeDocuments)
- POST `/api/migration/dm3/import-employee-schedules` (importDm3EmployeeSchedules)
- POST `/api/migration/dm3/import-opening-leave-balances` (importDm3OpeningLeaveBalances)
- POST `/api/migration/dm3/import-reporting-lines` (importDm3ReportingLines)

## Regenerating This Report

```bash
cd hris-api && npx tsx scripts/generate-logging-audit.ts
```
