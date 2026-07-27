# Project Truth

Adoption status: INFERRED_FROM_EXISTING_PROJECT
Status: Inferred from repository evidence. Requires human/agent review before becoming accepted project truth.
Truth confidence: HIGH
Last adoption audit: 2026-05-26

This file was populated from existing code, documentation, package metadata, configuration, and observed implementation.

Items marked `INFERRED`, `NEEDS_CONFIRMATION`, `CONFLICTING`, or `STALE` should be reviewed before major future work.

If this file conflicts with lower-priority reports, generated notes, task files, or stale documentation, this file wins once confirmed.

Project Truth must not be silently overwritten. Requirement evolution is allowed when documented and accepted.

## Product Identity

- Product name: HRIS Workforce System / hris-app
- Status: NEEDS_CONFIRMATION
- Evidence: repository path `hris-app`; README now uses `hris-app` as a working name; `firebase/README.md` references `hrisworkforcesystem-coder/hris-app`; Firebase project IDs use `hris-workforce-*`; package.json still says `react-app-template` and appears stale.

## Product Category

- Category: Human Resources Information System (HRIS) / workforce management application
- Status: CONFIRMED
- Evidence: `docs/employee-status-changes-eligibility.md` describes an HRIS system; routes and services cover employees, HR dashboards, attendance, timesheets, leave, payroll, recruitment, onboarding, performance, reports, and approvals.

## One-Line Description

- Description: hris-app appears to be an HRIS/workforce management application for employee records, attendance, requests, approvals, payroll-related workflows, recruitment, onboarding, and HR reporting.
- Status: INFERRED
- Evidence: `app/routes/hr/*`, `app/routes/employee/*`, `app/services/*`, `app/types/*`, HR dashboard components, and HRIS Firebase project naming.

## Primary Users and Roles

- Role: admin, HR admin, HR user, HR manager, manager, employee, public applicant
  - Status: INFERRED
  - Evidence: `app/routes/admin/*`, `app/routes/hr/*`, `app/routes/employee/*`, `app/routes/hr-public/*`, `app/components/dashboards/*`, `app/components/molecules/hr-admin/*`, `app/components/molecules/hr-user/*`, `app/components/molecules/manager/*`.

## Canonical Scope

Currently includes:

- Feature: HR dashboards, employee records, attendance, timesheets, leave, requests, approvals, payroll-related screens, billings, recruitment/jobs, public applicant flows, onboarding, performance, reports, document requests, and reusable form/UI components.
  - Status: INFERRED
  - Evidence: route, service, type, test, and component paths under `app/routes/hr`, `app/routes/employee`, `app/routes/hr-public`, `app/services`, `app/types`, `tests`, and `app/components`.
- Feature: Timesheet day actions open leave requests with prefilled dates via `/employee/requests?action=create&kind=leave&date=YYYY-MM-DD`. The leave modal preselects `FULL_DAY` duration for timesheet-origin requests and honors the selected date. Sick leave allows any calendar day; vacation and personal leave enforce advance-notice policy unless the request is opened from a timesheet day prefill.
  - Status: IMPLEMENTED_FROM_USER_REQUEST
  - Evidence: `app/components/organisms/TimesheetViewModal.tsx`; `app/lib/utils/requests-route.ts`; `app/lib/utils/leave-request-policy.ts`; `app/components/organisms/leave-request-modal.tsx`; `app/components/templates/my-pages/requests-hub-template.tsx`
- Feature: Payroll-locked timesheets (`lockedAt` / `lockedEmployeePayrollId` / `lockReason`) block day edits and edit-permission requests in `TimesheetViewModal`. Primary post-lock money path is **Request payroll correction** via banner/chip/footer and **in-modal** `TimesheetPayrollCorrectionPanel` (calendar multi-select + Time In/Time Out; type auto-derived and not displayed). Standalone `TimesheetPayrollCorrectionModal` remains as secondary/legacy shell. Day markers load from `listPayrollCorrections`. Time Requests includes a view-only Payroll Corrections tab. Domain SOT remains API `PayrollCorrection` + next-open payroll retro apply (see `../hris-api/.wwg/wiki/project-truth.md`).
  - Status: CONFIRMED_FROM_IMPLEMENTATION
  - Evidence: `app/components/organisms/TimesheetViewModal.tsx`; `app/components/molecules/TimesheetPayrollCorrectionPanel.tsx`; `app/components/molecules/TimesheetPayrollCorrectionModal.tsx`; `app/lib/utils/payroll-correction-form.ts`; `app/lib/hooks/useTimesheets.ts` (`useCreatePayrollCorrection`, `useTimesheetPayrollCorrections`); `app/components/templates/my-pages/requests-time-requests-template.tsx`.
