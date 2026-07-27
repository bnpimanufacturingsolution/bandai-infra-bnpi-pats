# Task 1: Add backend schedule-mode contract and failing tests

Files:
- Modify `../hris-api/prisma/schema/employeebenefit.prisma`.
- Modify `../hris-api/prisma/schema-postgres/employeebenefit.prisma`.
- Modify `../hris-api/zod/employeebenefit.zod.ts`.
- Test `../hris-api/tests/employee-benefit-schedule.contract.spec.ts`.

Produce `BenefitScheduleMode = "TIME_BOUND" | "FIXED_INSTALLMENTS"`, a persisted `scheduleMode` field on EmployeeBenefit, and Zod cross-field validation. Keep existing legacy payloads parseable, but new UI/API payloads will provide the mode. Add five meaningful contract tests: fixed acceptance, time-bound acceptance, missing fixed installment count rejection, missing time-bound end date rejection, and invalid mode rejection. Run the focused tests and Prisma generation/type checks. Commit the backend contract changes. Write a full report to `.superpowers/sdd/task-1-report.md` containing changed files, commit hash, commands/results, and concerns; return only status and a one-line test summary.

Global constraints: do not mutate shared databases; preserve existing records; frontend visibility is not authorization; every modified function needs at least five meaningful tests; do not change payroll direction or reconciliation behavior.
