# Project Truth Summary

Status: INFERRED_FROM_EXISTING_PROJECT
Last reviewed: 2026-07-17

## Accepted With Evidence

- Product category: HRIS / workforce management application.
- Delivery surface: TypeScript React Router web app.
- Paired backend API repository: `../hris-api`.
- Major domains: employee records, attendance, timesheets, leave, requests, approvals, recruitment, onboarding, payroll, reports, admin configuration, messages/notifications, and Firebase hosting deployment.
- High-risk areas: auth, authorization, employee data, attendance/timesheets, payroll/billing, credentials, deployment, deletion, migrations, and public applicant/onboarding data.
- Current app quality gate: `.github/workflows/firebase-hosting-develop.yml` blocks pull requests and pushes targeting `develop` and `uat` through `test_obligations`, `tests`, `e2e_smoke`, and `build`, which execute `npm run test:obligations`, `npm run test:ci`, `npm run test:e2e:smoke`, and `npm run build`.
- Firebase preview and branch deploy jobs in `.github/workflows/firebase-hosting-develop.yml` run or depend on the passing quality gate before publishing.
- Firebase PR preview deploy uploads the `build/client` artifact from the passing quality gate, downloads it in the deploy job, and verifies `build/client/index.html` before invoking Firebase.
- Firebase PR preview deploy resolves the concrete Hosting site from `.firebaserc` and uses a workspace-root, runner-scoped single-site preview config before `hosting:channel:deploy` so `public: build/client` resolves relative to the repository workspace.
- App behavior and quality-script source changes are now checked by `npm run test:obligations`; evidence must match the changed source feature, while docs, generated output, assets, and config-only changes remain intentionally exempt.
- Tracked generated `build/client` output and stale local route-refactor/screenshot/scratch artifacts have been removed from the app repository; `.gitignore` now covers the local scratch patterns.
- Root Vite timestamp cache modules, the local letter-spacing HTML scratch page, legacy root markdown notes, and the duplicate-routes generated report are not canonical app source; legacy root docs now live under `docs/archive/legacy-root-docs/`.
- Admin configuration list behavior now has app-side helper coverage for DataTable search fields, filters, sort ordering, pagination display ranges, and server-side count fallback.
- Admin configuration Departments now has deterministic mocked Playwright smoke coverage for auth-gated rendering, server-side search query accuracy, status filter query accuracy, and result counts; `npm run quality:ci` includes `npm run test:e2e:smoke`.
- Playwright configuration must remain declarative test configuration only; the previous remote-fetch-and-`eval` block in `playwright.config.ts` was removed and is not canonical app behavior.
- App migration/import UI quality now has helper and route-level evidence through `npm run test:migration:ui-quality`, including admin migration route wiring and attendance import template/status/source-truth contracts; this app-side evidence is linked into the API DM masterlist/map while backend migration correctness remains API-owned.
- App-side Phase 1 design-token foundation now lives in `app/styles/tokens.css` and the Tailwind bridge in `app/app.css`; new UI work should use the `brand-*` token surface while untouched legacy styling remains accepted debt until intentionally aligned.
- Approved overtime UI now follows the governed backend source-of-truth path: approver reasons are rendered from effective timesheet day data, and approved timesheets can surface backend-computed compensatory leave credit summaries from `Timesheet.metadata.compensatoryLeaveCredit`.
- HR benefits management supports schedule modes Time-bound, Fixed installments, and Recurring (per-payment amount, optional end date, open-ended when no end; Recurring shows recurrence EVERY_CUTOFF / MONTHLY / YEARLY). Create payroll adjustment is a full page (`/hr/benefits-management/new`) with multi-employee card picker (deep-linked via `?action=select-employees`, Select all for filtered employees) and bulk create API; edit remains modal with single-employee picker. Installment generation and payroll apply remain API-owned (`../hris-api/docs/BENEFIT_SCHEDULE_MODES.md`).
- Perfect Attendance: report tab (metrics) ≠ payroll money. Payroll uses benefit code **PFA** → `perfectAttendance` under attendance benefits/adjustments. Do not auto-award from report. API seed may still name type Performance Bonus (**CONFLICTING**); domain SOT `../hris-api/.wwg/wiki/project-truth.md`. PFA + attendance-based on: form shows warn-only banner (ABSENT pro-rate, not all-or-nothing); attendance off = fixed enrolled amount.
- HR Reports sidebar includes **Attendance Reports** → `/hr/reports/attendance` (Perfect Attendance and related attendance metrics tabs).
- Payroll-locked timesheets use **Request payroll correction** (in-modal panel: Time In/Time Out). Applied retro lines appear on payslips and in HR **Payroll summary** (prior-period accordion + daily detail category). Domain SOT is `../hris-api` `PayrollCorrection` next-period apply.
- Dual-app UI parity: timesheets/attendance/payroll/shared surfaces that exist in both `hris-app` and `hris-emp-app` must be updated together (see `AGENTS.md`, monorepo `AGENTS.md`, `.grok/rules/hris-dual-app-ui-parity.md`).

## Needs Confirmation

- Canonical product name.
- Canonical role labels and permission matrix.
- Backend API/data model details inside `../hris-api`, including active persistence mode, schema constraints, migrations, and backend authorization behavior.
- Production payroll, leave, recruitment privacy, and employee retention policies.
- Firebase service-account JSON rotation/removal; tracked Firebase admin SDK JSON filenames were detected without inspecting contents.
- GitHub branch protection and Environment approval settings are external to the repository and still need owner confirmation.
- Package identity reconciliation; README now uses the HRIS working name while final product name remains unconfirmed.

## Current Truth Alignment

Truth alignment is YELLOW.

The codebase clearly represents an HRIS/workforce app, but several important policy and production-readiness details remain inferred. Use the detailed wiki docs for orientation, but do not treat inferred policy, payroll, auth, deployment, or credential behavior as accepted truth without review.

## Key Detailed Context

- `.wwg/wiki/02-project/project-brief.md`
- `.wwg/wiki/03-requirements/functional-requirements.md`
- `.wwg/wiki/05-architecture/system-overview.md`
- `.wwg/wiki/05-architecture/deployment-model.md`
- `.wwg/wiki/05-architecture/security-model.md`
- `.wwg/wiki/06-domain/entities.md`
- `docs/BENEFIT_SCHEDULE_MODES.md`
- `CHANGELOG.md`
- `.wwg/wiki/06-domain/workflows.md`
- `.wwg/wiki/06-domain/rules.md`
- `.wwg/wiki/07-ux/screens.md`
- `.wwg/wiki/07-ux/user-journeys.md`
- `.wwg/wiki/11-synthesis/context-completeness-review.md`
- `.wwg/wiki/11-synthesis/open-questions.md`
