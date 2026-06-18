# Testing Program Implementation Report

Status: TDD_GATE_FOUNDATION
Last updated: 2026-05-25

## Task Classification

- Task mode: mixed
- Delivery mode: AI-agent
- Risk: high-risk quality infrastructure around persistence, employee data, attendance, timesheets, payroll, auth, and authorization.
- Implementation boundary: app-side deterministic tests in this repository; backend tests in sibling `../hris-api`.

## App-Side Implementation

- Added standard app test command names for unit, integration, E2E, regression, and CI baseline runs.
- Narrowed Vitest discovery so Playwright browser specs are not executed by Vitest.
- Removed remote-code execution behavior from Playwright configuration.
- Added focused test-surface typechecking through `tsconfig.test.json` and `npm run typecheck:test`.
- Fixed employee import preview validation so unknown schedules block import and preserve the existing regression expectation.
- Added `docs/testing-strategy.md`.
- Added `docs/testing-coverage-matrix.md`.

## App-Side Coverage Added

- `app/lib/api-url.helper.test.ts`
  - API base normalization, socket base stripping, duplicate `/api` prevention, and full URL resolution.
- `app/lib/api-client.test.ts`
  - GET query serialization, API prefix handling, JSON POST body handling, FormData headers, structured API errors, and network error normalization.
- `app/services/api-service.test.ts`
  - Default query params, field selection, pagination/search/sort, filter serialization, and query reset behavior.
- `app/services/metrics.service.test.ts`
  - Attendance obligation detail/summary payloads, today operational summary payloads, payroll blockers, payroll summary, and timesheet statistics payloads.
- `app/services/timesheetline.service.test.ts`
  - Default timesheet line fetch, approved/payroll-ready query construction, and missing-data failure behavior.
- `app/services/employee-payroll.service.test.ts`
  - Employee payroll list fetch, nested response unwrapping, paid snapshot field query, breakdown endpoint, payslip attachment upload, payslip generation, and payslip release endpoints.
- `app/services/attendance.service.test.ts`
  - HRIS attendance reads, query cleanup, attendance correction payloads, structured correction errors, import FormData, and legacy clock-in payloads.
- `app/components/atoms/ProfileInitialsAvatar.test.tsx`
  - Initial rendering, fallback initials, clickable accessible labels, and disabled clickable state.

## TDD Foundation Pass

- Added `docs/testing-maturity-audit.md` with cross-repo maturity assessment, risk matrix, testing pyramid, folder structure, CI strategy, coverage strategy, and prioritized backlog.
- Added `test:component` for app component-level tests.
- Added `~` alias support in Vitest to match app import conventions.
- Updated `.github/workflows/app-ci.yml` so app PR CI now blocks on `npm run test:ci`.
- Replaced stale insurance-oriented PR template with HRIS/TDD evidence checklist.
- Updated `../hris-api/.github/workflows/api-ci.yml` so API PR CI now blocks on `npm run test:ci:source-truth`.
- Added `../hris-api/docs/testing-maturity-audit.md`.

## Cleanup Pass

- Removed app-side API contract harness artifacts from `tests/api/`.
- Removed app-side load/soak harness artifacts from `tests/load/`.
- Removed synthetic backend DB invariant fixtures from `tests/regression/` and `tests/helpers/`.
- Removed `test:api`, `test:load`, and `test:soak` scripts from the app repository.
- Updated `vitest.config.ts`, `package.json`, and app testing docs so this repository now owns only frontend/client tests.

## API Repository Follow-Up

The paired sibling backend is `../hris-api`. API-server tests belong there:

- isolated test DB setup/teardown
- model/schema constraint tests
- endpoint authorization tests
- seeded DB fault-injection tests
- payroll snapshot immutability tests
- load/soak scenarios beyond read-only smoke checks

## API Follow-Through

- Continued implementation in `../hris-api` after app cleanup.
- Added API-side schema/source-truth contract tests for `AttendanceObligation`, `Attendance`, `Timesheetline`, and `EmployeePayroll`.
- Added API-side isolated DB fault-test guard tests.
- Passed in `../hris-api`: `npm run test:ci:source-truth` (45 tests).

## Cross-Repo Context Correction

- Corrected after user review: API implementation was not absent from the overall project context; it exists as sibling repo `../hris-api`.
- App-side tests in this repository are useful for client contracts, presentation behavior, and service payload construction, but they must not be treated as backend authorization, persistence, or DB proof.
- Added/updated WWG context in both repos so future agents route backend test work to `../hris-api`.

## Validation

- Passed after app cleanup: `npm run test:ci` (focused test typecheck plus 13 app test files, 135 passing tests).
- Passed after TDD foundation pass: `npm run test:ci` (focused test typecheck plus 15 app test files, 146 passing tests).
- Passed in API after TDD foundation pass: `npm run test:ci:source-truth` (45 passing tests).
- Previously passed before cleanup: `npm run typecheck:test`.
- Previously passed before cleanup: expanded app suite with 15 files / 140 tests / 1 skipped opt-in API contract before API-owned artifacts were removed.
- Failed existing explicit route audit: `npm run test:routes` reports 66 unused route files.
- Failed existing explicit route audit: `npm run test:unreachable` reports 54 unreachable route definitions.
- Failed existing typecheck: `npm run typecheck` reports unrelated project-wide TypeScript debt across app, scripts, backup routes, and examples.
- Not app-owned after cleanup: API contract, load, soak, and DB fault-injection execution.

## Recommendations

- New recommendation added: keep app CI limited to deterministic app/client tests until route-audit and typecheck debt are resolved.
- New recommendation added: continue backend contract, DB invariant, fault-injection, load, and soak implementation in `../hris-api`.
- New recommendation added: require an isolated disposable database before any intentional DB corruption or seeded bad-data tests.
- New recommendation added: add React Testing Library and provider-level app test utilities before broad form/hook/component expansion.
- New recommendation added: convert full app typecheck, route audits, and API broad legacy test harness into blocking CI gates only after their existing debt is repaired.

## WWG Truth Synchronization

- Task mode: mixed / high-risk quality infrastructure planning and first implementation.
- New truth detected: YES.
- Wiki updated: YES.
- Workspace updated: YES.
- Governance review completed: YES.
- Drift status: YELLOW.
- Canonical files changed:
  - `.wwg/workspace/current-task.md`
  - `.wwg/reports/testing-program-implementation.md`
  - `.wwg/reports/cross-repo-context-reconciliation.md`
  - `.wwg/wiki/project-truth.md`
  - `.wwg/wiki/project-truth-summary.md`
  - `.wwg/wiki/terminology.md`
  - `.wwg/wiki/terminology-summary.md`
- Implementation discoveries synced:
  - App repository owns frontend routes, UI, client payloads, browser E2E, and app-side regressions.
  - API implementation exists in sibling repo `../hris-api`.
  - Backend authorization, persistence, DB invariants, API contracts, load tests, and soak tests must be implemented in `../hris-api` or an approved API harness.
  - App CI now has a blocking deterministic test gate.
  - API CI now has a blocking source-truth test gate.
  - The initiating prompt included insurance-domain examples that conflict with HRIS Project Truth; the audit maps those examples to HRIS workflows.
- Remaining stale context:
  - Existing app route-audit/typecheck debt remains unresolved.
  - Isolated API DB target, role/permission matrix, and complete API persistence test coverage remain follow-up.
