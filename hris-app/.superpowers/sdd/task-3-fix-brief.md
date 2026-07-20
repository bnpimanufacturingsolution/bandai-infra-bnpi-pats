# Task 3 final corrective fix

In `../hris-api`, fix partial update validation for explicit `TIME_BOUND` employee benefits. The controller must validate the merged candidate (existing persisted benefit plus request changes) before writing. Reject HTTP 400 for a partial `startDate` or `endDate` update that produces `endDate < startDate`; do not persist the invalid range or zero schedule count. Preserve valid partial updates, fixed-mode behavior, legacy mode-less updates, status gating, and existing-installment no-duplicate behavior.

Add controller regression tests for partial end-date reversal and partial start-date reversal, plus successful valid partial update if needed. Run all schedule tests, targeted lint/type checks, commit, and append a full report to `C:\Users\Zen\Desktop\AZURO\BANDAI\hris-app\.superpowers\sdd\task-3-report.md`. Do not mutate shared databases or revert unrelated changes.
