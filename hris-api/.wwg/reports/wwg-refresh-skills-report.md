# WWG Refresh Skills Report

## Summary

Generation completed using safe generated-section and WWG-owned file rules.

## Command

`wwg dev refresh skills --target C:\Users\Renz\Documents\hris\hris-api`

## Target

.

## Skill Sources Read

- None.

## Files Created

- None.

## Files Updated

- .wwg/config/skill-manifest.yaml

## Files Skipped

- workspace/skills/skill-index.md - Generated section SKILL_INDEX was not found.

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

- .wwg/config/skill-manifest.yaml: Skill Manifest records project skill state only; recommended/reference-only skills are not runtime-active.
- workspace/skills/skill-index.md: Generated section SKILL_INDEX was not found.

## Governed Skill Copy Plan

Governed skill copy plan:
- Will copy 5 core/compatibility-core skills for new projects.
- Will reference 6 compatibility-domain skills instead of copying them for new projects.
- Existing projects will preserve copied compatibility-domain files.
- Cleanup runs only when `wwg maintain --apply-skill-cleanup` is explicitly requested.
- Recommended/reference-only skills are not runtime-active skills.
- Preserved copied compatibility-domain skills detected for this project: none.


## Validation Performed

- Verified wwg.project.yaml exists and can be parsed.
- Compiled generation inputs deterministically without LLM calls.
- Applied generated-section safety rules.
- Recorded markdown and JSON generation reports.
- Generated project-local Skill Manifest from profile recommendations, registry metadata, local evidence, and governed compatibility copy policy without activating skills.

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
