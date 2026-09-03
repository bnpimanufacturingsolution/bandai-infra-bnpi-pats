# Skill Cleanup Review

## Legacy Copied Skill Cleanup Review

WWG found copied compatibility-domain skills that are preserved for existing-project safety.

No files were removed.

## Summary

- Manifest present: yes
- Review candidates: 0
- Preserve required: 5
- Needs manual review: 0
- Already reference-only: 6
- Not applicable: 0
- Apply mode: available through `wwg maintain --apply-skill-cleanup --target .`
- Runtime activation: not performed by WWG; future Vorter responsibility

## Review Candidates

- None.

## Preserve Required

| Skill | Status | Current | Future | Manifest State | Path | Reason | Recommended Action |
| --- | --- | --- | --- | --- | --- | --- | --- |
| core.change-classifier | preserved_protected | copied | copied | enabled | .wwg/workspace/skills/change-classifier.skill.md | Core or compatibility-core skills are not cleanup candidates. | Keep copied or referenced according to core compatibility policy. |
| core.context-skill-maintenance | preserved_protected | copied | copied | enabled | .wwg/workspace/skills/context-skill-maintenance.skill.md | Core or compatibility-core skills are not cleanup candidates. | Keep copied or referenced according to core compatibility policy. |
| core.drift-detector | preserved_protected | copied | copied | enabled | .wwg/workspace/skills/drift-detector.skill.md | Core or compatibility-core skills are not cleanup candidates. | Keep copied or referenced according to core compatibility policy. |
| core.regression-guardrail-maintenance | preserved_protected | copied | copied | enabled | .wwg/workspace/skills/regression-guardrail-maintenance.skill.md | Core or compatibility-core skills are not cleanup candidates. | Keep copied or referenced according to core compatibility policy. |
| core.task-router | preserved_protected | copied | copied | enabled | .wwg/workspace/skills/task-router.skill.md | Core or compatibility-core skills are not cleanup candidates. | Keep copied or referenced according to core compatibility policy. |

## Manual Review

- None.

## Already Reference-Only

| Skill | Status | Current | Future | Manifest State | Path | Reason | Recommended Action |
| --- | --- | --- | --- | --- | --- | --- | --- |
| software.bug-fix | reference_only | reference | reference | recommended | n/a | Skill is not physically copied in the workspace. | Keep as reference-only unless future evidence changes the recommendation. |
| software.feature-implementation | reference_only | reference | reference | recommended | n/a | Skill is not physically copied in the workspace. | Keep as reference-only unless future evidence changes the recommendation. |
| software.production-monitoring | reference_only | none | reference | missing | n/a | Skill is not physically copied in the workspace. | Keep as reference-only unless future evidence changes the recommendation. |
| public.public-discovery-maintenance | reference_only | reference | reference | recommended | n/a | Skill is not physically copied in the workspace. | Keep as reference-only unless future evidence changes the recommendation. |
| public.public-surface-update | reference_only | reference | reference | recommended | n/a | Skill is not physically copied in the workspace. | Keep as reference-only unless future evidence changes the recommendation. |
| software.runtime-infrastructure | reference_only | reference | reference | recommended | n/a | Skill is not physically copied in the workspace. | Keep as reference-only unless future evidence changes the recommendation. |

## Not Applicable

- None.

## Review Rules

- Cleanup is explicit.
- Cleanup is review-first and applied only when `--apply-skill-cleanup` is provided.
- WWG does not delete copied legacy skills during the default maintenance review.
- Disabled state, disabled reasons, enabled ownership, manual overrides, user notes, promotion state, local skill paths, and local skill files are preserved.
- Core, compatibility-core, local, explicitly enabled, manually overridden, unclear, and missing-evidence skills are not cleanup candidates.
- Recommended or reference-only skills are not active runtime skills.

## Recommended Next Step

No cleanup approval is needed now.
