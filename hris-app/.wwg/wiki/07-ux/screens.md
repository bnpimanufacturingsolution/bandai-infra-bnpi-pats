<!-- docs-union: careful merge of standalone snapshot + bandai-infra develop (hris-app/.wwg/wiki/07-ux/screens.md) -->
# Screens And Routes

Status: INFERRED_FROM_EXISTING_PROJECT

## Auth, Legal, Support, And Profile

- Login: `/auth/login`.
- Auth / session splash (`LoadingScreen` atom): full-screen white, Bandai logo (same Cloudinary mark as login), soft indeterminate brand-red bar, optional short message only. Subtitle is screen-reader only. No card, phase labels, or status chrome. Parity: `hris-emp-app` same atom.
- Legal: `/terms`, `/privacy`.
- Support: `/help`, `/faq`.
- Profile/user utilities: `/home`, `/profile/:id`, `/notifications`, `/history`.

## Admin Workspace

Admin routes include:

- Dashboard.
- Celebrations and birthdays.
- Analytics.
- Configuration.
- Migration.
- Departments, agencies, positions, levels, employees, users.
- Shift types, schedule templates, schedules.
- Loan types, calendar items, holidays.
- Workflows and guide content.
- Device management and enrollment.
- Audit logs and activity logs.
- Disciplinary action.
- Messages, notifications, help, and profile.

## HR Workspace

HR routes include:

- Dashboard and approvals.
- Templates and settings.
- Documents, timesheet, leave, recruitment, payroll, and payroll-period settings.
- Onboarding setup.
- Employees create/edit/profile/documents/status changes.
- Recruitment jobs.
- Attendance and time corrections.
- Performance, tasks, messages, notifications.
- Payroll, HR payroll, billings, payroll periods, run payroll.
- Benefit types and benefit enrollments / benefits management (create page at `/hr/benefits-management/new` with multi-employee select modal; edit modal with single-employee picker; schedule modes: time-bound, fixed installments, recurring).
- Announcements and document viewer.
- Add user.
- Reports for attendance, workforce, and payroll.
- Requests for tickets, documents, and personnel actions.
- Timesheets, timesheet settings, leave settings, and request process.

## Employee Workspace

Employee routes include:

- Approvals and requests.
- Timesheet approvals.
- Benefits.
- Learning and performance.
- Team.
- Messages, notifications, help.
- Leave calendar.
- Workflows.
- Employee profile, attendance, payroll, and payslip details.

## Public And Utility Surfaces

Public/utility routes include:

- Jobs index and job application.
- Public guide.
- Onboarding.
- Setup callback/status.
- 403 page.
- Time logging.
- Announcements.
- PDF mapper/demo surfaces.

## UX Context

The product is an operational HRIS/workforce tool. Screens should prioritize dense but scannable data, reliable workflow actions, explicit states, clear approval context, and predictable navigation across repeated HR operations.

Marketing-style layouts are not the default UX shape for this application.
