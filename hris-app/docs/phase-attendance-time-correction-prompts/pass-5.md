# Pass 5 - App-Side Alignment and Terminology Cleanup

## Input (from Pass 4)

Read Pass 4's Handover before doing anything else. You need the current API
request/response shape baseline, and confirmation the backend is now
consolidated. Also re-read Pass 1's Finalized Correction Contract for the
canonical terminology decision and the `INCOMPLETE` classification rule - the
app needs to mirror both, not redecide them.

## Objective

Align `../../app/routes/hr/time-corrections.tsx` and `../../app/services/attendance.service.ts`
to the finalized backend contract, and resolve the confirmed terminology
inconsistency (`Time Correction` vs `Attendance Correction`) to the single term
the Pass 1 contract locked in. The app must not become a second source of
business-rule truth - it mirrors the backend, it does not reinterpret it.

## Action

- Update `../../app/routes/hr/time-corrections.tsx` validation so it matches the
  backend's classification rule exactly, including how `INCOMPLETE` is now
  handled per the Pass 1 contract. If the app's validation previously coerced
  `INCOMPLETE` into worked-day handling independently, make sure it now reflects
  the same rule the backend enforces - not a second, possibly-drifted copy of
  it.
- Update `../../app/services/attendance.service.ts` / `../../app/lib/hooks/useAttendances.ts`
  payload shape and error handling to match Pass 4's confirmed API contract.
- Apply the canonical term from the Pass 1 contract consistently: route title,
  page copy, error messages, button labels. Grep for the other term across these
  files first, so the cleanup is based on actual findings, not assumption.
- Surface any additional provenance fields per the Pass 1 contract's provenance
  decision, if it asked for more than ledger type + applied-by actor.
- Do not redesign the UI, change the correction flow's steps, or merge the
  direct and approval-side entry points. These remain explicitly out of scope per
  `chain-run.md`'s boundaries.

## Self-Check

- Did any change in this pass introduce a new business rule the backend doesn't
  already enforce (e.g. a validation check that exists only client-side)? If so,
  remove it - the app should map the backend's contract, not add to it.
- Run the terminology grep again after the edits - does only the canonical term
  remain in touched files, or did a stray instance of the other term survive?
- Did this pass touch anything outside `../../app/routes/hr/time-corrections.tsx`,
  `../../app/services/attendance.service.ts`, or `../../app/lib/hooks/useAttendances.ts`
  without a stated reason?

## Validation for this pass

- Manual or scripted cross-check: app validation rules match backend validation
  rules field-for-field (required fields, worked-day time window check,
  `INCOMPLETE` handling).
- Terminology grep across touched files shows the single resolved term only.
- No UI elements beyond copy/labels were changed (layout, flow steps, and entry
  points remain as they were).

## Handover to Pass 6

- List of files changed in this pass and what changed in each.
- Confirmation the terminology cleanup is complete in touched files (grep
  result).
- The finalized app-side validation rules, for Pass 6 to write tests against.
- Flag: any place where app and backend validation still diverge and why (if a
  divergence is intentional per the Pass 1 contract, state that explicitly so
  Pass 6 doesn't flag it as a bug).
