# HRIS App Testing Strategy

Status: ACTIVE_DRAFT
Last reviewed: 2026-07-13

## Scope

This repository owns the React app test surface: UI behavior, route/navigation behavior, app utilities, client payload construction, browser E2E, and app-side regressions.

The backend API implementation lives in the sibling repository `../hris-api`. Backend authorization, persistence, Prisma schema/model constraints, API contracts, DB invariant/fault-injection tests, load tests, and soak tests must live there or in an explicitly approved API harness.

See `docs/testing-coverage-matrix.md` for the domain-by-domain coverage map and `docs/testing-maturity-audit.md` for the cross-repo maturity roadmap.

## Safety Contract

- Do not test against production data.
- Do not intentionally corrupt shared dev, UAT, staging, or production databases.
- App tests may verify request payloads and source-selection intent, but they do not prove backend authorization or database integrity.
- Attendance, timesheet, approved OT, and payroll-history expectations must preserve the source-of-truth split from `../docs/attendance-timesheet-payroll-tally-prd.md`.

## Test Layers

| Layer | Tool | Purpose | Default command |
|---|---|---|---|
| Unit | Vitest | Pure app logic, service payloads, utilities, calculations | `npm run test:unit` |
| Component | Vitest | Atomic design components and behavior that can be tested without a browser journey | `npm run test:component` |
| App integration | Vitest | Client/service interactions without network or browser state | `npm run test:integration` |
| App regression | Vitest | Reproduced frontend/client bugs and high-risk app behavior | `npm run test:regression` |
| Migration/import UI quality | Vitest + evidence runner | App-side import UI mapping and elapsed-time breakdown | `npm run test:migration:ui-quality` |
| Browser E2E | Playwright | App workflows through the browser against an explicitly prepared environment | `npm run test:e2e` |
| Browser smoke | Playwright + mocked API | Deterministic local app smoke coverage for auth-gated UI workflows | `npm run test:e2e:smoke` |
| Test typecheck | TypeScript | Typechecks app tests and test helpers | `npm run typecheck:test` |
| Test obligation check | Node + git diff | Fails when changed app behavior or quality-script source lacks same-feature test evidence | `npm run test:obligations` |
| CI baseline | npm scripts | Focused deterministic app test baseline | `npm run test:ci` |
| Deployable quality gate | npm scripts | Blocking app release/deploy gate covering test obligations, test CI, deterministic browser smoke, and production build | `npm run quality:ci` |
| Strict quality hardening | npm scripts | Release-candidate debt-burndown gate for lint, full typecheck, route audits, and browser E2E | `npm run quality:strict` |
| Typecheck | TypeScript | Existing explicit gate; currently has unrelated project debt to resolve before enabling in CI baseline | `npm run typecheck` |
| Route audits | Vitest | Existing route hygiene checks; currently separate from CI baseline until the route backlog is resolved | `npm run test:routes`, `npm run test:unreachable` |

## Rendering Components in Tests (Providers & Mocks)

Most real components and route pages depend on:

- `@tanstack/react-query` (`QueryClientProvider`)
- `react-router` (`MemoryRouter` + `useSearchParams` / `useNavigate`)
- `useAuth()` (via `AuthContext`)

**Always use the shared helper** when writing component or route tests that render actual UI:

```ts
import { renderWithProviders } from "~/test/render";
// ...
const result = renderWithProviders(<MyComponent prop={x} />, {
  routerProps: { initialEntries: ["/employee/123?tab=timesheets"] },
});
```

You are still expected to `vi.mock(...)` the data-fetching hooks (`useEmployees`, `useTimesheets`, `useAuth`, service modules, etc.) so tests stay fast, deterministic, and do not perform real network calls.

See:
- `app/test/render.tsx` (the helper + `createTestQueryClient`)
- `app/routes/employee/dashboard/TimesheetsTab.test.tsx` (example using the helper + mocks)
- `app/components/shared/EmployeeList.test.tsx` and hook tests for prior patterns

This pattern was added to close a recurring source of "No QueryClient set" and "useAuth must be used within AuthProvider" failures.

## Source-Of-Truth Regression Rules

- Live/current/future operational attendance must use `AttendanceObligation`.
- Clock ledger evidence must use `Attendance`.
- Past submitted/approved/payroll-ready totals and approved OT tally must use effective `Timesheetline` rows.
- Paid payroll history must use `EmployeePayroll.timesheetSnapshot`.
- Frontend visibility checks are not authorization; API tests must verify enforcement in `../hris-api`.
- App migration/import screens must be regression-tested when file import state, preview, mapping, option flags, count/status display, or error/progress presentation changes.
- Backend migration execution, persistence, DB invariants, load, and soak evidence belongs in `../hris-api` or an approved API harness.

## Current App-Side Coverage

The app-side suite includes focused tests for:

