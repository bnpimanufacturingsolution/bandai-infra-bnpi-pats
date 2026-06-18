# Regression Priority Review

## Outcome

Status: PARTIAL_PROGRESS

One focused auth/permission regression surface was improved and verified. Broader adoption regression gaps remain open.

## Evidence

Updated executable tests:

- `app/lib/utils/__tests__/role-redirect.test.ts`
- `app/components/dashboards/shared/role-dashboard.config.test.ts`

Focused verification command:

```bash
npx vitest run app/lib/utils/__tests__/role-redirect.test.ts app/lib/utils/role-derivation.test.ts app/components/dashboards/shared/role-dashboard.config.test.ts
```

Result:

- 3 test files passed.
- 82 tests passed.

## Validation

The focused suite now confirms:

- Current HRIS role redirect targets.
- Unknown-role fallback for redirect behavior.
- Admin route access checks for admin-like roles.
- Timekeeper access to the time logging route.
- Role derivation rules for HR, manager, and employee roles.
- Role-dashboard bottom-right layout current behavior.

## Risks

- Auth/permission coverage remains partial. These tests do not prove backend authorization enforcement, route guard rendering behavior, or API permission checks.
- Data persistence behavior remains critical and open.
- Payment/billing behavior remains critical and open. The project appears to use billing/payroll/statement-of-account language more than payment processing language, so the exact risk area needs owner confirmation.
- Process and approval workflow behavior remains high and open.

## Next Action

Recommended regression priority:

1. Auth/permission route guard and API authorization tests.
2. Firebase credential removal/rotation verification after owner approval.
3. Data persistence/import/migration checks for employee and attendance data.
4. Billing/payroll/statement-of-account failure-path tests after owner clarifies production behavior.
5. Approval workflow tests for request and timesheet review paths.

## Detailed Notes

WWG adoption regression gaps are broad. The auth/permission gap should not be closed from this focused utility-level evidence alone. Treat the current evidence as partial coverage.

## Files Changed Or Files Reviewed

Changed:

- `app/lib/utils/__tests__/role-redirect.test.ts`
- `app/components/dashboards/shared/role-dashboard.config.test.ts`
- `.wwg/workspace/testing/manual-verification-evidence.json`

Reviewed:

- `.wwg/governance/regression-gaps.md`
- `.wwg/workspace/testing/regression-candidate-review.md`
- `.wwg/workspace/testing/proposed-executable-tests.md`
- `app/lib/utils/role-redirect.ts`
- `app/lib/utils/role-derivation.ts`
- `app/components/dashboards/shared/role-dashboard.config.ts`

## WWG Truth Synchronization

- Task mode: Existing Project Adoption / regression review
- New truth detected: YES
- Wiki updated: NO
- Workspace updated: YES
- Governance review completed: YES
- Drift status: YELLOW
- Canonical files changed:
  - `.wwg/workspace/testing/manual-verification-evidence.json`
- Implementation discoveries synced:
  - Existing role redirect test was stale and did not match current HRIS roles.
  - Employee dashboard bottom-right card is currently `employee_calendar`.
- Remaining stale context:
  - Critical/high regression gaps remain open until broader executable or manual/process evidence exists.

