# HRIS Testing Maturity Audit

Status: ACTIVE_DRAFT
Last reviewed: 2026-06-01

## Scope

This audit covers the paired HRIS repositories:

- `hris-app`: React Router frontend, app/client tests, browser E2E.
- `hris-api`: Express/Prisma backend, API contracts, authorization, persistence, DB invariants, load, soak, and fault-injection tests.

Insurance-specific examples from the initiating prompt are treated as `CONFLICTING` with Project Truth. The equivalent HRIS flows are employee onboarding, employee records, attendance, timesheets, manager approvals, recruitment/applicants, payroll, billing/SOA, documents, and auth.

## Maturity Assessment

Current maturity: `2.5 / 5`.

The project has useful targeted tests, but it is not yet operating as a mature TDD system. The main gap is not test framework availability; it is coverage breadth, CI enforcement, deterministic fixture design, and missing integration/failure layers.

## 2026-06-01 Confidence Audit Addendum

Current gate status: `RED`.

The latest audit did not assume passing focused tests were enough. `npm run quality:ci` currently fails in the app repo because `app/lib/repository-hygiene.test.ts` expects `.gitignore` to contain `routes.backup/`. Focused sub-lanes still provide useful evidence: `npm run test:e2e:smoke`, `npm run test:migration:ui-quality`, and `npm run build` passed when run separately. However, hardening lanes remain red or miswired: `npm run lint`, full `npm run typecheck`, route audits, and full Playwright E2E do not currently provide green release evidence.

The audit also found app coverage breadth remains narrow relative to the implemented surface: about 900 app TS/TSX source files, 219 route source files, 376 component source files, and 73 hook source files versus 36 total app/browser test files, 2 route test files, 2 component test files, and 0 hook test files.

## TDD Enforcement Repair Addendum

The app-side TDD enforcement was strengthened after a follow-up audit found two problems: the deployable gate was red on existing test failures, and the obligation checker accepted overly broad evidence. The repair keeps `npm run test:obligations` in `quality:ci`, adds direct tests for the obligation CLI, treats behavior-bearing repository scripts as test-obligated source, and rejects unrelated same-domain tests or unrelated browser specs as evidence.

Validation after the repair passed `npm run test:ci` with 32 files / 239 tests and passed `npm run quality:ci`, including obligation enforcement, browser smoke, and production build. This improves change discipline, but it does not by itself close the larger coverage gap. The latest app inventory still shows hundreds of route/component/hook files with sparse direct tests, so critical HRIS workflows still need targeted suites beyond the enforcement guard.

| Area | Current State | Maturity | Main Gap |
|---|---|---:|---|
| App unit/client tests | Focused app helper, service, component, route-contract, auth, request workflow, employee import/document, and hygiene tests exist | 3 | Many forms, hooks, and complex components remain untested |
| App component tests | First atom-level component test added | 1.5 | No React Testing Library setup yet for user-event flows |
| Browser E2E | 3 Playwright specs exist | 1.5 | No seeded deterministic HRIS journey suite |
| API unit/helper tests | Useful helper and source-truth tests exist | 2.5 | Many controllers/services are untested |
| API contracts | Some Supertest controller coverage exists | 2 | No systematic endpoint contract matrix |
| DB invariants | Static schema contracts and safety guard exist | 2 | No isolated DB setup/teardown or seeded bad-data runs yet |
| Load/soak | API dry-run harness exists | 1.5 | No approved target, thresholds, or scheduled reports |
| CI quality gates | App deployable quality gate now runs test-obligation enforcement, focused app CI tests, and production build, and gates Firebase/image deploy paths | 3.5 | Full typecheck, lint, route audits, and browser E2E remain strict/manual until existing debt is remediated |
| TDD workflow | PR template requires test evidence and `quality:ci` now fails app behavior or quality-script changes without same-feature test evidence | 3.25 | Enforcement is still change-evidence based, not coverage-threshold or mutation-test based |

## High-Risk Modules

