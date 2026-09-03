# WWG Report Classification Review

## Summary

- Total report-like files: 62
- Promoted/canonical: 15
- Routine generated: 23
- Historical: 0
- Backups: 8
- External/human-facing: 1
- Ambiguous: 15
- Archive candidates: 3
- Move candidates: 0
- Ignore candidates: 31

## Policy Summary

`.wwg/reports/` is the canonical native/dogfood home for promoted WWG reports, agent handoffs, promoted audit evidence, maintenance reviews, and agent-readable reports. `.wwg/reports/tmp/` and `.wwg/reports/backups/` are transient/backup spaces and should stay ignored unless evidence is explicitly promoted.

Root `reports/` is retained for historical, release, package, external-upload, and human-facing reports. Root backups are not canonical truth unless evidence is promoted into a purpose-named report.

## Classified Reports

| Path | Category | Recommended Disposition | Commit? | Ignore? | Canonical? | Risk | Reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| .wwg/reports/adoption-audit.md | promoted-dogfood-report | promote | yes | no | yes | low | Purpose-named dogfood report appears promotable; add it to the report index if it is durable evidence. |
| .wwg/reports/adoption-regression-report.json | ambiguous-json | review | no | no | no | low | JSON report-like output is not promoted by default and needs explicit classification before retention. |
| .wwg/reports/adoption-regression-report.md | ambiguous | review | no | no | no | medium | Report-like file does not match a known report policy category. |
| .wwg/reports/backups/wwg.project.20260516T125328Z.yaml | backup | ignore | no | yes | no | low | Backup reports are local/generated artifacts and should not become canonical truth in place. |
| .wwg/reports/backups/wwg.project.20260516T125351Z.yaml | backup | ignore | no | yes | no | low | Backup reports are local/generated artifacts and should not become canonical truth in place. |
| .wwg/reports/backups/wwg.project.20260516T125837Z.yaml | backup | ignore | no | yes | no | low | Backup reports are local/generated artifacts and should not become canonical truth in place. |
| .wwg/reports/backups/wwg.project.20260516T125918Z.yaml | backup | ignore | no | yes | no | low | Backup reports are local/generated artifacts and should not become canonical truth in place. |
| .wwg/reports/backups/wwg.project.20260516T130424Z.yaml | backup | ignore | no | yes | no | low | Backup reports are local/generated artifacts and should not become canonical truth in place. |
| .wwg/reports/backups/wwg.project.20260516T154454Z.yaml | backup | ignore | no | yes | no | low | Backup reports are local/generated artifacts and should not become canonical truth in place. |
| .wwg/reports/backups/wwg.project.20260516T154619Z.yaml | backup | ignore | no | yes | no | low | Backup reports are local/generated artifacts and should not become canonical truth in place. |
| .wwg/reports/backups/wwg.project.20260516T154622Z.yaml | backup | ignore | no | yes | no | low | Backup reports are local/generated artifacts and should not become canonical truth in place. |
| .wwg/reports/changelog-bump-recommendation.md | ambiguous | review | no | no | no | medium | Report-like file does not match a known report policy category. |
| .wwg/reports/changelog-preview.md | promoted-dogfood-report | promote | yes | no | yes | low | Purpose-named dogfood report appears promotable; add it to the report index if it is durable evidence. |
| .wwg/reports/context-skill-quality.json | ambiguous-json | review | no | no | no | low | JSON report-like output is not promoted by default and needs explicit classification before retention. |
| .wwg/reports/context-skill-quality.md | ambiguous | review | no | no | no | medium | Report-like file does not match a known report policy category. |
| .wwg/reports/generated-project-upgrade-review.json | ambiguous-json | review | no | no | no | low | JSON report-like output is not promoted by default and needs explicit classification before retention. |
| .wwg/reports/generated-project-upgrade-review.md | promoted-dogfood-report | promote | yes | no | yes | low | Purpose-named dogfood report appears promotable; add it to the report index if it is durable evidence. |
| .wwg/reports/readme-validation.md | ambiguous | review | no | no | no | medium | Report-like file does not match a known report policy category. |
| .wwg/reports/README.md | promoted-dogfood-report | keep | yes | no | yes | low | Report is indexed as promoted dogfood/native evidence. |
| .wwg/reports/regression-quality-report.md | promoted-dogfood-report | keep | yes | no | yes | low | Report is indexed as promoted dogfood/native evidence. |
| .wwg/reports/skill-cleanup-review.json | routine-generated-json | ignore | no | yes | no | low | Routine JSON reports are transient by default unless explicitly required by compatibility or release evidence. |
| .wwg/reports/skill-cleanup-review.md | routine-generated-command-report | ignore | no | yes | no | low | Routine generated command report should stay ignored unless promoted. |
| .wwg/reports/test-alignment-report.md | promoted-dogfood-report | keep | yes | no | yes | low | Report is indexed as promoted dogfood/native evidence. |
| .wwg/reports/wwg-adoption-plan.json | routine-generated-json | ignore | no | yes | no | low | Routine JSON reports are transient by default unless explicitly required by compatibility or release evidence. |
| .wwg/reports/wwg-adoption-plan.md | routine-generated-command-report | ignore | no | yes | no | low | Routine generated command report should stay ignored unless promoted. |
| .wwg/reports/wwg-adoption-report.json | routine-generated-json | ignore | no | yes | no | low | Routine JSON reports are transient by default unless explicitly required by compatibility or release evidence. |
| .wwg/reports/wwg-adoption-report.md | routine-generated-command-report | ignore | no | yes | no | low | Routine generated command report should stay ignored unless promoted. |
| .wwg/reports/wwg-adoption-truth-handoff.md | promoted-dogfood-report | promote | yes | no | yes | low | Purpose-named dogfood report appears promotable; add it to the report index if it is durable evidence. |
| .wwg/reports/wwg-agent-handoff.json | compatibility-json | keep | yes | no | yes | low | Handoff JSON is retained as compatibility machine-readable handoff evidence. |
| .wwg/reports/wwg-agent-handoff.md | agent-handoff | keep | yes | no | yes | low | Preferred generic Agent Handoff artifact. |
| .wwg/reports/wwg-audit-report.json | routine-generated-json | ignore | no | yes | no | low | Routine JSON reports are transient by default unless explicitly required by compatibility or release evidence. |
| .wwg/reports/wwg-audit-report.md | promoted-dogfood-report | keep | yes | no | yes | low | Report is indexed as promoted dogfood/native evidence. |
| .wwg/reports/wwg-changelog-handoff.md | promoted-dogfood-report | promote | yes | no | yes | low | Purpose-named dogfood report appears promotable; add it to the report index if it is durable evidence. |
| .wwg/reports/wwg-doctor-report.json | routine-generated-json | ignore | no | yes | no | low | Routine JSON reports are transient by default unless explicitly required by compatibility or release evidence. |
| .wwg/reports/wwg-doctor-report.md | routine-generated-command-report | ignore | no | yes | no | low | Routine generated command report should stay ignored unless promoted. |
| .wwg/reports/wwg-env-example-report.md | routine-generated-command-report | ignore | no | yes | no | low | Routine generated command report should stay ignored unless promoted. |
| .wwg/reports/wwg-existing-audit-report.json | routine-generated-json | ignore | no | yes | no | low | Routine JSON reports are transient by default unless explicitly required by compatibility or release evidence. |
| .wwg/reports/wwg-existing-audit-report.md | routine-generated-command-report | ignore | no | yes | no | low | Routine generated command report should stay ignored unless promoted. |
| .wwg/reports/wwg-generate-governance-report.json | ambiguous-json | review | no | no | no | low | JSON report-like output is not promoted by default and needs explicit classification before retention. |
| .wwg/reports/wwg-generate-governance-report.md | ambiguous | review | no | no | no | medium | Report-like file does not match a known report policy category. |
| .wwg/reports/wwg-generate-workspace-report.json | ambiguous-json | review | no | no | no | low | JSON report-like output is not promoted by default and needs explicit classification before retention. |
| .wwg/reports/wwg-generate-workspace-report.md | ambiguous | review | no | no | no | medium | Report-like file does not match a known report policy category. |
| .wwg/reports/wwg-handoff-to-codex.json | compatibility-json | keep | yes | no | yes | low | Handoff JSON is retained as compatibility machine-readable handoff evidence. |
| .wwg/reports/wwg-handoff-to-codex.md | compatibility-handoff | keep | yes | no | yes | low | Codex compatibility handoff artifact retained by policy. |
| .wwg/reports/wwg-infra-check-report.json | routine-generated-json | ignore | no | yes | no | low | Routine JSON reports are transient by default unless explicitly required by compatibility or release evidence. |
| .wwg/reports/wwg-infra-check-report.md | routine-generated-command-report | ignore | no | yes | no | low | Routine generated command report should stay ignored unless promoted. |
| .wwg/reports/wwg-infra-plan-report.md | routine-generated-command-report | ignore | no | yes | no | low | Routine generated command report should stay ignored unless promoted. |
| .wwg/reports/wwg-maintenance-review.md | routine-generated-command-report | ignore | no | yes | no | low | Routine generated command report should stay ignored unless promoted. |
| .wwg/reports/wwg-refresh-context-report.json | ambiguous-json | review | no | no | no | low | JSON report-like output is not promoted by default and needs explicit classification before retention. |
| .wwg/reports/wwg-refresh-context-report.md | ambiguous | review | no | no | no | medium | Report-like file does not match a known report policy category. |
| .wwg/reports/wwg-refresh-skills-report.json | ambiguous-json | review | no | no | no | low | JSON report-like output is not promoted by default and needs explicit classification before retention. |
| .wwg/reports/wwg-refresh-skills-report.md | ambiguous | review | no | no | no | medium | Report-like file does not match a known report policy category. |
| .wwg/reports/wwg-regression-handoff.md | promoted-dogfood-report | promote | yes | no | yes | low | Purpose-named dogfood report appears promotable; add it to the report index if it is durable evidence. |
| .wwg/reports/wwg-upgrade-plan.json | routine-generated-json | ignore | no | yes | no | low | Routine JSON reports are transient by default unless explicitly required by compatibility or release evidence. |
| .wwg/reports/wwg-upgrade-plan.md | routine-generated-command-report | ignore | no | yes | no | low | Routine generated command report should stay ignored unless promoted. |
| .wwg/reports/wwg-upgrade-report.json | routine-generated-json | ignore | no | yes | no | low | Routine JSON reports are transient by default unless explicitly required by compatibility or release evidence. |
| .wwg/reports/wwg-upgrade-report.md | routine-generated-command-report | ignore | no | yes | no | low | Routine generated command report should stay ignored unless promoted. |
| .wwg/reports/wwg-validate-report.md | promoted-dogfood-report | keep | yes | no | yes | low | Report is indexed as promoted dogfood/native evidence. |
| reports/README.md | external-upload-human-facing-report | keep | yes | no | no | low | Root reports index is retained for historical, release, package, external-upload, and human-facing report classification. |
| reports/wwg-doctor-report.md | routine-generated-command-report | archive-candidate | no | yes | no | low | Older generated root command report should be preserved until a user-approved archive pass. |
| reports/wwg-upgrade-plan.md | routine-generated-command-report | archive-candidate | no | yes | no | low | Older generated root command report should be preserved until a user-approved archive pass. |
| reports/wwg-upgrade-report.md | routine-generated-command-report | archive-candidate | no | yes | no | low | Older generated root command report should be preserved until a user-approved archive pass. |


