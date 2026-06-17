# Project Truth

Adoption status: INFERRED_FROM_EXISTING_PROJECT
Status: Reconciled from repository evidence on 2026-05-26. Product identity and category are confirmed by local README/package evidence; business policy details remain inferred until reviewed.
Truth confidence: HIGH for repository identity and HRIS API category; MEDIUM for detailed role/policy semantics.
Last adoption audit: 2026-05-26

This file was populated from existing code, documentation, package metadata, configuration, and observed implementation.

Items marked `INFERRED`, `NEEDS_CONFIRMATION`, `CONFLICTING`, or `STALE` should be reviewed before major future work.

If this file conflicts with lower-priority reports, generated notes, task files, or stale documentation, this file wins once confirmed.

Project Truth must not be silently overwritten. Requirement evolution is allowed when documented and accepted.

## Product Identity

- Product name: hris-api
- Status: CONFIRMED
- Evidence: `package.json` package name and README heading.

## Product Category

- Category: Backend API for an HRIS / workforce management system.
- Status: CONFIRMED
- Evidence: README states "Backend API for HRIS, built with TypeScript, Express, and Prisma"; package description states "HRIS API built with TypeScript, Express, and Prisma"; source folders and Prisma schemas cover HRIS domains.

## One-Line Description

- Description: hris-api is the backend API for the HRIS/workforce management system, serving auth, employee records, attendance, timesheets, payroll, leave/request/workflow, recruitment, onboarding, reporting, integration, migration, and administrative configuration behavior.
- Status: CONFIRMED_FOR_API_CATEGORY; INFERRED_FOR_FULL_BUSINESS_SCOPE
- Evidence: README/package metadata; `app/auth`, `app/employee`, `app/attendance`, `app/timesheet`, `app/timesheetline`, `app/payrollperiod`, `app/employeepayroll`, `app/request`, `app/workflowEngine`, `app/applicant`, `app/boardingProcess`, `app/report`, `app/metrics`, `app/hikvision`, and Prisma schema files.

## Primary Users and Roles

- Role: API consumer / paired frontend (`../hris-app`)
  - Status: CONFIRMED
  - Evidence: sibling repository `../hris-app` is the React HRIS app; app docs and service tests call API endpoints.
- Role: HR admin, HR user, HR manager, manager, employee, public applicant, super admin, integration/device actor
  - Status: INFERRED
  - Evidence: API modules and schemas for auth/user, employee, applicants, requests/workflows, dashboard/reporting, device/Hikvision, and frontend route/role evidence in `../hris-app`.
- Role: admin, user, agent
  - Status: STALE_AS_PRIMARY_ROLE_SET
  - Evidence: previous lightweight adoption audit inferred generic roles; current HRIS evidence is more specific and should be used.

## Canonical Scope

Currently includes:

- Feature: TypeScript/Express REST API backed by Prisma schemas and HRIS domain modules.
  - Status: CONFIRMED
  - Evidence: README, package scripts, `index.ts`, `app/*` routers/controllers, `prisma/schema`, and `prisma/schema-postgres`.
- Feature: Authentication, users/roles, employees/person records, organization/configuration, schedules, attendance, attendance obligations, timesheets, timesheet lines, payroll periods, employee payroll, leave, requests, workflow configuration/engine, recruitment/applicants, onboarding/offboarding, documents, reports, metrics, audit/activity logging, devices/Hikvision, migration/backfill/repair scripts, and OpenAPI/Postman export.
  - Status: INFERRED_FROM_MODULES
  - Evidence: source folders, Prisma schemas, package scripts, and docs.
- Feature: HR Attendance / Timesheet / Payroll source-of-truth behavior.
  - Status: CONFIRMED_AS_REQUIRED_CONTEXT
  - Evidence: `AGENTS.md` and `../docs/attendance-timesheet-payroll-tally-prd.md`.

Currently does not include unless approved:

- Boundary: production data mutation, shared database fault injection, migrations, backfills, repair scripts, employee deletion scripts, credential changes, deployment changes, auth/security policy changes, authorization changes, payroll policy changes, and public applicant privacy changes.
  - Status: CONFIRMED
  - Evidence: high-risk scripts and domains in `package.json`, Prisma schemas, auth/security docs, deployment workflows, and WWG safety gates.
- Boundary: App UI ownership.
  - Status: CONFIRMED
  - Evidence: paired frontend repo `../hris-app`. UI routes, presentation state, and frontend service-client tests belong there unless an API harness explicitly needs them.

## Cross-Repo Relationship

- Paired frontend repository: `../hris-app`
  - Status: CONFIRMED
  - Evidence: sibling repository exists and contains the HRIS React app with API-facing services.
- API repository ownership: backend authorization, persistence, source-of-truth selection, schema/model constraints, transactions/concurrency, migrations/backfills, server-side payroll/attendance/timesheet invariants, API contract behavior, and API load/soak tests with isolated synthetic data.
  - Status: CONFIRMED_FOR_REPOSITORY_BOUNDARY; INFERRED_FOR_SPECIFIC_TEST_COVERAGE
  - Evidence: API modules, Prisma schemas, scripts, WWG testing task context, and app-side testing strategy.
