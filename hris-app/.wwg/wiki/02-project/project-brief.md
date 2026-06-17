# Project Brief

Status: INFERRED_FROM_EXISTING_PROJECT
Review status: NEEDS_CONFIRMATION for final product name, production boundaries, and role naming.

## Product Identity

- Working product name: HRIS Workforce System / hris-app.
- Canonical product name: NEEDS_CONFIRMATION.
- Package name currently says `react-app-template`; this is STALE relative to source, routes, docs, and Firebase project naming.
- Product category: CONFIRMED as HRIS / workforce management application.
- Primary delivery surface: React Router web application backed by external HRIS APIs.

## Product Purpose

The application supports workforce administration across employee records, attendance, timesheets, leave, requests, approvals, recruitment, onboarding, payroll, reporting, and administrative configuration.

The system appears designed for an organization running HR operations with role-specific workspaces for administrators, HR users, HR managers, employees, employee managers, and timekeepers.

## Primary Users

- Admin / HRIS admin: manages organization-level configuration, departments, agencies, positions, levels, schedules, devices, workflows, audit/activity logs, and administrative dashboards.
- HR manager: reviews and approves HR operations, employee lifecycle changes, recruitment, payroll readiness, reports, and operational queues.
- HR user: performs day-to-day HR work including employee records, attendance review, requests, tasks, onboarding, recruitment, documents, and payroll support.
- Employee manager: reviews team requests, approvals, team calendar, and manager-facing dashboard work.
- Employee: views dashboard, profile, payslips, documents, requests, leave calendar, messages, notifications, and personal attendance/payroll views.
- Timekeeper: uses the time logging surface and attendance-related operations.
- Public applicant: views jobs and submits public job applications.

Role names are based on source code and need owner confirmation before being treated as final product language.

## Product Modules

- Authentication, SSO, handoff-token validation, and guarded routes.
- Role dashboards and quick actions.
- Employee master data, status changes, documents, schedules, import, and migration.
- Attendance, clocking/time logging, correction requests, imports, and approvals.
- Timesheets, timesheet lines, approval workflow, revision flow, and edit-permission requests.
- Leave, overtime, document, personnel action, termination, promotion, regularization, salary change, and transfer requests.
- Payroll settings, payroll periods, payroll runs, employee payroll, payslips, billings, and statements of account.
- Recruitment, public job pages, dynamic application forms, and applicant workflows.
- Onboarding/boarding templates and employee onboarding public/status surfaces.
- Reports for attendance, workforce, payroll, and operational metrics.
- Messaging, notifications, help, FAQ, legal pages, announcements, and guide pages.
- Firebase hosting deployment configuration for dev and UAT.

## Current State

- Application source is richer and more specific than the README/package identity.
- The generated WWG adoption context was structurally present but underfilled before this reconciliation.
- Canonical truth remains partly inferred from routes, service clients, type models, tests, docs, Firebase configuration, and package scripts.
- No application behavior was changed by this context reconciliation.

## Boundaries

Any work involving authentication, authorization, employee records, attendance, timesheets, payroll, billing, Firebase deployment, data deletion scripts, production credentials, or legal/compliance notices must be treated as high-risk and approval-gated.

