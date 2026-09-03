# Pass 6 - Regression Test Coverage

## Input (from Pass 5)

Read Pass 5's Handover before doing anything else. You need the finalized
app-side validation rules and the list of files changed across Passes 2 through
5. Note that Passes 2 and 3 already include their own unit/integration tests for
the classification, normalization, and write/refresh core - this pass is about
end-to-end coverage across both entry points, not re-testing what those passes
already proved in isolation.

## Objective

Produce the full regression suite for the consolidated correction workflow,
covering both entry points end-to-end and the downstream effects, so that any
future change to either controller or the shared service gets caught by tests
rather than discovered in production.

## Action

Write or confirm the following minimum coverage exists (carried from the source
implementation plan's Phase 3 list, applied against the now-consolidated code):

- Direct HR correction creates a new correction row.
- Approval-side correction creates the same kind of correction row.
- Non-work statuses clear the worked-window fields.
- Worked-day corrections require valid time input.
- `INCOMPLETE` behaves per the Pass 1 contract's locked rule - explicitly test
  this, since it is the one classification rule that changed from the original
  draft assumption.
- Same-day attendance is required for a correction to proceed.
- Prior effective row(s) are superseded - test the multi-row case specifically,
  not just the single-row case, since multiple effective rows per day are
  confirmed possible.
- Obligation and timesheet refreshes still happen after both entry points.
- Cache invalidation still happens, and happens post-commit, for both entry
  points.
- API error-shape verification: both entry points return the same predictable
  error shape for the same validation failure.
- End-to-end: a correction submitted through `request.controller.ts` approval
  produces a result indistinguishable in data shape from one submitted through
  `attendance.controller.ts` directly, except for the provenance/source field.

## Self-Check

- Does every test in this list actually exist and pass, or are any still marked
  pending?
- Does the multi-row supersession test use a fixture with genuinely multiple
  effective rows, or does it accidentally test the single-row case twice?
- Does the "indistinguishable except for provenance" test actually diff the two
  results, or does it just check each independently? A direct diff is the real
  proof that `source` isn't leaking into core behavior.

## Validation for this pass

- Full test suite run, all listed cases passing.
- Test output captured as evidence for Pass 7.

## Handover to Pass 7

- Full test suite location and complete pass/fail results.
- Specific confirmation (with test name) that the source-leakage check passed.
- Any test that had to be skipped or marked as a known gap, with the reason -
  Pass 7 needs this to decide the final status honestly (a skipped test means
  the outcome cannot be marked FULFILLED without a documented warning).
