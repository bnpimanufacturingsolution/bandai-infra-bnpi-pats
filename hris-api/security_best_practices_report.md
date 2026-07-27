# HRIS API Logging Audit

## Executive Summary

The codebase does have a logging pattern: most controllers call `logActivity()` for successful actions and `logAudit()` for mutations. The backend also has a dedicated audit table and a generated coverage report.

The main risks are not the presence of logging, but the gaps:

- The audit/activity log controllers themselves are not logged, which creates a blind spot for tampering with the evidence trail.
- Several sensitive controllers have zero logging, especially employee documents, Hikvision device/user management, and report generation.
- Some high-impact workflow mutations are only partially logged, or not logged at all, in attendance and timesheet flows.

One important note: the DM3 migration import helpers do use delegated activity/audit logging through `logDm3ImportSuccess()`, so the coverage report's "no standard logging" label needs manual interpretation there.

## High Severity

### F1. Audit trail and activity log CRUD are not themselves audited

`activityLogging` and `auditLogging` both expose full CRUD without any activity or audit trail of their own. That means an operator who can edit or delete logs can do so without a second-order record.

Evidence:

- [docs/logging-audit.md](C:/Users/User/Desktop/DEVS PROJECTS/BANDAI/hris-api/docs/logging-audit.md#L48)
- [docs/logging-audit.md](C:/Users/User/Desktop/DEVS PROJECTS/BANDAI/hris-api/docs/logging-audit.md#L128)
- [docs/logging-audit.md](C:/Users/User/Desktop/DEVS PROJECTS/BANDAI/hris-api/docs/logging-audit.md#L1339)
- [activityLogging.controller.ts](C:/Users/User/Desktop/DEVS PROJECTS/BANDAI/hris-api/app/activityLogging/activityLogging.controller.ts#L24)
- [activityLogging.controller.ts](C:/Users/User/Desktop/DEVS PROJECTS/BANDAI/hris-api/app/activityLogging/activityLogging.controller.ts#L80)
- [activityLogging.controller.ts](C:/Users/User/Desktop/DEVS PROJECTS/BANDAI/hris-api/app/activityLogging/activityLogging.controller.ts#L160)
- [activityLogging.controller.ts](C:/Users/User/Desktop/DEVS PROJECTS/BANDAI/hris-api/app/activityLogging/activityLogging.controller.ts#L253)
- [activityLogging.controller.ts](C:/Users/User/Desktop/DEVS PROJECTS/BANDAI/hris-api/app/activityLogging/activityLogging.controller.ts#L333)
- [auditLogging.controller.ts](C:/Users/User/Desktop/DEVS PROJECTS/BANDAI/hris-api/app/auditLogging/auditLogging.controller.ts#L24)
- [auditLogging.controller.ts](C:/Users/User/Desktop/DEVS PROJECTS/BANDAI/hris-api/app/auditLogging/auditLogging.controller.ts#L80)
- [auditLogging.controller.ts](C:/Users/User/Desktop/DEVS PROJECTS/BANDAI/hris-api/app/auditLogging/auditLogging.controller.ts#L160)
- [auditLogging.controller.ts](C:/Users/User/Desktop/DEVS PROJECTS/BANDAI/hris-api/app/auditLogging/auditLogging.controller.ts#L253)
- [auditLogging.controller.ts](C:/Users/User/Desktop/DEVS PROJECTS/BANDAI/hris-api/app/auditLogging/auditLogging.controller.ts#L333)

Impact:

- Log deletion or modification can erase forensic evidence with no higher-level trace.

## High Severity

### F2. Sensitive controllers with zero activity/audit logging

The coverage report marks the following controllers as having no activity, audit, delegated, or domain audit logging:

- `employeeDocuments`
- `hikvision/controller/access.control`
- `hikvision/controller/users`
- `report`

These are not low-risk utility surfaces. They handle employee documents, biometric/device administration, and report generation with sensitive HR data.

Evidence:

- [docs/logging-audit.md](C:/Users/User/Desktop/DEVS PROJECTS/BANDAI/hris-api/docs/logging-audit.md#L1339)
- [docs/logging-audit.md](C:/Users/User/Desktop/DEVS PROJECTS/BANDAI/hris-api/docs/logging-audit.md#L1346)
- [docs/logging-audit.md](C:/Users/User/Desktop/DEVS PROJECTS/BANDAI/hris-api/docs/logging-audit.md#L1347)
- [docs/logging-audit.md](C:/Users/User/Desktop/DEVS PROJECTS/BANDAI/hris-api/docs/logging-audit.md#L1349)
- [docs/logging-audit.md](C:/Users/User/Desktop/DEVS PROJECTS/BANDAI/hris-api/docs/logging-audit.md#L1350)
- [employeeDocuments.controller.ts](C:/Users/User/Desktop/DEVS PROJECTS/BANDAI/hris-api/app/employeeDocuments/employeeDocuments.controller.ts#L24)
- [employeeDocuments.controller.ts](C:/Users/User/Desktop/DEVS PROJECTS/BANDAI/hris-api/app/employeeDocuments/employeeDocuments.controller.ts#L80)
- [employeeDocuments.controller.ts](C:/Users/User/Desktop/DEVS PROJECTS/BANDAI/hris-api/app/employeeDocuments/employeeDocuments.controller.ts#L160)
- [employeeDocuments.controller.ts](C:/Users/User/Desktop/DEVS PROJECTS/BANDAI/hris-api/app/employeeDocuments/employeeDocuments.controller.ts#L253)
- [employeeDocuments.controller.ts](C:/Users/User/Desktop/DEVS PROJECTS/BANDAI/hris-api/app/employeeDocuments/employeeDocuments.controller.ts#L333)
- [access.control.controller.ts](C:/Users/User/Desktop/DEVS PROJECTS/BANDAI/hris-api/app/hikvision/controller/access.control.controller.ts#L320)
- [access.control.controller.ts](C:/Users/User/Desktop/DEVS PROJECTS/BANDAI/hris-api/app/hikvision/controller/access.control.controller.ts#L543)
- [access.control.controller.ts](C:/Users/User/Desktop/DEVS PROJECTS/BANDAI/hris-api/app/hikvision/controller/access.control.controller.ts#L736)
- [users.controller.ts](C:/Users/User/Desktop/DEVS PROJECTS/BANDAI/hris-api/app/hikvision/controller/users.controller.ts#L61)
- [users.controller.ts](C:/Users/User/Desktop/DEVS PROJECTS/BANDAI/hris-api/app/hikvision/controller/users.controller.ts#L87)
- [users.controller.ts](C:/Users/User/Desktop/DEVS PROJECTS/BANDAI/hris-api/app/hikvision/controller/users.controller.ts#L117)
- [users.controller.ts](C:/Users/User/Desktop/DEVS PROJECTS/BANDAI/hris-api/app/hikvision/controller/users.controller.ts#L371)
- [report.controller.ts](C:/Users/User/Desktop/DEVS PROJECTS/BANDAI/hris-api/app/report/report.controller.ts#L30)
- [report.controller.ts](C:/Users/User/Desktop/DEVS PROJECTS/BANDAI/hris-api/app/report/report.controller.ts#L80)

Impact:

- Employee document access and biometric device/user changes are invisible to the normal audit trail.
- Report generation can leak sensitive HR data without a trace that the report was produced.

## Medium Severity

### F3. Attendance mutations are only partially logged

Attendance has decent coverage for create/backfill/correction, but the following mutation paths are unlogged in the coverage report:

- `POST /api/attendance/import`
- `POST /api/attendance/uzaro/import`
- `PATCH /api/attendance/:id`
- `DELETE /api/attendance/:id`

The correction path is audited, but import/update/remove flows are not. Those are high-value actions in an HRIS because they affect raw clock data and downstream payroll/timesheet outcomes.

Evidence:

- [docs/logging-audit.md](C:/Users/User/Desktop/DEVS PROJECTS/BANDAI/hris-api/docs/logging-audit.md#L112)
- [docs/logging-audit.md](C:/Users/User/Desktop/DEVS PROJECTS/BANDAI/hris-api/docs/logging-audit.md#L115)
- [docs/logging-audit.md](C:/Users/User/Desktop/DEVS PROJECTS/BANDAI/hris-api/docs/logging-audit.md#L116)
- [docs/logging-audit.md](C:/Users/User/Desktop/DEVS PROJECTS/BANDAI/hris-api/docs/logging-audit.md#L117)
- [docs/logging-audit.md](C:/Users/User/Desktop/DEVS PROJECTS/BANDAI/hris-api/docs/logging-audit.md#L118)
- [attendance.controller.ts](C:/Users/User/Desktop/DEVS PROJECTS/BANDAI/hris-api/app/attendance/attendance.controller.ts#L200)
- [attendance.controller.ts](C:/Users/User/Desktop/DEVS PROJECTS/BANDAI/hris-api/app/attendance/attendance.controller.ts#L224)
- [attendance.controller.ts](C:/Users/User/Desktop/DEVS PROJECTS/BANDAI/hris-api/app/attendance/attendance.controller.ts#L307)
- [attendance.controller.ts](C:/Users/User/Desktop/DEVS PROJECTS/BANDAI/hris-api/app/attendance/attendance.controller.ts#L335)
- [attendance.controller.ts](C:/Users/User/Desktop/DEVS PROJECTS/BANDAI/hris-api/app/attendance/attendance.controller.ts#L522)
- [attendance.controller.ts](C:/Users/User/Desktop/DEVS PROJECTS/BANDAI/hris-api/app/attendance/attendance.controller.ts#L669)
- [attendance.controller.ts](C:/Users/User/Desktop/DEVS PROJECTS/BANDAI/hris-api/app/attendance/attendance.controller.ts#L679)

### F4. Timesheet workflow mutations have gaps, especially edit-permission flows and period locking

The timesheet controller has a mixed picture:

- `submit`, `update`, `updateConfig`, and `remove` are logged.
- `lockPeriodTimesheets` is activity-only even though it mutates lock state.
- `requestEditPermission` and `reviewEditPermission` are listed as unlogged, even though they create workflow records and update workflow/timesheet state.
- `sendReminder` is activity-only, which is acceptable if treated as a non-CUD notification action.

Evidence:

- [docs/logging-audit.md](C:/Users/User/Desktop/DEVS PROJECTS/BANDAI/hris-api/docs/logging-audit.md#L1226)
- [docs/logging-audit.md](C:/Users/User/Desktop/DEVS PROJECTS/BANDAI/hris-api/docs/logging-audit.md#L1227)
- [docs/logging-audit.md](C:/Users/User/Desktop/DEVS PROJECTS/BANDAI/hris-api/docs/logging-audit.md#L1228)
- [docs/logging-audit.md](C:/Users/User/Desktop/DEVS PROJECTS/BANDAI/hris-api/docs/logging-audit.md#L1229)
- [docs/logging-audit.md](C:/Users/User/Desktop/DEVS PROJECTS/BANDAI/hris-api/docs/logging-audit.md#L1230)
- [docs/logging-audit.md](C:/Users/User/Desktop/DEVS PROJECTS/BANDAI/hris-api/docs/logging-audit.md#L1234)
- [docs/logging-audit.md](C:/Users/User/Desktop/DEVS PROJECTS/BANDAI/hris-api/docs/logging-audit.md#L1236)
- [docs/logging-audit.md](C:/Users/User/Desktop/DEVS PROJECTS/BANDAI/hris-api/docs/logging-audit.md#L1237)
- [docs/logging-audit.md](C:/Users/User/Desktop/DEVS PROJECTS/BANDAI/hris-api/docs/logging-audit.md#L1238)
- [docs/logging-audit.md](C:/Users/User/Desktop/DEVS PROJECTS/BANDAI/hris-api/docs/logging-audit.md#L1239)
- [timesheet.controller.ts](C:/Users/User/Desktop/DEVS PROJECTS/BANDAI/hris-api/app/timesheet/timesheet.controller.ts#L3751)
- [timesheet.controller.ts](C:/Users/User/Desktop/DEVS PROJECTS/BANDAI/hris-api/app/timesheet/timesheet.controller.ts#L3823)
- [timesheet.controller.ts](C:/Users/User/Desktop/DEVS PROJECTS/BANDAI/hris-api/app/timesheet/timesheet.controller.ts#L3845)
- [timesheet.controller.ts](C:/Users/User/Desktop/DEVS PROJECTS/BANDAI/hris-api/app/timesheet/timesheet.controller.ts#L4460)
- [timesheet.controller.ts](C:/Users/User/Desktop/DEVS PROJECTS/BANDAI/hris-api/app/timesheet/timesheet.controller.ts#L4511)
- [timesheet.controller.ts](C:/Users/User/Desktop/DEVS PROJECTS/BANDAI/hris-api/app/timesheet/timesheet.controller.ts#L4599)
- [timesheet.controller.ts](C:/Users/User/Desktop/DEVS PROJECTS/BANDAI/hris-api/app/timesheet/timesheet.controller.ts#L4758)
- [timesheet.controller.ts](C:/Users/User/Desktop/DEVS PROJECTS/BANDAI/hris-api/app/timesheet/timesheet.controller.ts#L4800)

Impact:

- Locking a pay period and handling edit permission requests/responses affects payroll-critical workflow state without a complete audit trail.

## Notes

### Delegated migration logging is present

The DM3 migration import handlers are not actually bare. They call `logDm3ImportSuccess()`, which delegates to `logMigrationActivity()` and `logMigrationAudit()`.

Evidence:

- [migration.controller.ts](C:/Users/User/Desktop/DEVS PROJECTS/BANDAI/hris-api/app/migration/migration.controller.ts#L1721)
- [migration.controller.ts](C:/Users/User/Desktop/DEVS PROJECTS/BANDAI/hris-api/app/migration/migration.controller.ts#L1738)
- [migration.controller.ts](C:/Users/User/Desktop/DEVS PROJECTS/BANDAI/hris-api/app/migration/migration.controller.ts#L1777)
- [migration.controller.ts](C:/Users/User/Desktop/DEVS PROJECTS/BANDAI/hris-api/app/migration/migration.controller.ts#L2843)
- [migration.controller.ts](C:/Users/User/Desktop/DEVS PROJECTS/BANDAI/hris-api/app/migration/migration.controller.ts#L2916)
- [migration.controller.ts](C:/Users/User/Desktop/DEVS PROJECTS/BANDAI/hris-api/app/migration/migration.controller.ts#L3113)
- [migration.controller.ts](C:/Users/User/Desktop/DEVS PROJECTS/BANDAI/hris-api/app/migration/migration.controller.ts#L3199)
- [migration.controller.ts](C:/Users/User/Desktop/DEVS PROJECTS/BANDAI/hris-api/app/migration/migration.controller.ts#L3538)

## Recommended Next Step

If you want, I can turn this into fixes, starting with the highest-risk issue: making the log CRUD controllers self-auditing or moving them behind an append-only/immutable path.
