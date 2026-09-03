# Skill Cleanup Review

## Legacy Copied Skill Cleanup Review

WWG found copied compatibility-domain skills that are preserved for existing-project safety.

No files were removed.

## Summary

- Manifest present: no
- Review candidates: 0
- Preserve required: 0
- Needs manual review: 0
- Already reference-only: 6
- Not applicable: 5
- Apply mode: available through `wwg maintain --apply-skill-cleanup --target .`
- Runtime activation: not performed by WWG; future Vorter responsibility

## Review Candidates

- None.

## Preserve Required

- None.

## Manual Review

- None.

## Already Reference-Only

| Skill | Status | Current | Future | Manifest State | Path | Reason | Recommended Action |
| --- | --- | --- | --- | --- | --- | --- | --- |
| software.bug-fix | reference_only | none | reference | manifest_missing | n/a | Skill is not physically copied in the workspace. | Keep as reference-only unless future evidence changes the recommendation. |
| software.feature-implementation | reference_only | none | reference | manifest_missing | n/a | Skill is not physically copied in the workspace. | Keep as reference-only unless future evidence changes the recommendation. |
| software.production-monitoring | reference_only | none | reference | manifest_missing | n/a | Skill is not physically copied in the workspace. | Keep as reference-only unless future evidence changes the recommendation. |
| public.public-discovery-maintenance | reference_only | none | reference | manifest_missing | n/a | Skill is not physically copied in the workspace. | Keep as reference-only unless future evidence changes the recommendation. |
| public.public-surface-update | reference_only | none | reference | manifest_missing | n/a | Skill is not physically copied in the workspace. | Keep as reference-only unless future evidence changes the recommendation. |
| software.runtime-infrastructure | reference_only | none | reference | manifest_missing | n/a | Skill is not physically copied in the workspace. | Keep as reference-only unless future evidence changes the recommendation. |

## Not Applicable

| Skill | Status | Current | Future | Manifest State | Path | Reason | Recommended Action |
| --- | --- | --- | --- | --- | --- | --- | --- |
| core.change-classifier | already_clean | none | copied | manifest_missing | n/a | No legacy copied skill file is physically present. | No cleanup action is available. |
| core.context-skill-maintenance | already_clean | none | copied | manifest_missing | n/a | No legacy copied skill file is physically present. | No cleanup action is available. |
| core.drift-detector | already_clean | none | copied | manifest_missing | n/a | No legacy copied skill file is physically present. | No cleanup action is available. |
| core.regression-guardrail-maintenance | already_clean | none | copied | manifest_missing | n/a | No legacy copied skill file is physically present. | No cleanup action is available. |
| core.task-router | already_clean | none | copied | manifest_missing | n/a | No legacy copied skill file is physically present. | No cleanup action is available. |

## Review Rules

- Cleanup is explicit.
- Cleanup is review-first and applied only when `--apply-skill-cleanup` is provided.
- WWG does not delete copied legacy skills during the default maintenance review.
- Disabled state, disabled reasons, enabled ownership, manual overrides, user notes, promotion state, local skill paths, and local skill files are preserved.
- Core, compatibility-core, local, explicitly enabled, manually overridden, unclear, and missing-evidence skills are not cleanup candidates.
- Recommended or reference-only skills are not active runtime skills.

## Recommended Next Step

No cleanup approval is needed now.
