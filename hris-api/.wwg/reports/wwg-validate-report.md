# WWG Validate Report

## Summary

Overall status: FAIL

critical: 0, high: 2, medium: 0, low: 16, info: 12

## Command

`wwg validate --target C:\uzaro\bandai-infra\hris-api`

## Repository Type Detected

wwg-native-project

## Checks Run

- PASS JSON schemas parse and compile - 1 finding(s)
- PASS YAML manifests parse - 1 finding(s)
- PASS wwg.project.yaml registry validates when present - 1 finding(s)
- WARN Skill Registry and Skill Manifest validate when present - 18 finding(s)
- PASS Profile skill recommendation metadata validates when present - 1 finding(s)
- PASS Required WWG directories exist - 1 finding(s)
- FAIL WWG operating loop files are present and actionable - 2 finding(s)
- PASS Principles folder and Principle Brief frontmatter are valid - 1 finding(s)
- PASS Generated marker pairs are balanced - 1 finding(s)
- PASS Markdown files are readable and non-empty - 1 finding(s)
- PASS Report policy indexes and ignore rules are advisory-clean - 1 finding(s)
- PASS Markdown contract quality report generated - 1 finding(s)

## Findings

- HIGH wwg-current-task-missing-existing-adoption (.wwg/workspace/current-task.md): evidence=confirmed Current task does not describe Existing Project Adoption. Recommendation: Update current-task.md with the adoption task and evidence reviewed.
- HIGH wwg-operating-loop-reading-order-invalid (AGENTS.md): evidence=confirmed AGENTS guidance is missing or reorders required WWG reading sources. Missing or out of order: .wwg/workspace/current-task.md Recommendation: Keep the required reading order aligned with the WWG operating contract.
- LOW runtime-skill-candidate-unknown-skill (.wwg/reports/runtime-skill-candidates.json): evidence=confirmed Runtime Skill Candidate references an unknown Skill Registry id. business.business-brief is not present in the loaded Skill Registry. Recommendation: Keep unknown candidate IDs only when they are intentional local/project candidates.
- LOW runtime-skill-candidate-unknown-skill (.wwg/reports/runtime-skill-candidates.json): evidence=confirmed Runtime Skill Candidate references an unknown Skill Registry id. business.decision-memo is not present in the loaded Skill Registry. Recommendation: Keep unknown candidate IDs only when they are intentional local/project candidates.
- LOW runtime-skill-candidate-unknown-skill (.wwg/reports/runtime-skill-candidates.json): evidence=confirmed Runtime Skill Candidate references an unknown Skill Registry id. business.sop-writing is not present in the loaded Skill Registry. Recommendation: Keep unknown candidate IDs only when they are intentional local/project candidates.
- LOW runtime-skill-candidate-unknown-skill (.wwg/reports/runtime-skill-candidates.json): evidence=confirmed Runtime Skill Candidate references an unknown Skill Registry id. creative.storytelling is not present in the loaded Skill Registry. Recommendation: Keep unknown candidate IDs only when they are intentional local/project candidates.
- LOW runtime-skill-candidate-unknown-skill (.wwg/reports/runtime-skill-candidates.json): evidence=confirmed Runtime Skill Candidate references an unknown Skill Registry id. public.public-discovery-maintenance is not present in the loaded Skill Registry. Recommendation: Keep unknown candidate IDs only when they are intentional local/project candidates.
- LOW runtime-skill-candidate-unknown-skill (.wwg/reports/runtime-skill-candidates.json): evidence=confirmed Runtime Skill Candidate references an unknown Skill Registry id. public.public-surface-update is not present in the loaded Skill Registry. Recommendation: Keep unknown candidate IDs only when they are intentional local/project candidates.
- LOW runtime-skill-candidate-unknown-skill (.wwg/reports/runtime-skill-candidates.json): evidence=confirmed Runtime Skill Candidate references an unknown Skill Registry id. software.bug-fix is not present in the loaded Skill Registry. Recommendation: Keep unknown candidate IDs only when they are intentional local/project candidates.
- LOW runtime-skill-candidate-unknown-skill (.wwg/reports/runtime-skill-candidates.json): evidence=confirmed Runtime Skill Candidate references an unknown Skill Registry id. software.feature-implementation is not present in the loaded Skill Registry. Recommendation: Keep unknown candidate IDs only when they are intentional local/project candidates.
- LOW runtime-skill-candidate-unknown-skill (.wwg/reports/runtime-skill-candidates.json): evidence=confirmed Runtime Skill Candidate references an unknown Skill Registry id. software.runtime-infrastructure is not present in the loaded Skill Registry. Recommendation: Keep unknown candidate IDs only when they are intentional local/project candidates.
- LOW runtime-skill-candidate-unknown-skill (.wwg/reports/runtime-skill-candidates.json): evidence=confirmed Runtime Skill Candidate references an unknown Skill Registry id. software.web.rendering-strategy is not present in the loaded Skill Registry. Recommendation: Keep unknown candidate IDs only when they are intentional local/project candidates.
- LOW runtime-skill-candidate-unknown-skill (.wwg/reports/runtime-skill-candidates.json): evidence=confirmed Runtime Skill Candidate references an unknown Skill Registry id. core.change-classifier is not present in the loaded Skill Registry. Recommendation: Keep unknown candidate IDs only when they are intentional local/project candidates.
- LOW runtime-skill-candidate-unknown-skill (.wwg/reports/runtime-skill-candidates.json): evidence=confirmed Runtime Skill Candidate references an unknown Skill Registry id. core.context-skill-maintenance is not present in the loaded Skill Registry. Recommendation: Keep unknown candidate IDs only when they are intentional local/project candidates.
- LOW runtime-skill-candidate-unknown-skill (.wwg/reports/runtime-skill-candidates.json): evidence=confirmed Runtime Skill Candidate references an unknown Skill Registry id. core.drift-detector is not present in the loaded Skill Registry. Recommendation: Keep unknown candidate IDs only when they are intentional local/project candidates.
- LOW runtime-skill-candidate-unknown-skill (.wwg/reports/runtime-skill-candidates.json): evidence=confirmed Runtime Skill Candidate references an unknown Skill Registry id. core.regression-guardrail-maintenance is not present in the loaded Skill Registry. Recommendation: Keep unknown candidate IDs only when they are intentional local/project candidates.
- LOW runtime-skill-candidate-unknown-skill (.wwg/reports/runtime-skill-candidates.json): evidence=confirmed Runtime Skill Candidate references an unknown Skill Registry id. core.task-router is not present in the loaded Skill Registry. Recommendation: Keep unknown candidate IDs only when they are intentional local/project candidates.
- LOW runtime-skill-candidate-unknown-skill (.wwg/reports/runtime-skill-candidates.json): evidence=confirmed Runtime Skill Candidate references an unknown Skill Registry id. core.truth-loop is not present in the loaded Skill Registry. Recommendation: Keep unknown candidate IDs only when they are intentional local/project candidates.
- INFO ambiguous-report-classification: evidence=confirmed risk=low Some report-like files need human classification. Recommendation: Run `wwg reports --target .` and review the Ambiguous / Needs Review section.
- INFO generated-markers-balanced: Generated marker pairs are balanced where present.
- INFO json-schemas-parse: Parsed and compiled 0 JSON schema file(s).
- INFO markdown-contract-quality-report-generated (reports/context-skill-quality.md): evidence=confirmed Markdown contract quality report completed with 191 warning(s) and 106 suggestion(s). Advisory Markdown quality findings are recorded in the quality report and do not change validate status by default. Recommendation: Review `.wwg/reports/context-skill-quality.md` during focused documentation remediation.
- INFO markdown-readable: Markdown files are non-empty and readable.
- INFO profile-skill-recommendations-valid: evidence=confirmed Validated skill recommendation metadata for 0 profile file(s). Recommendation: Keep profile skill recommendations advisory until manifest generation and runtime activation are implemented.
- INFO project-registry-valid (.wwg/config/wwg.project.yaml): WWG project registry parses and matches the registry schema.
- INFO required-directories-present: Required directories exist for wwg-native-project.
- INFO runtime-skill-candidates-valid (.wwg/reports/runtime-skill-candidates.json): evidence=confirmed Runtime Skill Candidate contract validates as candidate-only and Vorter-owned. Recommendation: Treat this artifact as candidate-only metadata. WWG did not activate runtime skills.
- INFO skill-manifest-valid (.wwg/config/skill-manifest.yaml): evidence=confirmed Skill Manifest validates against schemas/skill-manifest.schema.json. Recommendation: Preferred future canonical Skill Manifest path is .wwg/config/skill-manifest.yaml.
- INFO wwg-principles-valid: Principles folder and lightweight Principle Brief checks passed.
- INFO yaml-files-parse: Parsed 2 YAML file(s).

## Validation Results

PASS: 10
WARN: 1
FAIL: 1

## Principle Review

- Principles reviewed:
  - Principles folder and Principle Brief frontmatter checks.
- Principles updated:
  - None by validation.
- Candidate principle changes:
  - None by validation.
- Principle drift concerns:
  - Review principle findings above.

## WWG Truth Synchronization

- Task mode: validation
- New truth detected: NO
- Wiki updated: NO / N/A
- Workspace updated: NO
- Governance review completed: YES
- Drift status: HIGH
- Canonical files changed:
  - None by validation.
- Implementation discoveries synced:
  - None.
- Remaining stale context:
  - Review findings above.

## Recommended Next Steps

- Fix FAIL findings, then rerun `wwg validate`.
