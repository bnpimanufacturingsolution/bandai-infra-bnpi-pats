# Task 4 test-quality corrective fix

In `../hris-api`, strengthen only the payroll benefit regression tests and any narrowly required test seam. Read the prior Task 4 brief/report and review findings.

1. Add mode-specific fixed-installment coverage that constructs a `FIXED_INSTALLMENTS` benefit, uses `buildBenefitInstallments`, then passes the generated rows into `resolvePayrollBenefitSource` and asserts the due amount/installment ID.
2. Add mode-specific time-bound coverage that constructs a `TIME_BOUND` benefit with overlapping payroll periods, uses `buildBenefitInstallments`, then resolves the due row for a payroll period.
3. Replace the weak duplicate-processing assertion with a real idempotency test that invokes `markPayrollBenefitInstallmentsDeducted` twice against a controlled Prisma mock: first call updates a scheduled row; second call recognizes the already-deducted row for the same payroll cutoff without a second update or error.
4. Keep compensation/deduction and statutory behavior unchanged. Do not claim the broad source-truth suite directly covers these focused tests; report both separately.

Run the focused payroll benefit tests and the source-truth suite, targeted lint, commit, and append a full fix report to `C:\Users\Zen\Desktop\AZURO\BANDAI\hris-app\.superpowers\sdd\task-4-report.md`. Do not mutate shared databases.
