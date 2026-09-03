# Generated Project Merge Guidance

## Executive Summary

Merge guidance was generated for review only. Applied changes: 0.

- Guidance items: 6
- Files reviewed: 13

## Read-Only Guarantee

This guidance does not modify target files. Review and apply snippets manually only after confirming local project truth.

## Guidance Items

### .wwg/governance/drift-guard.md

- Category: drift-guard
- Risk: medium
- Human review required: true
- Finding: governance-missing-purpose: Governance file is missing 'Purpose'.; governance-missing-applies-to: Governance file is missing 'Applies To'.; governance-missing-rules: Governance file is missing 'Rules'.; governance-missing-enforcement: Governance file is missing 'Enforcement'.; governance-missing-reports-artifacts: Governance file is missing 'Reports / Artifacts'.; governance-missing-references: Governance file is missing 'References'.
- Recommended action: Review and merge manually. Do not apply an automatic overwrite.
- Preserve sections: local safety rules, truth-loop requirements, validation requirements, approval gates
- Never overwrite: safety gates, approval gates, truth-loop rules, validation requirements
- Canonical references: .wwg/wiki/project-truth.md, .wwg/wiki/terminology.md, .wwg/governance/drift-guard.md

Candidate snippet for manual review only:

```md
## Applies To

- agents
- maintainers
- docs, governance, context, and skill changes

## Rules

### Must

- Preserve canonical truth and validation requirements.

### Must Not

- Do not overwrite Project Truth or Terminology.

## Enforcement

- Stop and report safety-critical conflicts.

## Reports / Artifacts

- Record upgrade evidence under `.wwg/reports/`.

<!-- Candidate snippet only. Preserve stricter local governance. -->
```

### .wwg/wiki/project-truth.md

- Category: canonical-truth
- Risk: high
- Human review required: true
- Finding: File either carries project-specific truth, lacks reliable unchanged-template evidence, or has upgrade-readiness findings.
- Recommended action: Review and merge manually. Do not apply an automatic overwrite.
- Preserve sections: all accepted canonical truth
- Never overwrite: canonical Project Truth body, accepted decisions, project-specific facts
- Canonical references: .wwg/wiki/project-truth.md, .wwg/wiki/terminology.md, .wwg/governance/drift-guard.md

Candidate snippet for manual review only:

```md
<!-- Candidate guidance only. Review canonical sources and preserve project-specific content before editing. -->
```

### .wwg/wiki/terminology.md

- Category: canonical-truth
- Risk: high
- Human review required: true
- Finding: File either carries project-specific truth, lacks reliable unchanged-template evidence, or has upgrade-readiness findings.
- Recommended action: Review and merge manually. Do not apply an automatic overwrite.
- Preserve sections: all accepted canonical truth
- Never overwrite: accepted canonical terms, project-specific vocabulary
- Canonical references: .wwg/wiki/project-truth.md, .wwg/wiki/terminology.md, .wwg/governance/drift-guard.md

Candidate snippet for manual review only:

```md
<!-- Candidate guidance only. Review canonical sources and preserve project-specific content before editing. -->
```

### .wwg/workspace/context/project-context.md

- Category: active-context
- Risk: medium
- Human review required: true
- Finding: context-missing-purpose: Context file is missing 'Purpose'.; context-missing-scope: Context file is missing 'Scope'.; context-missing-current-state: Context file is missing 'Current State'.; context-missing-canonical-terms: Context file is missing 'Canonical Terms'.; context-missing-decisions: Context file is missing 'Decisions'.; context-missing-constraints: Context file is missing 'Constraints'.; context-missing-references: Context file is missing 'References'.
- Recommended action: Review and merge manually. Do not apply an automatic overwrite.
- Preserve sections: current decisions, constraints, project-specific terms, canonical references
- Never overwrite: human-authored content outside generated markers, project-specific truth, accepted decisions
- Canonical references: .wwg/wiki/project-truth.md, .wwg/wiki/terminology.md, .wwg/governance/drift-guard.md, .wwg/governance/context-writer.md

Candidate snippet for manual review only:

```md
## Purpose

- Define active context for repeated agent loading.

## Current State

- Requires human review: summarize current accepted state.

## Constraints

### Must

- Link to canonical truth instead of duplicating long history.

<!-- Candidate snippet only. Preserve project-specific decisions. -->
```

### AGENTS.md

- Category: agent-instruction
- Risk: medium
- Human review required: true
- Finding: agent-instruction-missing-required-reading: Agent Instruction file is missing 'Required Reading'.; agent-instruction-missing-operating-rules: Agent Instruction file is missing 'Operating Rules'.
- Recommended action: Review and merge manually. Do not apply an automatic overwrite.
- Preserve sections: local rules, required reading, safety gates, handoff rules
- Never overwrite: human-authored content outside generated markers, project-specific truth, accepted decisions
- Canonical references: .wwg/wiki/project-truth.md, .wwg/wiki/terminology.md, .wwg/governance/drift-guard.md, .wwg/governance/markdown-contracts.md

Candidate snippet for manual review only:

```md
## Required Reading

- `.wwg/wiki/project-truth-summary.md`
- `.wwg/wiki/terminology-summary.md`
- `.wwg/workspace/current-task.md`
- `.wwg/governance/drift-guard.md`

## Safety Gates

- Do not overwrite project-specific truth.
- Stop and report conflicts with canonical truth.

## Handoff / Reporting Rules

- Report changes, validation, risks, and unresolved ambiguity.

<!-- Candidate snippet only. Preserve local instructions. -->
```

### README.md

- Category: public-doc
- Risk: medium
- Human review required: true
- Finding: File either carries project-specific truth, lacks reliable unchanged-template evidence, or has upgrade-readiness findings.
- Recommended action: Review and merge manually. Do not apply an automatic overwrite.
- Preserve sections: user-authored content, local decisions, accepted evidence
- Never overwrite: human-authored content outside generated markers, project-specific truth, accepted decisions
- Canonical references: .wwg/wiki/project-truth.md, .wwg/wiki/terminology.md, .wwg/governance/drift-guard.md

Candidate snippet for manual review only:

```md
<!-- Candidate guidance only. Review canonical sources and preserve project-specific content before editing. -->
```

## WWG Truth Synchronization

- Task mode: generated-project merge guidance
- New truth detected: NO
- Wiki updated: NO
- Workspace updated: NO
- Governance review completed: YES
- Drift status: REVIEW
- Canonical files changed:
  - None; guidance lives under reports.
- Implementation discoveries synced:
  - None; guidance requires review before promotion.
- Remaining stale context:
  - Review guidance items before applying any future edits.
