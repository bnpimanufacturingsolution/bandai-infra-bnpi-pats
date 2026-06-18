# Cross-Repo Context Reconciliation Report

Status: COMPLETE
Last updated: 2026-05-25

## Task Classification

- Task mode: docs-only / governance context repair.
- Delivery mode: AI-agent.
- Risk: high-risk context because the next work touches API tests, persistence, employee data, attendance, timesheets, payroll, authorization, load testing, soak testing, and DB fault injection.
- Implementation boundary: no runtime code, database, migration, deployment, secret, credential, deletion, load, or soak action was performed.

## Trigger

During the HRIS testing-program task, the app repository context treated the API implementation as unavailable inside the app workspace. The user identified that a sibling `hris-api` repository exists and asked to fill the WWG context gap before proceeding.

## Findings

- `hris-api` exists as a sibling repository to `hris-app`.
- `hris-api` README and package metadata confirm this repository is the HRIS backend API built with TypeScript, Express, and Prisma.
- API modules and Prisma schemas cover HRIS domains including auth, employee records, attendance, attendance obligations, timesheets, timesheet lines, payroll, requests/workflows, recruitment/applicants, onboarding, reports, metrics, audit/activity logging, devices/Hikvision, and migrations.
- The previous API Project Truth incorrectly classified this repository as a Web3 eCommerce prototype. That classification is stale and has been replaced with HRIS API truth.

## Context Changes

- Updated `.wwg/wiki/project-truth.md` to identify this repo as the HRIS backend API and record the paired frontend at `../hris-app`.
- Updated `.wwg/wiki/project-truth-summary.md` so agents reading the required summary first do not see stale Web3/eCommerce identity.
- Updated `.wwg/wiki/terminology.md` with HRIS API, paired frontend, API contract, isolated test DB, load/soak, and attendance/timesheet/payroll source-of-truth terms.
- Updated `.wwg/wiki/terminology-summary.md` with the same high-priority language.
- Updated `.wwg/workspace/current-task.md` with an active addendum for this context repair while preserving the existing function-level test-enforcement task.

## Test Ownership Split

- `../hris-app` owns frontend routes, UI behavior, role-based display, client-side payload construction, browser E2E, and app-side regression tests.
- `hris-api` owns backend authorization enforcement, persistence rules, Prisma schema/model constraints, API contracts, transactions/concurrency, payroll/attendance/timesheet source-of-truth invariants, migrations/backfills, API load tests, and API soak tests.
- Frontend visibility is not authorization. Authorization and persistence guarantees must be tested in the API repo or an approved API harness.

## Remaining Risks

- Canonical role/permission matrix is still inferred and needs confirmation before deep authorization tests are locked.
- Active persistence mode and migration state between MongoDB and Postgres need confirmation before DB invariant tests are finalized.
- Payroll lock/reopen/correction policy and paid snapshot immutability details need confirmation before all payroll regressions become hard gates.
- An approved isolated database target is still needed for destructive/fault-injection and realistic load/soak tests.

## Validation

- Completed with warnings: `npx @homedesk/wwg refresh-context` (5 generated context files updated; `workspace/context/project-context.md` skipped because it has no generated section and was updated directly).
- Passed with warnings: `npm run wwg:task:end` / `npx @homedesk/wwg validate` (0 high findings; low advisory skill-candidate findings remain).
- Passed: `npx @homedesk/wwg brief generic` through `npm run wwg:task:end`.

## Recommendations

- New recommendation added: before continuing the full testing task, implement API-side tests in `hris-api` with isolated synthetic data rather than treating app-side tests as backend proof.
- New recommendation added: add a cross-repo CI/test map that explicitly runs app tests in `hris-app` and API unit/integration/DB/load/soak jobs in `hris-api`.
- New recommendation added: confirm the role/permission matrix and active database target before writing destructive DB fault-injection specs.

## WWG Truth Synchronization

- Task mode: docs-only / governance context repair.
- New truth detected: YES.
- Wiki updated: YES.
- Workspace updated: YES.
- Governance review completed: YES.
- Drift status: YELLOW.
- Canonical files changed:
  - `.wwg/wiki/project-truth.md`
  - `.wwg/wiki/project-truth-summary.md`
  - `.wwg/wiki/terminology.md`
  - `.wwg/wiki/terminology-summary.md`
- Implementation discoveries synced:
  - `hris-api` is confirmed as the HRIS backend API.
  - Paired frontend repo exists at `../hris-app`.
  - Stale Web3/eCommerce identity is superseded.
  - API repo owns backend authorization, persistence, DB invariants, API contracts, load tests, and soak tests.
- Remaining stale context:
  - Role/permission matrix, active database/migration state, payroll lock/reopen/correction policy, deployment/secret status, and approved isolated DB target remain unconfirmed.
