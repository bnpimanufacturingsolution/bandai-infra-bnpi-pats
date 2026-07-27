# Task 4 Report: Payroll schedule source compatibility

## Scope

Task 4 was completed in `../hris-api` using the existing generated `EmployeeBenefitInstallment` rows as the payroll execution source. No benefit direction, reconciliation calculation, statutory payroll behavior, schema, migration, or UI behavior was changed.

## Compatibility change

`resolvePayrollBenefitSource` now accepts a `SCHEDULED` installment only when it has no `payrollCutOffId` or its cutoff matches the payroll period being processed. A `DEDUCTED` installment remains reusable only for the same payroll period, preserving payroll rerun behavior. This prevents a date-in-range scheduled installment that is already linked to another payroll period from being selected and applied again.

## Regression coverage added

Eleven Task 4 cases were added across:

- `../hris-api/tests/payroll-benefit-source.helper.spec.ts`
- `../hris-api/tests/payroll-benefit-integration.spec.ts`

They cover fixed-installment selection, time-bound selection, date-range exclusion, benefit-period exclusion, installment payroll-period mismatch exclusion, same-period deducted reruns, compensation aggregation, deduction aggregation, legacy recurring-amount fallback, generated-row `DEDUCTED` persistence, and duplicate-processing protection.

## TDD evidence

The new regression tests were executed before the compatibility change. The focused run produced 29 passing and 2 failing cases, both for scheduled installments linked to a different payroll period. After the minimal resolver guard was added, the same focused command passed with 31 passing cases.

## Validation

Passed:

- `npx tsx node_modules/mocha/bin/mocha --no-config tests/payroll-benefit-source.helper.spec.ts tests/payroll-benefit-integration.spec.ts` — 31 passing.
- `npm run test:regression:payroll-source-truth` — 60 API source-truth tests and 24 DB source-truth tests passing.
- `git diff --check` — no whitespace errors.

## Safety and scope review

- Changed only the payroll-benefit source compatibility helper and the two requested regression test files in `hris-api`.
- No shared or production database, migration, backfill, repair, deployment, or external payroll action was run.
- No durable terminology or source-of-truth definition changed, so no WWG truth document update was needed.

## Remaining concern

The existing source-truth quality command exits successfully but emits unrelated activity/audit logger datasource and request-context warnings during mocked controller tests. They were not introduced by this task.

---

# Task 4 Test-Quality Corrective Fix

## Scope

Strengthened only the payroll-benefit regression tests and the narrowly required idempotency seam in `../hris-api`. No shared database, migration, backfill, repair, deployment, statutory calculation, compensation/deduction direction, reconciliation behavior, schema, or UI behavior was changed.

## Changes

- Replaced hand-constructed fixed-installment coverage with a `FIXED_INSTALLMENTS` benefit generated through `buildBenefitInstallments`, then resolved the generated due row and asserted its amount and installment ID.
- Replaced hand-constructed time-bound coverage with a `TIME_BOUND` benefit generated from overlapping payroll periods through `buildBenefitInstallments`, then resolved the due row and asserted its amount and installment ID.
- Replaced the disconnected duplicate-processing counter with a stateful Prisma mock that invokes `markPayrollBenefitInstallmentsDeducted` twice. The first invocation updates the scheduled row; the second detects the row already deducted for the same cutoff, returns zero, does not issue a second update, and does not throw.
- Added a pre-update same-cutoff `DEDUCTED` lookup in `markPayrollBenefitInstallmentsDeducted`; the existing post-update lookup remains the concurrency-safe fallback when another process deducts the row between lookup and update.

## TDD evidence

After adding the generation-backed tests and stateful idempotency test, the focused payroll-benefit run failed as intended: 30 passing, 1 failing. The failure showed two update attempts where the new idempotency expectation requires one. After the minimal preflight lookup change, the same focused command passed with 31 passing tests.

## Validation

Focused payroll-benefit tests:

- Passed: `npx tsx node_modules/mocha/bin/mocha --no-config tests/payroll-benefit-source.helper.spec.ts tests/payroll-benefit-integration.spec.ts` — 31 passing.
- Passed: `npx eslint helper/payroll-period.helper.ts tests/payroll-benefit-source.helper.spec.ts tests/payroll-benefit-integration.spec.ts`.

Separate source-truth evidence (not direct coverage of the focused payroll-benefit tests):

- Passed: `npm run test:regression:payroll-source-truth` — 60 API source-truth tests and 24 DB source-truth tests passing.

## Remaining concern

The passing source-truth suite continues to emit pre-existing activity/audit logger datasource and mocked request-context warnings. They are unrelated to this targeted change and did not fail the suite. No new recommendations were identified.
