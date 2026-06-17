# Current Task

Status: WWG_CONTEXT_EFFICIENT_CHAIN_MODEL_COMPLETE

## Recruitment Coverage Missing-Section And Level Hydration Follow-Up

- Status: COMPLETE.
- Task mode: bug fix / terminology alignment / app regression testing.
- Delivery mode: AI-agent.
- User request:
  - Fix recruitment coverage under `/admin/rules-policies/recruitment` so missing-section positions do not render as a normal `Unassigned section` accordion.
  - Display missing-section positions in a department-scoped `Positions without section` block while keeping real sections as section accordions.
  - Hydrate admin coverage position levels from the global level catalog so it matches `/hr/recruitment?jobAction=create`.
- App follow-through:
  - Added `useLevels({ limit: 1000 })` to the workforce recruitment settings module and passed the level catalog into coverage row construction.
  - Updated the admin positions request fields to include `levels.id`, `levels.levelId`, `levels.level.id`, `levels.level.name`, and `levels.level.rank`.
  - Hydrated linked position levels by business level id, using `levelId` for junction rows unless `entry.level.id` is present.
  - Kept the position catalog authoritative for department/section placement and grouped rows with no valid section into `Positions without section`.
  - Preserved legacy missing-section policies by matching `positionId + levelId` when exact section scope is absent.
  - Updated terminology docs to record `Positions without section` as the missing-section display bucket.
- Validation:
  - Passed: `npm run test -- app/lib/workforce-recruitment-coverage.test.ts app/components/organisms/settings/WorkforceRecruitmentSettingsModule.test.tsx` (2 files / 8 tests).
  - Passed: `npm run typecheck:test`.
- Safety boundary:
  - No backend/API schema change, production/shared data mutation, migration, deployment, credential change, or destructive action was executed.
- Recommendations:
  - No new recommendations were identified.

## Task Summary

- Task mode: mixed / high-risk quality infrastructure planning and implementation.
- Delivery mode: AI-agent.
- Existing Project Adoption: active; this task must reconcile code/docs/config discoveries into WWG truth, workspace context, governance, and reports before close-out.
- User request:
  - Create and begin implementing a senior-level testing program for app and API coverage.
  - Include load testing, soak testing, regression testing, and DB-bug detection.
  - Clean backend-owned test artifacts out of the app repo and continue API-side implementation in `../hris-api`.
  - Audit the existing test maturity and move the project toward a TDD-driven, reliability-focused workflow.

## TDD Enforcement Audit Follow-Up

- Status: COMPLETE.
- Task mode: mixed / governance, quality infrastructure, and regression testing.
- Delivery mode: AI-agent.
- User request:
  - Audit whether the project is truly test-driven.
  - WWG should enforce TDD so every meaningful change carries relevant test suites.
  - Add necessary test suites and enforcement.
- App audit findings:
  - The repository already had a meaningful test program, but the deployable app gate was red.
  - `npm run quality:ci` failed on repository hygiene because `.gitignore` did not include `routes.backup/` and `test-letter-spacing.html`.
  - `npm run quality:ci` also failed because agency import behavior had been added to the admin migration route without updating the route contract test.
  - `scripts/check-test-obligations.mjs` enforced same broad app area, but unrelated same-domain tests and unrelated browser specs could satisfy the check.
  - Current breadth remains limited relative to app size: app source is about 933 TS/TSX files, routes about 226 files, components about 395 files, hooks 73 files, while app/scripts/browser test/spec files are about 39 and hook tests remain at 0.
- App follow-through so far:
  - Restored `.gitignore` hygiene entries without weakening the hygiene test.
  - Added agency import action coverage to the shared admin migration UI helper test and route contract test.
  - Added `scripts/check-test-obligations.test.ts`.
  - Updated `test:obligations` so behavior-bearing repository scripts require direct tests.
  - Updated `test:obligations` so evidence must match the same source feature, not just the same broad domain.
  - Added regression coverage proving unrelated same-domain tests and unrelated browser specs do not satisfy the TDD obligation.
  - Updated WWG governance and testing docs to record the same-feature TDD evidence rule.
- Safety boundary:
  - No production/shared data mutation, deployment, credential rotation, secret write, migration, destructive business-data action, or external GitHub setting change is in scope.
- Validation so far:
  - Failed before repair: `npm run quality:ci` on repository hygiene and admin migration agency import route-contract drift.
  - Passed after repair: `npm run test:obligations`.
  - Passed after repair: `npm run test -- scripts/check-test-obligations.test.ts app/lib/test-obligation-policy.test.ts app/lib/admin-migration-ui.test.ts app/routes/admin/configuration/migration.import-route.test.ts app/lib/repository-hygiene.test.ts` (5 files / 35 tests).
  - Passed after repair: `npm run test:ci` (32 files / 239 tests).
  - Passed after repair: `npm run quality:ci` (test obligations, focused test typecheck, 32 Vitest files / 239 tests, 1 Playwright smoke test, and production build with existing sourcemap/chunk/unused-import warnings).
  - Failed first on known generated `context-skill-quality` truth-sync self-check, then passed with warnings after generated report sync block repair: `npx @homedesk/wwg validate` (known low runtime-skill candidate warnings remain; no high/critical findings).
