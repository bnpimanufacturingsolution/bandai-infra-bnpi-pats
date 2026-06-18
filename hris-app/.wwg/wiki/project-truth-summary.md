# Project Truth Summary

Status: INFERRED_FROM_EXISTING_PROJECT
Last reviewed: 2026-05-28

## Accepted With Evidence

- Product category: HRIS / workforce management application.
- Delivery surface: TypeScript React Router web app.
- Paired backend API repository: `../hris-api`.
- Major domains: employee records, attendance, timesheets, leave, requests, approvals, recruitment, onboarding, payroll, reports, admin configuration, messages/notifications, and Firebase hosting deployment.
- High-risk areas: auth, authorization, employee data, attendance/timesheets, payroll/billing, credentials, deployment, deletion, migrations, and public applicant/onboarding data.
- Current app quality gate: `.github/workflows/app-ci.yml` blocks PR/push verification for `develop` and `uat` on `npm run quality:ci`, which runs app test-obligation enforcement, focused app CI tests, and a production build.
- Firebase preview and branch deploy workflows run or depend on `npm run quality:ci` before publishing; manual image deploys run `npm run quality:ci` before building/pushing the image.
- Firebase PR preview deploy uploads the `build/client` artifact from the passing quality gate, downloads it in the deploy job, and verifies `build/client/index.html` before invoking Firebase.
- Firebase PR preview deploy resolves the concrete Hosting site from `.firebaserc` and uses a workspace-root, runner-scoped single-site preview config before `hosting:channel:deploy` so `public: build/client` resolves relative to the repository workspace.
- App behavior and quality-script source changes are now checked by `npm run test:obligations`; evidence must match the changed source feature, while docs, generated output, assets, and config-only changes remain intentionally exempt.
- Tracked generated `build/client` output and stale local route-refactor/screenshot/scratch artifacts have been removed from the app repository; `.gitignore` now covers the local scratch patterns.
- Root Vite timestamp cache modules, the local letter-spacing HTML scratch page, legacy root markdown notes, and the duplicate-routes generated report are not canonical app source; legacy root docs now live under `docs/archive/legacy-root-docs/`.
- Admin configuration list behavior now has app-side helper coverage for DataTable search fields, filters, sort ordering, pagination display ranges, and server-side count fallback.
- Admin configuration Departments now has deterministic mocked Playwright smoke coverage for auth-gated rendering, server-side search query accuracy, status filter query accuracy, and result counts; `npm run quality:ci` includes `npm run test:e2e:smoke`.
- Playwright configuration must remain declarative test configuration only; the previous remote-fetch-and-`eval` block in `playwright.config.ts` was removed and is not canonical app behavior.
- App migration/import UI quality now has helper and route-level evidence through `npm run test:migration:ui-quality`, including admin migration route wiring and attendance import template/status/source-truth contracts; this app-side evidence is linked into the API DM masterlist/map while backend migration correctness remains API-owned.

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
- `.wwg/wiki/06-domain/workflows.md`
- `.wwg/wiki/06-domain/rules.md`
- `.wwg/wiki/07-ux/screens.md`
- `.wwg/wiki/07-ux/user-journeys.md`
- `.wwg/wiki/11-synthesis/context-completeness-review.md`
- `.wwg/wiki/11-synthesis/open-questions.md`
