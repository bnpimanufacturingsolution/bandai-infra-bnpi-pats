# WWG Refresh Context Report

## Summary

Generation completed using safe generated-section and WWG-owned file rules.

## Command

`wwg refresh-context --target C:\Users\1biss\Documents\Projects\hris-api`

## Target

.

## Source Wiki Artifacts Read

- wiki/12-maintenance/self-maintenance-loop.md
- wiki/principles/README.md
- wiki/principles/adopted-principles.md

## Context Files Created

- None.

## Context Files Updated

- None.

## Files Skipped

- workspace/context/project-context.md - Generated section COMPILED_CONTEXT was not found.

## Missing Canonical Sources

- wiki/12-maintenance/context-maintenance-matrix.md
- wiki/12-maintenance/drift-policy.md
- wiki/12-maintenance/maintenance-contract.md
- wiki/index.md

## Principle Review

- Principles reviewed:
  - Source Wiki artifacts and generated agent/governance outputs were checked for principle references.
- Principles updated:
  - None by generation.
- Candidate principle changes:
  - None.
- Principle drift concerns:
  - Review warnings above if principle source artifacts were skipped.

## Conflicts / Warnings

- workspace/context/project-context.md: Generated section COMPILED_CONTEXT was not found.


## Validation Performed

- Verified wwg.project.yaml exists and can be parsed.
- Compiled generation inputs deterministically without LLM calls.
- Applied generated-section safety rules.
- Recorded markdown and JSON generation reports.

## WWG Truth Synchronization

- Task mode: generation
- New truth detected: NO
- Wiki updated: NO / N/A
- Workspace updated: YES
- Governance review completed: NO / N/A
- Drift status: NONE / LOW / MEDIUM / HIGH
- Canonical files changed:
  - None by deterministic generation unless listed above.
- Implementation discoveries synced:
  - None.
- Remaining stale context:
  - Review skipped files and missing canonical sources above.

## Next Steps

- Review skipped files before using `--force`.
- Edit canonical Wiki truth before refreshing generated Workspace or Governance outputs.