- Report artifact:
  - `output/reports/tdd-enforcement-audit-2026-06-02.md`.

## App Scope

This React app repository owns:

- frontend/client unit tests
- app service payload and query construction tests
- app-side regression tests
- route/navigation hygiene tests
- browser E2E tests
- app testing docs and coverage mapping

This repository does not own:

- backend API contract/integration tests
- backend authorization tests
- Prisma schema/model constraint tests
- DB invariant/fault-injection tests
- API load tests
- API soak tests

Those backend-owned layers belong in `../hris-api` or an explicitly approved API harness.

## Cleanup Completed

- Removed app-side `tests/api/` API contract harness.
- Removed app-side `tests/load/` load/soak harness.
- Removed app-side synthetic DB invariant fixture files under `tests/regression/` and `tests/helpers/`.
- Removed app scripts `test:api`, `test:load`, and `test:soak`.
- Updated app docs and WWG report to preserve the app/API ownership split.

## Cross-Repo Context Correction

- Status: COMPLETE_FOR_CONTEXT_REPAIR
- User identified that API implementation exists outside this app repo in sibling `../hris-api`.
- App WWG context now records the paired backend API repository and the app/API test ownership split.
- API WWG context has been reconciled so stale Web3/eCommerce API truth does not misroute future work.
- App-side tests remain valid for frontend/client behavior, but backend authorization, persistence, DB invariants, integration/load/soak tests must be implemented in `../hris-api` or an approved API harness.

## Safety Boundary

- Do not mutate production, UAT, shared dev, or real employee data.
- Do not corrupt any real DB.
- Do not perform migrations, deletion, deployment, credential changes, or irreversible operations.
- Load/soak scripts must default to local/read-only behavior and require explicit approval for shared environments.

## Required Source-Of-Truth Context

- `AttendanceObligation` is live/current/future operational attendance truth.
- `Attendance` is biometric/raw/effective clock ledger truth.
- Past submitted/approved/payroll-ready totals and approved OT tally come from effective `Timesheetline` rows.
- Paid payroll history reads `EmployeePayroll.timesheetSnapshot`.
- Frontend hiding is not authorization; API enforcement must be tested in the API repository or an API harness.

## Validation Plan

- Passed after cleanup: `npm run test:ci` (focused test typecheck plus 13 app test files, 135 passing tests).
- Passed after TDD foundation pass: `npm run test:ci` (focused test typecheck plus 15 app test files, 146 passing tests).
- Passed in API after TDD foundation pass: `npm run test:ci:source-truth` (45 passing tests).
- Passed after app migration/import quality pass: `npm run test -- app/lib/admin-migration-ui.test.ts app/lib/import-progress-ui.test.ts app/lib/attendance-import-ui.test.ts` (3 test files, 27 passing tests).
- Passed after app migration/import evidence pass: `npm run test:migration:ui-quality` (27 passing tests; command elapsed `00:00:01.290`; terminal shows scope/file/test breakdowns).
- Passed after app migration/import quality pass: `npm run test:ci` (focused test typecheck plus 18 app test files, 173 passing tests).
- Failed existing explicit route audits: `npm run test:routes` and `npm run test:unreachable`.
- Failed existing typecheck: `npm run typecheck`; filtered rerun showed no remaining errors in touched migration/import files.
- Failed existing WWG validation: `npx @homedesk/wwg validate` reports one high finding in generated `reports/context-skill-quality.md` truth-sync fields plus existing low runtime-skill candidate warnings.
- API contract, load, soak, and DB fault-injection tests are no longer app-owned after cleanup.

## API Follow-Through

- Continued API-side test implementation in `../hris-api`.
- Added schema/model contract coverage and isolated DB fault-test guardrails before any intentional bad-data tests.
- API validation passed: `npm run test:ci:source-truth` (45 tests).

## TDD Foundation Pass

- Added cross-repo testing maturity audit: `docs/testing-maturity-audit.md`.
- Added app component command: `npm run test:component`.
- Added app component test coverage for `ProfileInitialsAvatar`.
- Added app attendance service tests for attendance reads, correction payloads, import FormData, structured correction errors, and legacy clock-in payloads.
- Updated app CI so PRs now fail when `npm run test:ci` fails.
- Replaced stale insurance-oriented PR template with HRIS/TDD evidence checklist.
- Updated API CI so PRs now fail when `npm run test:ci:source-truth` fails.
- Added API backend testing maturity audit in `../hris-api/docs/testing-maturity-audit.md`.

## App Migration Import Quality Pass

- Added app-side regression helpers and tests for admin migration/import count resolution, status/count badge display, and import modal URL state.
- Added import progress timing helpers and tests for started/completed/elapsed display calculations and compact import error rows.
- Fixed the admin attendance import mutation payload shape and added regression coverage for the wrapper.
- Wired the admin migration route and inline import progress component through the tested helpers.
- Added `npm run test:migration:ui-quality` so app import/migration UI tests print evidence mapping and elapsed-time breakdowns in the terminal and write `output/reports/app-import-ui-quality-breakdown.*`.
- Updated app test governance so migration/import/backfill-facing UI changes require app-side test evidence.
- Updated Project Truth and app testing docs to record the app/API split for migration/import quality coverage.

