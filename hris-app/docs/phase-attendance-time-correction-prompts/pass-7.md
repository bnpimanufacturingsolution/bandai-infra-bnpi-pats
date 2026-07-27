# Pass 7 - Validation, WWG Sync, and Handoff Report

## Input (from Pass 6)

Read Pass 6's Handover before doing anything else. You need the full test suite
results, the source-leakage confirmation, and any documented test gaps. Also
gather every prior pass's Handover (Pass 1 through 6) - this pass is the one
that checks the whole chain against the original goal, not just the most recent
step.

## Objective

Run final validation across the complete consolidated workflow, reconcile any
confirmed behavior against WWG documentation, close out the one remaining open
item from Pass 1 (the PRD question, if still unresolved), and produce the
handoff report.

## Action

- Re-run the full regression suite from Pass 6 as a final confirmation, not just
  trusting the earlier handover.
- Cross-check final behavior against the WWG guardrails stated in
  `chain-run.md`'s boundaries: confirm `EmployeePayroll.timesheetSnapshot` was
  never written to across any pass, confirm `AttendanceObligation` and effective
  `Timesheetline` refresh behavior matches what Pass 1's contract specified.
- If any confirmed behavior from the original Phase 0 audit, or anything
  discovered during Passes 2-6, differs from existing WWG documentation, update
  those docs now. Do not leave a known discrepancy undocumented.
- Resolve the PRD question (Pass 1, Decision 7) explicitly: either the owner
  supplied the file at some point during this chain, or the 5-business-day
  default fired and a written confirmation exists. Record which one happened and
  where the confirmation lives.
- Check every defaulted decision flagged back in Pass 1's handover - confirm
  each one was either later upgraded to an explicit owner answer, or is being
  accepted as a permanent default with that reasoning on record.

## Validation Gate

Answer each of these directly, with evidence, before assigning a final status:

1. Was the goal met? - both controllers route through one shared service, with
   `source` affecting only provenance/labeling (cite Pass 3 and Pass 4 evidence).
2. Was scope respected? - check the full file change list across all passes
   against `chain-run.md`'s boundaries list.
3. Were unrelated files avoided? - confirm via the cumulative diff.
4. Were required checks run? - Pass 2, 3, and 6's test suites.
5. Did any checks fail? - if yes, this cannot be FULFILLED.
6. Were warnings documented? - gather from every pass's Handover flags.
7. Is evidence available? - test output, diffs, WWG doc diff, Decision Record
   from Pass 1.
8. Is another loop needed? - only if a check failed or a blocker was found.
9. Is this safe to hand off for review/commit? - depends on 1-8.

## Final Status

Choose exactly one:

FULFILLED / FULFILLED WITH WARNINGS / PARTIALLY FULFILLED / READY FOR REVIEW /
READY WITH WARNINGS / BLOCKED / VALIDATION FAILED / NOT ACCEPTED

Do not select FULFILLED if any required validation was skipped, failed, or left
as an unresolved default from Pass 1.

## Final Handoff Report

### Final Status
[STATUS]

### Summary
[WHAT WAS DONE ACROSS ALL 7 PASSES]

### Files Changed
* [FILE] - [WHY] - [WHICH PASS]

### Files Intentionally Not Changed
* [FILE/AREA] - [WHY]

### Validation Performed
* [CHECK/COMMAND] - [PASS/FAIL/WARNING] - [WHICH PASS PRODUCED IT]

### Evidence
* [TEST OUTPUT / DIFF / WWG DOC DIFF / DECISION RECORD FROM PASS 1]

### Warnings / Risks
* [CARRIED FROM chain-run.md's OPEN RISKS, PLUS ANYTHING NEW FOUND DURING THIS
  CHAIN]

### Acceptance Review
[WAS THE GOAL MET, AND WHY - REFERENCE THE VALIDATION GATE ANSWERS ABOVE]

### Recommended Next Step
[NEXT BOARD ITEM / FOLLOW-UP / FIX BLOCKER]

## Handover (end of chain)

This is the last pass - there is no Pass 8. The handover here is to whoever
reads the Final Handoff Report: the next board item in sequence
(`absence-to-sick-leave conversion`), or a fix-blocker loop back into whichever
pass failed validation, if status is not FULFILLED.
