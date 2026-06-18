# Terminology

This file defines canonical and observed project language.

Adoption status: INFERRED_FROM_EXISTING_PROJECT
Status: Reconciled from repository evidence on 2026-05-25. Core HRIS/API terms are accepted where backed by README/package/source evidence; policy terms remain inferred until reviewed.

## Canonical Terms

| Term | Meaning | Status | Evidence |
|---|---|---|---|
| HRIS API | The backend API repository, `hris-api`. | CONFIRMED | README and package metadata. |
| HRIS app / frontend | The paired React frontend repository at `../hris-app`. | CONFIRMED | sibling repository and app WWG truth. |
| Backend API | TypeScript/Express service layer that owns server-side contracts, authorization enforcement, persistence behavior, and API responses. | CONFIRMED | README, `app/*` routers/controllers, package scripts. |
| API contract | The server-observable request/response, auth, status, validation, and error behavior exposed to clients. | CONFIRMED | Express routers/controllers and generated docs scripts. |
| Prisma schema | The model/schema source under `prisma/schema` and `prisma/schema-postgres`. | CONFIRMED | Prisma folders and package scripts. |
| Database invariant | A server-side persistence rule that must stay true even when bad or conflicting data is seeded in an isolated test database. | INFERRED | testing task context and persistence boundaries. |
| Isolated test database | A disposable local or approved non-production database used for DB fault-injection, integration, load, and soak tests. | CONFIRMED_AS_REQUIRED_BOUNDARY | WWG safety gates and testing task context. |
| Dedicated local DB fault database | The exact local Postgres database `hris_fault_test`, reachable only through `localhost:55432` or `127.0.0.1:55432`, used for the current destructive DB fault-test harness. | CONFIRMED_FOR_LOCAL_TEST_TARGET | user-approved implementation plan on 2026-05-25; testing docs and guard tests. |
| Load test | A bounded performance test using synthetic/local or explicitly approved non-production data. | CONFIRMED_AS_REQUIRED_BOUNDARY | testing task context. |
| Soak test | A longer stability test using synthetic/local or explicitly approved non-production data. | CONFIRMED_AS_REQUIRED_BOUNDARY | testing task context. |
| Router | Express route registration module for one API domain. | CONFIRMED | `app/*/*.router.ts`. |
| Controller | API request handler module for one API domain. | CONFIRMED | `app/*/*.controller.ts`. |
| Service | Domain or support module that performs reusable backend behavior outside direct route registration. | INFERRED | import, migration, payroll generation, and cron service files. |
| Migration | Database/schema/data migration behavior; high-risk when it touches real data. | CONFIRMED | migration scripts, migration module, Postgres migration docs. |
| Enterprise DM masterlist | Executable DM0-DM7 mapping of source files/stages to business names, target models, key fields, dependencies, and quality gates. | CONFIRMED_FOR_TEST_INFRASTRUCTURE | `scripts/migration/migration-dm-masterlist.ts`; `docs/migration-dm-quality-masterlist.md`; migration masterlist tests. |
| Migration DM report | Excel report artifact for migration count, start time, end time, elapsed time, rows/sec, warning/error, and GO/NO-GO evidence. | CONFIRMED_FOR_TEST_INFRASTRUCTURE | `scripts/migration/migration-dm-report.ts`; `tests/enterprise-migration-dm-report.spec.ts`. |
| Backfill | Scripted data population or recalculation for existing records; high-risk when it touches shared data. | CONFIRMED | package backfill scripts. |
| Repair script | Scripted corrective mutation for existing data; high-risk when it touches shared data. | CONFIRMED | package repair scripts. |
| Seed | Scripted fixture/default/demo data creation. | CONFIRMED | package seed scripts and Prisma seeds. |

## HR Attendance / Timesheet / Payroll Source Terms

| Term | Meaning | Status | Evidence |
|---|---|---|---|
| AttendanceObligation | Live/current/future operational attendance truth. | CONFIRMED_AS_REQUIRED_CONTEXT | `../docs/attendance-timesheet-payroll-tally-prd.md`; Prisma schemas. |
| Attendance | Biometric/raw/effective clock ledger truth. | CONFIRMED_AS_REQUIRED_CONTEXT | `../docs/attendance-timesheet-payroll-tally-prd.md`; attendance module/schemas. |
| Timesheetline | Effective submitted/approved/payroll-ready rows used for past totals and approved OT tally. | CONFIRMED_AS_REQUIRED_CONTEXT | `../docs/attendance-timesheet-payroll-tally-prd.md`; timesheetline module/schemas. |
| EmployeePayroll.timesheetSnapshot | Paid payroll history source once payroll has been paid. | CONFIRMED_AS_REQUIRED_CONTEXT | `../docs/attendance-timesheet-payroll-tally-prd.md`; employee payroll module/schemas. |
| Payroll period | Payroll grouping/cycle domain served by payroll period APIs and schemas. | INFERRED | `app/payrollperiod`, Prisma payroll period schemas. |
| Payroll snapshot | Immutable history used for paid payroll reads; confirm exact schema field semantics before test hardening. | INFERRED | source-of-truth PRD and employee payroll schemas. |
| Approved OT | Approved overtime tally sourced from effective `Timesheetline` rows. | CONFIRMED_AS_REQUIRED_CONTEXT | `../docs/attendance-timesheet-payroll-tally-prd.md`. |

## HRIS Domain Terms