## Data Migration Testing Gap Prompt Chain

- Status: COMPLETE.
- User requested a chain-prompting execution plan to fill audited data migration testing gaps.
- Used local prompt-chain scratch artifacts for execution, then ignored/removed them from the shippable workspace to avoid prompt buildup.
- Passes 2 through 6 completed API migration safety, Mongo/Postgres, backfill/source-truth, import service, legacy dry-run, and seed/QA safety coverage in `../hris-api`.
- Pass 7 completed app route-level migration/import UI coverage and quality gate reconciliation.

## Latest Data Migration Chain Validation

- API passed: `npm run test:migration:quality` (68 passing tests).
- API passed: `npm run test:ci:source-truth` (24 API source-truth tests, 24 DB source-truth tests, and 68 migration quality tests).
- App passed: `npm run test:migration:ui-quality` (35 passing tests).
- App passed: `npm run test:ci` (20 test files, 181 passing tests).
- App passed with warnings: `npx @homedesk/wwg validate` after regenerating the known self-check-sensitive `context-skill-quality` report from a clean slate.
- Ship cleanup added gitignore coverage for task-specific prompt-chain scratch directories and the raw app Vitest JSON runner artifact.
- No production/shared database, migration, backfill, repair, seed, delete, deployment, credential, live load, or live soak command was executed.

## Latest DM Evidence Specificity Follow-Up

- Status: COMPLETE.
- User feedback:
  - The DM masterlist mapping was too vague because it showed quality-gate labels without the specifics of what was actually tested.
- API follow-through in `../hris-api`:
  - Added concrete shared, group, and direct evidence mapping to the executable DM masterlist.
  - Updated the DM quality runner so the terminal and retained reports show per-row specific tested evidence.
  - Rows with only shared all-row gates are explicitly labeled as direct row fixture pending instead of being overstated.
  - Updated API migration quality docs and workspace context.
- Validation:
  - API passed: `npm run test:migration:quality` (71 passing tests after app-side evidence was linked into the map).
  - API passed: `npm run test:ci:source-truth` (24 API source-truth tests, 24 DB source-truth tests, and 71 migration quality tests after app-side evidence was linked into the map).
  - API passed with warnings: `npm run wwg:task:end`.
  - App attempted: `npx @homedesk/wwg validate`; failed on the known generated `reports/context-skill-quality.md` truth-sync self-check, not on the DM evidence implementation.

## Latest App-Side DM Evidence Map Follow-Up

- Status: COMPLETE.
- User feedback:
  - The app-side Data Migration coverage should be visible in the masterlist/map, not only in the separate app report.
- API/app follow-through:
  - Added `api` / `app` evidence layering to the API executable DM masterlist.
  - Linked app import UI evidence into the API DM map for admin setup imports, employee import auto-create defaults, attendance import payload/template/status labels, create-timesheets option propagation, import progress behavior, and source-truth labels.
  - Updated app testing docs and Project Truth to state that app evidence is linked into the API DM masterlist/map while backend migration correctness remains API-owned.
- Validation:
  - API passed: `npm run test:migration:quality` (71 passing tests).
  - API passed: `npm run test:ci:source-truth` (24 API source-truth tests, 24 DB source-truth tests, and 71 migration quality tests).
  - App passed: `npm run test:migration:ui-quality` (35 passing tests).
  - App passed with warnings: `npx @homedesk/wwg validate` after regenerating the known self-check-sensitive `context-skill-quality` report from a clean slate.

## WWG Context-Efficient Prompt Chain Addendum

- Status: COMPLETE.
- Task mode: docs/governance / durable agent workflow standard.
- Delivery mode: AI-agent.
- User request:
  - Make prompt chaining the standard for now.
  - Improve WWG efficiency so agents use context slices instead of reading every related doc/report.
  - Dogfood the plan with a compact prompt chain.
- Work completed:
  - Added `.wwg/governance/development-operating-model.md` to define prompt chaining, context routing, scratch artifact, validation, and app/API ownership rules.
  - Added `.wwg/workspace/context/task-context-index.md` to route tasks to minimal Tier 0 and task-specific context slices.
  - Added `.wwg/workspace/context/chain-state-template.md` for compact pass-to-pass state packets.
  - Added `.wwg/workspace/prompts/chain-pass-template.md` for reusable delta-oriented chain prompts.
- Dogfood chain:
  - Pass 1: context router and operating model.
  - Pass 2: compact chain templates.
  - Pass 3: validation and close-out.
- Validation:
  - Passed with warnings: `npx @homedesk/wwg validate`.
  - First validate hit the known generated-report self-check issue for `context-skill-quality`; the report was regenerated from a clean slate and validation then passed with warnings.
- Safety boundary:
  - No production/shared data mutation, deployment, credential, migration, seed, delete, load, or soak action is in scope.

## CI/CD Quality Gate Chain Follow-Up

- Status: COMPLETE.
- Task mode: mixed / high-risk quality infrastructure implementation.
- Delivery mode: AI-agent prompt chain.
- User request:
  - Apply the senior CI/CD review recommendations through a chain prompt instead of stopping at a small Phase 0.
