# Generated Project Upgrade Review

## Executive Summary

Risk level: medium.
Safe additions: 2.
Safe updates: 1.
Merge/review required: 5.
Never-overwrite entries: 9.

## Read-Only Guarantee

This review is read-only for project files. WWG writes only this report and its JSON companion. It does not add compact surfaces, rewrite Project Truth, rewrite Terminology, compact AGENTS, change Drift Guard, change skills, or mutate `.vorter/`.

## Detected Project State

- Project path: C:\Users\anoni\OneDrive\Desktop\PROJECT_TRUTH_HYPERV_FRESH
- Detected WWG version: 0.6.6
- Generated template version: 0.6.6
- Checked files: 5

## Missing Compact Surfaces

- .wwg/wiki/project-truth-summary.md | risk: low | Compact active surface is missing. Recommendation: Add a compact summary surface in a future approved action. The full canonical file must remain authoritative.
- .wwg/wiki/terminology-summary.md | risk: low | Compact active surface is missing. Recommendation: Add a compact summary surface in a future approved action. The full canonical file must remain authoritative.

## Safe Additions

- .wwg/wiki/project-truth-summary.md | risk: low | Compact active surface is missing. Recommendation: Add a compact summary surface in a future approved action. The full canonical file must remain authoritative.
- .wwg/wiki/terminology-summary.md | risk: low | Compact active surface is missing. Recommendation: Add a compact summary surface in a future approved action. The full canonical file must remain authoritative.

## Safe Updates If Unchanged From Template

- AGENTS.md | risk: low | File contains valid WWG_GENERATED markers. Recommendation: Only generated sections may be candidates for safe update. Preserve all human content outside markers.

## Merge/Review Required

- .wwg/governance/drift-guard.md | risk: medium | File either carries project-specific truth, lacks reliable unchanged-template evidence, or has upgrade-readiness findings. Recommendation: Review and merge manually. Do not apply an automatic overwrite.
- .wwg/wiki/project-truth.md | risk: high | File either carries project-specific truth, lacks reliable unchanged-template evidence, or has upgrade-readiness findings. Recommendation: Review and merge manually. Do not apply an automatic overwrite.
- .wwg/wiki/terminology.md | risk: high | File either carries project-specific truth, lacks reliable unchanged-template evidence, or has upgrade-readiness findings. Recommendation: Review and merge manually. Do not apply an automatic overwrite.
- AGENTS.md | risk: medium | File either carries project-specific truth, lacks reliable unchanged-template evidence, or has upgrade-readiness findings. Recommendation: Review and merge manually. Do not apply an automatic overwrite.
- README.md | risk: medium | File either carries project-specific truth, lacks reliable unchanged-template evidence, or has upgrade-readiness findings. Recommendation: Review and merge manually. Do not apply an automatic overwrite.

## Never-Overwrite Files