- Feature: Employee payslip detail shows labeled next-period retro lines from `EmployeePayroll.metadata.payrollCorrections[]` under “Adjustments / Retro” and includes their amounts in TOTAL EARNINGS (gross/net already include apply on the API). Parity with emp-app payslip detail.
  - Status: CONFIRMED_FROM_IMPLEMENTATION
  - Evidence: `app/components/templates/employee/payslip-detail-template.tsx`; `app/types/employee-payroll.ts`; API apply path `../hris-api/helper/payroll-period.helper.ts` + `metadata.payrollCorrections`.
- Feature: HR **Payroll summary** modal (`/hr/hr-payroll` past/active view) surfaces applied prior-period corrections: labeled lines in Payroll computation (from `employeePayrollComputationView` / metadata fallback), dedicated **Prior-period corrections** accordion with dayDeltas, and a Daily detail **correction category** so totals tally with GrossPay. Does not rewrite this period’s attendance rows.
  - Status: CONFIRMED_FROM_IMPLEMENTATION
  - Evidence: `app/components/templates/common/payroll-management-template.tsx`; API `buildEmployeePayrollComputationView`; `app/types/employee-payroll.ts` (`metadata.payrollCorrections.dayDeltas`).
- Feature / agent contract: Dual-app UI parity with `hris-emp-app` for timesheets, attendance, employee payroll/payslips, leave-request patterns, and shared molecules/utils. Agents must update both packages when a surface exists in both (see package `AGENTS.md` and monorepo `AGENTS.md` / `.grok/rules/hris-dual-app-ui-parity.md`). HR-admin-only surfaces are exempt.
  - Status: ACCEPTED_TRUTH
  - Evidence: user directive 2026-07-15; `AGENTS.md`; `../AGENTS.md`; `../.grok/rules/hris-dual-app-ui-parity.md`; `.wwg/governance/drift-guard.md`.
- Feature / temporary UX: On employee attendance (`AttendanceTemplate` / `/employee/:id/attendance`) Today card, the **Clock In/Out action button is hidden** (`SHOW_CLOCK_IN_BUTTON = false`). Clock In/Out time cards remain. Primary CTA is a larger **View Timesheet** button. Parity with emp-app `/attendance`. Re-enable by flipping the flag.
  - Status: CONFIRMED temporary product choice
  - Evidence: user request 2026-07-21; `app/components/templates/common/attendance-template.tsx`
- Feature: Perfect Attendance appears in two UI surfaces that must not be conflated: (1) **HR Attendance reports** tab “Perfect Attendance” via metrics `perfectAttendanceMetrics` (analytics only); (2) **payroll / benefits** compensation code **`PFA`** labeled Perfect Attendance on register/payslip (`perfectAttendance` field), filtered under benefits “attendance” preset. Money is enrollment-driven on the API; the report does not award pay. Seed catalog may still show type name Performance Bonus — **CONFLICTING** with product label; prefer PFA + Perfect Attendance in payroll UI language. Domain SOT: `../hris-api/.wwg/wiki/project-truth.md` (reconciled 2026-07-17).
  - Status: CONFIRMED_FROM_IMPLEMENTATION (UI wiring); CONFLICTING (catalog display name on API seed)
  - Evidence: `app/routes/hr/reports/tabs/PerfectAttendanceTab.tsx`; `app/components/templates/hr/benefits-management-template.tsx` (`attendance: ["PFA"]`); `app/components/templates/common/run-payroll-template.tsx`; `app/components/templates/common/payroll-management-template.tsx`; API payroll field mapping.
