# Task 2/3 corrective fix

Read the prior briefs and reports:
- `C:\Users\Zen\Desktop\AZURO\BANDAI\hris-app\.superpowers\sdd\task-2-brief.md`
- `C:\Users\Zen\Desktop\AZURO\BANDAI\hris-app\.superpowers\sdd\task-2-fix-brief.md`
- `C:\Users\Zen\Desktop\AZURO\BANDAI\hris-app\.superpowers\sdd\task-2-report.md`

Fix the remaining review findings in `../hris-api`:

1. `TIME_BOUND` must persist the actual number of overlapping payroll periods, not the legacy six default. In create/update, after selecting valid organization-scoped overlapping periods, pass that count into the normalized Prisma payload or otherwise make `totalInstallments` equal the selected period count. Keep legacy mode-less payloads at six and fixed mode at its requested count.
2. Add the missing controller/helper tests so the focused controller suite has at least ten meaningful cases, including reversed payroll-period ranges and explicit time-bound persistence count.

Do not weaken the API schema, do not mutate shared databases, do not revert other changes. Run all employee-benefit schedule tests plus targeted lint/type checks. Commit the fix and append a full report to `C:\Users\Zen\Desktop\AZURO\BANDAI\hris-app\.superpowers\sdd\task-2-report.md`. Return only status, commit hash, one-line tests, concerns.
