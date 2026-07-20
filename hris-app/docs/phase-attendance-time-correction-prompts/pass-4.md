# Pass 4 - Route Both Controllers Through the Shared Service

## Input (from Pass 3)

Read Pass 3's Handover before doing anything else. You need the finished shared
correction function - its name, location, and signature - and the confirmation
that `source` only affects provenance/labeling, not core logic.

## Objective

Replace the duplicated inline mutation logic in `../../../hris-api/app/attendance/attendance.controller.ts`
and `../../../hris-api/app/request/request.controller.ts` with calls into the Pass 3
shared service. This is the pass where consolidation either becomes real or
becomes a false claim - check carefully.

## Action

- In `../../../hris-api/app/attendance/attendance.controller.ts` (direct HR
  correction): remove the inline classification, supersession, row-creation, and
  refresh logic. Replace with a call to the Pass 3 shared service, passing
  `source: 'direct'` plus the relevant actor context.
- In `../../../hris-api/app/request/request.controller.ts` (approval-side correction,
  triggered when an `ATTENDANCE_CORRECTION` request is approved): remove the
  inline duplicate logic the same way. Replace with a call to the same shared
  service, passing `source: 'approval'` plus the relevant actor and `requestId`
  context.
- Leave `request.controller.ts` only with request-specific bookkeeping:
  validating the request is approvable, extracting/normalizing the correction
  payload from request metadata (which then gets handed to Pass 2's
  normalization, not a second local copy of it), marking the request approved,
  and notifying the requester. No attendance-domain logic should remain in this
  controller.
- Do not change either controller's external API contract (request/response
  shape) in this pass - that is Pass 5/7's concern if it changes at all per the
  Pass 1 contract.

## Self-Check

- Grep both controllers after this pass: is there any leftover inline
  classification, supersession, or row-creation logic that didn't get removed? A
  partial removal where one controller keeps a "just in case" fallback path is
  the consolidation failing silently - check for this explicitly.
- Did `request.controller.ts` end up with any attendance-domain logic still
  living in it, or is it now purely request bookkeeping plus a service call?
- Are both call sites passing the correct `source` value?

## Validation for this pass

- Run Pass 2 and Pass 3's existing unit/integration tests against the now-wired
  controllers - they should still pass unchanged, since the underlying logic
  didn't change, only its caller did.
- Manual diff review: confirm no unrelated code in either controller was touched.
- Confirm neither controller still imports or calls anything from its old inline
  implementation.

## Handover to Pass 5

- Confirmation both controllers now call the Pass 3 shared service exclusively.
- Diff summary: what was removed from each controller, what was added.
- The current API request/response shape for both endpoints, as a baseline for
  Pass 5 to check the app against.
- Flag: anything found during the self-check that required a fix before this
  pass could close cleanly.
