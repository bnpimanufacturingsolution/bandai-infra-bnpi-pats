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
  - Status: CONFIRMED_FROM_IMPLEMENTATION
  - Evidence: `AGENTS.md`; `.wwg/wiki/terminology.md` HR Attendance/Timesheet/Payroll Source Terms (re-grounded against Prisma schemas and service code on 2026-06-26 after `../docs/attendance-timesheet-payroll-tally-prd.md` was confirmed permanently unrecoverable).
- Feature: Employee benefit payroll schedule modes (`TIME_BOUND`, `FIXED_INSTALLMENTS`, `RECURRING`) on `EmployeeBenefit`, with `EmployeeBenefitInstallment` rows as the payroll execution source. Finite modes bulk-generate installments at active/approved create/update; `RECURRING` stores a per-period amount with optional end date and lazy-ensures one installment per payroll period at run time. Bulk create endpoint `POST /api/employeeBenefit/bulk` accepts `employeeIds[]` plus shared benefit fields and creates one enrollment (and non-recurring installments) per employee; partial failures return 207 with `{ created, failed }`.
- Feature: Optional attendance-based benefit amounts (`attendanceBased`, `attendanceAmountBasis` = `PER_DAY` | `PER_CUTOFF`). When enabled, payroll recomputes the period installment from timesheet attendance (ABSENT-only reduction in v1) before resolve.
  - Status: CONFIRMED_FROM_IMPLEMENTATION
  - Evidence: `prisma/schema/employeebenefit.prisma`; `prisma/schema-postgres/employeebenefit.prisma`; `zod/employeebenefit.zod.ts`; `helper/employee-benefit-program.helper.ts`; `helper/payroll-benefit-source.helper.ts`; `helper/payroll-period.helper.ts`; `app/employeeBenefit/employeeBenefit.controller.ts`; `docs/BENEFIT_SCHEDULE_MODES.md`; focused tests under `tests/employee-benefit-schedule.*.spec.ts` and `tests/payroll-benefit-*.spec.ts`. Owner product decisions for recurring (per-period amount, optional end date, lazy ensure) confirmed 2026-07-14.
- Feature: RECURRING benefit `recurrenceFrequency` cadence filter (`EVERY_CUTOFF` | `MONTHLY` | `YEARLY`).
  - Meaning: Under `scheduleMode: RECURRING`, payroll lazy-ensure creates an installment only on eligible periods. Null/missing = **EVERY_CUTOFF**. **MONTHLY** = `periodNumber === 2` or sole period in that UTC calendar month. **YEARLY** = last period of fiscal-year-end month from org `cycleRules.ANNUALLY.startMonth` (default 1 → December). Amount is per payment event.
  - Status: CONFIRMED_FROM_IMPLEMENTATION
  - Evidence: `helper/benefit-recurrence.helper.ts`; `planRecurringInstallmentForPeriod`; `docs/BENEFIT_SCHEDULE_MODES.md`; `tests/benefit-recurrence.helper.spec.ts`; HR form recurrence control.
- Feature: Perfect Attendance payroll compensation (Bandai named register field).
  - Meaning: Money for Perfect Attendance is an **EmployeeBenefit** compensation source with benefit type code **`PFA`**, mapped to **`EmployeePayroll.perfectAttendance`** (Bandai register column **CT**, label **Perfect Attendance**). Payroll generation sources it via code `PFA` and/or name match `"Perfect Attendance"`. Computation view / payslip treat the saved register field as **post-net receivable** (`ADDED_AFTER_NETPAY` with meal allowance and line leader allowance). Display role is post-net when the benefit line’s `reconciliationAction` is `RECEIVABLE_ONLY`.
  - Status: CONFIRMED_FROM_IMPLEMENTATION
  - Evidence: `prisma/schema/employeepayroll.prisma` (`perfectAttendance`); `helper/payroll-period.helper.ts` (register CT + `sourceBy(["PFA"], ["Perfect Attendance"], …)`); `helper/payroll-source-display.helper.ts` (`PFA` → `perfectAttendance`); `app/employeepayroll/employeepayroll.controller.ts` (post-net register row); `scripts/generate-bandai-payroll-benefit-imports.ts` (`"Perfect Attendance": "PFA"`); `tests/payroll-source-display.helper.spec.ts`; `tests/payslip-pdf.helper.spec.ts`.
  - Not the same as: metrics report `perfectAttendanceMetrics` / `helper/perfect-attendance-metrics.helper.ts` (analytics only; does **not** enroll or award PFA).
  - Not the same as: optional `attendanceBased` pro-rating (ABSENT-only amount math on any benefit). That path does **not** auto-qualify Perfect Attendance eligibility (no late/leave perfect-attendance rule).
  - Product semantics for PFA + `attendanceBased` (owner-confirmed 2026-07-17):
    - **`attendanceBased` off**: fixed enrolled amount when due (all-or-nothing enrollment pay; no ABSENT pro-rate).
    - **`attendanceBased` on**: ABSENT-only pro-rate; employee can still receive PFA money when absences exist (late/undertime/leave do not zero). Allowed composition; not blocked by API.
    - HR enrollment form (`hris-app` `employee-benefit-form.tsx`) shows a **warn-only** banner when type code is `PFA` and attendance-based is on (`pfa-attendance-based-warning`). Save is not blocked.