- Feature: PFA enrollment + attendance-based amount UX (benefits form).
  - Meaning: When benefit type code is **`PFA`** and **Compute from attendance** is on, the create/edit enrollment form shows a **warning banner** (`pfa-attendance-based-warning`) explaining ABSENT-only pro-rate (still pays with absences; not metrics eligibility; not all-or-nothing). Save is not blocked. With attendance off, PFA pays the fixed enrolled amount when due.
  - Status: CONFIRMED_FROM_IMPLEMENTATION
  - Evidence: `app/components/templates/hr/employee-benefit-form.tsx` (`shouldShowPfaAttendanceBasedWarning`); `benefits-management-template.test.tsx`; `docs/BENEFIT_SCHEDULE_MODES.md`. Dual-app: **HR/emp-only** (no emp-app enrollment form counterpart).
- Feature: HR sidebar **Reports** submenu includes **Attendance Reports** → `/hr/reports/attendance` (Perfect Attendance, Daily Trend, Tardiness & Undertime, Overtime, Leave Balance tabs). Route already existed; nav entry added so the page is discoverable.
  - Status: CONFIRMED_FROM_IMPLEMENTATION
  - Evidence: `app/components/organisms/Sidebar.tsx` (`hr-reports-attendance`); `app/routes.ts` (`reports/attendance`); `app/routes/hr/reports/attendance.tsx`.
- Feature: HR benefits management supports explicit payroll schedule modes `TIME_BOUND`, `FIXED_INSTALLMENTS`, and `RECURRING`. Create is a dedicated full page at `/hr/benefits-management/new` (not a modal); edit/view/delete remain list-page modals. Create assigns employees via multi-select card modal (avatar, name, employee ID; search + department/section/position/level filters) and bulk-creates via `POST /api/employeeBenefit/bulk`. On the create page, the employee picker is deep-linked via `?action=select-employees` (open/close syncs the URL; other query params are preserved). Multi-select mode includes **Select all** (adds all currently filtered employees to the draft) and **Clear** (removes filtered employees from the draft). Edit reuses the same picker in single-select mode (local open state only, no deep link). Recurring uses per-period amount labeling, optional end date (open-ended when empty), omits installment count, and shows **Recurrence** (`EVERY_CUTOFF` / `MONTHLY` / `YEARLY`). API remains authoritative for installment generation and payroll apply. Legacy `?action=create` deep links redirect to `/new`.
  - Status: CONFIRMED_FROM_IMPLEMENTATION
  - Evidence: `app/components/molecules/employee/EmployeeMultiSelectModal.tsx`; `app/components/templates/hr/employee-benefit-form.tsx` (`SELECT_EMPLOYEES_ACTION`, `recurrence-frequency`); `app/routes/hr/benefits-management.new.tsx`; `app/services/employee-benefit.service.ts`; paired API bulk route `../hris-api/app/employeeBenefit/*`; `docs/BENEFIT_SCHEDULE_MODES.md`. Multi-employee bulk create confirmed 2026-07-14; select-employees deep link + Select all confirmed 2026-07-17; recurrence frequency v1 confirmed 2026-07-17.

Currently does not include unless approved:

- Boundary: production security, auth, authorization, billing, payroll, persistence, data deletion, Firebase deployment, and secrets handling changes require explicit approval and evidence-backed review.
  - Status: CONFIRMED
  - Evidence: auth context/guard/service files, billing/payroll routes and services, Mongoose dependency, Firebase config/workflows, employee deletion scripts, and Firebase admin SDK JSON filenames detected in the repository.

## Canonical Terminology

See `.wwg/wiki/terminology.md`.

Critical terms:

- Term: card
  - Meaning: Observed project term; confirm canonical meaning before broad use.
  - Status: INFERRED
  - Evidence: app/components/atoms/Card.tsx, app/components/atoms/ChartCard.tsx, app/components/atoms/SummaryCard.tsx, app/components/dashboards/shared/cards/action-needed-card.tsx
- Term: calendar
  - Meaning: Observed project term; confirm canonical meaning before broad use.
  - Status: INFERRED
  - Evidence: app/components/atoms/schedule-calendar.tsx, app/components/dashboards/shared/cards/employee-calendar-card.tsx, app/components/molecules/TimesheetCalendar.tsx, app/components/molecules/TimesheetCalendarApproval.tsx
- Term: dashboard
  - Meaning: Observed project term; confirm canonical meaning before broad use.
  - Status: INFERRED
  - Evidence: source text, README/source text, app/components/dashboards/dashboard-skeleton.tsx, app/components/dashboards/employee-dashboard.tsx
