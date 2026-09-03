# Task 4: Preserve Payroll source behavior and add regression coverage

Files:
- Inspect/modify `../hris-api/helper/payroll-benefit-source.helper.ts` only when required by the explicit schedule mode contract.
- Inspect/modify `../hris-api/helper/payroll-period.helper.ts` only when required by the explicit schedule mode contract.
- Test `../hris-api/tests/payroll-benefit-source.helper.spec.ts`.
- Test `../hris-api/tests/payroll-benefit-integration.spec.ts`.

Verify that existing `resolvePayrollBenefitSource` consumes generated installment rows, selects each scheduled installment once for its payroll period, and marks applied rows `DEDUCTED` after successful payroll processing. Add at least ten meaningful regression cases covering fixed-mode due selection, time-bound due selection, out-of-range exclusion, benefit-period exclusion, compensation aggregation, deduction aggregation, legacy amount fallback, duplicate-processing protection, deducted-state persistence, and payroll-period mismatch exclusion. Make only the smallest compatibility change necessary; do not change direction/reconciliation calculations or statutory payroll behavior.

Run focused payroll tests and the existing payroll source-truth quality suite. Commit any compatibility change and tests. Write the full report to `C:\Users\Zen\Desktop\AZURO\BANDAI\hris-app\.superpowers\sdd\task-4-report.md`; return only status, commit hash, one-line tests, concerns.