## Promotion Candidates

- .wwg/reports/adoption-audit.md (promoted-dogfood-report, promote) - Purpose-named dogfood report appears promotable; add it to the report index if it is durable evidence.
- .wwg/reports/changelog-preview.md (promoted-dogfood-report, promote) - Purpose-named dogfood report appears promotable; add it to the report index if it is durable evidence.
- .wwg/reports/generated-project-upgrade-review.md (promoted-dogfood-report, promote) - Purpose-named dogfood report appears promotable; add it to the report index if it is durable evidence.
- .wwg/reports/wwg-adoption-truth-handoff.md (promoted-dogfood-report, promote) - Purpose-named dogfood report appears promotable; add it to the report index if it is durable evidence.
- .wwg/reports/wwg-changelog-handoff.md (promoted-dogfood-report, promote) - Purpose-named dogfood report appears promotable; add it to the report index if it is durable evidence.
- .wwg/reports/wwg-regression-handoff.md (promoted-dogfood-report, promote) - Purpose-named dogfood report appears promotable; add it to the report index if it is durable evidence.

## Archive Candidates

- reports/wwg-doctor-report.md (routine-generated-command-report, archive-candidate) - Older generated root command report should be preserved until a user-approved archive pass.
- reports/wwg-upgrade-plan.md (routine-generated-command-report, archive-candidate) - Older generated root command report should be preserved until a user-approved archive pass.
- reports/wwg-upgrade-report.md (routine-generated-command-report, archive-candidate) - Older generated root command report should be preserved until a user-approved archive pass.

