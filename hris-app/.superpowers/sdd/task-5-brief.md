# Task 5: Add frontend schedule selector, conditional fields, and preview

Files:
- Modify `app/components/templates/hr/benefits-management-template.tsx`.
- Modify `app/services/employee-benefit.service.ts`.
- Modify `app/zod/employee-benefit.zod.ts`.
- Modify `app/lib/hooks/useEmployeeBenefits.ts` only if type propagation requires it.
- Test `app/components/templates/hr/benefits-management-template.test.tsx`.
- Extend `app/zod/employee-benefit.zod.test.ts`.

Add explicit `scheduleMode` values `TIME_BOUND` and `FIXED_INSTALLMENTS`, optional `totalInstallments`, conditional fields, and a user-visible preview. Time-bound mode shows start date, end date, total amount, and calculated payroll-period installment count. Fixed-installments mode shows start date, positive integer installment count, total amount, and calculated per-installment amount. Switching modes clears irrelevant values. Create/update payloads send explicit mode and only relevant fields. Preserve view/edit behavior, payroll-period prefill, benefit-type direction display, and existing organization handling. API remains authoritative; preview is informational.

Use TDD. Add at least ten meaningful frontend tests for default mode, field visibility per mode, mode-switch cleanup, missing end date, invalid count, amount preview, rounding preview, create payload, edit compatibility, and payroll-period prefill. Run focused tests, typecheck, lint, and test-obligation checks. Commit and write a full report to `C:\Users\Zen\Desktop\AZURO\BANDAI\hris-app\.superpowers\sdd\task-5-report.md`; return only status, commit hash, one-line tests, concerns.