- Catalog / seed naming for PFA:
  - Seeded `BenefitType` code `PFA` uses name **`Performance Bonus`**, category **`BONUS`**, description “attendance incentive”, default `reconciliationAction: KEEP_AS_BENEFIT`.
  - Product / payroll / HR UI language uses **Perfect Attendance** (register, payslip, import workbook, run-payroll attendance filter).
  - Status: **CONFLICTING** (seed catalog name vs payroll/product label); money path still works by **code `PFA`**.
  - Evidence: `prisma/seeds/benefitTypeSeeder.ts` vs register/import/display helpers above; HR app `benefits-management-template.tsx` (`attendance: ["PFA"]`) and `run-payroll-template.tsx` (PFA → Perfect Attendance).
  - Owner decision still open: whether seed name should become “Perfect Attendance”, whether category should stay `BONUS` vs UI “allowance” wording, and whether default `reconciliationAction` should be `RECEIVABLE_ONLY` for Bandai post-net parity.

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
  - Status: CONFIRMED_FROM_IMPLEMENTATION
  - Evidence: `prisma/schema-postgres/attendanceobligation.prisma`; `helper/attendance-obligation.helper.ts`.
- Term: Attendance
  - Meaning: Biometric/raw/effective clock ledger truth.
  - Status: CONFIRMED_FROM_IMPLEMENTATION
  - Evidence: `prisma/schema-postgres/attendance.prisma`; `app/attendance/attendance-correction.service.ts`.
- Term: Timesheetline
  - Meaning: Effective submitted/approved/payroll-ready timesheet rows used for past totals and approved OT tally.
  - Status: CONFIRMED_FROM_IMPLEMENTATION
  - Evidence: `prisma/schema-postgres/timesheetline.prisma`; `helper/timesheet.helper.ts`.
- Term: EmployeePayroll.timesheetSnapshot
  - Meaning: Paid payroll history source once payroll has been paid.
  - Status: CONFIRMED_FROM_IMPLEMENTATION
  - Evidence: `prisma/schema-postgres/employeepayroll.prisma:124-146,246-251`.
- Term: PayrollCorrection
  - Meaning: Durable post-lock payable delta ledger for future open payroll periods; statuses include REQUESTED, READY, APPLIED, REJECTED, VOID, APPROVED_HOLD. Settlement dayDeltas are minutes by hours type; UI proposes Time In/Time Out. Apply-period lines labeled `Retro {type} ({source period} correction)`.
  - Status: ACCEPTED_TRUTH / CONFIRMED_FROM_IMPLEMENTATION
  - Evidence: `prisma/schema-postgres/payrollCorrection.prisma`; `app/payrollCorrection/payroll-correction.service.ts`; `helper/payroll-correction.helper.ts` (`buildRetroPayslipLabel`); full item under Accepted Project Truth.
- Term: Benefit schedule mode
  - Meaning: Explicit `EmployeeBenefit.scheduleMode` (`TIME_BOUND` | `FIXED_INSTALLMENTS` | `RECURRING`) controlling how payroll installments are formed; installments remain the payroll apply source.
  - Status: CONFIRMED_FROM_IMPLEMENTATION
  - Evidence: `docs/BENEFIT_SCHEDULE_MODES.md`; Prisma `BenefitScheduleMode`; payroll ensure/resolve helpers.
- Term: Perfect Attendance (payroll / PFA)
  - Meaning: Named Bandai payroll compensation benefit (code `PFA`) stored on `EmployeePayroll.perfectAttendance`; typically post-net receivable. Seed catalog currently labels the type **Performance Bonus** — see CONFLICTING catalog note under Canonical Scope.
  - Status: CONFIRMED_FROM_IMPLEMENTATION (money path); CONFLICTING (seed display name)
  - Evidence: see Perfect Attendance payroll feature under Canonical Scope.
