<!-- docs-union: careful merge of standalone snapshot + bandai-infra develop (hris-app/.wwg/wiki/03-requirements/functional-requirements.md) -->
# Functional Requirements

Status: INFERRED_FROM_EXISTING_PROJECT
Source basis: route map, service clients, type models, tests, docs, Firebase configuration, and package scripts.

## Status Key

- CONFIRMED: Directly represented by source, docs, tests, or configuration.
- INFERRED: Strongly implied by implementation shape, but not yet accepted as product truth by a human owner.
- NEEDS_CONFIRMATION: Requires owner review before being used as final requirement language.

## Authentication And Access

- CONFIRMED: Provide login at `/auth/login`.
- CONFIRMED: Hydrate current user through auth service calls.
- CONFIRMED: Support logout, SSO login, password update, and handoff-token validation.
- CONFIRMED: Redirect unauthenticated users to login through `AuthGuard`.
- INFERRED: Route access is intended to vary by role and scope.
- NEEDS_CONFIRMATION: Final authorization behavior, permission matrix, and production enforcement expectations.

## Role-Based Dashboards

- CONFIRMED: Provide dashboard configurations for employee, employee manager, HR user, and HR manager.
- CONFIRMED: Display role-specific summary cards and quick actions.
- CONFIRMED: Route users to role-specific destinations after login.
- NEEDS_CONFIRMATION: Canonical role labels shown to users and admins.

## Employee Management

- CONFIRMED: Support employee list/detail/create/edit/profile/document/status-change surfaces.
- CONFIRMED: Support employee import and migration workflows.
- CONFIRMED: Track employee departments, positions, levels, schedules, employment type/status, work location, salary/pay frequency, and documents.
- INFERRED: Employee data is a core system-of-record domain and should be treated as sensitive.
- NEEDS_CONFIRMATION: Final data retention, audit, and privacy requirements.

## Attendance And Time Logging

- CONFIRMED: Support attendance records, clock-in/out behavior, imports, correction requests, approval flows, and attendance reports.
- CONFIRMED: Track attendance status, time in/out/breaks, hours, late/early-out values, overtime, undertime, and correction metadata.
- CONFIRMED: Provide a public or special-purpose `/time-logging` route for timekeepers.
- NEEDS_CONFIRMATION: Device integration and biometric/facial-recognition production requirements.

## Timesheets

- CONFIRMED: Support timesheet list/detail/submit/approve/reject/revise/update behavior through the timesheet service.
- CONFIRMED: Track DRAFT, SUBMITTED, APPROVED, REJECTED, and REVISED states.
- CONFIRMED: Support edit-permission request, review, and consume flows.
- INFERRED: Timesheet approval can affect payroll readiness.
- NEEDS_CONFIRMATION: Payroll lock, approval authority, and correction cut-off rules.

## Requests And Approvals

- CONFIRMED: Support request types including leave, overtime, time adjustment, document request, promotion, regularization, transfer, salary change, termination, expense reimbursement, and other.
- CONFIRMED: Support PENDING, APPROVED, REJECTED, and CANCELLED request states.
- CONFIRMED: Support HR approvals, employee approvals, workflows, request transactions, and workflow runtime services.
- NEEDS_CONFIRMATION: Final approval routing and escalation rules.

## Leave

- CONFIRMED: Support leave requests, leave balances, leave policies, and leave calendar.
- CONFIRMED: Provide employee and HR leave settings/surfaces.
- NEEDS_CONFIRMATION: Final leave accrual and carryover rules.

## Payroll And Billing

- CONFIRMED: Support payroll settings, payroll periods, payroll run routes, employee payroll, HR payroll, payslips, billings, and statements of account.
- CONFIRMED: Payroll models include earnings, deductions, bonuses, overtime, net pay, gross pay, and paid/processed/pending/cancelled states.
- INFERRED: Payroll depends on employee, attendance, timesheet, leave, and benefit data.
- CONFIRMED: HR benefits management can create/edit employee benefit enrollments (page title/CTA: Enroll employees) with schedule fields; create uses full page `/hr/benefits-management/new`; recurring uses per-period amount and optional open-ended end date. API owns installment generation/ensure and payroll apply. Domain may still call resulting payroll money a “payroll adjustment.”
- NEEDS_CONFIRMATION: Whether payroll is production-grade calculation, preview-only, or integration support.

## Recruitment And Public Applications

- CONFIRMED: Support public job listing/application routes and HR recruitment routes.
- CONFIRMED: Support dynamic job application forms with sections, fields, validation rules, file fields, and submissions.
- CONFIRMED: Support applicant and recruitment settings services.
- NEEDS_CONFIRMATION: Candidate privacy, consent, retention, and notification requirements.

## Onboarding And Employee Lifecycle

- CONFIRMED: Support onboarding setup, boarding templates, onboarding public/status routes, and employee status change docs.
- CONFIRMED: Employee status change candidates include promotion, regularization, termination, and transfer.
- INFERRED: Status changes should be initiated through personnel action or approval workflows.
- NEEDS_CONFIRMATION: Final lifecycle workflow ownership and legal review gates.

## Reporting And Analytics

- CONFIRMED: Support attendance, workforce, payroll, analytics, and dashboard metrics routes/services.
- INFERRED: Report scope should respect user role, organization, department, and employee visibility.
- NEEDS_CONFIRMATION: Export formats, report auditability, and data masking rules.

## Administration And Configuration

- CONFIRMED: Admin configuration includes departments, agencies, positions, levels, employees, users, shift types, schedules, schedule templates, loan types, calendar items, holidays, workflows, guide content, devices, audit logs, activity logs, disciplinary actions, messages, notifications, and help.
- CONFIRMED: Destructive employee deletion scripts exist and must remain approval-gated.
- NEEDS_CONFIRMATION: Final admin permission matrix and production-safe operation policy.
