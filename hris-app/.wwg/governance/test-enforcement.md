# Test Enforcement

## Purpose

Define how WWG classifies implementation changes by test obligation and how missing or weak tests affect Truth Alignment and Execution Gate guidance.

Testing is implementation subtext. Users should not need to repeatedly ask agents to add tests after meaningful behavior changes.

Verification must match the work. Non-software changes may be verified with decision logs, manual review, approval checklists, sign-off notes, or Project Truth updates when software tests are not the correct evidence. Copy-only changes should not be forced into unit tests.

## Test Obligation Model

### A. No Test Required

Use for:

- copy-only changes
- comments
- cosmetic-only styling
- documentation-only changes
- policy copy edits that do not change accepted behavior

### B. Test Recommended

Use for:

- minor UI behavior
- small helper changes
- low-risk state changes

Missing recommended tests maps to YELLOW / `warn`.

### C. Test Required

Use for:

- new feature behavior
- state management
- parsing
- validation
- cart, checkout, order, referral, onboarding, dashboard, workflow, or business-rule behavior
- persistence, localStorage, database, API/client integration seams
- payment, auth, security, or workflow behavior
- bug fixes when no stronger regression obligation applies
- meaningful business/process/policy behavior when a manual verification or decision log is not enough

Missing required tests maps to ORANGE / pause_for_plan.

### D. Regression Test Required

Use for:

- previously fixed bugs
- reintroduced bugs
- edge cases discovered during debugging
- payment, auth, security, persistence, or high-risk failure paths
- any issue that should never return

Missing regression tests maps to RED / `stop`.

## TDD Evidence Rule

Every behavior-bearing change must have relevant changed test evidence. Relevant means the test evidence targets the same source feature, not merely the same broad folder.

Accepted evidence examples:

- `app/services/employees.service.ts` -> `app/services/employees.service.test.ts`
- `app/lib/admin-migration-ui.ts` -> `app/lib/admin-migration-ui.test.ts`
- `app/routes/hr/payroll.tsx` -> a named browser spec such as `tests/hr-payroll.spec.ts`
- `scripts/check-test-obligations.mjs` -> `scripts/check-test-obligations.test.ts`

Unaccepted evidence examples:

- an unrelated service test for a changed service
- any browser spec for an unrelated route or component
- a build-only or smoke-only check after behavior changed
- governance/test-runner script changes without direct policy tests

`npm run test:obligations` is the app repository's executable TDD guard. It must remain nested inside `npm run quality:ci`.

## HRIS Migration And Import Rules

Data migration/import/backfill-facing app changes are at least Test Required.

Use Regression Test Required when a change touches:

- file import parsing, preview, column mapping, or upload options
- migration/import modal URL state or persisted import progress
- imported record counts, status badges, validation errors, skipped rows, or summary display
- employee import auto-create behavior, default leave balances, or create-timesheets options
- attendance, timesheet, approved OT, payroll tally, or payroll-history source selection

App-side tests must prove UI/client behavior and request intent. Backend import execution, persistence, DB invariants, data mutation, load, and soak guarantees belong in `../hris-api` or an approved API harness.

## Required Close-Out Questions

Before closing any meaningful implementation task, agents must identify:

- what behavior changed
- what unit tests were added or updated
- what regression tests were added or updated
- what manual verification was done
- what test command was run
- the result
- if no tests were added, why not
- whether `CHANGELOG.md` was updated or a changelog command was run
- what version was affected and whether a minor or major bump was recommended

If a bug was fixed, add or update a regression test whenever practical.

## Weak Test Detection

WWG should flag obvious gaps when tests exist but do not cover changed behavior.

Weak tests include:

- only checking that files exist
- only checking static copy
- only checking structure without behavior assertions
- relying only on a build/smoke test after behavior changed
- very low test count despite multiple behavior areas
- checkout, referral, cart, auth, payment, persistence, or security logic changing without behavior tests

WWG does not require perfect coverage, but obvious superficial tests are not enough for behavior changes.

## Feature-To-Test Expectations

Use these as generic examples, not project-specific hardcoding:

- Cart behavior -> tests for add, remove, quantity, total
- Checkout behavior -> tests for intent creation, payment state transitions, success paths, failure paths
- Referral behavior -> tests for URL parsing, persistence, attribution
- Onboarding behavior -> tests for validation, progress, saved state
- Dashboard metrics -> tests for calculations and empty states
- Payment seam/provider -> tests for mock provider lifecycle and error handling
- Auth/security -> tests for access control and failure states
- Persistence -> tests for load, save, migration, invalid data
- Bug fix -> regression test reproducing the bug before the fix

## Truth Alignment And Execution Gate

- No Test Required missing -> GREEN / `allow`
- Test Recommended missing -> YELLOW / `warn`
- Test Required missing -> ORANGE / `pause_for_plan`
- Regression Test Required missing -> RED / `stop`
- Tests removed/weakened -> RED / `stop`
- Tests failing for core behavior -> RED / `stop`

Missing meaningful tests are Regression / Quality Drift.

## Repair Guidance

Natural prompt first:

```txt
Tell the agent: "Add meaningful tests for the behavior introduced in the latest implementation before adding more features."
```

Natural prompt first:

```txt
Tell the agent: "Create regression tests for the fixed bug so it does not return."
```

Natural prompt first:

```txt
Tell the agent: "Strengthen the test suite so it verifies behavior, not just file structure."
```

Backup CLI:

```bash
npm run wwg -- test-check --target .
npm run wwg -- regression-check --target .
```

## Report-First Check

`wwg test-check --target .` reports changed areas, expected test types, tests found, missing tests, weak tests, regression gaps, natural repair guidance, and backup CLI commands.

The command does not rewrite implementation or tests.
