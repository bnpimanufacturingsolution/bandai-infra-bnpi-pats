# WWG Generate Governance Report

## Summary

Generation completed using safe generated-section and WWG-owned file rules.

## Command

`wwg generate-governance --target C:\Users\Renz\Documents\hris\hris-api`

## Target

.

## Source Artifacts Read

- None.

## Files Created

- governance/README.md
- governance/quality-gates.md
- governance/project-readiness-checklist.md
- governance/test-plan.md
- governance/security-review.md
- governance/release-checklist.md
- governance/audit-log.md
- governance/drift-detection.md
- governance/human-approval-matrix.md
- governance/maintenance-review-checklist.md
- governance/canonical-artifact-review.md
- governance/context-drift-detection.md
- governance/public-surface-review.md
- governance/public-discovery-review.md
- governance/regression-guardrail-catalog.md
- governance/operational-readiness-review.md
- governance/truth-conflict-resolution.md
- governance/enforcement-levels.md
- governance/evidence-standards.md
- governance/recommendation-registry.md
- governance/recommendation-policy.md

## Files Updated

- None.

## Files Skipped

- governance/truth-capture.md - Existing file has no safe generated section.
- governance/drift-guard.md - Existing file has no safe generated section.

## Generated Sections Updated

- None.

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

- governance/drift-guard.md: Existing file has no safe generated section.
- governance/truth-capture.md: Existing file has no safe generated section.


## Validation Performed

- Verified wwg.project.yaml exists and can be parsed.
- Compiled generation inputs deterministically without LLM calls.
- Applied generated-section safety rules.
- Recorded markdown and JSON generation reports.

## WWG Truth Synchronization

- Task mode: generation
- New truth detected: NO
- Wiki updated: NO / N/A
- Workspace updated: NO / N/A
- Governance review completed: YES
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
