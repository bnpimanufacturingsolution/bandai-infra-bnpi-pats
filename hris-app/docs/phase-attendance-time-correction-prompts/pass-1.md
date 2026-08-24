# Pass 1 - Decision Lock and Finalized Contract

## Input (from chain-run.md)

Read `chain-run.md` first for the overall objective and boundaries. This pass has
no prior pass handover - it is the first in the chain.

## Objective

Close the 7 remaining decisions left open by the Phase 0 code audit, and turn the
answers into a finalized correction contract that every later pass builds
against. Nothing in Pass 2 onward should require guessing at a rule this pass
should have locked.

## Context

The Phase 0 audit already resolved the empirical code questions (status
classification reality, supersession scope, refresh cost, cache placement,
provenance, services-layer precedent, payroll snapshot isolation). What remains
are genuine policy/UX calls that only an owner can make. Do not attempt to answer
these from code - the code has already been checked and does not decide them.

## Action

Present these 7 decisions to the task owner and record an answer for each:

1. Should `INCOMPLETE` remain a worked-day correction branch (current code
   behavior), or should the product redefine it as a separate branch before the
   helper is built?
2. Should the reason-category list stay fixed in the UI, or should it be promoted
   to a schema/config-backed business list?
3. What is the canonical user-facing term for this surface: `time correction` or
   `attendance correction`? Shipped copy is currently inconsistent between the
   two.
4. How much provenance should the UI expose beyond `Ledger Type` and applied-by
   actor?
5. Should the shared helper be extracted into a dedicated service module, or
   stay controller-local for the first pass?
6. Should corrections that only change notes or provenance skip the
   obligation/timesheet refresh, or should the always-refresh behavior remain the
   default regardless of what changed?
7. The backend AGENTS guide references
   `../docs/attendance-timesheet-payroll-tally-prd.md`, which does not exist in
   the workspace. Can the owner provide it, or confirm the current code plus this
   audit are the authoritative source going forward?

If an owner does not respond to a given item within a reasonable window, the
default below may be applied - but it must be recorded as a default, not
silently assumed:

- Decision 6 default: always refresh, regardless of what changed in the
  correction. Refresh cost is confirmed nontrivial but the cost of a missed
  refresh on payroll-adjacent data is worse than a redundant one.
- Decision 7 default: after 5 business days with no PRD and no response, send
  one written confirmation that code + this audit are the source of truth, then
  proceed and record that confirmation as the citation in WWG docs during Pass 7.
- Decisions 1, 2, 3, 4, 5 have no safe default - if unanswered, stop this pass
  and report a blocker. Do not guess.

## Self-Check

- Are all 7 decisions either answered or explicitly defaulted with a reason on
  record?
- Did any decision get silently skipped rather than recorded?
- Does the finalized contract below actually reflect every answer, or did one
  get lost in translation?

## Output: Finalized Correction Contract

Fill in once decisions are locked - this is what Pass 2 reads first:

- `INCOMPLETE` classification: [worked-day / separate branch / other - state rule]
- Non-work status set: `ABSENT`, `LEAVE`, `REST_DAY` (confirmed unchanged unless
  Decision 1 adds another)
- Reason category source: [fixed UI enum / schema-backed list]
- Canonical term: [`time correction` / `attendance correction`]
- Provenance fields to expose in UI: [ledger type + actor / expanded list - state
  it]
- Service extraction: [dedicated module / controller-local]
- Refresh behavior: [always-refresh / conditional - state condition]
- PRD status: [provided / code-is-truth-confirmed, with date and owner]

## Handover to Pass 2

- Finalized Correction Contract (above), fully filled in - no blanks.
- Flag: any decision that was defaulted rather than explicitly answered, so Pass
  7 can re-surface it during final sign-off rather than letting a default go
  unnoticed permanently.
- Blocker flag: if any of Decisions 1, 2, 3, 4, or 5 remain unanswered, this
  pass does not produce a usable handover - stop here and report the blocker
  instead of passing incomplete decisions forward.