- App follow-through:
  - Added `npm run quality:ci` as the canonical deployable quality gate: app test-obligation enforcement, focused test typecheck, Vitest app suite, and production build.
  - Added `npm run quality:strict` for release-candidate hardening: read-only lint, full app typecheck, route audits, unreachable-route audit, and browser E2E.
  - Made `npm run lint` read-only and moved mutation to `npm run lint:fix`.
  - Added ESLint v9 flat config so lint is no longer blocked by missing configuration.
  - Updated APP CI to cover `develop` and `uat` and block on `npm run quality:ci`.
  - Gated Firebase PR previews and branch deploys on `npm run quality:ci`; branch deploys now publish the build artifact from the passing gate.
  - Gated manual image deploy dispatches on `npm run quality:ci`.
  - Replaced `/tmp` rollback state with per-environment `.deploy-state` files in the deploy path and allowed explicit rollback image input.
  - Aligned Firebase helper scripts with current project IDs, `VITE_API_BASE_URL_*` variables, and standard service-account secret names.
- Safety boundary:
  - No production/shared data mutation, deployment, credential rotation, secret write, or external GitHub setting change was executed.
- Validation:
  - Passed: `npm run test -- app/lib/ci-cd-quality-gates.test.ts` (1 file, 5 tests).
  - Passed: `npm run quality:ci` (test typecheck, 21 Vitest files / 187 tests, and production build before the later TDD/cleanup pass expanded the suite).
  - Passed dry-run: `npm run gh:sync:deploy-config -- --repo=owner/name --dry-run --vite-api-base-url-dev=https://dev.example.invalid --vite-api-base-url-uat=https://uat.example.invalid`.
  - Failed as expected strict-debt evidence: `npm run lint` now loads ESLint v9 flat config but reports 914 errors and 3354 warnings across existing source/legacy files.
  - Passed with warnings after generated-report sync block repair: `npx @homedesk/wwg validate`.
  - Build completed with existing warnings for sourcemap location resolution, large chunks, and unused imports.
- Remaining follow-ups:
  - Confirm GitHub branch protection requires `APP CI / Quality Gate` before merges to deployable branches.
  - Confirm GitHub Environment approval rules for `dev`, `uat`, `staging`, and `production`.
  - Rotate/revoke tracked Firebase admin SDK JSON keys before treating Firebase credentials as safe.
  - Burn down `npm run quality:strict` debt before making strict checks blocking.
  - No new recommendation registry entry was added in this pass.

## App TDD Enforcement And Cleanup Follow-Up

- Status: COMPLETE.
- Task mode: mixed / quality infrastructure, app regression testing, and repository cleanup.
- Delivery mode: AI-agent.
- User request:
  - Fill app test gaps because the suite is too small for the system size.
  - Enforce TDD and require test specs only when necessary.
  - Clean obvious app trash.
- App follow-through:
  - Added `npm run test:obligations` and nested it inside `npm run quality:ci`.
  - Added `scripts/check-test-obligations.mjs`; it fails changed app behavior source without same-area Vitest or browser test evidence while ignoring docs, generated output, assets, and config-only changes.
  - Added tests for the test-obligation policy, CI/CD gate wiring, repository hygiene, central route configuration, auth service client behavior, request workflow client behavior, and employee service import/document behavior.
  - Fixed an employee import-progress regression where API-client 404 errors shaped as `{ status: 404 }` were not treated as expired/missing jobs.
  - Removed tracked generated `build/client` output, stale route backup files, stale route-refactor notes/scripts, local screenshots, Playwright/test result output, and a backup component copy.
  - Added `.gitignore` coverage for local screenshots, `tmp/`, `test-results/`, and route backup scratch folders.
- Safety boundary:
  - No production/shared data mutation, deployment, credential rotation, secret write, migration, destructive business-data action, or external GitHub setting change was executed.
  - Tracked Firebase admin SDK JSON files remain approval-gated for owner rotation/removal and were not changed.
- Validation so far:
  - Passed: `npm run test:obligations`.
  - Passed: `npm run test -- app/lib/test-obligation-policy.test.ts app/lib/ci-cd-quality-gates.test.ts`.
  - Failed before fix as expected: `npm run test -- app/services/auth-service.test.ts app/services/requests.service.test.ts app/services/employees.service.test.ts` on the employee import-progress 404 regression.
  - Passed after fix: `npm run test -- app/services/auth-service.test.ts app/services/requests.service.test.ts app/services/employees.service.test.ts`.
  - Passed: `npm run test -- app/routes.test.ts`.
  - Passed: `npm run test -- app/lib/repository-hygiene.test.ts`.
  - Passed: `npm run test:ci` (27 Vitest files / 213 tests).
  - Passed: `npm run quality:ci` (test-obligation enforcement, 27 Vitest files / 213 tests, and production build with existing sourcemap/chunk/unused-import warnings).
  - Passed with warnings: `npx @homedesk/wwg validate` (known low runtime-skill candidate warnings; no high/critical findings after generated report refresh).

## Firebase PR Preview Target Fix

