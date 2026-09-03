# Generated Project Upgrade Candidates

## Executive Summary

Candidate artifacts were generated for review only. Applied changes: 0.

- Candidate surfaces: 0
- Candidate artifacts: 0
- Merge guidance items: 8
- Human review required: true

## Read-Only Guarantee

This workflow writes reports and candidate artifacts only. It does not modify Project Truth, Terminology, compact surfaces, AGENTS, active context, Drift Guard, skills, README, changelog, user-authored docs, or `.vorter/`.

## Candidate Surface Artifacts

- None.

## Candidate Surfaces

- None.

## Candidate Source Files

- .wwg/wiki/project-truth.md
- .wwg/wiki/terminology.md

## Uncertain Sections

- None.

## Merge Guidance Artifacts

- .wwg/reports/generated-project-merge-guidance.md
- .wwg/reports/generated-project-merge-guidance.json

## Safe Adds

- None.

## Safe Updates

- .wwg/workspace/context/project-context.md | risk: low | File contains valid WWG_GENERATED markers. Recommendation: Only generated sections may be candidates for safe update. Preserve all human content outside markers.

## Never Overwrite

- .wwg/wiki/project-truth.md | risk: high | Project Truth is project-specific canonical truth. Recommendation: Review and merge manually. Never replace the canonical truth body wholesale.
- .wwg/wiki/terminology.md | risk: high | Terminology contains accepted project vocabulary. Recommendation: Review and merge manually. Never replace accepted terminology wholesale.
- CHANGELOG.md | risk: high | Changelog history is project evidence. Recommendation: Append only when appropriate. Never overwrite release history.
- .wwg/reports/** | risk: high | Reports preserve evidence and historical decisions. Recommendation: Keep reports as evidence. Do not rewrite historical reports during upgrades.
- custom governance rules | risk: high | Local governance may encode approvals, compliance, or safety rules. Recommendation: Merge carefully and preserve stricter local rules.
- custom skills | risk: medium | Team-modified skills may contain local operating contracts. Recommendation: Review skill changes before adopting newer defaults.
- user-written docs | risk: medium | Project documentation may be customer-facing or team-specific. Recommendation: Treat human-authored docs as merge/review required.
- secrets/config files | risk: high | Secrets and deployment config can change security posture. Recommendation: Do not overwrite secrets, environment files, credentials, or deployment config.
- files outside generated markers | risk: medium | Unmarked content has no reliable generated-section boundary. Recommendation: Require merge/review unless the user explicitly approves the edit.

## Vorter Boundary Findings

- None.

## Recommended Next Actions

- Review candidate surfaces before copying them into `.wwg/wiki/`.
- Use merge guidance to update AGENTS, active context, Drift Guard, or skills manually.
- Do not overwrite Project Truth, Terminology, accepted decisions, changelog history, custom governance, custom skills, user-written docs, reports/evidence, secrets, config, or `.vorter/`.
- Run validation after any future approved adoption of candidate content.

## WWG Truth Synchronization

- Task mode: generated-project upgrade candidate workflow
- New truth detected: NO
- Wiki updated: NO
- Workspace updated: NO
- Governance review completed: YES
- Drift status: REVIEW
- Canonical files changed:
  - None; candidates live under reports.
- Implementation discoveries synced:
  - None; candidate content requires review before promotion.
- Remaining stale context:
  - Review candidate surfaces and merge guidance before applying any future upgrade.