- API URL normalization and duplicate `/api` prevention.
- Low-level API client request, FormData, and error behavior.
- Shared `APIService` query building and reset behavior.
- Test-obligation policy behavior for app and quality-script source changes that require same-feature test evidence.
- Repository hygiene checks that keep generated build output, scratch screenshots, route backups, and stale mutation scripts out of source control.
- Central route configuration contracts for workspace layout grouping, duplicate route ids, static-before-dynamic employee routes, and public applicant entry points.
- Auth service login, password update, current-user endpoint selection, organization hydration, and fallback behavior.
- Requests service workflow client payloads, approval/delegation endpoints, state fallback, and structured create-error propagation.
- Employees service list query construction, employee-with-account FormData, document update FormData, import options, document delete encoding, and expired import job handling.
- Attendance obligation metrics, operational attendance summary, payroll blocker, payroll summary, and timesheet statistics payloads.
- Timesheetline service query construction for approved/payroll-ready line reads.
- EmployeePayroll service reads, paid snapshot field selection, breakdown, payslip generation, payslip release, and attachment upload endpoints.
- Attendance service reads, corrections, imports, and legacy clock-in payloads.
- Attendance import UI mutation payload wrapping.
- Profile initials avatar rendering and accessible clickable state.
- Employee import preview validation, including unknown schedule rejection.
- Admin migration/import UI count resolution, status/count badge state, and modal URL state.
- Admin migration route action ordering, modal title mapping, search-param state, and employee auto-create defaults.
- Admin configuration DataTable search field matching, status filtering, sort ordering, pagination display ranges, and server-side count fallback.
- Admin configuration Departments browser smoke coverage for auth-gated rendering, server-side search query accuracy, status filter query accuracy, and visible result counts.
- Recruitment requisition modal WARN/BLOCK behavior, requisition state reset, public job modal query preservation, job-detail apply navigation, public jobs/apply browser smoke coverage, and HR recruitment jobs-manager browser smoke coverage for server-side search/filter state.
- Attendance import route template columns, allowed status guidance, and source-of-truth contract labels.
- Import progress timing helpers for started/completed/elapsed display and compact error rows.
- Employee benefit schedule modes in the HR benefits modal: default `TIME_BOUND` mode, conditional end-date vs installment-count fields, `RECURRING` optional end date and per-period amount, mode-switch cleanup, missing end date and invalid count validation, informational installment previews including final-centavo remainder and open-ended recurring copy, create payload shaping, legacy edit compatibility, and payroll-period prefill. Client Zod and service projection tests cover `scheduleMode` / `totalInstallments` / recurring contracts.

Product behavior for the three schedule modes is documented in `docs/BENEFIT_SCHEDULE_MODES.md`. The API remains authoritative for installment generation (and lazy recurring ensure) and payroll deduction; backend coverage lives in `../hris-api`.

Focused benefit-schedule app evidence:

```bash
npx vitest run app/zod/employee-benefit.zod.test.ts app/services/employee-benefit.service.test.ts app/components/templates/hr/benefits-management-template.test.tsx
```

Latest focused result: 21 passing tests.

This app-side evidence is now linked into the API DM masterlist/map in `../hris-api/docs/migration-dm-quality-masterlist.md`. The app rows prove UI/client contracts only: admin setup import route wiring for holidays, leave types, benefit types, shift types, departments/sections, levels, positions, and employees; attendance import payload/template/status/source-truth labels; create-timesheets option propagation; and import progress display. Backend migration correctness, persistence, authorization, and DB invariants remain API-owned.

The focused migration/import UI evidence command is:

```bash
npm run test:migration:ui-quality
```

It prints scope, file, and individual-test elapsed-time breakdowns in the terminal and writes:

- `output/reports/app-import-ui-quality-breakdown.json`
- `output/reports/app-import-ui-quality-breakdown.md`

Latest focused result: 35 passing tests.

## Current Quality Gates

App PR/push CI now blocks on:

```bash
npm run quality:ci
```

`quality:ci` runs `npm run test:obligations`, `npm run test:ci`, `npm run test:e2e:smoke`, and `npm run build`. App CI covers pushes and pull requests for `develop` and `uat`. Firebase preview and branch deploy workflows run or depend on this gate before publishing. Manual image deploys run this gate before building and pushing an image.

`test:obligations` is intentionally scoped: it checks changed app behavior source under `app/components`, `app/contexts`, `app/guards`, `app/hooks`, `app/layouts`, `app/lib`, `app/routes`, `app/services`, `app/utils`, validation/config source, and behavior-bearing repository scripts. It ignores docs, assets, generated build output, and config-only changes so tests are required only when they are meaningful. The check now requires same-feature evidence: unrelated same-domain tests and unrelated browser specs do not satisfy the TDD obligation.

Full app `npm run typecheck`, route audits, full browser E2E, and lint remain part of `npm run quality:strict` until existing unrelated debt and deterministic test data gaps are resolved. The deterministic Playwright smoke lane is now part of `quality:ci`; environment-dependent full E2E remains strict-only. The ESLint v9 flat config is now present, but the current lint backlog is still red.

Latest TDD enforcement repair: the app gate red findings for route-backup hygiene and admin migration agency import contract drift were repaired without weakening assertions. `npm run test:obligations` now treats behavior-bearing scripts as test-obligated source and requires same-feature evidence. `npm run quality:ci` passed after the repair with 32 Vitest files / 239 tests, 1 Playwright smoke test, and production build. Full app `npm run lint`, broad `npm run typecheck`, route audits, and full browser E2E remain hardening debt until separately repaired.

## API Repository Handoff

The following are intentionally out of scope for this app repository and belong in `../hris-api`:

- API contract/integration tests for real endpoints.
- Backend authorization tests for employee, manager, HR, admin, and super admin roles.
- Prisma schema/model constraint tests.
- Seeded DB fault-injection tests against an isolated database.
- Payroll snapshot immutability tests after payroll is paid.
- Approval lock/reopen behavior and audit/event capture.
- API load and soak scenarios using synthetic users and seed data.