- App repository ownership: frontend routes, role-based display behavior, client-side payload construction, presentation logic, browser E2E, and app-side regression tests.
  - Status: CONFIRMED
  - Evidence: `../hris-app` routes/services/components/tests.
- Rule: frontend visibility is not authorization. Authorization and persistence guarantees must be enforced and tested in this API repo or an approved API test harness.
  - Status: CONFIRMED
  - Evidence: existing WWG test task and high-risk auth/authorization boundaries.

## Canonical Terminology

See `.wwg/wiki/terminology.md`.

Critical terms:

- Term: HRIS API
  - Meaning: This backend API repository, `hris-api`.
  - Status: CONFIRMED
  - Evidence: README and package metadata.
- Term: HRIS app / frontend
  - Meaning: Paired React frontend repository at `../hris-app`.
  - Status: CONFIRMED
  - Evidence: sibling repository and app WWG truth.
- Term: AttendanceObligation
  - Meaning: Live/current/future operational attendance truth.
  - Status: CONFIRMED_AS_REQUIRED_CONTEXT
  - Evidence: `../docs/attendance-timesheet-payroll-tally-prd.md`.
- Term: Attendance
  - Meaning: Biometric/raw/effective clock ledger truth.
  - Status: CONFIRMED_AS_REQUIRED_CONTEXT
  - Evidence: `../docs/attendance-timesheet-payroll-tally-prd.md`.
- Term: Timesheetline
  - Meaning: Effective submitted/approved/payroll-ready timesheet rows used for past totals and approved OT tally.
  - Status: CONFIRMED_AS_REQUIRED_CONTEXT
  - Evidence: `../docs/attendance-timesheet-payroll-tally-prd.md`.
- Term: EmployeePayroll.timesheetSnapshot
  - Meaning: Paid payroll history source once payroll has been paid.
  - Status: CONFIRMED_AS_REQUIRED_CONTEXT
  - Evidence: `../docs/attendance-timesheet-payroll-tally-prd.md`.

## Architecture Truth

Accepted or observed architecture:

- Item: TypeScript Express API with router/controller/service-style modules, Prisma schemas, generated OpenAPI/Postman docs, MongoDB-to-Postgres migration support, and local/dev scripts.
  - Status: CONFIRMED
  - Evidence: README, package scripts, `app/*`, `prisma/schema`, `prisma/schema-postgres`, and docs.
- Item: Prisma-backed model/schema layer is a source of persistence truth; generator workflow must be followed when adding Prisma-backed models.
  - Status: CONFIRMED
  - Evidence: `AGENTS.md`, `prisma/schema`, `prisma/schema-postgres`, `zod-generate`, and Prisma scripts.
- Item: HR attendance/timesheet/payroll source-of-truth split is binding for backend behavior and tests.
  - Status: CONFIRMED
  - Evidence: `AGENTS.md` and `../docs/attendance-timesheet-payroll-tally-prd.md`.
- Item: API PR/push CI has a blocking fast source-truth gate through `npm run test:ci:source-truth`.
  - Status: CONFIRMED
  - Evidence: `.github/workflows/api-ci.yml`; `package.json`; `docs/testing-maturity-audit.md`.
- Item: Local destructive DB fault testing is approved only for the dedicated Postgres database `hris_fault_test` on `localhost:55432` or `127.0.0.1:55432`.
  - Status: CONFIRMED_FOR_LOCAL_TEST_TARGET
  - Evidence: user-approved dedicated local DB fault harness plan on 2026-05-25; `docs/testing-strategy.md`; DB fault guard tests.
- Item: Enterprise CSV/data migration has an executable DM0-DM7 quality masterlist and report/test gate for DM mapping, timing, sample-pack integrity, actual migration service dry-run execution, script safety/target guards, Mongo/Postgres helper parity, source-truth backfill planning, import dry-run/no-write contracts, seed/QA safety checks, and timesheet migration source-truth checks.
  - Status: CONFIRMED_FOR_TEST_INFRASTRUCTURE
  - Evidence: `scripts/migration/migration-dm-masterlist.ts`; `scripts/migration/script-safety.ts`; `docs/migration-dm-quality-masterlist.md`; `tests/enterprise-migration.service.spec.ts`; `tests/enterprise-migration-dm-masterlist.spec.ts`; `tests/enterprise-migration-timesheet-quality.spec.ts`; `tests/migration-script-safety.spec.ts`; `tests/mongo-postgres-migration.spec.ts`; `tests/timesheet-backfill-source-truth.spec.ts`; `tests/attendance-status-migration.spec.ts`; `tests/import-service-contracts.spec.ts`; `tests/migration-service-dry-run.spec.ts`; `tests/seed-and-qa-script-safety.spec.ts`; `package.json` script `test:migration:quality`.

Do not introduce without approval:

- Auth/security changes beyond existing auth/security modules and docs.
  - Status: NEEDS_CONFIRMATION
  - Evidence: auth/security is a high-risk boundary.
