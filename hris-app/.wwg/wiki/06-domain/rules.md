# Domain Rules

Status: INFERRED_FROM_EXISTING_PROJECT

## Role Derivation Rules

- HR department membership is detected through department names `HR` and `HUMAN RESOURCES`.
- Manager classification is inferred from levels such as Director, Senior Manager, Manager, and Lead.
- Non-manager classification is inferred from levels such as Senior, Mid, Junior, and Entry.
- HR department plus manager level maps toward HR manager role.
- HR department plus non-manager level maps toward HR user role.
- Non-HR manager level maps toward employee manager role.
- Non-HR non-manager level maps toward employee role.
- Final role labels and authorization effects require owner confirmation.

## Route Access Rules

- Unauthenticated users are redirected to login.
- Admin-like roles route to `/admin/dashboard`.
- HR and employee roles route to `/dashboard`.
- Timekeeper routes to `/time-logging`.
- Backend enforcement is not proven by frontend route guards and must be confirmed separately.

## Request State Rules

- Request statuses include PENDING, APPROVED, REJECTED, and CANCELLED.
- Request types include leave, overtime, time adjustment, document request, promotion, regularization, transfer, salary change, termination, expense reimbursement, and other.
- Workflow rules and approval routing are configuration-driven or service-backed, but final routing rules are not canonical in this repository.

## Timesheet State Rules

- Timesheet statuses include DRAFT, SUBMITTED, APPROVED, REJECTED, and REVISED.
- Timesheets support submit, approve, reject, revise, and update actions.
- Edit-permission workflow exists for controlled post-lock or exception edits.
- Timesheet approval can be payroll-relevant and should be tested when changed.

## Employee Status Change Rules

Based on `docs/employee-status-changes-eligibility.md`:

- Status change categories include promotion, regularization, termination, and transfer.
- Candidate evaluation may consider employment type/status, tenure, attendance, performance, approval state, and business need.
- Process expectations include review, eligibility verification, personnel action request creation, approval, and implementation.
- These rules are documented but still need owner confirmation before being treated as complete policy.

## Payroll And Billing Rules

- Payroll status includes pending, processed, paid, and cancelled.
- Payroll records include gross pay, deductions, bonuses, overtime, and net pay.
- Payroll, payslips, billing, and statement of account behavior are high-risk and require tests and approval for meaningful changes.
- Final calculation rules, tax/statutory deductions, lock behavior, and legal requirements are not confirmed.

## Security And Data Rules

- Employee data, payroll, billing, attendance, timesheet, applicant, document, and credential material are sensitive.
- Firebase service-account JSON files must not be exposed in chat or logs.
- Deletion, migration, deployment, secret sync, and production operations require explicit approval.
- Public applicant and onboarding flows require privacy review before production reliance.

## Regression Rules

- Meaningful feature changes require meaningful tests.
- Bug fixes require regression tests when practical.
- Auth, authorization, employee data, attendance, timesheets, payroll, billing, deployment, and destructive scripts require higher scrutiny.
- Proposed WWG regression tests are drafts until reviewed, implemented, and passing.

