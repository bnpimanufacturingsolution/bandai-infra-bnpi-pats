# WWG Generate Workspace Report

## Summary

Generation completed using safe generated-section and WWG-owned file rules.

## Command

`wwg generate-workspace --target C:\Users\1biss\Documents\Projects\hris-app`

## Target

.

## Source Artifacts Read

- wiki/principles/README.md

## Files Created

- workspace/context/project-context.md
- workspace/context/architecture-context.md
- workspace/context/domain-context.md
- workspace/context/ux-context.md
- workspace/context/governance-context.md
- workspace/context/context-maintenance-matrix.md
- workspace/prompts/task-router.md
- workspace/prompts/feature-implementation.md
- workspace/prompts/bug-fix.md
- workspace/prompts/runtime-infrastructure.md
- workspace/prompts/public-surface-update.md
- workspace/prompts/public-discovery-maintenance.md
- workspace/prompts/production-monitoring.md
- workspace/agents/codex.md
- workspace/agents/claude-code.md
- workspace/agents/cursor.md
- workspace/agents/vscode.md
- workspace/AGENTS.md
- workspace/skills/change-classifier.skill.md
- workspace/skills/context-skill-maintenance.skill.md
- workspace/skills/drift-detector.skill.md
- workspace/skills/regression-guardrail-maintenance.skill.md
- workspace/skills/task-router.skill.md
- workspace/skills/README.md
- workspace/skills/skill-index.md
- .wwg/config/skill-manifest.yaml

## Files Updated

- None.

## Files Skipped

- workspace/current-task.md - Existing file has no safe generated section.
- AGENTS.md - Generated section PROJECT_CONTEXT was not found.
- AGENTS.md - Generated section SELECTED_PROFILES was not found.
- AGENTS.md - Generated section MAINTENANCE_CONTRACT was not found.

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
- AGENTS.md: Generated section MAINTENANCE_CONTRACT was not found.
- AGENTS.md: Generated section PROJECT_CONTEXT was not found.
- AGENTS.md: Generated section SELECTED_PROFILES was not found.
- workspace/current-task.md: Existing file has no safe generated section.

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