- .wwg/wiki/project-truth.md | risk: high | Project Truth is project-specific canonical truth. Recommendation: Review and merge manually. Never replace the canonical truth body wholesale.
- .wwg/wiki/terminology.md | risk: high | Terminology contains accepted project vocabulary. Recommendation: Review and merge manually. Never replace accepted terminology wholesale.
- CHANGELOG.md | risk: high | Changelog history is project evidence. Recommendation: Append only when appropriate. Never overwrite release history.
- .wwg/reports/** | risk: high | Reports preserve evidence and historical decisions. Recommendation: Keep reports as evidence. Do not rewrite historical reports during upgrades.
- custom governance rules | risk: high | Local governance may encode approvals, compliance, or safety rules. Recommendation: Merge carefully and preserve stricter local rules.
- custom skills | risk: medium | Team-modified skills may contain local operating contracts. Recommendation: Review skill changes before adopting newer defaults.
- user-written docs | risk: medium | Project documentation may be customer-facing or team-specific. Recommendation: Treat human-authored docs as merge/review required.
- secrets/config files | risk: high | Secrets and deployment config can change security posture. Recommendation: Do not overwrite secrets, environment files, credentials, or deployment config.
- files outside generated markers | risk: medium | Unmarked content has no reliable generated-section boundary. Recommendation: Require merge/review unless the user explicitly approves the edit.

## Active Contract Findings

- MEDIUM agent-instruction-missing-purpose | AGENTS.md - Agent Instruction file is missing 'Purpose'. Recommendation: Add 'Purpose' during a reviewed merge. Do not overwrite project-specific content.
- MEDIUM agent-instruction-missing-required-reading | AGENTS.md - Agent Instruction file is missing 'Required Reading'. Recommendation: Add 'Required Reading' during a reviewed merge. Do not overwrite project-specific content.
- MEDIUM agent-instruction-missing-operating-rules | AGENTS.md - Agent Instruction file is missing 'Operating Rules'. Recommendation: Add 'Operating Rules' during a reviewed merge. Do not overwrite project-specific content.
- MEDIUM agent-instruction-missing-safety-gates | AGENTS.md - Agent Instruction file is missing 'Safety Gates'. Recommendation: Add 'Safety Gates' during a reviewed merge. Do not overwrite project-specific content.
- MEDIUM agent-instruction-missing-handoff-reporting-rules | AGENTS.md - Agent Instruction file is missing 'Handoff / Reporting Rules'. Recommendation: Add 'Handoff / Reporting Rules' during a reviewed merge. Do not overwrite project-specific content.
- MEDIUM agent-instruction-missing-references | AGENTS.md - Agent Instruction file is missing 'References'. Recommendation: Add 'References' during a reviewed merge. Do not overwrite project-specific content.
- MEDIUM governance-missing-purpose | .wwg/governance/drift-guard.md - Governance file is missing 'Purpose'. Recommendation: Add 'Purpose' during a reviewed merge. Do not overwrite project-specific content.
- MEDIUM governance-missing-applies-to | .wwg/governance/drift-guard.md - Governance file is missing 'Applies To'. Recommendation: Add 'Applies To' during a reviewed merge. Do not overwrite project-specific content.
- MEDIUM governance-missing-rules | .wwg/governance/drift-guard.md - Governance file is missing 'Rules'. Recommendation: Add 'Rules' during a reviewed merge. Do not overwrite project-specific content.
- MEDIUM governance-missing-enforcement | .wwg/governance/drift-guard.md - Governance file is missing 'Enforcement'. Recommendation: Add 'Enforcement' during a reviewed merge. Do not overwrite project-specific content.
- MEDIUM governance-missing-reports-artifacts | .wwg/governance/drift-guard.md - Governance file is missing 'Reports / Artifacts'. Recommendation: Add 'Reports / Artifacts' during a reviewed merge. Do not overwrite project-specific content.
- MEDIUM governance-missing-references | .wwg/governance/drift-guard.md - Governance file is missing 'References'. Recommendation: Add 'References' during a reviewed merge. Do not overwrite project-specific content.

## Context Findings

- None.

## Skill Findings

- None.

## Governance and Drift Guard Findings

- MEDIUM governance-missing-purpose | .wwg/governance/drift-guard.md - Governance file is missing 'Purpose'. Recommendation: Add 'Purpose' during a reviewed merge. Do not overwrite project-specific content.
- MEDIUM governance-missing-applies-to | .wwg/governance/drift-guard.md - Governance file is missing 'Applies To'. Recommendation: Add 'Applies To' during a reviewed merge. Do not overwrite project-specific content.
- MEDIUM governance-missing-rules | .wwg/governance/drift-guard.md - Governance file is missing 'Rules'. Recommendation: Add 'Rules' during a reviewed merge. Do not overwrite project-specific content.
- MEDIUM governance-missing-enforcement | .wwg/governance/drift-guard.md - Governance file is missing 'Enforcement'. Recommendation: Add 'Enforcement' during a reviewed merge. Do not overwrite project-specific content.
- MEDIUM governance-missing-reports-artifacts | .wwg/governance/drift-guard.md - Governance file is missing 'Reports / Artifacts'. Recommendation: Add 'Reports / Artifacts' during a reviewed merge. Do not overwrite project-specific content.
- MEDIUM governance-missing-references | .wwg/governance/drift-guard.md - Governance file is missing 'References'. Recommendation: Add 'References' during a reviewed merge. Do not overwrite project-specific content.

## Agent Instruction Findings

- MEDIUM agent-instruction-missing-purpose | AGENTS.md - Agent Instruction file is missing 'Purpose'. Recommendation: Add 'Purpose' during a reviewed merge. Do not overwrite project-specific content.
- MEDIUM agent-instruction-missing-required-reading | AGENTS.md - Agent Instruction file is missing 'Required Reading'. Recommendation: Add 'Required Reading' during a reviewed merge. Do not overwrite project-specific content.
- MEDIUM agent-instruction-missing-operating-rules | AGENTS.md - Agent Instruction file is missing 'Operating Rules'. Recommendation: Add 'Operating Rules' during a reviewed merge. Do not overwrite project-specific content.
- MEDIUM agent-instruction-missing-safety-gates | AGENTS.md - Agent Instruction file is missing 'Safety Gates'. Recommendation: Add 'Safety Gates' during a reviewed merge. Do not overwrite project-specific content.
- MEDIUM agent-instruction-missing-handoff-reporting-rules | AGENTS.md - Agent Instruction file is missing 'Handoff / Reporting Rules'. Recommendation: Add 'Handoff / Reporting Rules' during a reviewed merge. Do not overwrite project-specific content.
- MEDIUM agent-instruction-missing-references | AGENTS.md - Agent Instruction file is missing 'References'. Recommendation: Add 'References' during a reviewed merge. Do not overwrite project-specific content.

## Vorter Boundary Findings

- None.

## Candidate Workflow

- Not requested. Run `wwg audit --upgrade-candidates --target <project>` to write candidate surfaces and merge guidance under reports.

## Recommended Actions

- Plan an approved safe-add step for missing compact Project Truth and Terminology surfaces.
- Limit safe updates to valid WWG_GENERATED sections and preserve all content outside markers.
- Prepare merge guidance for files requiring review; do not overwrite project-specific truth.
- Run validation after any future approved upgrade action.

## Validation Notes

- Generated-project upgrade readiness review completed in read-only mode.
- No project truth, context, governance, skill, AGENTS, or compact-surface files were changed.

## WWG Truth Synchronization

- Task mode: generated-project upgrade readiness review
- New truth detected: NO
- Wiki updated: NO / N/A
- Workspace updated: NO
- Governance review completed: YES
- Drift status: REVIEW
- Canonical files changed:
  - None by this read-only review.
- Implementation discoveries synced:
  - None by this read-only review; findings must be reviewed before promotion into project truth.
- Remaining stale context:
  - Review merge/review findings before applying compact active-surface upgrades.

## Next Step

Review safe additions and merge/review items before requesting an approved upgrade action.
