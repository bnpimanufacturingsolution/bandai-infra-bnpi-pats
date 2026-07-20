<!-- docs-union: careful merge of standalone snapshot + bandai-infra develop (hris-app/.wwg/wiki/06-domain/entities.md) -->
# Domain Entities

Status: INFERRED_FROM_EXISTING_PROJECT

## Organization And Access

- Organization: tenant or company context associated with users and branding.
- User: authenticated account with person data, organization data, metadata, roles, scope, and possible password-change requirement.
- Role: access identity such as admin, HR manager, HR user, employee manager, employee, timekeeper, or super admin.
- Permission: named access capability associated with role or scope.

## Workforce Structure

- Employee: workforce member with personal data, employee ID, department, position, level, manager/team relationships, employment status/type, hire date, work location, salary/pay frequency, schedules, role flags, and documents.
- Department: organizational unit used for employee assignment and HR role derivation.
- Position: job title or assignment used in employee records.
- Level: seniority/management classification used in employee role derivation.
- Agency: staffing or workforce-source entity.
- Schedule / Shift Type / Schedule Template: work-time structure used by attendance and timesheets.

## Attendance And Time

- Attendance Record: dated employee time record with time in/out, breaks, status, hours, late/early-out, overtime/undertime, location/device, approval and correction metadata.
- Time Entry: clock segment or time log tied to an employee and date/time.
- Timesheet: pay-period or period-based work summary with status, totals, approval metadata, and revision history.
- Timesheet Line: detailed day or work-entry line inside a timesheet.
- Edit Permission Request: request to allow timesheet editing after normal edit rules would block changes.

## Requests And Approvals

- Request: workflow item with type, status, requester, department reviewers, metadata, attachments, comments, and approval history.
- Workflow Configuration: routing and rule configuration for request processing.
- Workflow Runtime: active execution state for configured workflows.
- Request Transaction: trace or event record for request state changes.

## Leave And Benefits

- Leave Request: employee leave workflow item with type, dates, reason, and status.
- Leave Balance: available and used leave amounts by type.
- Leave Policy: rules for leave eligibility and use.
- Benefit Type / Benefit Enrollment: employee benefits configuration and enrollment records.
- Benefit schedule mode: enrollment/adjustment schedule type — `TIME_BOUND` (date range + total amount), `FIXED_INSTALLMENTS` (count + total amount), or `RECURRING` (per-period amount, optional end date). Installment rows and payroll apply are API-owned.

## Payroll And Billing

- Payroll Item: employee payroll record with gross pay, deductions, bonuses, overtime, net pay, and status.
- Payroll Period: configured payroll cycle.
- Payslip: employee-facing payroll statement.
- Deduction / Bonus / Overtime Item: payroll components.
- Billing / Statement of Account: client or organization billing artifact associated with payroll or workforce services.

## Recruitment And Onboarding

- Job: public or internal job posting.
- Applicant: person submitting a job application.
- Job Application Form: dynamic form with sections, fields, validation rules, conditional behavior, and submission state.
- Boarding / Onboarding Template: configured employee onboarding process and tasks.

## Communication And Operations

- Message: user or system communication artifact.
- Notification: surfaced alert or update for a user.
- Announcement: public or internal announcement content.
- Audit Log: security or administrative trace event.
- Activity Log: operational activity trace.
- Device: enrolled attendance or time logging device.
- Document: employee, applicant, request, or organization file and its review/approval state.