- Term: Perfect attendance metrics (report)
  - Meaning: Analytics metric key `perfectAttendanceMetrics` (zero late/undertime and no LEAVE status in range, with ≥1 attendance row). **Not** a payroll award path.
  - Status: CONFIRMED_FROM_IMPLEMENTATION
  - Evidence: `helper/perfect-attendance-metrics.helper.ts`; `app/metrics/metrics.controller.ts`; HR reports Perfect Attendance tab in `../hris-app`.

## Architecture Truth

Accepted or observed architecture:

- Item: TypeScript Express API with router/controller/service-style modules, Prisma schemas, generated OpenAPI/Postman docs, MongoDB-to-Postgres migration support, and local/dev scripts.
  - Status: CONFIRMED
  - Evidence: README, package scripts, `app/*`, `prisma/schema`, `prisma/schema-postgres`, and docs.
- Item: Prisma-backed model/schema layer is a source of persistence truth; generator workflow must be followed when adding Prisma-backed models.
  - Status: CONFIRMED
  - Evidence: `AGENTS.md`, `prisma/schema`, `prisma/schema-postgres`, `zod-generate`, and Prisma scripts.
- Item: HR attendance/timesheet/payroll source-of-truth split is binding for backend behavior and tests.
  - Status: CONFIRMED_FROM_IMPLEMENTATION
  - Evidence: `AGENTS.md`; `prisma/schema-postgres/attendanceobligation.prisma`, `attendance.prisma`, `timesheetline.prisma`, `employeepayroll.prisma`; `helper/timesheet.helper.ts`; `helper/attendance-obligation.helper.ts` (re-grounded on 2026-06-26 after `../docs/attendance-timesheet-payroll-tally-prd.md` was confirmed permanently unrecoverable — see Open Questions).
- Item: Employee benefit payroll adjustments resolve through generated or lazily ensured `EmployeeBenefitInstallment` rows. `RECURRING` benefits do not pre-generate infinite installments; payroll ensures one row per period. Attendance-based benefits recompute installment amounts from timesheet metrics inside `buildPayrollSourceAmountsByEmployeeId` (shared by preview and generation). Frontend field visibility is not authorization.
  - Status: CONFIRMED_FROM_IMPLEMENTATION
  - Evidence: `docs/BENEFIT_SCHEDULE_MODES.md`; `helper/payroll-benefit-source.helper.ts`; `helper/payroll-period.helper.ts`; `helper/employee-benefit-program.helper.ts`.
- Item: Named Bandai post-net receivable compensation fields include at least `perfectAttendance` (PFA), `mealAllowance` (MLA), and `lineLeaderAllowance` (LLA). These are filled from active EmployeeBenefit sources (and/or saved register values), not from the perfect-attendance **metrics report**. Do not invent auto-award from analytics.
  - Status: CONFIRMED_FROM_IMPLEMENTATION
  - Evidence: `helper/payroll-period.helper.ts`; `helper/payroll-source-display.helper.ts`; `app/employeepayroll/employeepayroll.controller.ts`.
- Item: Approved leave requests are attendance-side reconciliation events: they may create or supersede `Attendance` ledger rows, must recompute `AttendanceObligation`, must refresh mutable draft/revised/rejected timesheet snapshots from obligations, and must leave submitted/approved locked snapshots unchanged while surfacing explicit adjustment-required follow-up metadata.
  - Status: CONFIRMED_FROM_IMPLEMENTATION
  - Evidence: `app/request/request.controller.ts`, `app/request/leave-attendance-reconciliation.service.ts`, `helper/timesheet.helper.ts`, and `tests/leave-attendance-reconciliation.service.spec.ts`.
- Item: `validateLeaveRequestPolicy` skips advance-notice validation for `SICK` leave so backdated sick leave can be filed from timesheet flows. Vacation and personal leave still enforce `minAdvanceNoticeDays`.
  - Status: IMPLEMENTED_FROM_USER_REQUEST
  - Evidence: `helper/leave-policy.helper.ts`; `tests/leave-policy.helper.spec.ts`
- Item: Overtime is detected at clock-out/correction as an OT candidate; effective `overtimeHours` stays `0:00` until a manager approves an `OVERTIME` request (`WF-OVERTIME-DEFAULT`). Employees must file OT requests for all candidate days before timesheet submit (`OVERTIME_REQUEST_REQUIRED`). Payable OT and compensatory-leave credit still read approved effective `Timesheetline` rows only.
  - Status: CONFIRMED_FROM_IMPLEMENTATION
  - Evidence: `docs/OVERTIME_APPROVAL_WORKFLOW_PLAN.md`; `helper/overtime-approval.helper.ts`; `app/timesheet/overtime-request.service.ts`; `app/timesheet/timesheet.controller.ts`; `app/request/request.controller.ts`; `prisma/seeds/requestWorkflowCatalog.ts`; `tests/overtime-approval.helper.spec.ts`; `app/timesheet/approved-overtime-comp-leave.service.ts`.
