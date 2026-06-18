# Terminology Summary

Status: INFERRED_FROM_EXISTING_PROJECT
Last reviewed: 2026-05-15

## Product Terms

- HRIS: Human Resources Information System context for the application.
- Workforce management: operational employee, attendance, timesheet, request, payroll, and reporting work.
- HRIS Workforce System / hris-app: evidenced working product identity; final canonical name needs confirmation.
- HRIS API / hris-api: paired backend API repository at `../hris-api`; owns backend authorization, persistence, schemas, API contracts, DB invariants, load tests, and soak tests.
- API contract: observable app-to-API request/response behavior, including auth, status, validation, and error behavior.
- Isolated test database: disposable local or approved non-production database used for intentional DB fault-injection, integration, load, and soak tests.

## User And Access Terms

- Admin / HRIS admin: organization or system configuration role.
- HR manager: HR leadership or approval role.
- HR user: HR operations role.
- Employee manager: manager of employee/team workflows.
- Employee: self-service workforce user.
- Timekeeper: time logging role.
- Super admin: highest observed system-level role.

## Domain Terms

- Employee: workforce member record.
- Attendance: dated employee time/attendance record.
- Timesheet: period work summary with approval state.
- Request: workflow item such as leave, overtime, time adjustment, document request, promotion, regularization, transfer, salary change, or termination.
- Leave: employee absence request and balance domain.
- Payroll: pay-period and compensation processing domain.
- Payslip: employee-facing payroll statement.
- Billing / Statement of Account: billing artifact associated with payroll or workforce services.
- Recruitment: job posting and applicant workflow domain.
- Onboarding / Boarding: employee setup workflow and task templates.
- Workflow: configured approval or routing process.
- Audit log / Activity log: traceability records.

## Organization Hierarchy

- Confirmed recruitment coverage hierarchy: Department -> Section -> Position -> Level.
- Missing or stale section assignments remain visible in admin coverage under `Positions without section`; do not render these rows as a normal `Unassigned section` section accordion or label them as department-level scope.

## Usage Rule

Use these terms for agent orientation, but treat final user-facing labels and policy terms as NEEDS_CONFIRMATION until reviewed by the project owner.

Keep the app/API ownership split explicit: this repo owns frontend routes, UI, client payloads, browser E2E, and app-side regressions; `../hris-api` owns backend authorization, persistence, DB invariants, API contracts, load tests, and soak tests.