- Term: modal
  - Meaning: Observed project term; confirm canonical meaning before broad use.
  - Status: INFERRED
  - Evidence: app/components/atoms/Modal.tsx, app/components/dashboards/shared/regularization-celebration-modal.tsx, app/components/modals/CandidateDetailsModal.tsx, app/components/modals/ChangePasswordModal.tsx
- Term: form
  - Meaning: Observed project term; confirm canonical meaning before broad use.
  - Status: INFERRED
  - Evidence: app/components/atoms/form/FormFieldGroup.tsx, app/components/atoms/form/form-input.tsx, app/components/atoms/form/form-number-input.tsx, app/components/atoms/form/form-select.tsx
- Term: Benefit schedule mode
  - Meaning: UI/API schedule type for payroll benefit adjustments: Time-bound, Fixed installments, or Recurring.
  - Status: CONFIRMED_FROM_IMPLEMENTATION
  - Evidence: `docs/BENEFIT_SCHEDULE_MODES.md`; benefits create page + edit modal (`employee-benefit-form.tsx`).

## Design System Reference

- Design system document: `docs/design-system.md`
  - Status: INFERRED_FROM_IMPLEMENTATION_CONTEXT
  - Evidence: `docs/design-system.md`; user request on 2026-06-10 to update the design system for `hris-app`.
- Usage boundary: Treat this as active app-side UI guidance for `hris-app` unless superseded by accepted product truth or a more specific component/route standard.
  - Status: INFERRED_FROM_USER_REQUEST
  - Evidence: `docs/design-system.md`; `DOCUMENTATION_INDEX.md`.

## Architecture Truth

Accepted or observed architecture:

- Item: source folders: app, app/assets, app/assets/forms, app/components, app/components/atoms, app/components/atoms/form, app/components/atoms/navigation, app/components/atoms/progress; package-managed runtime; TypeScript configuration
  - Status: INFERRED
  - Evidence: source/config (folders and package metadata)
- Item: paired backend API repository exists at `../hris-api`.
  - Status: CONFIRMED
  - Evidence: sibling repository `../hris-api`; `../hris-api/README.md` identifies "Backend API for HRIS"; `../hris-api/package.json` package name is `hris-api`.
- Item: App PR/push CI has a blocking deployable quality gate through `.github/workflows/firebase-hosting-develop.yml`, covering app test-obligation enforcement, focused app CI tests, deterministic browser smoke, and production build for `develop` and `uat`.
  - Status: CONFIRMED
  - Evidence: `.github/workflows/firebase-hosting-develop.yml`; `package.json`; `scripts/check-test-obligations.mjs`; `docs/testing-strategy.md`; `docs/testing-maturity-audit.md`.
- Item: App behavior and quality-script source changes must include changed test evidence for the same source feature; broad same-domain or unrelated browser specs are not sufficient TDD evidence.
  - Status: CONFIRMED
  - Evidence: `scripts/check-test-obligations.mjs`; `scripts/check-test-obligations.test.ts`; `app/lib/test-obligation-policy.test.ts`; `docs/testing-strategy.md`; `.wwg/governance/test-enforcement.md`.
- Item: Firebase preview and branch deployment workflows run or depend on the app quality gate before publishing build artifacts, and manual image deploy runs the gate before building/pushing an image.
  - Status: CONFIRMED_FOR_REPOSITORY_CONFIG; NEEDS_CONFIRMATION_FOR_REMOTE_GITHUB_PROTECTION
  - Evidence: `.github/workflows/firebase-hosting-develop.yml`; `package.json`.
- Item: Generated `build/client` output and local scratch artifacts are not canonical source and should not be tracked in this repository.
  - Status: CONFIRMED
  - Evidence: `.gitignore`; `app/lib/repository-hygiene.test.ts`; tracked stale artifacts removed in the app testing/cleanup pass.
- Item: Root Vite timestamp cache modules, local letter-spacing scratch HTML, legacy root markdown notes, and generated duplicate route reports are not canonical app source.
  - Status: CONFIRMED
  - Evidence: `.gitignore`; `app/lib/repository-hygiene.test.ts`; `DOCUMENTATION_INDEX.md`; `docs/archive/legacy-root-docs/`.
