# Task 3 — Partial TIME_BOUND employee-benefit update validation

Date: 2026-07-13

## Scope

Fixed the API controller in `../hris-api` so partial updates to an explicit `TIME_BOUND` employee benefit validate the merged schedule candidate before any payroll-period lookup, benefit write, or installment creation.

## Implementation

- `app/employeeBenefit/employeeBenefit.controller.ts`
  - After merging persisted benefit data with the validated request payload, the controller validates the resulting schedule fields with `UpdateEmployeeBenefitSchema`.
  - A reversed merged range now returns HTTP 400 with the existing `endDate` validation error and exits before persistence or schedule processing.
  - Fixed-installment validation remains included; mode-less legacy updates do not gain an explicit schedule mode.
- `tests/employee-benefit-schedule.controller.spec.ts`
  - Added regressions for partial end-date and start-date reversals.
  - Both tests assert HTTP 400, no `employeeBenefit.update`, no payroll-period query, and no installment creation.
  - Added a valid partial end-date update regression that still returns HTTP 200 and persists the date.

## TDD evidence

1. Added the three controller tests before changing production code.
2. Ran the focused partial-update tests. The two reversal tests failed as expected with `200 !== 400`; the valid partial update passed.
3. Added merged schedule-candidate validation in the update controller.
4. Re-ran the focused tests: 3 passing.

## Verification

- Passed: `npx tsx node_modules/mocha/bin/mocha --no-config tests/employee-benefit-schedule.contract.spec.ts tests/employee-benefit-schedule.helper.spec.ts tests/employee-benefit-schedule.controller.spec.ts` — 47 passing.
- Passed: `npx eslint app/employeeBenefit/employeeBenefit.controller.ts tests/employee-benefit-schedule.controller.spec.ts`.
- `npx tsc --noEmit --pretty false` did not pass because of existing errors outside this change, including unresolved `deriveBehaviorFlags` references in attendance services, Prisma-client type mismatches in employee/migration/payroll files, and unrelated implicit-`any` errors in helpers. Neither changed Task 3 file is listed in the output.
- Passed: `git diff --check`.
- WWG lifecycle: `npm run wwg:task:start` passed; `npm run wwg:task:end` completed with 16 pre-existing low-severity skill-registry warnings and no critical/high findings.

## Safety and compatibility

- No shared database, migration, backfill, repair, seed, deployment, or credential command was run.
- Existing schedule tests continue to cover fixed schedules, legacy mode-less payloads, inactive-status gating, and the no-duplicate-installment path.
- The controller tests emit pre-existing asynchronous activity/audit logging datasource warnings after completion because their log writers are not mocked; the test command exits successfully.

## Recommendations

No new recommendations were identified for this narrowly scoped regression repair.
