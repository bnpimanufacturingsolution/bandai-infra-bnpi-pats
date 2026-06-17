# Domain Workflows

Status: INFERRED_FROM_EXISTING_PROJECT

## Authentication And Routing

1. User opens the app.
2. Auth provider hydrates current-user state from the API.
3. Unauthenticated users are redirected to `/auth/login`.
4. Authenticated users are redirected by role to admin dashboard, dashboard, or time logging.
5. Deactivated users trigger error handling and auth state cleanup.

## Role Dashboard Use

1. User lands on a role-appropriate dashboard.
2. Dashboard cards show role-specific queues, metrics, quick actions, requests, calendars, approvals, or operational items.
3. User follows quick actions into employee, HR, manager, payroll, document, request, or report surfaces.

## Employee Lifecycle

1. HR/admin creates, imports, or migrates employee records.
2. Employee details are maintained across department, position, level, status, schedule, documents, and payroll-related fields.
3. Lifecycle events such as promotion, regularization, transfer, salary change, termination, resignation, or disciplinary action are initiated through HR routes or request workflows.
4. Approvals and documentation are attached to the status-change process.
5. Downstream attendance, timesheet, payroll, reporting, and access behavior may be affected.

## Attendance Correction

1. Attendance records are created from clock events, imports, devices, or service actions.
2. Exceptions such as absence, incomplete records, undertime, overtime, late, or early out are surfaced.
3. User or HR creates a correction request.
4. Approvers review and approve or reject the correction.
5. Approved correction updates attendance evidence and may affect timesheets/payroll readiness.

## Timesheet Approval

1. Timesheet is created or loaded for a period.
2. Employee or HR user reviews line items, hours, leave, holiday, night shift, and overtime breakdowns.
3. Timesheet moves from draft to submitted.
4. Approver approves, rejects, or requests revision.
5. Edit-permission workflow may be used when the timesheet is locked or past normal edit rules.
6. Approved timesheets can support payroll processing.

## Request Approval

1. Employee, manager, HR, or admin submits a request.
2. Request is assigned type and starts as PENDING.
3. Workflow configuration determines reviewers and routing.
4. Request is approved, rejected, cancelled, or revised through configured actions.
5. Approved requests trigger domain changes where applicable.

## Recruitment

1. HR creates or manages job postings and recruitment settings.
2. Public applicant views jobs and opens a job page.
3. Applicant completes a dynamic job application form.
4. HR reviews applicant records and advances recruitment workflow.
5. Successful hiring may feed onboarding and employee creation.

## Payroll And Billing

1. HR/payroll configures payroll settings and payroll periods.
2. Employee, attendance, timesheet, leave, benefit, and salary data are reviewed.
3. Payroll run or HR payroll screen processes or previews payroll.
4. Payslips are generated for employees.
5. Billing or statement of account artifacts may be generated where applicable.

## Firebase Deployment

1. Build runs with React Router build output.
2. Firebase hosting target is selected for dev or UAT.
3. GitHub workflow or local Firebase tooling deploys hosting assets.
4. Secrets and service-account material must be provided safely.
5. Production or public deployment requires explicit approval.

