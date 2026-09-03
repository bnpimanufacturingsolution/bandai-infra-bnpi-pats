# Task 2: Implement schedule normalization and installment generation

Files:
- Modify `../hris-api/helper/employee-benefit-program.helper.ts`.
- Test `../hris-api/tests/employee-benefit-schedule.helper.spec.ts`.

Produce `BenefitSchedulePeriod { id: string; startDate: Date; endDate: Date }` and extend `buildBenefitInstallments(benefitId, benefit, periods?)` to support explicit `TIME_BOUND` and `FIXED_INSTALLMENTS` modes. Fixed mode must divide total amount by the requested positive count, schedule at the existing 15-day cadence, and put the centavo remainder in the final row. Time-bound mode must use supplied payroll periods overlapping the inclusive start/end range, generate one row per selected payroll period, divide the amount across them, and put the remainder in the final row. New explicit modes must not receive an implicit six-installment count; legacy payloads without `scheduleMode` retain compatibility defaults.

Use TDD. Add at least ten meaningful tests covering fixed count, one installment, rounding remainder, invalid count, missing start date, time-bound period selection, inclusive date boundaries, no overlapping periods, inactive status exclusion at caller boundary, and legacy six-installment compatibility. Run focused tests and typecheck, commit, and write a complete report to `C:\Users\Zen\Desktop\AZURO\BANDAI\hris-app\.superpowers\sdd\task-2-report.md`. Return only status, commit hash, one-line tests, concerns.

Global constraints: preserve Payroll’s existing installment row contract and status values; do not mutate shared databases; every modified function needs at least five meaningful tests.
