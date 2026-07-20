# Task 1 Report: Backend schedule-mode contract

## Commit

`e262b9b0261b4f6b0b5ff3417e24b0889e294a2e` — `feat(benefits): add schedule mode contract`

## Changed files

- `hris-api/prisma/schema/employeebenefit.prisma`
  - Adds persisted optional `BenefitScheduleMode` and `EmployeeBenefit.scheduleMode` for MongoDB.
- `hris-api/prisma/schema-postgres/employeebenefit.prisma`
  - Adds the matching enum and nullable field for PostgreSQL.
- `hris-api/zod/employeebenefit.zod.ts`
  - Exports `BenefitScheduleMode` with `TIME_BOUND` and `FIXED_INSTALLMENTS`.
  - Validates fixed schedules require `totalInstallments` and time-bound schedules require `endDate`.
  - Keeps mode-less legacy payloads parseable and retains the legacy default of six installments.
- `hris-api/zod/employee.zod.ts`
  - Applies the same schedule validation to nested employee-benefit payload schemas while preserving their existing extensions/omissions.
- `hris-api/tests/employee-benefit-schedule.contract.spec.ts`
  - Adds the five requested contract cases: fixed acceptance, time-bound acceptance, missing installment-count rejection, missing end-date rejection, and invalid-mode rejection.

## Commands and results

| Command | Result |
| --- | --- |
| `npx tsx node_modules/mocha/bin/mocha --no-config tests/employee-benefit-schedule.contract.spec.ts` before implementation | Expected red: 0 passing, 5 failing because `scheduleMode` was stripped and incomplete schedules were accepted. |
| `npx tsx node_modules/mocha/bin/mocha --no-config tests/employee-benefit-schedule.contract.spec.ts tests/payroll-benefit-integration.spec.ts` | Pass: 10 passing (all five new contract tests plus existing legacy payload coverage). |
| `npx prisma generate --no-engine` | Pass: PostgreSQL Prisma client generated without replacing the locked Windows engine binary. |
| `npx prisma generate --schema prisma/schema --no-engine` | Pass: MongoDB Prisma client generated without replacing the locked Windows engine binary. |
| `npx prisma validate --schema prisma/schema-postgres` | Pass. |
| `DATABASE_URL=mongodb://127.0.0.1:27017/hris_contract_validation npx prisma validate --schema prisma/schema` | Pass; validation only, no database connection or mutation. |
| `npx eslint zod/employeebenefit.zod.ts zod/employee.zod.ts tests/employee-benefit-schedule.contract.spec.ts` | Pass. |
| `npm run typecheck` | Fails on existing errors outside Task 1 in attendance, employee import, migration, person, payroll-period, and timesheet files; no Task 1 file is reported. |

## Concerns

- Normal Prisma generation without `--no-engine` is blocked by an external Windows lock on `generated/prisma/query_engine-windows.dll.node` (`EPERM` during rename). Engine-less generation and both schema validations pass.
- Repository-wide `npm run typecheck` remains failing because of pre-existing unrelated errors listed above. Task 1 focused tests, lint, and Prisma validation pass.
- No database command that connects to or mutates shared data was run. The MongoDB validation URL was a local placeholder used only for schema configuration validation.

---

# Task 1 Review Fix: Schedule-mode persistence and update validation

## Commit

`751dedac8b1bca59f28db0224aa2fa32e8dc6110` — `fix(benefits): persist and validate schedule modes`

## Changed files

- `hris-api/helper/employee-benefit-program.helper.ts`
  - Preserves the optional `scheduleMode` when normalizing create and update persistence payloads. Mode-less legacy payloads still normalize with no mode.
- `hris-api/zod/employeebenefit.zod.ts`
  - Applies the existing mode-specific schedule validation to partial update payloads without applying the create-only six-installment default.
- `hris-api/tests/employee-benefit-schedule.contract.spec.ts`
  - Covers fixed and time-bound mode persistence through normalization, legacy mode-less default behavior, rejected incomplete mode updates, and accepted mode-less partial updates.

## Tests and output

| Command | Result |
| --- | --- |
| `npx tsx node_modules/mocha/bin/mocha --no-config tests/employee-benefit-schedule.contract.spec.ts` before implementation | Expected red: 9 passing, 4 failing. Both normalization persistence assertions returned `undefined`; both incomplete schedule-mode update payloads were accepted. |
| `npx tsx node_modules/mocha/bin/mocha --no-config tests/employee-benefit-schedule.contract.spec.ts` after implementation | Pass: 13 passing. |
| `npx eslint helper/employee-benefit-program.helper.ts zod/employeebenefit.zod.ts tests/employee-benefit-schedule.contract.spec.ts` | Pass: no output, exit 0. |
| `npx tsc --noEmit --pretty false --target ES6 --module Node16 --moduleResolution node16 --strict --esModuleInterop --skipLibCheck --types node helper/employee-benefit-program.helper.ts zod/employeebenefit.zod.ts` | Pass: no output, exit 0. |
| `npx tsc --noEmit --pretty false` | Fails on existing unrelated attendance, employee-import, migration, person, payroll-period, timesheet, database, and helper errors; no changed production benefit file is reported. |
| `git diff --check` | Pass before commit and on the staged change set. |

## Concerns

- The full repository type check remains blocked by unrelated existing errors. A targeted type check for the changed production files passes.
- Directly type-checking the contract test also reports existing `CreateEmployeeBenefitSchema` generic-inference errors on the original create-schema assertions (and the new legacy assertion). Runtime contract execution via `tsx` passes all 13 tests; this review fix does not expand into an unrelated schema-inference refactor.
- The report is workspace metadata under `hris-app/.superpowers`; it was appended as requested and is not part of the `hris-api` fix commit.