- Item: Admin configuration list behavior is app-owned and covered at the shared table-state layer for search-field matching, filter composition, sorting, pagination display, and server-side total fallback.
  - Status: CONFIRMED
  - Evidence: `app/lib/data-table-state.ts`; `app/lib/data-table-state.test.ts`; `app/components/atoms/DataTable.tsx`; `docs/testing-strategy.md`.
- Item: Deterministic app-owned browser smoke tests use Playwright with mocked API responses and are part of the deployable app quality gate.
  - Status: CONFIRMED
  - Evidence: `playwright.smoke.config.ts`; `tests/smoke/admin-config-departments.spec.ts`; `package.json`; `docs/testing-strategy.md`.
- Item: Playwright test configuration must not fetch and execute remote code.
  - Status: CONFIRMED
  - Evidence: `playwright.config.ts`; previous remote-fetch-and-`eval` block removed in the admin configuration testing cleanup.

Do not introduce without approval:

- Auth/security changes beyond class-variance-authority, firebase-tools, .react-router/types/app/layouts/+types/auth-layout.ts, .react-router/types/app/routes/auth/+types/login.ts, app/components/debug/AuthDebug.tsx, app/components/templates/AuthTemplate.tsx, app/contexts/auth-context.tsx, app/contexts/auth-provider.tsx, app/guards/auth-guard.tsx, app/layouts/auth-layout.tsx
  - Status: NEEDS_CONFIRMATION
  - Evidence: Existing project adoption audit
- Payment/billing changes beyond .react-router/types/app/routes/hr/+types/billings.$id.ts, .react-router/types/app/routes/hr/+types/billings.ts, app/components/templates/common/billings-template.tsx, app/lib/mock-soa-billings.ts, app/routes/hr/billings.$id.tsx, app/routes/hr/billings.tsx
  - Status: NEEDS_CONFIRMATION
  - Evidence: Existing project adoption audit
- Deployment changes beyond .github/workflows/firebase-hosting-develop.yml, .firebaserc, Dockerfile, firebase.json
  - Status: NEEDS_CONFIRMATION
  - Evidence: Existing project adoption audit

## Cross-Repo Relationship

- Paired backend API repository: `../hris-api`
  - Status: CONFIRMED
  - Evidence: sibling repo exists; API README/package identify HRIS backend API.
- App repository ownership: frontend routes, role-based display behavior, client-side service payload construction, presentation logic, browser E2E, and app-side regression tests.
  - Status: CONFIRMED
  - Evidence: app routes, components, services, tests, and testing docs in this repository.
- App repository ownership: admin migration/import UI for setup/master-data file import workflows, including client-side option state, counts/status display, import preview behavior, app-side regression tests, and app-side evidence linked into the API DM masterlist/map.
  - Status: CONFIRMED
  - Evidence: `app/routes/admin/configuration/migration.tsx`; `app/routes/admin/configuration/migration.import-route.test.ts`; `app/routes/admin/configuration/attendance.tsx`; `app/routes/admin/configuration/attendance.import-route.test.ts`; `app/lib/admin-migration-ui.ts`; `app/lib/admin-migration-ui.test.ts`; `app/lib/attendance-import-ui.ts`; `app/lib/attendance-import-ui.test.ts`; `app/lib/import-progress-ui.ts`; `app/lib/import-progress-ui.test.ts`; `scripts/run-import-ui-quality-tests.mjs`; `docs/testing-strategy.md`.
- API repository ownership: backend authorization enforcement, persistence, Prisma schema/model constraints, source-of-truth selection, transactions/concurrency, migrations/backfills, API contracts, API load tests, API soak tests, and DB invariant/fault-injection tests.
  - Status: CONFIRMED_FOR_REPOSITORY_BOUNDARY; INFERRED_FOR_SPECIFIC_TEST_COVERAGE
  - Evidence: `../hris-api` README/package, API modules, Prisma schemas, scripts, and API WWG Project Truth.
- Rule: frontend visibility is not authorization. Authorization and persistence guarantees must be tested in `../hris-api` or an approved API harness.
  - Status: CONFIRMED
  - Evidence: high-risk auth/authorization boundary and current testing-program task.

## Safety and Production Boundaries

Current boundaries:

