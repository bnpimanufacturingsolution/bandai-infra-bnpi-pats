# WWG Validate Report

## Summary

Overall status: PASS

critical: 0, high: 0, medium: 0, low: 0, info: 12

## Command

`wwg validate --target C:\Users\anoni\OneDrive\Desktop\PROJECT_TRUTH_HYPERV_FRESH`

## Repository Type Detected

wwg-native-project

## Checks Run

- PASS JSON schemas parse and compile - 1 finding(s)
- PASS YAML manifests parse - 1 finding(s)
- PASS wwg.project.yaml registry validates when present - 1 finding(s)
- PASS Skill Registry and Skill Manifest validate when present - 0 finding(s)
- PASS Profile skill recommendation metadata validates when present - 1 finding(s)
- PASS Required WWG directories exist - 1 finding(s)
- PASS WWG operating loop files are present and actionable - 1 finding(s)
- PASS Principles folder and Principle Brief frontmatter are valid - 1 finding(s)
- PASS UI/UX principle pack expectations are profile-aware - 0 finding(s)
- PASS Generated marker pairs are balanced - 1 finding(s)
- PASS Markdown files are readable and non-empty - 1 finding(s)
- PASS Report policy indexes and ignore rules are advisory-clean - 2 finding(s)
- PASS Markdown contract quality report generated - 1 finding(s)

## Findings

- INFO ambiguous-report-classification: evidence=confirmed risk=low Some report-like files need human classification. Recommendation: Run `wwg reports --target .` and review the Ambiguous / Needs Review section.
- INFO generated-markers-balanced: Generated marker pairs are balanced where present.
- INFO gitignore-native-report-backups-missing (.gitignore): evidence=confirmed risk=low Report policy expects `.wwg/reports/backups/` to be ignored. Recommendation: Add a narrow ignore rule for `.wwg/reports/backups/` or `.wwg/.gitignore` `reports/backups/`.
- INFO json-schemas-parse: Parsed and compiled 0 JSON schema file(s).
- INFO markdown-contract-quality-report-generated (reports/context-skill-quality.md): evidence=confirmed Markdown contract quality report completed with 79 warning(s) and 93 suggestion(s). Advisory Markdown quality findings are recorded in the quality report and do not change validate status by default. Recommendation: Review `.wwg/reports/context-skill-quality.md` during focused documentation remediation.
- INFO markdown-readable: Markdown files are non-empty and readable.
- INFO profile-skill-recommendations-valid: evidence=confirmed Validated skill recommendation metadata for 0 profile file(s). Recommendation: Keep profile skill recommendations advisory until manifest generation and runtime activation are implemented.
- INFO project-registry-valid (.wwg/config/wwg.project.yaml): WWG project registry parses and matches the registry schema.
- INFO required-directories-present: Required directories exist for wwg-native-project.
- INFO wwg-operating-loop-present: WWG operating loop files and AGENTS signals are present.
- INFO wwg-principles-valid: Principles folder and lightweight Principle Brief checks passed.
- INFO yaml-files-parse: Parsed 1 YAML file(s).

## Findings by User Action

### Info
Passing or informational validation evidence.
Next: No command required.
- INFO json-schemas-parse: Parsed and compiled 0 JSON schema file(s).
- INFO yaml-files-parse: Parsed 1 YAML file(s).
- INFO project-registry-valid (.wwg/config/wwg.project.yaml): WWG project registry parses and matches the registry schema.
- INFO profile-skill-recommendations-valid: Validated skill recommendation metadata for 0 profile file(s).
- INFO required-directories-present: Required directories exist for wwg-native-project.
- INFO wwg-operating-loop-present: WWG operating loop files and AGENTS signals are present.
- INFO wwg-principles-valid: Principles folder and lightweight Principle Brief checks passed.
- INFO generated-markers-balanced: Generated marker pairs are balanced where present.
- INFO markdown-readable: Markdown files are non-empty and readable.
- INFO ambiguous-report-classification: Some report-like files need human classification.
- INFO gitignore-native-report-backups-missing (.gitignore): Report policy expects `.wwg/reports/backups/` to be ignored.
- INFO markdown-contract-quality-report-generated (reports/context-skill-quality.md): Markdown contract quality report completed with 79 warning(s) and 93 suggestion(s).

## Validation Results

PASS: 13
WARN: 0
FAIL: 0

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
- Drift status: NONE
- Canonical files changed:
  - None by validation.
- Implementation discoveries synced:
  - None.
- Remaining stale context:
  - None detected by validation.

## Recommended Next Steps

- Run `wwg lint` for higher-level consistency checks.