- Status: COMPLETE.
- Task mode: bug fix / deployment configuration.
- Delivery mode: AI-agent.
- User-reported failure:
  - GitHub Actions PR preview deploy failed with `Hosting site or target hosting:dev not detected in firebase.json` while running `firebase-tools hosting:channel:deploy`.
- App follow-through:
  - Added CI/CD wiring test coverage requiring PR preview deploys to resolve the concrete Firebase Hosting site and use a runner-scoped single-site preview config.
  - Updated the Firebase PR preview workflow to resolve `FIREBASE_TARGET` through `.firebaserc`, preflight that the resolved site is visible, write `.firebase-hosting-preview.json` in the repository workspace, and deploy the preview channel with `--config "$FIREBASE_PREVIEW_CONFIG"` instead of `--only "hosting:$FIREBASE_TARGET"`.
  - Updated deployment truth docs to record the preview deploy target-resolution behavior.
- Safety boundary:
  - No local or external Firebase deploy, production/shared data mutation, credential rotation, secret write, migration, or destructive action was executed.
- Validation:
  - Failed before fix as expected: `npm run test -- app/lib/ci-cd-quality-gates.test.ts` on missing PR preview target-resolution guard.
  - Passed after fix: `npm run test -- app/lib/ci-cd-quality-gates.test.ts`.
  - Passed: `npm run test:obligations`.
  - Passed: YAML parse smoke check for Firebase hosting workflows using the local `yaml` package.
  - Passed: local Node smoke check resolving dev target to `hris-workforce-dev-20260416-app` and generating the single-site preview config shape.
  - Passed with warnings after clean-slate generated-report refresh: `npx @homedesk/wwg validate`.

## Firebase PR Preview Build Artifact Fix

- Status: COMPLETE.
- Task mode: bug fix / deployment configuration.
- Delivery mode: AI-agent.
- User-reported failure:
  - GitHub Actions PR preview deploy reached the resolved site but failed with `Directory 'build/client' for Hosting does not exist`.
- App follow-through:
  - Added CI/CD wiring test coverage requiring Firebase PR previews to upload the `build/client` artifact from the passing quality gate, download it in the deploy job, verify `build/client/index.html`, and deploy only after artifact verification.
  - Split the Firebase PR preview workflow into a `quality_gate` job and a dependent `Deploy Preview` job so the deployed preview artifact is the same build produced by `npm run quality:ci`.
  - Updated deployment truth docs to record the PR preview artifact handoff and verification behavior.
- Safety boundary:
  - No local or external Firebase deploy, production/shared data mutation, credential rotation, secret write, migration, or destructive action was executed.
- Validation:
  - Failed before fix as expected: `npm run test -- app/lib/ci-cd-quality-gates.test.ts` on missing PR preview artifact handoff.
  - Passed after fix: `npm run test -- app/lib/ci-cd-quality-gates.test.ts`.
  - Passed: `npm run test:obligations`.
  - Passed: YAML parse smoke check for Firebase hosting workflows using the local `yaml` package.
  - Passed: `npm run build` and confirmed `build/client/index.html` generation, with existing sourcemap/chunk/unused-import warnings.
  - Passed with warnings after clean-slate generated-report refresh: `npx @homedesk/wwg validate`.

## Firebase PR Preview Config Path Fix

- Status: COMPLETE.
- Task mode: bug fix / deployment configuration.
- Delivery mode: AI-agent.
- User-reported failure:
  - GitHub Actions PR preview deploy downloaded and verified `build/client/index.html`, but Firebase still failed with `Directory 'build/client' for Hosting does not exist`.
- App follow-through:
  - Identified that Firebase resolves `hosting.public` relative to the directory containing the `--config` file; the previous config in `$RUNNER_TEMP` made `build/client` resolve under the runner temp directory instead of the repository workspace.
  - Updated the Firebase PR preview workflow to write `.firebase-hosting-preview.json` in `$GITHUB_WORKSPACE`, verify that the config resolves `build/client` to the repository workspace, and verify `index.html` at that resolved path before deploy.
  - Added `.gitignore` coverage and repository hygiene test coverage for the generated preview config file.
- Safety boundary:
  - No local or external Firebase deploy, production/shared data mutation, credential rotation, secret write, migration, or destructive action was executed.
- Validation:
  - Failed before fix as expected: `npm run test -- app/lib/ci-cd-quality-gates.test.ts` on missing workspace-relative config verification.
  - Passed after fix: `npm run test -- app/lib/ci-cd-quality-gates.test.ts app/lib/repository-hygiene.test.ts`.
  - Passed: YAML parse smoke check for Firebase hosting workflows using the local `yaml` package.
  - Passed: local Node smoke check generating `.firebase-hosting-preview.json` in the repository workspace and confirming `hosting.public` resolves to the real `build/client/index.html`.
  - Passed: `npm run quality:ci` (test-obligation enforcement, focused test typecheck, 27 Vitest files / 213 tests, and production build with existing sourcemap/chunk/unused-import warnings).
  - Passed with warnings after clean-slate generated-report refresh: `npx @homedesk/wwg validate`.

## Admin Config Testing And Root Cleanup Follow-Up