## Ignore Candidates

- .wwg/reports/backups/wwg.project.20260516T125328Z.yaml (backup, ignore) - Backup reports are local/generated artifacts and should not become canonical truth in place.
- .wwg/reports/backups/wwg.project.20260516T125351Z.yaml (backup, ignore) - Backup reports are local/generated artifacts and should not become canonical truth in place.
- .wwg/reports/backups/wwg.project.20260516T125837Z.yaml (backup, ignore) - Backup reports are local/generated artifacts and should not become canonical truth in place.
- .wwg/reports/backups/wwg.project.20260516T125918Z.yaml (backup, ignore) - Backup reports are local/generated artifacts and should not become canonical truth in place.
- .wwg/reports/backups/wwg.project.20260516T130424Z.yaml (backup, ignore) - Backup reports are local/generated artifacts and should not become canonical truth in place.
- .wwg/reports/backups/wwg.project.20260516T154454Z.yaml (backup, ignore) - Backup reports are local/generated artifacts and should not become canonical truth in place.
- .wwg/reports/backups/wwg.project.20260516T154619Z.yaml (backup, ignore) - Backup reports are local/generated artifacts and should not become canonical truth in place.
- .wwg/reports/backups/wwg.project.20260516T154622Z.yaml (backup, ignore) - Backup reports are local/generated artifacts and should not become canonical truth in place.
- .wwg/reports/skill-cleanup-review.json (routine-generated-json, ignore) - Routine JSON reports are transient by default unless explicitly required by compatibility or release evidence.
- .wwg/reports/skill-cleanup-review.md (routine-generated-command-report, ignore) - Routine generated command report should stay ignored unless promoted.
- .wwg/reports/wwg-adoption-plan.json (routine-generated-json, ignore) - Routine JSON reports are transient by default unless explicitly required by compatibility or release evidence.
- .wwg/reports/wwg-adoption-plan.md (routine-generated-command-report, ignore) - Routine generated command report should stay ignored unless promoted.
- .wwg/reports/wwg-adoption-report.json (routine-generated-json, ignore) - Routine JSON reports are transient by default unless explicitly required by compatibility or release evidence.
- .wwg/reports/wwg-adoption-report.md (routine-generated-command-report, ignore) - Routine generated command report should stay ignored unless promoted.
- .wwg/reports/wwg-audit-report.json (routine-generated-json, ignore) - Routine JSON reports are transient by default unless explicitly required by compatibility or release evidence.
- .wwg/reports/wwg-doctor-report.json (routine-generated-json, ignore) - Routine JSON reports are transient by default unless explicitly required by compatibility or release evidence.
- .wwg/reports/wwg-doctor-report.md (routine-generated-command-report, ignore) - Routine generated command report should stay ignored unless promoted.
- .wwg/reports/wwg-env-example-report.md (routine-generated-command-report, ignore) - Routine generated command report should stay ignored unless promoted.
- .wwg/reports/wwg-existing-audit-report.json (routine-generated-json, ignore) - Routine JSON reports are transient by default unless explicitly required by compatibility or release evidence.
- .wwg/reports/wwg-existing-audit-report.md (routine-generated-command-report, ignore) - Routine generated command report should stay ignored unless promoted.
- .wwg/reports/wwg-infra-check-report.json (routine-generated-json, ignore) - Routine JSON reports are transient by default unless explicitly required by compatibility or release evidence.
- .wwg/reports/wwg-infra-check-report.md (routine-generated-command-report, ignore) - Routine generated command report should stay ignored unless promoted.
- .wwg/reports/wwg-infra-plan-report.md (routine-generated-command-report, ignore) - Routine generated command report should stay ignored unless promoted.
- .wwg/reports/wwg-maintenance-review.md (routine-generated-command-report, ignore) - Routine generated command report should stay ignored unless promoted.
- .wwg/reports/wwg-upgrade-plan.json (routine-generated-json, ignore) - Routine JSON reports are transient by default unless explicitly required by compatibility or release evidence.
- .wwg/reports/wwg-upgrade-plan.md (routine-generated-command-report, ignore) - Routine generated command report should stay ignored unless promoted.
- .wwg/reports/wwg-upgrade-report.json (routine-generated-json, ignore) - Routine JSON reports are transient by default unless explicitly required by compatibility or release evidence.
- .wwg/reports/wwg-upgrade-report.md (routine-generated-command-report, ignore) - Routine generated command report should stay ignored unless promoted.
- reports/wwg-doctor-report.md (routine-generated-command-report, archive-candidate) - Older generated root command report should be preserved until a user-approved archive pass.
- reports/wwg-upgrade-plan.md (routine-generated-command-report, archive-candidate) - Older generated root command report should be preserved until a user-approved archive pass.
- reports/wwg-upgrade-report.md (routine-generated-command-report, archive-candidate) - Older generated root command report should be preserved until a user-approved archive pass.

