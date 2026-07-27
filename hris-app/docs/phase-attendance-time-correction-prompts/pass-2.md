# Pass 2 - Classification and Normalization Core

## Input (from Pass 1)

Read Pass 1's Handover before doing anything else. You need the Finalized
Correction Contract in full - especially the `INCOMPLETE` classification rule,
the non-work status set, and the reason-category source decision. If any of
those are blank or marked as a blocker, stop and escalate rather than guessing.

## Objective

Build the first half of the shared correction logic: the part that decides what
kind of correction this is and what the clean payload looks like - before any
database write happens. This is deliberately split from Pass 3 (the actual
supersede-and-write step) so that classification can be reviewed and tested on
its own, since it is the piece most likely to need revision if a Remaining
Decision changes later.

## Action

Implement, as one cohesive unit (module-local function or part of the dedicated
service module per the Pass 1 contract):

- Status classification: given a correction status, return whether it is worked,
  non-worked, or (per the Pass 1 contract) the resolved treatment for
  `INCOMPLETE`. This must be the single place this decision is made - no
  duplicate classification logic left behind in either controller after Pass 4.
- Payload normalization: time parsing, non-work status coercion (null out
  `timeIn`/`timeOut`/location for non-worked statuses), notes fallback, same-day
  date handling.
- Reason category handling: per the Pass 1 contract - either validate against
  the fixed UI enum, or read from the schema/config-backed list, whichever was
  decided.

Do not implement supersession, row creation, or refresh logic in this pass - that
is Pass 3's responsibility. Keep this pass's output a pure function of its input:
given a raw correction payload, return a normalized, classified payload. No
database writes here.

## Self-Check

- Is there exactly one classification function, or did a second copy creep in
  somewhere?
- Does the function handle `INCOMPLETE` per the Pass 1 contract, not the old
  default behavior?
- Does this pass touch the database at all? It should not - if it does, that
  belongs in Pass 3.

## Validation for this pass

- Unit tests for classification: each status (`PRESENT`, `INCOMPLETE`, `LEAVE`,
  `ABSENT`, `REST_DAY`, and any status added by the Pass 1 contract) returns the
  expected classification.
- Unit tests for normalization: non-work statuses null the worked-window
  fields; worked-day statuses require a valid time window; notes fallback behaves
  as specified.

## Handover to Pass 3

- The classification function and normalization function (names, file location).
- Confirmation that no DB access exists in this layer.
- Test file location and pass/fail status for this pass's own unit tests.
- Flag: if the Pass 1 contract's `INCOMPLETE` rule required a new status value
  or changed validation shape in a way that affects the API request/response
  contract, note it here so Pass 6 (tests) and Pass 7 (validation) know to check
  for it explicitly.
