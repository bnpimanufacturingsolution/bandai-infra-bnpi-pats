# Generated Project Upgrade Apply

## Executive Summary

Explicit upgrade apply flags were used. The read-only audit default remains preserved.

- Safe adds applied: 0
- Generated sections updated: 1
- Skipped: 0
- Refused: 14

## Explicit Approval / Flag Used

`wwg upgrade --apply-generated-sections`

## Files Applied

- .wwg/governance/drift-guard.md | generated-section | applied | section: WWG_ADOPTION_DRIFT_GUARD - Generated section was updated from merge guidance candidate snippet.

## Files Skipped

- None.

## Files Refused

- .wwg/wiki/project-truth.md | merge-review | refused - File requires merge/review and was not updated automatically.
- .wwg/wiki/terminology.md | merge-review | refused - File requires merge/review and was not updated automatically.
- .wwg/workspace/context/project-context.md | merge-review | refused - File requires merge/review and was not updated automatically.
- AGENTS.md | merge-review | refused - File requires merge/review and was not updated automatically.
- README.md | merge-review | refused - File requires merge/review and was not updated automatically.
- .wwg/wiki/project-truth.md | never-overwrite | refused - Project Truth is project-specific canonical truth.
- .wwg/wiki/terminology.md | never-overwrite | refused - Terminology contains accepted project vocabulary.
- CHANGELOG.md | never-overwrite | refused - Changelog history is project evidence.
- .wwg/reports/** | never-overwrite | refused - Reports preserve evidence and historical decisions.
- custom governance rules | never-overwrite | refused - Local governance may encode approvals, compliance, or safety rules.
- custom skills | never-overwrite | refused - Team-modified skills may contain local operating contracts.
- user-written docs | never-overwrite | refused - Project documentation may be customer-facing or team-specific.
- secrets/config files | never-overwrite | refused - Secrets and deployment config can change security posture.
- files outside generated markers | never-overwrite | refused - Unmarked content has no reliable generated-section boundary.

## Integrity Checks

- PASS reports/generated-project-upgrade-review.json is valid JSON: ok
- PASS reports/generated-project-upgrade-candidates.json is valid JSON: ok
- PASS reports/generated-project-merge-guidance.json is valid JSON: ok
- PASS review report target path matches current project: C:\Users\Renz\Documents\hris\hris-api
- PASS candidate report target path matches current project: C:\Users\Renz\Documents\hris\hris-api
- PASS merge guidance report target path matches current project: C:\Users\Renz\Documents\hris\hris-api
- PASS candidate report is read-only: ok
- PASS candidate report requires human review: ok
- PASS merge guidance is read-only: ok

## Validation Recommendation / Results

- Recommendation: Run `wwg validate`, then rerun `wwg audit` after any applied upgrade-safe additions or generated-section updates.
- Validation was not run by the apply flow.
- Read-only audit remains the default; this apply flow runs only when explicit apply flags are provided.

## Never-Overwrite Protections

- .wwg/wiki/project-truth.md | never-overwrite | refused - Project Truth is project-specific canonical truth.
- .wwg/wiki/terminology.md | never-overwrite | refused - Terminology contains accepted project vocabulary.
- CHANGELOG.md | never-overwrite | refused - Changelog history is project evidence.
- .wwg/reports/** | never-overwrite | refused - Reports preserve evidence and historical decisions.
- custom governance rules | never-overwrite | refused - Local governance may encode approvals, compliance, or safety rules.
- custom skills | never-overwrite | refused - Team-modified skills may contain local operating contracts.
- user-written docs | never-overwrite | refused - Project documentation may be customer-facing or team-specific.
- secrets/config files | never-overwrite | refused - Secrets and deployment config can change security posture.
- files outside generated markers | never-overwrite | refused - Unmarked content has no reliable generated-section boundary.

## Vorter Boundary Review

- Apply flow does not touch `.vorter/`.
- Apply flow does not claim WWG activates, loads, injects, mounts, routes, or executes runtime skills.

## Candidate Reports Used

- .wwg/reports/generated-project-upgrade-review.json
- .wwg/reports/generated-project-upgrade-candidates.json
- .wwg/reports/generated-project-merge-guidance.json

## Candidate Artifacts Used

- None.

## Next Actions

- Review the apply report.
- Run validation.
- Rerun `wwg audit` to confirm remaining merge/review items.