- Item: Approved `TIME_ADJUSTMENT` requests are a single-date attendance-side reconciliation event: recompute `AttendanceObligation` for the target date, refresh the mutable timesheet snapshot from current source truth, and surface locked snapshots as `adjustment_required` follow-up metadata instead of mutating raw punches. The request does not carry corrected `timeIn`/`timeOut`, so no punch mutation is performed here. Unresolved `adjustment_required` follow-ups are **not** auto-applied into a future payroll run; the governed money path for post-lock hour/pay differences is the separate `PAYROLL_CORRECTION` ledger (see next item). Bridging leave/time-adjustment metadata into payroll corrections remains optional/out of MVP.
  - Status: CONFIRMED_FROM_IMPLEMENTATION
  - Evidence: `app/request/request.controller.ts` (`applyTimeAdjustmentApprovalSideEffects`), `app/request/time-adjustment-reconciliation.service.ts`, `tests/time-adjustment-reconciliation.service.spec.ts`, `hris-app/app/components/templates/my-pages/requests-time-requests-template.tsx` (create-flow metadata shape).
- Item: Post-payroll-lock valid corrections are filed as request type `PAYROLL_CORRECTION` (`WF-PAYROLL-CORRECTION-DEFAULT`), approved via the request workflow, stored as durable `PayrollCorrection` rows (`REQUESTED` → `READY` / `APPROVED_HOLD` / `REJECTED` → `APPLIED`), and applied as **explicit retro lines** on the **next open payroll generate** (`metadata.payrollCorrections[]` + `otherCompensation` / gross / net). Locked period timesheet source and Period A `EmployeePayroll.timesheetSnapshot` remain immutable. Stuffing prior-period hours into next-period timesheet day cells is prohibited. Negative estimated nets use `APPROVED_HOLD` and are not auto-applied in MVP (`IMPLEMENTED_DEFAULT_PENDING_OWNER_CONFIRMATION` for finance edge cases: tax treatment, negative recovery, off-cycle pay). Employee/HR request UI captures proposed **Time In / Time Out** (same mental model as edit timesheet); `beforeMinutes`/`afterMinutes`/`deltaMinutes` on day deltas remain the money settlement shape (duration derived overnight-aware from the proposed clocks; optional `timeIn`/`timeOut` may ride along for audit).
  - Status: ACCEPTED_TRUTH / CONFIRMED_FROM_IMPLEMENTATION
  - Evidence: `docs/PAYROLL_CORRECTION_NEXT_PERIOD_PRD.md`; `docs/PAYROLL_CORRECTION_NEXT_PERIOD_HANDOFF_PROMPT.md`; `prisma/schema-postgres/payrollCorrection.prisma`; `app/payrollCorrection/payroll-correction.service.ts`; `helper/payroll-correction.helper.ts`; `helper/payroll-period.helper.ts` (generate apply); `app/request/request.controller.ts` (approval side effects); `app/timesheet/timesheet.controller.ts` (`POST|GET /:id/payroll-corrections`); `prisma/seeds/requestWorkflowCatalog.ts`; `tests/payroll-correction.helper.spec.ts`; `buildEmployeePayrollComputationView` includes labeled retro gross rows from `metadata.payrollCorrections` (`tests/employee-payroll-computation-view-corrections.spec.ts`); emp-app + hris-app `TimesheetPayrollCorrectionPanel` / `payroll-correction-form.ts` (TimePicker in/out); HR Payroll summary modal prior-period accordion + daily detail correction category (`payroll-management-template.tsx`); payslip retro section (`payslip-detail-template.tsx`).
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
- Area: Baseline `prisma-seed` kiosk login demo content (emp-app `/auth/login` carousel).
  - Behavior (minimal): `kioskLoginSeeder` seeds **1** `COMPANY_EVENT` (“Bandai Town Hall”), cancels retired demo events (e.g. Wellness Friday), sets **1** parent employee DOB to current UTC month (+ `metadata.isActive=true`), and soft-deletes the legacy “Kiosk Celebrant” child so only one birthday appears. General employee DOBs use varied hash months (not all current month). Seed org code is stable **`bnei`**.
  - Public feeds: `GET /api/celebrations/public/birthdays` and `GET /api/calendar-item/public/kiosk` accept **`organizationId` or `organizationCode`**. Public kiosk calendar is filtered to **`type: COMPANY_EVENT`** (holidays excluded). Emp-app login slices to 1 event + 1 employee birthday slide.
  - Status: CONFIRMED
  - Evidence: `prisma/seeds/kioskLoginSeeder.ts`; `prisma/seeds/generalEmployeeSeeder.shared.ts`; `app/calendar-item/calendar-item.controller.ts`; `helper/public-kiosk-org.helper.ts`; `tests/kiosk-login-seeder.spec.ts`; `tests/public-kiosk-feeds.contract.spec.ts`; user request 2026-07-16.

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
  - Evidence: `prisma/schema-postgres/attendanceobligation.prisma`, `attendance.prisma`, `timesheetline.prisma`, `employeepayroll.prisma`; `helper/timesheet.helper.ts`.
