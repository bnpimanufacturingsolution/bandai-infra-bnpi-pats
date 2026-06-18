# HRIS Testing Coverage Matrix

Status: ACTIVE_DRAFT
Last reviewed: 2026-05-28

This matrix tracks expected coverage breadth for the HRIS app and API. It separates executable app-side coverage in this repository from API/database coverage that must live in the sibling API repository `../hris-api` or an approved API test harness.

| Domain | App unit/regression | App E2E | API contract/integration | DB/invariant | Load/soak | Priority |
|---|---|---|---|---|---|---|
| Auth and roles | Role derivation, redirects, API client auth headers | Login by role, rejected unauthorized routes | Token validation, role enforcement, deactivation | User/role linkage integrity | Login/status endpoints | Critical |
| Employee records | Import validation, draft persistence, service payloads | Create/edit employee, import preview | Employee CRUD, manager/team scoping | Orphaned person/user/employee links | Employee search/list | Critical |
| Attendance obligation | Metrics source selection, status presentation | HR attendance view, employee attendance page | Obligation list, backfill, role-scoped visibility | Duplicate/missing obligation rows | Attendance list/metrics | Critical |
| Attendance clock ledger | Clock-in/out client payloads, error handling | Clock in/out workflow | Clock event validation, device/import ingestion | Duplicate clock rows, negative minutes | Clock in/out endpoints | Critical |
| Timesheets | Timesheetline query payloads, effective-total helpers | Submit correction, view status | Submit/approve/reopen transitions | Draft included in payroll tally, orphan lines | Timesheet submit/list | Critical |
| Manager approvals | Approval display helpers, actor metadata checks | Manager approval queue | Approval authorization and audit events | Orphan approval, missing actor | Approval endpoints | Critical |
| Payroll tally | Metrics payloads, payroll snapshot selection | Payroll tally visibility | Payroll blockers, payroll run summary | Wrong source rows, mutable paid history | Payroll metrics endpoints | Critical |
| Paid payroll history | Snapshot selection invariants | Payslip/history view | Paid payroll read paths | Missing or mutable snapshots | Payslip summary/read | Critical |
| Leave | Validation and balance helpers | Leave request and approval | Leave balances, approval policy | Negative balance, stale entitlement | Leave list/requests | High |
| Requests/workflows | Request payload builders, status helpers | Submit/approve request | Workflow routing and authorization | Missing workflow instance/audit links | Request list/approval | High |
| Recruitment | Requisition modal policy/reset behavior, job-detail apply navigation, public job deep-link query preservation | Public jobs modal/apply smoke, HR recruitment jobs-manager smoke, applicant entry, HR review | Applicant/job endpoints | Applicant/job orphan links | Public apply/read | High |
| Onboarding/offboarding | Checklist validation, document helpers | Onboarding document flow | Boarding process endpoints | Orphan checklist/template items | Boarding list/read | High |
| Admin config | Import/setup redirects, option validation, DataTable search/filter/sort/pagination accuracy | Departments config smoke for auth-gated rendering, search query accuracy, status filter query accuracy, and counts | Department/position/schedule APIs | Referenced config deletion constraints | Config list endpoints | High |
| Reports | Scope helpers, metric payloads | Report tab smoke | Report/metric contracts | Aggregation source correctness | Report endpoints | High |
| Billing/SOA | Safe display helpers only until policy confirmed | Billing read smoke | Billing authorization and failure paths | Billing/payroll link integrity | Billing read endpoints | High |
| Notifications/messages | Query payloads, unread helpers | Notification/message view | Notification delivery/read APIs | Orphan notification target | Notification list | Medium |
| Route/navigation hygiene | Route audit commands exist but currently red | Navigation smoke | N/A | N/A | N/A | Medium |

## Current App-Side Executable Coverage

- Auth/roles: role redirect, role derivation, dashboard config.
- Reports: report scope helper.
- Employee import/drafts: import validation, IndexedDB draft persistence, default password helper.
- API/client plumbing: API URL normalization, low-level API client behavior, shared query construction.
- TDD enforcement: same-feature test obligation checks for app behavior and quality-script changes.
- Components: Profile initials avatar rendering and accessible clickable state.
- Attendance/timesheet/payroll: attendance service requests/corrections/imports, metrics payloads, Timesheetline query construction, EmployeePayroll snapshot and payslip request construction.
- Admin config: DataTable search field matching, status filters, sort ordering, pagination display ranges, server-side list count fallback, and mocked Playwright Departments smoke coverage.
- Recruitment: requisition modal WARN/BLOCK behavior, requisition state reset, job-detail apply navigation, public job modal query preservation, mocked Playwright public jobs/apply smoke coverage, and mocked HR recruitment jobs-manager smoke coverage for server-side search/filter wiring.

## Immediate App-Side Expansion Targets

- Browser E2E smoke coverage for the HR dashboard, employee attendance, timesheet submission, payroll read paths, and the remaining admin configuration master-data pages.
- Component-level regression tests around manager approval queues, payroll/history display, and attendance status rendering.
- Route-audit cleanup so `npm run test:routes` and `npm run test:unreachable` can graduate into CI.

## API Repository Handoff

The following are not credible as app-only tests and should be implemented in `../hris-api` with the API server and an isolated test database:

- schema/model constraints for attendance, obligations, timesheet lines, approvals, payroll periods, employee payrolls, and snapshots
- endpoint-level authorization for employee, manager, HR, admin, and super admin
- seeded DB fault-injection for duplicate ledger rows, orphaned links, draft lines in payroll, missing paid snapshots, and stale mutable reads
- transaction and concurrency tests for clock events, timesheet approval, payroll lock, payroll generation, and payslip release
- API load/soak scenarios using synthetic users and seed data

## Cleanup Note

API-only artifacts that were briefly scaffolded in this app repository have been removed. The app now keeps only frontend/client tests; backend contracts, DB invariants, load tests, and soak tests continue in `../hris-api`.