| Risk | Repo | Why It Matters | Current Coverage | Priority |
|---|---|---|---|---|
| Auth and authorization | app/api | Frontend hiding is not authorization | Role utilities, auth service endpoint/fallback tests, some security middleware | Critical |
| Employee records/import | app/api | PII, document uploads, onboarding state | Import validation helpers, employee service FormData/import/document tests, expired import job regression | Critical |
| Data migration import UI | app/api | Admins import setup/master files before backend migration execution | App migration count/status/query-state helpers, route-level import contracts, attendance import mutation payload/template/status coverage, import progress timing helpers, API DM quality gate | Critical |
| Attendance obligations | app/api | Live attendance truth | App metrics payloads, API helper/schema tests | Critical |
| Clock ledger corrections | app/api | Payroll and audit impact | App attendance client tests, API schema contracts | Critical |
| Timesheet submission/approval | app/api | Payroll-ready totals and manager approval | Timesheetline tests | Critical |
| Payroll generation/history | app/api | Paid history must be immutable | EmployeePayroll app/API snapshot tests | Critical |
| Recruitment/applicants | app/api | Public data and privacy | Sparse | High |
| Documents/uploads | app/api | File validation and retention | App service FormData and document-key encoding tests; backend validation remains API-owned | High |
| Billing/SOA | app/api | Payment-adjacent financial records | Sparse | High |
| Migration/backfill/repair scripts | api | Irreversible data mutation risk | API migration safety, Mongo/Postgres, backfill source-truth, import service, legacy dry-run, seed/QA safety, and DM quality tests; app tests cover import UI intent only | High |

## Architectural Blockers

- App CI previously did not run app tests; fixed in this pass by adding `npm run test:ci`.
- App behavior changes previously relied on PR checklist discipline; `npm run test:obligations` now blocks changed app behavior and quality-script source without same-feature test evidence and is nested inside `quality:ci`.
- API CI previously ran broad `npm test` as non-blocking; fixed in this pass by adding blocking `npm run test:ci:source-truth`.
- App component testing lacks React Testing Library and a standard render helper.
- API broad `npm test` has legacy ts-node/ESM/type debt, so a focused `tsx` source-truth gate is the safe current baseline.
- Destructive DB tests need an approved isolated database before they can run.
- Role/permission matrix remains inferred, limiting authorization test hardening.
- The latest known app `test:ci` blocker was Hikvision service response typing; that local blocker has been resolved and `npm run test:ci` now passes locally.
- Full app `npm run typecheck`, route audits, unreachable-route audits, and lint are red and cannot become mandatory gates until their backlog is burned down.
- ESLint v9 flat config now exists, but the latest read-only lint run reported 914 errors and 3354 warnings across existing source/legacy files.
- Tracked generated `build/client` output and local scratch artifacts were removed from the repository; `app/lib/repository-hygiene.test.ts` guards against reintroducing the largest stale artifacts.

## Testing Pyramid

| Layer | Owner | Command | CI Timing | Purpose |
|---|---|---|---|---|
| Unit | App/API | `npm run test:unit`, targeted API helper specs | Every PR | Pure functions and small helpers |
| Component | App | `npm run test:component` | Every PR once suite is stable | Atomic design components, a11y states, form rendering |
| App integration | App | `npm run test:integration` | Every PR | Client services, hooks, React Query, request construction |
| API contract | API | `npm run test:api:source-truth` | Every PR | HTTP/controller payload shape and failure behavior |
| DB/schema invariant | API | `npm run test:db:source-truth` | Every PR | Prisma source contracts and DB fault-test guardrails |
| Isolated DB integration | API | Future `test:db:integration` | PR or nightly depending runtime | Seeded database behavior with cleanup |
| Browser E2E | App | `npm run test:e2e` | Nightly, release, selected PRs | Real HRIS journeys |
| Smoke | App/API | Future `test:smoke` | Deploy preflight | Health, auth, dashboard, core read paths |
| Load/stress/spike | API | `npm run test:load` with approved target | Scheduled and release | Throughput and thresholds |
| Soak | API | `npm run test:soak` with approved target | Scheduled | Stability, memory, slow query detection |
| Failure injection | API | Future isolated DB/fault commands | Scheduled or gated manual | Connection drops, duplicate records, partial writes |

## Priority Roadmap

### Phase 0: Fast Gates