- Payroll, billing, attendance, timesheet, persistence, migration, destructive script, deployment, secret, or production data changes.
  - Status: NEEDS_CONFIRMATION
  - Evidence: payroll/attendance modules, Prisma schemas, scripts, deployment docs/workflows, and WWG safety gates.

## Safety and Production Boundaries

Current boundaries:

- Boundary: HRIS production-sensitive behavior includes employee/person data, auth/permissions, attendance, timesheets, payroll, requests/workflows, public applicant data, document data, device integrations, persistence, migrations/backfills/repair scripts, deployment, secrets, and deletion scripts.
  - Status: CONFIRMED
  - Evidence: source modules, Prisma schemas, package scripts, docs, and WWG safety gates.
- Boundary: Load, soak, DB fault-injection, migration, backfill, and repair tests must use synthetic fixtures, local disposable databases, or explicitly approved isolated non-production environments.
  - Status: CONFIRMED
  - Evidence: WWG testing task context and high-risk persistence boundaries.
- Boundary: DB fault tests must not use `.env` `PG_DATABASE_URL` values such as `hris-new`; the fault harness must pass `ISOLATED_TEST_DATABASE_URL` directly to an explicitly constructed Prisma client.
  - Status: CONFIRMED
  - Evidence: user-approved dedicated local DB fault harness plan on 2026-05-25.

Mock/demo-only areas:

- Area: Demo seeding/reset scripts exist but are not a safe substitute for production policy.
  - Status: INFERRED
  - Evidence: `seed:reset-demo-requests`, `seed:bulk-backdated-employees`, demo/backfill scripts.

Do not claim production readiness for:

- Capability: authorization, payroll calculations/policy, attendance/timesheet invariants, migration parity, read/write split behavior, deployment/secret handling, public applicant privacy, device integration security, or load/soak capacity.
  - Status: NEEDS_CONFIRMATION
  - Evidence: high-risk domains are implemented, but production-readiness evidence is not established by this reconciliation.

## Current Product Direction

Current direction:

- Direction: Continue as the backend API for the paired HRIS/workforce app, with governed API-side testing for persistence, authorization, source-of-truth, load, soak, and regression coverage.
  - Status: CONFIRMED_FOR_REPO_BOUNDARY; INFERRED_FOR_TEST_ROADMAP
  - Evidence: README/package identity, app/API repos, WWG testing task, and source modules.

Avoid drifting into:

- Drift risk: stale Web3/eCommerce identity.
  - Status: STALE
  - Evidence: previous adoption text conflicted with README/package/source evidence and has been replaced.
- Drift risk: app-only tests being treated as proof of API authorization, database invariants, payroll immutability, or migration correctness.
  - Status: CONFIRMED
  - Evidence: frontend cannot enforce backend persistence/authorization guarantees.
- Drift risk: destructive DB fault tests or load/soak tests against shared environments without explicit approval.
  - Status: CONFIRMED
  - Evidence: WWG safety gates and high-risk persistence/deployment boundaries.
- Drift risk: source-of-truth mixing between `AttendanceObligation`, `Attendance`, `Timesheetline`, and `EmployeePayroll.timesheetSnapshot`.
  - Status: CONFIRMED
  - Evidence: `../docs/attendance-timesheet-payroll-tally-prd.md`.

## Open Questions

- Question: Confirm canonical role and permission matrix across frontend routes, API middleware, and Prisma models.
  - Why it matters: Authorization tests and UI access behavior must align.
  - Evidence / uncertainty: Role names are inferred from app/API modules and need acceptance.
- Question: Confirm current primary persistence mode and migration state between MongoDB and Postgres.
  - Why it matters: DB invariant tests, seeds, migrations, and CI must target the correct schema.
  - Evidence / uncertainty: Prisma MongoDB and Postgres schemas plus migration/parity scripts exist.
- Question: Confirm payroll lock/reopen/correction policy and paid snapshot immutability rules.
  - Why it matters: Regression tests must encode accepted payroll behavior, not guessed policy.
  - Evidence / uncertainty: payroll/timesheet modules and the source-of-truth PRD define core source selection but not every workflow policy.
- Question: Confirm any remote/shared isolated database target for destructive/fault-injection, load, and soak testing.
  - Why it matters: The user explicitly wants tests that detect DB bugs, but shared data must not be corrupted.
  - Evidence / uncertainty: local `hris_fault_test` is confirmed for this implementation slice; remote/shared targets remain unapproved.
- Question: Confirm deployment/secret handling and whether any credentials require rotation/removal.
  - Why it matters: secrets and deployment are high-risk closeout boundaries.
  - Evidence / uncertainty: deployment/secret scripts and docs exist; credential contents were not inspected.

## Update Rules

Update this file when:
- product category changes
- user roles change
- canonical terminology changes
- architecture boundaries change
- safety boundaries change
- production-readiness boundaries change
- major product decisions become accepted truth
- high-risk behavior, production claims, approval requirements, or verification expectations change
- cross-repo app/API responsibilities change

For adopted projects, do not treat inferred truth as final confirmed truth until reviewed.
