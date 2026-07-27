# Task 2 corrective fix / Task 3 integration

Read the original requirements at `C:\Users\Zen\Desktop\AZURO\BANDAI\hris-app\.superpowers\sdd\task-2-brief.md` and the Task 3 section of `C:\Users\Zen\Desktop\AZURO\BANDAI\hris-app\docs\superpowers\plans\2026-07-13-benefit-schedule-modes.md`.

Fix all reviewed findings:

1. Production employee-benefit create and update must query the organization’s payroll periods overlapping a `TIME_BOUND` benefit and pass them to `buildBenefitInstallments`, so time-bound mode creates real scheduled rows.
2. Explicit `TIME_BOUND` and `FIXED_INSTALLMENTS` modes must not receive an implicit six-installment count. Legacy payloads without `scheduleMode` retain six for compatibility.
3. Add caller-boundary tests proving pending/cancelled benefits do not create installments, and production create/update pass selected payroll periods.
4. Reject fractional installment counts instead of truncating them.
5. Add malformed payroll-period and production caller coverage.

Own backend files only: `app/employeeBenefit/employeeBenefit.controller.ts`, `helper/employee-benefit-program.helper.ts`, and the focused schedule helper/controller tests. Do not revert other agents’ changes. Use TDD, run the covering tests and lint/type checks, commit, and append a full report to `C:\Users\Zen\Desktop\AZURO\BANDAI\hris-app\.superpowers\sdd\task-2-report.md`. Return only status, commit hash, one-line tests, concerns.