- Block app PRs/deploys on `npm run quality:ci`; `npm run test:ci` remains nested inside this gate.
- Keep `npm run test:obligations` nested inside `quality:ci` so app behavior and quality-script changes must include same-feature test evidence when tests are necessary.
- Block API PRs on `npm run test:ci:source-truth`.
- Keep existing full typecheck and broad legacy tests visible but non-blocking until debt is remediated.
- Replace stale PR template with HRIS/TDD evidence checklist.

### Phase 1: Foundational Test Utilities

- App: add React Testing Library, `renderWithProviders`, React Query test client, router/auth mocks, file upload helpers.
- API: add shared Supertest app builder, auth principal builders, Prisma mock builders, request factories.
- Cross-repo: create canonical fixture names for employee, manager, HR, admin, payroll period, attendance day, timesheet line, and paid payroll snapshot.

### Phase 2: Critical Behavior Expansion

- App: attendance, timesheet, payroll, employee import, file upload, onboarding, recruitment, billing display, and error states.
- API: auth, authorization middleware, controllers, Zod validation, malformed requests, error responses, audit logging, payroll snapshot lock, timesheet approval.
- Regression rule: every bug gets a failing test that passes after the fix.

### Phase 3: Isolated DB Reliability

- Provision disposable Postgres/Mongo test profiles.
- Add transaction-safe cleanup using per-run schema/database names.
- Seed bad data for duplicate attendance ledger rows, orphan employee links, draft payroll lines, missing paid snapshots, stale mutable paid-history reads, and manager approval orphans.
- Assert graceful API errors, structured logs, and no partial writes.

### Phase 4: E2E And Release Confidence

- Seed deterministic app/API data for auth, employee onboarding, attendance clocking, timesheet correction, manager approval, payroll read, recruitment, document upload, and billing/SOA read flows.
- Run smoke on every deploy candidate.
- Run full E2E nightly and before release.

### Phase 5: Performance And Reliability

- Define p95, p99, error-rate, memory, and slow-query thresholds.
- Add local dry-run reports, scheduled non-prod reports, and release artifacts.
- Add stress, spike, and soak profiles with explicit failure criteria.

## Coverage Strategy

Initial enforceable thresholds should be modest and rise only after the suite is stable:

- Critical source-truth helpers and contracts: 90 percent statement/branch intent.
- App client/services/routes/components touched by a PR: direct behavioral tests required when the changed source is behavior-bearing; docs, generated output, assets, and config-only changes are exempt.
- API controllers touched by a PR: happy path, validation error, auth error, not found, dependency failure.
- New/modified functions in API: at least five meaningful test cases unless explicitly waived by the owner.
- Overall repo thresholds should start as reporting-only, then become ratcheting gates after baseline collection.

## Recommended Folder Structure

App:

```txt
app/**/*.test.ts(x)              unit, service, component tests near code
app/test/                        shared render/mocking utilities
tests/e2e/                       stable browser journeys
tests/smoke/                     deploy smoke specs
tests/perf/                      frontend performance specs
```

API:

```txt
tests/unit/                      pure helpers and services
tests/contracts/                 Supertest API contracts
tests/db/                        schema, isolated DB, bad-data invariants
tests/fixtures/                  builders and reusable fixture data
tests/load/                      load, stress, spike, soak harnesses
tests/support/                   mocks, auth principals, DB guards
```

## Backlog

1. Add React Testing Library and `renderWithProviders` to the app.
2. Add app component tests for file uploads, status badges, attendance cards, and payroll history display.
3. Add app hook tests for auth, requests, employees, and React Query flows.
4. Add API Supertest contracts for auth login/me, employee CRUD, attendance corrections, timesheet submit/approve, payroll period generation, employee payroll read/update, recruitment/applicant endpoints.
5. Add isolated DB setup/teardown with the existing fault-test guard.
6. Add seeded DB fault tests for duplicate ledger rows, orphan links, draft payroll lines, missing paid snapshots, slow query timeout, and partial-write rollback.
7. Add deterministic E2E seed harness and HRIS user personas.
8. Make route audits and full typecheck blocking after fixing existing debt.
9. Add coverage reporting and ratcheting thresholds.
10. Add scheduled load/soak reports against an approved non-production environment.