- Boundary: HRIS production-sensitive behavior includes employee data, attendance, timesheets, payroll/billing, auth/permissions, persistence, Firebase deployment, public legal/support pages, and scripts that can delete employee records.
  - Status: CONFIRMED
  - Evidence: `app/contexts/auth-context.tsx`, `app/guards/auth-guard.tsx`, HR routes/services, `mongoose`, Firebase workflow/config files, legal/support routes, and package scripts `delete:employee` / `delete:all-employees`.
- Boundary: Firebase admin SDK JSON files are present and tracked in the Git index by filename; they must be treated as exposed credential material until reviewed, removed, and rotated or revoked by the project owner.
  - Status: NEEDS_CONFIRMATION
  - Evidence: `firebase/hris-workforce-uat-20260416-firebase-adminsdk-fbsvc-ee4f65cccc.json`; `firebase/scripts/hris-workforce-dev-20260416-firebase-adminsdk-fbsvc-5bc96d313b.json`.

Mock/demo-only areas:

- Area: package identity vs implemented HRIS application
  - Status: CONFLICTING
  - Evidence: package.json still identifies the project as `react-app-template`, while README, source, docs, Firebase config, and routes identify an HRIS/workforce application.
- Area: Build output and local scratch artifacts
  - Status: RESOLVED_FOR_CURRENT_TRACKED_ARTIFACTS
  - Evidence: `build/client`, `routes.backup`, root route-refactor helper scripts, local screenshot outputs, and route-refactor scratch docs were removed from tracking; `.gitignore` now covers scratch folders and screenshots.

Do not claim production readiness for:

- Capability: class-variance-authority, firebase-tools, .react-router/types/app/layouts/+types/auth-layout.ts, .react-router/types/app/routes/auth/+types/login.ts, app/components/debug/AuthDebug.tsx, app/components/templates/AuthTemplate.tsx, app/contexts/auth-context.tsx, app/contexts/auth-provider.tsx, app/guards/auth-guard.tsx, app/layouts/auth-layout.tsx
  - Status: CONFIRMED
  - Evidence: class-variance-authority (auth/security indicator)
- Capability: .react-router/types/app/routes/hr/+types/billings.$id.ts, .react-router/types/app/routes/hr/+types/billings.ts, app/components/templates/common/billings-template.tsx, app/lib/mock-soa-billings.ts, app/routes/hr/billings.$id.tsx, app/routes/hr/billings.tsx
  - Status: CONFIRMED
  - Evidence: .react-router/types/app/routes/hr/+types/billings.$id.ts (payments/billing indicator)

## Current Product Direction

Current direction:

- Direction: Continue as an HRIS/workforce management app with governed HR, employee, attendance, payroll/billing, recruitment, onboarding, performance, reporting, auth, and Firebase deployment boundaries.
  - Status: INFERRED
  - Evidence: implemented routes/services/types/tests and Firebase HRIS project naming.

Avoid drifting into:

- Drift risk: stale package template identity, public/docs mismatch, and unsupported production-readiness claims
  - Status: CONFLICTING
  - Evidence: package metadata conflicts with implemented HRIS source; production-sensitive auth, billing/payroll, persistence, Firebase, public legal/support, and deletion-script surfaces exist.

## Open Questions

- Question: Confirm the canonical product name and whether `HRIS Workforce System`, `hris-app`, or another name should be used.
  - Why it matters: Product name affects package metadata, release notes, docs, handoffs, and agent prompts.
  - Evidence / uncertainty: Source, README, and Firebase naming indicate HRIS/workforce; package.json still says `react-app-template`.
- Question: Confirm primary users and role names.
  - Why it matters: Roles affect permissions, UX, terminology, and task routing.
  - Evidence / uncertainty: INFERRED: admin, HR admin, HR user, HR manager, manager, employee, public applicant.
- Question: Confirm whether tracked Firebase admin SDK JSON files have already been revoked/rotated, then approve repository removal if appropriate.
  - Why it matters: Service account JSON files may contain sensitive credentials and should not be treated as safe without owner review.
  - Evidence / uncertainty: Firebase admin SDK JSON filenames are tracked in the Git index under `firebase/` and `firebase/scripts/`; file contents were not inspected.

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

For adopted projects, do not treat inferred truth as final confirmed truth until reviewed.