- Status: COMPLETE.
- Task mode: mixed / repository cleanup, documentation organization, and app regression testing.
- Delivery mode: AI-agent prompt-chain style.
- User request:
  - Focus on `hris-app`.
  - Remove obvious app trash such as Vite config timestamp files and unorganized/deprecated markdown.
  - Add meaningful admin configuration tests for search inputs, filters, accuracy, and related behavior.
- App follow-through so far:
  - Removed root Vite timestamp cache modules and the local letter-spacing scratch HTML.
  - Moved stale root-level implementation/refactor markdown and the generated duplicate-routes report to `docs/archive/legacy-root-docs/`.
  - Replaced the stale job-application-form documentation index with an HRIS app documentation index.
  - Added shared DataTable state helpers and tests for admin config list search-field matching, status filter composition, sort ordering, pagination display accuracy, and server-side count fallback.
  - Updated repository hygiene coverage and app testing docs.
- Safety boundary:
  - No production/shared data mutation, deployment, credential rotation, secret write, migration, destructive business-data action, or external GitHub setting change is in scope.
- Validation:
  - Passed: `npm run test -- app/lib/data-table-state.test.ts app/lib/repository-hygiene.test.ts` (2 files / 12 tests).
  - Passed: `npm run typecheck:test`.
  - Ran non-strict audit: `npm run audit:admin-config-ui`; command completed and reported existing static-audit debt on legacy redirect/wrapper/special pages.
  - Passed: `npm run test:ci` (28 files / 222 tests) before the component-area DataTable evidence was added.
  - Passed after component-area evidence: `npm run test -- app/components/atoms/DataTable.test.tsx app/lib/data-table-state.test.ts app/lib/repository-hygiene.test.ts` (3 files / 15 tests).
  - Passed: `npm run test:obligations` (2 behavior files / 3 test evidence files).
  - Passed: `npm run quality:ci` (test obligations, 29 Vitest files / 225 tests, and production build with existing sourcemap/chunk/unused-import warnings).
  - Passed: `npx @homedesk/wwg refresh-context` (6 generated sections updated, registry updated).
  - Failed first, then passed with warnings after clean-slate generated-report refresh: `npx @homedesk/wwg validate` (known low runtime-skill candidate warnings remain; no high/critical findings after refresh).

## Playwright Smoke And Admin Config Coverage Follow-Up

- Status: COMPLETE.
- Task mode: mixed / quality infrastructure, app regression testing, security cleanup, documentation synchronization.
- Delivery mode: AI-agent prompt-chain style.
- User request:
  - Continue in `hris-app`.
  - Treat the app test suite as too small for the system size and add automated Playwright coverage.
  - Branch out and push updates after implementation.
- App follow-through so far:
  - Added React Testing Library, user-event, jest-dom, and jsdom test setup for real component interaction coverage.
  - Added component tests for DataTable search filtering, pagination display, and server-side count/search behavior.
  - Removed a remote-fetch-and-`eval` block from `playwright.config.ts`.
  - Added `playwright.smoke.config.ts` for deterministic local browser smoke tests with mocked API responses.
  - Added `tests/smoke/admin-config-departments.spec.ts` covering auth-gated Departments rendering, server-side search query accuracy, status filter query accuracy, visible rows, and result counts.
  - Added `npm run test:e2e:smoke` and included it in `npm run quality:ci`.
- Safety boundary:
  - No production/shared data mutation, deployment, credential rotation, secret write, migration, destructive business-data action, or external GitHub setting change is in scope.
- Validation so far:
  - Passed: `npm run test -- app/components/atoms/DataTable.test.tsx app/lib/data-table-state.test.ts app/lib/repository-hygiene.test.ts` (3 files / 15 tests).
  - Passed: `npm run typecheck:test`.
  - Failed first, then passed after selector and stale-server hardening: `npm run test:e2e:smoke` (1 Playwright smoke test).
  - Failed first, then passed after CI/CD gate contract update: `npm run quality:ci` (test-obligation enforcement, 29 Vitest files / 225 tests, 1 Playwright smoke test, and production build with existing sourcemap/chunk/unused-import warnings).
  - Passed: `npx @homedesk/wwg refresh-context` (registry updated; no generated sections changed).
  - Failed first on the known generated `context-skill-quality` truth-sync self-check, then passed with warnings after clean-slate report refresh: `npx @homedesk/wwg validate` (known low runtime-skill candidate warnings remain; no high/critical findings).

## Branch Check Repair Follow-Up

- Status: COMPLETE.
- Task mode: bug fix / regression repair / quality infrastructure.
- Delivery mode: AI-agent.
- User request:
  - Fix the failed checks on `feat/testing-infra-admin-coverage`.
- App follow-through:
  - Reproduced the failed local deployable quality gate through `npm run quality:ci`.
  - Identified the duplicated GitHub check failures as two workflows running the same `quality:ci` gate.
  - Fixed the admin Departments Playwright smoke test by asserting exact department-name table cells instead of partial table text, removing the `Operations` versus `People operations` strict-locator ambiguity.
  - Hardened the same smoke test for cold dev-server route hydration by allowing the initial Departments search input readiness check to wait longer in CI.
  - Reproduced the remaining CI-only installer failure with npm 10 and refreshed `package-lock.json` so `npm ci` accepts the lockfile under the GitHub Node 20 runner.
  - Added Playwright browser installation steps to every workflow that runs `npm run quality:ci`, with regression coverage for the workflow wiring.
