# Test Enforcement

## Purpose

Define how this project classifies test obligations and what evidence is required before closing meaningful changes.

## Applies To

All repository changes, with emphasis on behavior, business rules, state transitions, persistence, API contracts, auth/security, and prior bug-fix areas.

## Rules

- Classify each change as one of: No Test Required, Test Recommended, Test Required, or Regression Test Required.
- Meaningful behavior changes must include meaningful verification evidence.
- New and modified functions must have at least 5 test cases each (happy path, validation/error path, edge cases, and behavior-specific assertions).
- Migration, backfill, repair, attendance, timesheet, payroll tally, approval-history, or payroll-history changes must include matching automated smoke, quality-gate, or regression test evidence.
- If tests are not added or updated, document why and what alternative verification was used.
- Flag weak tests when they do not validate changed behavior.
- High-risk changes (security, auth, persistence, destructive actions, compliance-sensitive flows) require stronger verification before close-out.

## Classification

- No Test Required: Docs-only, comment-only, or cosmetic-only changes with no behavior impact.
- Test Recommended: Low-risk helper or minor UI/output adjustments with limited behavior impact.
- Test Required: New or changed behavior, business rules, parsing/validation, state management, persistence, API/client seams, or bug fixes.
- Test Required: Data migration mapping, schema validation, dry-run behavior, idempotency expectations, reconciliation output, timing/report output, or migration smoke coverage.
- Regression Test Required: Previously fixed bugs, edge-case failures, migration/data integrity failures, source-of-truth violations, or incidents that must not recur.

## Enforcement

- Missing Test Recommended evidence: warning.
- Missing Test Required evidence: pause for plan.
- Missing Regression Test Required evidence: stop until addressed.
- Function-level test count below 5 for new/modified functions: stop until addressed or explicitly waived by project owner.
- Migration/backfill/repair changes without smoke or quality-gate evidence: pause for plan.
- Attendance, timesheet, approved OT, payroll tally, or paid payroll history changes without source-truth regression evidence: stop until addressed or explicitly waived by project owner.
- Record test command(s), outcomes, and any manual verification notes in close-out evidence.

## Reports / Artifacts

- `.wwg/reports/wwg-validate-report.md`
- `.wwg/reports/wwg-audit-report.md`
- `.wwg/reports/wwg-agent-handoff.md`
- Project-specific test output (for example `npm test`, targeted test runs, or CI job evidence)

## References

- `.wwg/governance/quality-gates.md`
- `.wwg/governance/test-plan.md`
- `.wwg/governance/enforcement-levels.md`
- `.wwg/governance/regression-manifest.md`