- Drift risk: treating Perfect Attendance **metrics** (`perfectAttendanceMetrics`) as the same feature as Perfect Attendance **payroll money** (`PFA` / `EmployeePayroll.perfectAttendance`), or treating seed name “Performance Bonus” as the only product label while register/payslip say “Perfect Attendance”.
  - Status: CONFIRMED_FROM_IMPLEMENTATION (split is real); CONFLICTING (catalog vs product label)
  - Evidence: metrics helper vs payroll source map vs `benefitTypeSeeder` PFA row; WWG reconciliation 2026-07-17.

## Open Questions

- Question: Confirm canonical role and permission matrix across frontend routes, API middleware, and Prisma models.
  - Why it matters: Authorization tests and UI access behavior must align.
  - Evidence / uncertainty: Role names are inferred from app/API modules and need acceptance.
- Question: Confirm current primary persistence mode and migration state between MongoDB and Postgres.
  - Why it matters: DB invariant tests, seeds, migrations, and CI must target the correct schema.
  - Evidence / uncertainty: Prisma MongoDB and Postgres schemas plus migration/parity scripts exist.
- Question: Confirm payroll lock/reopen/correction policy and paid snapshot immutability rules.
  - Why it matters: Regression tests must encode accepted payroll behavior, not guessed policy.
  - Evidence / uncertainty: payroll/timesheet modules and code-level schema evidence define core source selection but not every workflow policy; `../docs/attendance-timesheet-payroll-tally-prd.md` (the prior binding spec for this) was confirmed permanently unrecoverable on 2026-06-26 (never committed in either repo's git history per `git log --all --diff-filter=A/D` and `git fsck --unreachable`). Any policy beyond what is verifiable in code requires explicit sign-off rather than inference.
- Question: Confirm any remote/shared isolated database target for destructive/fault-injection, load, and soak testing.
  - Why it matters: The user explicitly wants tests that detect DB bugs, but shared data must not be corrupted.
  - Evidence / uncertainty: local `hris_fault_test` is confirmed for this implementation slice; remote/shared targets remain unapproved.
- Question: Confirm deployment/secret handling and whether any credentials require rotation/removal.
  - Why it matters: secrets and deployment are high-risk closeout boundaries.
  - Evidence / uncertainty: deployment/secret scripts and docs exist; credential contents were not inspected.
- Question: Confirm finance edge cases for payroll corrections: statutory/tax treatment of retro lines, negative-delta recovery automation, termination/final-pay timing, and whether leave/`TIME_ADJUSTMENT` `adjustment_required` metadata should bridge into `PAYROLL_CORRECTION` automatically.
  - Why it matters: MVP applies positive READY corrections as next-period retro earnings under existing gross/contribution rules; negative holds and bridges are stubbed.
  - Evidence / uncertainty: `docs/PAYROLL_CORRECTION_NEXT_PERIOD_PRD.md`; `PayrollCorrection` `APPROVED_HOLD`; product handoff defaults D3/D5 labeled `IMPLEMENTED_DEFAULT_PENDING_OWNER_CONFIRMATION`.
- Question: Confirm Perfect Attendance benefit catalog identity for `PFA`: display name (Performance Bonus vs Perfect Attendance), category (`BONUS` vs allowance language), default `reconciliationAction` (`KEEP_AS_BENEFIT` seed vs Bandai post-net `RECEIVABLE_ONLY`), and whether eligibility should ever auto-link from `perfectAttendanceMetrics`.
  - Why it matters: HR import/UI, payslip labels, and seed data currently diverge; agents must not invent auto-award or rename casually.
  - Evidence / uncertainty: implementation confirms money path by code `PFA`; seed name and default reconciliation action are **CONFLICTING** / **NEEDS_CONFIRMATION** relative to Bandai register/post-net treatment.

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