- Validation:
  - Failed before fix as expected: `npm run quality:ci` on `tests/smoke/admin-config-departments.spec.ts` because `table.getByText("Operations")` matched both `People operations` and `Operations`.
  - Failed before lockfile fix as expected: `npx -p npm@10 npm ci --dry-run --no-audit --no-fund` with missing `gcp-metadata@7.0.1` and `yaml@2.9.0` lockfile entries.
  - Passed after lockfile fix: `npx -p npm@10 npm ci --dry-run --no-audit --no-fund`.
  - Failed in GitHub after lockfile fix on missing Playwright Chromium browser installation before the browser smoke test.
  - Passed after fix: `npm run test:e2e:smoke`.
  - Passed after fix: `npm run quality:ci` (test obligations, focused test typecheck, 29 Vitest files / 225 tests, 1 Playwright smoke test, and production build with existing sourcemap/chunk/unused-import warnings).
- Truth/context update:
  - Workspace context updated for the branch check repair.
  - No Project Truth, terminology, governance, or principle update was needed because the product behavior and durable operating rules did not change.
- Safety boundary:
  - No production/shared data mutation, deployment, credential rotation, secret write, migration, or destructive business-data action was executed.
- Recommendations:
  - No new recommendations were identified.

## Test Suite Confidence Audit Follow-Up

- Status: COMPLETE_FOR_REPORTING.
- Task mode: docs/reporting audit with high-risk quality and release-readiness implications.
- Delivery mode: AI-agent prompt chain.
- User request:
  - Determine whether the current test suite provides genuine confidence in the application and API.
  - Do not assume passing tests mean the system is adequately tested.
  - Audit, document, report, branch, commit, and push without fixing, modifying product behavior, or suppressing findings.
- App audit findings:
  - `npm run quality:ci` failed on `app/lib/repository-hygiene.test.ts`; the failing assertion expects `.gitignore` to contain `routes.backup/`.
  - Separate app sub-runs passed: `npm run test:e2e:smoke`, `npm run test:migration:ui-quality`, and `npm run build`.
  - App hardening checks failed or produced no-test-found signals: `npm run lint`, `npm run typecheck`, `npm run test:routes`, `npm run test:unreachable`, and `npm run test:e2e`.
  - App coverage is useful but narrow: about 900 app TS/TSX source files, 219 route files, 376 component files, and 73 hook files versus 36 total test/spec files, 2 route test files, 2 component test files, and 0 hook test files.
- API audit findings from sibling `../hris-api`:
  - `npm run test:ci:source-truth` failed because `npm run test:migration:quality` failed one DM3 provenance test; API source-truth and DB source-truth sub-suites passed.
  - API load/soak dry-run commands passed but did not execute traffic.
  - API `npm run lint`, `npm run typecheck`, `npm test`, and `npm run test:function-coverage` failed; `npm run build` passed with warnings.
- Report artifact:
  - `output/reports/test-suite-confidence-audit-2026-06-01.md`.
- Safety boundary:
  - No production/shared database, migration execute, backfill, repair, seed write, deletion, deployment, credential change, live load, or live soak command was executed.
  - No product code or test code was fixed or suppressed.
- Recommendations:
  - New recommendation added: `REC-0007` in `.wwg/governance/recommendation-registry.md`.

## Recruitment Bug Fix And Coverage Follow-Up

- Status: COMPLETE.
- Task mode: mixed / bug fix, regression repair, app regression coverage, deferred UX documentation.
- Delivery mode: AI-agent.
- User request:
  - Execute the current recruitment bug fixes now.
  - Add app regression coverage and Playwright coverage now.
  - Document the recruitment UI/UX review and keep it in the current-task pipeline for a later dedicated UX pass.
- App follow-through:
  - Fixed the job requisition modal so request payload metadata fields (`jobType`, `jobLocation`, `jobTags`, `jobDescription`) are visible and editable in the UI instead of being hidden state only.
  - Aligned the requisition modal with recruitment policy behavior so `WARN` allows submit with warning copy while `BLOCK` prevents over-capacity submission.
  - Reset the requisition modal state on close so reopened requests do not keep stale values.
  - Fixed the public jobs list so opening a job detail modal preserves existing URL search params while adding/removing the modal `id`.
  - Updated the job detail modal apply action to close modal state before navigating to `/jobs/:jobId/apply`.
  - Added Vitest regression coverage for requisition modal WARN/BLOCK behavior, requisition modal reset behavior, public jobs query-param preservation, job-detail apply navigation, and the SummaryCard icon-prop typing fix needed to restore the full app gate.
  - Added deterministic Playwright smoke coverage for `/jobs` modal deep-linking and the public apply entry path.
  - Added deterministic Playwright smoke coverage for the HR recruitment jobs manager so auth-gated recruitment search/filter behavior is now verified against both URL state and the `/api/job` query contract.
- Deferred UX/context follow-through:
  - Added the senior recruitment UX review and deferred backlog in `docs/recruitment-ux-review.md`.
  - Preserved the deferred UX work here so a later IDE pass can continue from documented journey judgment and acceptance direction instead of re-discovery.
