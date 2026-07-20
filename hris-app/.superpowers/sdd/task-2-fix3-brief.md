# Task 2/3 final corrective fix

In `../hris-api`, fix the review finding that inactive explicit `TIME_BOUND` records can persist Prisma’s legacy six-installment default. For an explicit time-bound record that is not active/approved or has no usable periods, persist an explicit unscheduled count of `0` (or an equivalent schema-safe value) so it cannot silently become six; preserve legacy mode-less six and fixed-mode requested counts. Apply the same rule to update.

Add focused meaningful tests for: inactive explicit time-bound persistence count, update with existing installments does not duplicate, invalid benefit date range, and API validation error response. Keep the active time-bound create/update behavior unchanged. Do not mutate shared databases or revert unrelated changes. Run all schedule tests and targeted lint/type checks, commit, and append a full report to `C:\Users\Zen\Desktop\AZURO\BANDAI\hris-app\.superpowers\sdd\task-2-report.md`.