| Term | Meaning | Status | Evidence |
|---|---|---|---|
| Employee | HRIS worker record/domain. | CONFIRMED | employee modules and Prisma schemas. |
| Person | Person-level identity record associated with employees/users/applicants. | INFERRED | Prisma person schema. |
| User | Auth/user account domain. | INFERRED | auth module and user schema. |
| Applicant | Public or recruitment applicant domain. | CONFIRMED | applicant module/schema and paired app public applicant routes. |
| Request | Employee/HR request domain routed through workflows. | INFERRED | request and requestTransaction modules/schemas. |
| Workflow | Configurable routing/approval behavior for requests/processes. | INFERRED | workflowConfig and workflowEngine modules/schemas. |
| Boarding | Onboarding/offboarding process and template domains. | INFERRED | boardingProcess and boardingTemplate modules/schemas. |
| Device / Hikvision | Device/access-control integration surface. | INFERRED | device and hikvision modules. |
| Audit logging | Server-side audit trail behavior for sensitive actions. | INFERRED | auditLogging and activityLogging modules/schemas. |
| Metrics / reports | Backend reporting and aggregate API surface. | CONFIRMED | metrics and report modules. |

## Incorrect Or Stale Language

| Term | Status | Rule | Evidence |
|---|---|---|---|
| Web3 eCommerce prototype | STALE | Do not use for this repository unless new accepted truth explicitly changes the product. | Previous adoption audit conflicted with README/package/source evidence. |
| Cart / checkout / wallet | STALE_UNLESS_NEW_EVIDENCE | Do not infer these as product scope from generic dependency or source hits. | Current canonical evidence identifies HRIS API. |
| Frontend visibility as authorization | INCORRECT | Do not treat hidden UI routes/actions as server authorization. API enforcement belongs in this repo or approved API harness. | WWG test task and high-risk authorization boundary. |

## Observed Terms

| Observed Term | Where Found | Inferred Meaning | Status |
|---|---|---|---|
| router | `app/Rule/rule.router.ts`, `app/activityLogging/activityLogging.router.ts`, `app/agency/agency.router.ts`, `app/applicant/applicant.router.ts` | Express route registration module. | CONFIRMED |
| controller | `app/Rule/rule.controller.ts`, `app/activityLogging/activityLogging.controller.ts`, `app/agency/agency.controller.ts`, `app/applicant/applicant.controller.ts` | API request handler module. | CONFIRMED |
| employee | `app/employee/employee-import.service.ts`, `app/employee/employee.controller.ts`, `app/employee/employee.router.ts`, `app/employeeBenefit/employeeBenefit.controller.ts` | HRIS employee domain. | CONFIRMED |
| attendance | `app/attendance/attendance-import.service.ts`, `app/attendance/attendance.controller.ts`, `app/attendance/attendance.router.ts` | Attendance clock/ledger and attendance behavior. | CONFIRMED |
| migration | README heading, `app/migration/migration.controller.ts`, `app/migration/migration.router.ts`, `app/migration/migration.service.ts` | Database/data migration API and scripts. | CONFIRMED |
| service | `app/attendance/attendance-import.service.ts`, `app/cron/cron.service.ts`, `app/employee/employee-import.service.ts`, `app/migration/migration.service.ts` | Backend support/domain service module. | INFERRED |
| access | `app/hikvision/controller/access.control.controller.ts`, `app/hikvision/routes/access.control.router.ts` | Device/access-control integration term. | INFERRED |

## Canonical Term Candidates

| Concept | Recommended Canonical Term | Also Seen As | Confidence | Evidence |
|---|---|---|---|---|
| backend API repository | HRIS API / hris-api | API repo, backend repo | HIGH | README and package metadata. |
| paired frontend repository | HRIS app / hris-app | frontend repo, app repo | HIGH | sibling `../hris-app` repository and app WWG truth. |
| API request routing | Router | route module | HIGH | `app/*/*.router.ts`. |
| API request handling | Controller | handler module | HIGH | `app/*/*.controller.ts`. |
| persistence model source | Prisma schema | schema model | HIGH | `prisma/schema`, `prisma/schema-postgres`. |
| intentional DB-bug detection | DB invariant test | fault-injection test | MEDIUM | testing task context. |
| safe destructive test target | Isolated test database / `hris_fault_test` for local DB fault tests | disposable test DB | HIGH | WWG safety boundary and testing docs. |
| live operational attendance truth | AttendanceObligation | attendance obligation | HIGH | `../docs/attendance-timesheet-payroll-tally-prd.md`. |
| clock ledger truth | Attendance | clock ledger | HIGH | `../docs/attendance-timesheet-payroll-tally-prd.md`. |
| approved/payroll-ready totals | Timesheetline | timesheet line | HIGH | `../docs/attendance-timesheet-payroll-tally-prd.md`. |
| paid payroll history | EmployeePayroll.timesheetSnapshot | payroll snapshot | HIGH | `../docs/attendance-timesheet-payroll-tally-prd.md`. |

## Terminology Conflicts

| Conflict | Evidence | Recommendation |
|---|---|---|
| Previous Product Truth described the repo as Web3/eCommerce while README/package/source describe HRIS API. | stale `.wwg/wiki/project-truth.md` content before 2026-05-25 reconciliation. | Use HRIS API language and keep stale terms only as drift warnings. |
| Generic role labels (`admin`, `user`, `agent`) are too broad for HRIS authorization work. | previous adoption audit vs app/API route and domain evidence. | Use inferred HRIS role labels until the canonical permission matrix is confirmed. |

## Rules

- Do not rename core concepts casually.
- If a prompt introduces a synonym, decide whether it is canonical before using it broadly.
- If terminology changes, update this file and reconcile code/docs.
- If terminology changes, reconcile reports, tests, governance files, and generated context too.
- For adopted projects, confirm inferred canonical terms before large renames.
- Keep app/API ownership language explicit: UI behavior belongs in `../hris-app`; server authorization, persistence, schema, and DB invariant behavior belong here.