## Ambiguous / Needs Review

- .wwg/reports/adoption-regression-report.json (ambiguous-json, review) - JSON report-like output is not promoted by default and needs explicit classification before retention.
- .wwg/reports/adoption-regression-report.md (ambiguous, review) - Report-like file does not match a known report policy category.
- .wwg/reports/changelog-bump-recommendation.md (ambiguous, review) - Report-like file does not match a known report policy category.
- .wwg/reports/context-skill-quality.json (ambiguous-json, review) - JSON report-like output is not promoted by default and needs explicit classification before retention.
- .wwg/reports/context-skill-quality.md (ambiguous, review) - Report-like file does not match a known report policy category.
- .wwg/reports/generated-project-upgrade-review.json (ambiguous-json, review) - JSON report-like output is not promoted by default and needs explicit classification before retention.
- .wwg/reports/readme-validation.md (ambiguous, review) - Report-like file does not match a known report policy category.
- .wwg/reports/wwg-generate-governance-report.json (ambiguous-json, review) - JSON report-like output is not promoted by default and needs explicit classification before retention.
- .wwg/reports/wwg-generate-governance-report.md (ambiguous, review) - Report-like file does not match a known report policy category.
- .wwg/reports/wwg-generate-workspace-report.json (ambiguous-json, review) - JSON report-like output is not promoted by default and needs explicit classification before retention.
- .wwg/reports/wwg-generate-workspace-report.md (ambiguous, review) - Report-like file does not match a known report policy category.
- .wwg/reports/wwg-refresh-context-report.json (ambiguous-json, review) - JSON report-like output is not promoted by default and needs explicit classification before retention.
- .wwg/reports/wwg-refresh-context-report.md (ambiguous, review) - Report-like file does not match a known report policy category.
- .wwg/reports/wwg-refresh-skills-report.json (ambiguous-json, review) - JSON report-like output is not promoted by default and needs explicit classification before retention.
- .wwg/reports/wwg-refresh-skills-report.md (ambiguous, review) - Report-like file does not match a known report policy category.

## Policy Findings

- INFO ambiguous-report-classification: Some report-like files need human classification. Recommendation: Run `wwg reports --target .` and review the Ambiguous / Needs Review section.

## Suggested Next Actions

- Review ambiguous report files before promoting, archiving, or ignoring them.
- Keep movement, deletion, and archive application as explicit future actions.
- Promote only purpose-named Markdown reports with durable evidence, handoff context, maintenance findings, release/certification evidence, or external-upload material.
- Keep routine JSON, backups, and scratch reports ignored unless a documented compatibility or release workflow requires them.