- Validation:
  - Passed: `npm run test -- app/components/modals/JobRequisitionRequestModal.test.tsx app/components/organisms/job-lists.test.tsx app/components/organisms/job-details-modal.test.tsx`.
  - Passed: `npm run test:e2e:smoke -- tests/smoke/public-jobs-flow.spec.ts`.
  - Passed: `npm run quality:ci` (test obligations, test typecheck, 36 Vitest files / 245 tests, 3 Playwright smoke tests, and production build with existing sourcemap/chunk/future-flag warnings).
  - Failed on existing unrelated WWG maintenance debt: `npx @homedesk/wwg validate` reports runtime-skill candidate schema/status findings in generated `.wwg/reports/runtime-skill-candidates.json`; no recruitment-specific WWG truth/drift finding was introduced by this pass.
- Truth/context update:
  - Updated `docs/testing-coverage-matrix.md` and `docs/testing-strategy.md` for the new recruitment app-side evidence.
  - No Project Truth, terminology, or principle update was required because this pass repaired existing implemented behavior and documented a deferred UX backlog without changing durable product identity or doctrine.
- Recommendations:
  - No new recommendation registry entry was added in this pass.

### Recruitment HR Jobs Manager Smoke Extension

- Status: COMPLETE.
- Task mode: regression coverage expansion.
- Delivery mode: AI-agent.
- User request:
  - Add the same level of smoke coverage to the HR recruitment board.
  - Branch, commit, and push the task like a senior developer would.
- App follow-through:
  - Added `tests/smoke/hr-recruitment-jobs-manager.spec.ts`.
  - The smoke loads `/hr/recruitment` as an HR manager, opens `Manage Jobs`, verifies the jobs table renders inside the recruitment workspace, and asserts that search/filter actions propagate to both URL state (`jobSearch`, `jobStatus`) and server query params (`query`, `filter=isDeleted:true`).
  - Tightened the Playwright API interception pattern so the smoke only mocks root `/api/*` requests and does not accidentally intercept Vite route-module imports under `/app/lib/api/*`.
- Truth/context update:
  - Updated `docs/testing-coverage-matrix.md` and `docs/testing-strategy.md` to record HR recruitment jobs-manager smoke coverage and to remove the board from immediate uncovered smoke targets.
- Validation:
  - Passed: `npm run test:e2e:smoke -- tests/smoke/hr-recruitment-jobs-manager.spec.ts`.
  - Passed: `npm run quality:ci` (36 Vitest files / 245 tests, 3 Playwright smoke tests, and production build with existing sourcemap/chunk/future-flag warnings).
- Recommendations:
  - No new recommendation registry entry was added in this extension.

## Close-Out Requirements

- Changed files and validation results must be reported in the agent close-out.
- Remaining API-server gaps must be reported as follow-up in `../hris-api` or an approved API harness.
- New recommendations were added in `.wwg/reports/testing-program-implementation.md`.
- No new recommendation registry entry was added during the data migration gap chain execution.

## Branch Check Repair Revalidation

- Status: COMPLETE.
- Task mode: bug fix / regression repair / CI reliability.
- Delivery mode: AI-agent.
- User request:
  - Check why the branch mostly skipped CI checks and fix any issues.
  - Merge only after the branch is updated and the gate is clean.
- Follow-through:
  - Fixed the missing calendar cell clock evidence by rendering `timeInLabel` and `timeOutLabel` inside [`TimesheetDayCell`](../../app/components/atoms/TimesheetDayCell.tsx).
  - Tightened [`JobDetailsModal`](../../app/components/organisms/job-details-modal.tsx) and [`JobList`](../../app/components/organisms/job-lists.tsx) close/open handlers for clearer URL state handling.
  - Added direct regression evidence in [`app/components/atoms/TimesheetDayCell.test.tsx`](../../app/components/atoms/TimesheetDayCell.test.tsx), [`app/components/organisms/job-details-modal.test.tsx`](../../app/components/organisms/job-details-modal.test.tsx), [`app/components/organisms/job-lists.test.tsx`](../../app/components/organisms/job-lists.test.tsx), [`app/components/modals/JobRequisitionRequestModal.test.tsx`](../../app/components/modals/JobRequisitionRequestModal.test.tsx), [`app/components/atoms/DataTable.test.tsx`](../../app/components/atoms/DataTable.test.tsx), [`app/components/shared/EmployeeList.test.tsx`](../../app/components/shared/EmployeeList.test.tsx), and [`app/components/molecules/employee/EmploymentCompensationForm.test.tsx`](../../app/components/molecules/employee/EmploymentCompensationForm.test.tsx).
  - Replaced slower user-event flows with direct change/click events where appropriate and widened a few slow test timeouts so the full suite remains reliable under combined load.
- Validation:
  - Passed: `npm run quality:ci` (3 behavior files / 7 test evidence files in obligation check, 40 Vitest files / 270 tests, 3 Playwright smoke tests, and production build with existing warnings).
- Truth/context update:
  - No Project Truth, terminology, or principle update was required because the product behavior and durable operating rules did not change.
- Recommendations:
  - No new recommendations were added in this pass.
