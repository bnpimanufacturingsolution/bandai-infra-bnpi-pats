# WWG Maintenance Review

WWG STATUS: Critical Alignment Break
Truth Alignment Status: RED / Critical Alignment Break
EXECUTION GATE: Stop

## Plain-English Summary

A recent change appears to conflict with Project Truth, reintroduce a regression, weaken required verification, or touch a high-risk area without proper documentation.

Recommended decision:
Regression / Quality Repair

Why:
- Test Enforcement requires regression repair or reports removed/weakened verification.
- A high-severity finding touches tests, regression, or a high-risk product area.
- Governance, audit, report, history, or regression evidence appears to be removed without documented approval.
- Recent docs use admin, customer terminology not fully reflected in canonical terminology.
- Recent reports suggest documentation lag or stale context that may need Project Truth synchronization.

## Recommended Next Step

Stop implementation and resolve the truth conflict, regression, or verification gap before continuing.

## Recommended Natural Prompt

Tell the agent: "Treat this as a regression or quality gap. Add or update meaningful tests, document the issue, and repair the implementation."

## Backup CLI

wwg regression-check

## Summary

- Total findings: 21
- Critical: 1
- High: 1
- Medium: 2
- Low: 3
- Info: 14
- Safe-to-apply recommendations: 0
- Requires-user-confirmation: 18
- Archive candidates: 0
- Merge candidates: 4
- Rename candidates: 0
- Stale context candidates: 1
- Drift Score: 10/10
- Truth Alignment Status: Critical Alignment Break
- Interpretation: Drift Score 10/10 indicates a critical conflict, regression, missing verification, or high-risk change that needs planning/reconciliation before more implementation.

## Scope

- Target path: .
- Timestamp: 2026-05-15T06:32:05.846Z
- Command: `wwg maintain --target C:\Users\1biss\Documents\Projects\hris-app --json`
- Dry-run status: true
- Safety: no deletes, moves, archives, renames, broad rewrites, or apply behavior were performed.

## Maintenance Model

WWG maintenance has two forms:

1. Continuous Maintenance Awareness: Agents must notice and record maintenance drift during normal truth-loop work.
2. Explicit Maintenance Review: `wwg maintain --target <path>` generates a structured report of maintenance findings and recommendations.

WWG is self-maintaining by doctrine, and maintainable by command.

The truth loop is continuous. The maintenance review is explicit.

## How to Use This Review

This review is advisory and non-destructive.

Use it to decide which recommendations should become:

- immediate edits
- future prompts
- archive/move/rename candidates
- user-confirmation items
- safe generated-section updates
- ignored findings

## Findings by Category

- fragmented-guidance: 4
- generated-artifact-freshness: 1
- gitignore-policy-drift: 1
- naming-drift: 6
- principle-drift: 1
- regression-governance: 3
- report-policy-drift: 3
- truth-loop-drift: 2

## Truth Alignment Findings

- Level: RED / Critical Alignment Break
- Execution Gate: stop / Stop
- Drift Score: 10/10
- Interpretation: Drift Score 10/10 indicates a critical conflict, regression, missing verification, or high-risk change that needs planning/reconciliation before more implementation.

Category findings:
- Requirement Evolution: none detected.
- Undocumented Requirement Change: none detected.
- Documentation Lag:
  - Recent reports suggest documentation lag or stale context that may need Project Truth synchronization.
  - Low-severity findings are present; review alongside Truth Alignment Status instead of treating them as harmful drift by default.
- Implementation Drift: none detected.
- Regression / Quality Drift:
  - Test Enforcement requires regression repair or reports removed/weakened verification.
  - A high-severity finding touches tests, regression, or a high-risk product area.
  - Governance, audit, report, history, or regression evidence appears to be removed without documented approval.
- Terminology Drift:
  - Recent docs use admin, customer terminology not fully reflected in canonical terminology.

## Continuous Maintenance Awareness Findings

These findings are signals agents should notice during ordinary truth-loop work and either fix when directly related or record for follow-up.

- MEDIUM Report policy drift (.wwg/reports/README.md): Add `.wwg/reports/README.md` before claiming native report policy readiness.
- LOW Report policy drift (.gitignore): Add a narrow ignore rule for `.wwg/reports/backups/` or `.wwg/.gitignore` `reports/backups/`.
- LOW Changelog project memory is missing (CHANGELOG.md): Run `wwg changelog generate --target . --from-git --weekly --dry-run` before creating or applying changelog history.
- LOW README front door needs governance review (README.md): Run `wwg readme preview --target .` and `wwg readme route-docs --target . --dry-run`.
- INFO Potential fragmented guidance: readiness (.wwg/governance/infrastructure-readiness-checklist.md): This is a consolidation candidate only; template, dogfood, docs, and compatibility boundaries must be reviewed before merging guidance.
- INFO Potential fragmented guidance: maintenance (.wwg/governance/README.md): This is a consolidation candidate only; template, dogfood, docs, and compatibility boundaries must be reviewed before merging guidance.
- INFO Potential fragmented guidance: principles (.wwg/governance/recommendation-policy.md): This is a consolidation candidate only; template, dogfood, docs, and compatibility boundaries must be reviewed before merging guidance.
- INFO Potential fragmented guidance: handoff (.wwg/workspace/AGENTS.md): This is a consolidation candidate only; template, dogfood, docs, and compatibility boundaries must be reviewed before merging guidance.
- INFO Governed skill copy policy is current (.wwg/config/skill-manifest.yaml): Core/compatibility-core skill support remains available. Compatibility-domain skills are reference-only recommendations when relevant. Cleanup runs only through explicit --apply-skill-cleanup, and WWG does not activate runtime skills.
- INFO Principle-like guidance exists outside principles (.wwg/workspace/AGENTS.md): Promotion to active principles requires deliberate human or task-level confirmation.
- INFO Report policy drift: Run `wwg reports --target .` and review the Ambiguous / Needs Review section.
- INFO Ambiguous JSON reports need classification (.wwg/reports/adoption-regression-report.json): JSON reports are not promoted by default; classify as compatibility JSON, promoted JSON, routine generated JSON, transient JSON, or ambiguous JSON before committing policy decisions.

## Explicit Maintenance Review Findings

These findings were produced by the explicit `wwg maintain` review. They are recommendations, not automatic cleanup actions or audit/validate hard failures.

- fragmented-guidance: 4
- generated-artifact-freshness: 1
- gitignore-policy-drift: 1
- naming-drift: 6
- principle-drift: 1
- regression-governance: 3
- report-policy-drift: 3
- truth-loop-drift: 2

## Recommended Create/Edit/Merge/Move/Rename/Archive/Ignore/Delete/Keep Actions

| Path | Category | Issue | Recommended Action | Risk | Can Apply Safely? | Needs User Confirmation? | Reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| .wwg/governance/regression-gaps.md | regression-governance | Critical or high regression governance gaps remain open | review | medium | no | yes | Review `.wwg/governance/regression-gaps.md` and convert safe report-first candidates into real tests or checklists as part of normal implementation work. |
| .wwg/workspace/testing/regression-candidate-review.md | regression-governance | Regression candidates need confirmation evidence | review | low | no | yes | Review `.wwg/workspace/testing/regression-candidate-review.md` and record explicit manual/process, executable, or waiver evidence in `.wwg/workspace/testing/manual-verification-evidence.json`. |
| .wwg/governance/rule-traceability.md | regression-governance | Regression traceability remains uncovered or unknown | review | low | no | yes | Review `.wwg/governance/rule-traceability.md` and map uncovered behavior to confirmed evidence. |
| .wwg/reports/README.md | report-policy-drift | Report policy drift | review | medium | no | yes | Add `.wwg/reports/README.md` before claiming native report policy readiness. |
| .gitignore | gitignore-policy-drift | Report policy drift | review | low | no | yes | Add a narrow ignore rule for `.wwg/reports/backups/` or `.wwg/.gitignore` `reports/backups/`. |
| CHANGELOG.md | truth-loop-drift | Changelog project memory is missing | create | low | no | no | Run `wwg changelog generate --target . --from-git --weekly --dry-run` before creating or applying changelog history. |
| README.md | truth-loop-drift | README front door needs governance review | review | low | no | no | Run `wwg readme preview --target .` and `wwg readme route-docs --target . --dry-run`. |
| .wwg/governance/infrastructure-readiness-checklist.md | fragmented-guidance | Potential fragmented guidance: readiness | merge | medium | no | yes | This is a consolidation candidate only; template, dogfood, docs, and compatibility boundaries must be reviewed before merging guidance. |
| .wwg/governance/README.md | fragmented-guidance | Potential fragmented guidance: maintenance | merge | medium | no | yes | This is a consolidation candidate only; template, dogfood, docs, and compatibility boundaries must be reviewed before merging guidance. |
| .wwg/governance/recommendation-policy.md | fragmented-guidance | Potential fragmented guidance: principles | merge | medium | no | yes | This is a consolidation candidate only; template, dogfood, docs, and compatibility boundaries must be reviewed before merging guidance. |
| .wwg/workspace/AGENTS.md | fragmented-guidance | Potential fragmented guidance: handoff | merge | medium | no | yes | This is a consolidation candidate only; template, dogfood, docs, and compatibility boundaries must be reviewed before merging guidance. |
| .wwg/config/skill-manifest.yaml | generated-artifact-freshness | Governed skill copy policy is current | keep | low | no | no | Core/compatibility-core skill support remains available. Compatibility-domain skills are reference-only recommendations when relevant. Cleanup runs only through explicit --apply-skill-cleanup, and WWG does not activate runtime skills. |
| .wwg/reports/adoption-audit.md | naming-drift | Report filename has unclear purpose suffix | review | low | no | yes | Ambiguous report names should be indexed or renamed only through a deliberate report policy pass. |
| .wwg/reports/changelog-bump-recommendation.md | naming-drift | Report filename has unclear purpose suffix | review | low | no | yes | Ambiguous report names should be indexed or renamed only through a deliberate report policy pass. |
| .wwg/reports/changelog-preview.md | naming-drift | Report filename has unclear purpose suffix | review | low | no | yes | Ambiguous report names should be indexed or renamed only through a deliberate report policy pass. |
| .wwg/reports/context-skill-quality.md | naming-drift | Report filename has unclear purpose suffix | review | low | no | yes | Ambiguous report names should be indexed or renamed only through a deliberate report policy pass. |
| .wwg/reports/readme-preview.md | naming-drift | Report filename has unclear purpose suffix | review | low | no | yes | Ambiguous report names should be indexed or renamed only through a deliberate report policy pass. |
| .wwg/reports/runtime-skill-candidates.md | naming-drift | Report filename has unclear purpose suffix | review | low | no | yes | Ambiguous report names should be indexed or renamed only through a deliberate report policy pass. |
| .wwg/workspace/AGENTS.md | principle-drift | Principle-like guidance exists outside principles | promote | medium | no | yes | Promotion to active principles requires deliberate human or task-level confirmation. |
|  | report-policy-drift | Report policy drift | review | low | no | yes | Run `wwg reports --target .` and review the Ambiguous / Needs Review section. |
| .wwg/reports/adoption-regression-report.json | report-policy-drift | Ambiguous JSON reports need classification | review | low | no | yes | JSON reports are not promoted by default; classify as compatibility JSON, promoted JSON, routine generated JSON, transient JSON, or ambiguous JSON before committing policy decisions. |


## Agent-Brand Drift

- None detected.

Allowlisted references:

- None.

## Stable Docs Phase Pollution

- None detected.

Allowlisted historical references:

- None.

## Report Policy Review

- MEDIUM Report policy drift (.wwg/reports/README.md): Add `.wwg/reports/README.md` before claiming native report policy readiness.
- LOW Report policy drift (.gitignore): Add a narrow ignore rule for `.wwg/reports/backups/` or `.wwg/.gitignore` `reports/backups/`.
- INFO Report policy drift: Run `wwg reports --target .` and review the Ambiguous / Needs Review section.
- INFO Ambiguous JSON reports need classification (.wwg/reports/adoption-regression-report.json): JSON reports are not promoted by default; classify as compatibility JSON, promoted JSON, routine generated JSON, transient JSON, or ambiguous JSON before committing policy decisions.

## Naming Drift

- INFO Report filename has unclear purpose suffix (.wwg/reports/adoption-audit.md): Ambiguous report names should be indexed or renamed only through a deliberate report policy pass.
- INFO Report filename has unclear purpose suffix (.wwg/reports/changelog-bump-recommendation.md): Ambiguous report names should be indexed or renamed only through a deliberate report policy pass.
- INFO Report filename has unclear purpose suffix (.wwg/reports/changelog-preview.md): Ambiguous report names should be indexed or renamed only through a deliberate report policy pass.
- INFO Report filename has unclear purpose suffix (.wwg/reports/context-skill-quality.md): Ambiguous report names should be indexed or renamed only through a deliberate report policy pass.
- INFO Report filename has unclear purpose suffix (.wwg/reports/readme-preview.md): Ambiguous report names should be indexed or renamed only through a deliberate report policy pass.
- INFO Report filename has unclear purpose suffix (.wwg/reports/runtime-skill-candidates.md): Ambiguous report names should be indexed or renamed only through a deliberate report policy pass.

## Context and Skill Freshness

- INFO Governed skill copy policy is current (.wwg/config/skill-manifest.yaml): Core/compatibility-core skill support remains available. Compatibility-domain skills are reference-only recommendations when relevant. Cleanup runs only through explicit --apply-skill-cleanup, and WWG does not activate runtime skills.

## Governed Skill State

- Skill manifest: `.wwg/config/skill-manifest.yaml` (valid/readable)
- Enabled core skills: 6
- Recommended domain skills: 13
- Recommended reference-only skills: business.business-brief, business.decision-memo, business.sop-writing, creative.pitch-deck, creative.storytelling, public.public-discovery-maintenance, public.public-surface-update, software.bug-fix, software.feature-implementation, software.runtime-infrastructure, software.web.component-architecture, software.web.react-patterns, software.web.rendering-strategy
- Creative/Business recommendations: business.business-brief, business.decision-memo, business.sop-writing, creative.pitch-deck, creative.storytelling (reference-only; no skill files copied)
- Local project skills: 0
- Disabled skills: 0
- Skill materialization: none 0, reference 14, copied 5, local 0
- Skill policy: manifest present, no policy violations
- Detected domains: business.compliance, business.decision, business.operations, business.strategy, creative.presentation, creative.story, game-design, software.security, software.testing, software.web
- Legacy copied skills: 5 compatibility-core, 0 compatibility-domain
- Runtime activation: not performed by WWG; future Vorter responsibility.

## Legacy Copied Skill Cleanup Review

- Report: .wwg/reports/skill-cleanup-review.md
- JSON: .wwg/reports/skill-cleanup-review.json
- Mode: review
- No files removed: yes
- Files removed: 0
- Manifest updated: no
- Review candidates: 0
- Cleanup applied: 0
- Preserved protected: 5
- Reference-only: 6
- Already clean: 0
- Manual review required: 0
- Preserve required: 5
- Needs manual review: 0
- Already reference-only: 6
- Not applicable: 0
- Recommendation: Cleanup is not required now.
- Apply mode: available through explicit `--apply-skill-cleanup`.

## Principle and Truth Loop Review

- LOW Changelog project memory is missing (CHANGELOG.md): Run `wwg changelog generate --target . --from-git --weekly --dry-run` before creating or applying changelog history.
- LOW README front door needs governance review (README.md): Run `wwg readme preview --target .` and `wwg readme route-docs --target . --dry-run`.
- INFO Potential fragmented guidance: readiness (.wwg/governance/infrastructure-readiness-checklist.md): This is a consolidation candidate only; template, dogfood, docs, and compatibility boundaries must be reviewed before merging guidance.
- INFO Potential fragmented guidance: maintenance (.wwg/governance/README.md): This is a consolidation candidate only; template, dogfood, docs, and compatibility boundaries must be reviewed before merging guidance.
- INFO Potential fragmented guidance: principles (.wwg/governance/recommendation-policy.md): This is a consolidation candidate only; template, dogfood, docs, and compatibility boundaries must be reviewed before merging guidance.
- INFO Potential fragmented guidance: handoff (.wwg/workspace/AGENTS.md): This is a consolidation candidate only; template, dogfood, docs, and compatibility boundaries must be reviewed before merging guidance.
- INFO Principle-like guidance exists outside principles (.wwg/workspace/AGENTS.md): Promotion to active principles requires deliberate human or task-level confirmation.

## Handoff and Registry Readiness

- None detected.

## WWG Readiness

Must Have items are required for agent-safe operation. Other Features are recommendations, not automatic authorization to expand task scope.

### Must Have

- [x] WWG workspace present (present)
  - Evidence: `.wwg`
- [x] Project config present (present)
  - Evidence: `.wwg/config/wwg.project.yaml`
- [x] Project Truth present (present)
  - Evidence: `.wwg/wiki/project-truth.md`
- [x] Terminology present (present)
  - Evidence: `.wwg/wiki/terminology.md`
- [x] Principles README present (present)
  - Evidence: `.wwg/wiki/principles/README.md`
- [x] Workspace current task present (present)
  - Evidence: `.wwg/workspace/current-task.md`
- [x] Governance drift guard present (present)
  - Evidence: `.wwg/governance/drift-guard.md`
- [x] Recommendation Registry present (present)
  - Evidence: `.wwg/governance/recommendation-registry.md`
- [x] Reports directory present (present)
  - Evidence: `.wwg/reports`
- [x] Root AGENTS.md present (present)
  - Evidence: `AGENTS.md`
- [x] Test enforcement governance present (present)
  - Evidence: `.wwg/governance/test-enforcement.md`
- [x] Regression guardrail governance present (present)
  - Evidence: `.wwg/governance/regression-guardrail-catalog.md`
- [x] Validation report present (present)
  - Evidence: `.wwg/reports/wwg-validate-report.md`
- [x] Audit report present (present)
  - Evidence: `.wwg/reports/wwg-audit-report.md`
- [x] Agent handoff present (present)
  - Evidence: `.wwg/reports/wwg-agent-handoff.md`, `.wwg/reports/wwg-handoff-to-codex.md`
- [x] Adoption regression baseline present (present)
  - Evidence: `.wwg/governance/regression-manifest.md`, `.wwg/governance/regression-manifest.json`

### Other Features

- [ ] Changelog missing (missing)
  - Reason: Package, product, or git history signals make release memory relevant.
  - Agent action: Prepare or review release narrative before treating changelog wording as final.
  - CLI support: `wwg changelog generate --from-git --weekly --dry-run`
  - Evidence: `CHANGELOG.md`
- [ ] GitHub publishing readiness not checked (available)
  - Reason: Git or GitHub context exists.
  - Agent action: Do not publish without explicit approval; review readiness and secret safety first.
  - CLI support: `wwg publish github --dry-run`
  - Evidence: `.git`, `.github`, `package.json repository`

### Recommended Next

- [ ] Review relevant Other Features (available)
  - Reason: Only detected gaps or context-relevant actions are shown.
  - Agent action: Treat recommendations as scoped support, not permission to expand the current task.
  - CLI support: `wwg brief`

Agents should follow Must Have items first. Missing Other Features are not blockers unless the current task depends on them.

## Regression Governance Readiness

- Regression baseline: present
- CI readiness: partial
- Open regression gaps: 9 (3 critical, 3 high)
- Traceability: 0 covered, 2 partial, 0 uncovered, 1 unknown
- Safe report-first candidates: 17 (not counted as coverage)
- Regression candidates: 17 total, 17 proposed, 0 confirmed, 0 waived
- Manual evidence confirmed: 0
- Executable evidence detected: 12
- Candidate-only evidence: 17
- Proposed executable tests: 10 (0 eligible to apply, 10 blocked/unsafe)
- Recommended action: Review `.wwg/workspace/testing/regression-candidate-review.md` and confirm candidates with manual/process or executable evidence before claiming coverage.
- Warnings: 9 open regression gap(s) remain.; Some behavior traceability remains uncovered or unknown.

## Recommendation Registry Review

- Registry found: Yes
- Policy found: Yes
- Total recommendations: 3

### By Status

| Status | Count |
|---|---:|
| Proposed | 3 |

### By Impact

| Impact | Count |
|---|---:|
| High | 2 |
| Medium | 1 |

### By Type

| Type | Count |
|---|---:|
| Documentation | 1 |
| Governance | 1 |
| Security | 1 |

### Items Needing Review

| ID | Name | Status | Impact | Review By | Suggested Action |
|---|---|---|---|---|---|
| REC-0001 | Reconcile stale template identity | Proposed | High | 2026-05-22 | Review for promotion |
| REC-0002 | Review Firebase admin SDK JSON files | Proposed | High | 2026-05-16 | Review for promotion |
| REC-0003 | Track WWG generator missing test-enforcement file | Proposed | Medium | 2026-05-22 | Review recommendation |

### High-Impact Open Recommendations

| ID | Name | Status | Impact | Owner | Suggested Timing |
|---|---|---|---|---|---|
| REC-0001 | Reconcile stale template identity | Proposed | High | Unassigned | Before public release or next major agent handoff |
| REC-0002 | Review Firebase admin SDK JSON files | Proposed | High | Unassigned | Immediate security triage |

### Stale Review By Items

No stale Review By items found.

### Parsing Warnings

- Row 28 has unknown effort: Low.

### Suggested Actions

- Review Proposed recommendations before planning.
- Promote accepted work into Workspace or issue tracker only when intentionally approved.
- Add owners for Accepted or Promoted items.
- Revisit stale Review By dates.
- Keep recommendations in Governance until promoted.

- Automation: maintain summarized the registry only; it did not promote, implement, or rewrite recommendations.

## Follow-Up Modes

- Update truth/governance now
- Create a cleanup prompt
- Archive/move only after approval
- Ignore as intentional
- Convert into a principle/governance rule

## Suggested Next Actions

- Review `.wwg/workspace/testing/regression-candidate-review.md` and confirm candidates with manual/process or executable evidence before claiming coverage.
- Review medium-or-higher findings before treating the project as freshly maintained.
- Review `.wwg/reports/skill-cleanup-review.md` before applying legacy copied compatibility-domain cleanup.
- Keep all archive, move, rename, delete, and merge recommendations manual unless a dedicated explicit apply flag exists for that workflow.
- Run `wwg reports --target .` before any report archive or promotion work.
- Run `wwg brief --target .` if generic or compatibility agent brief readiness is missing.
- Refresh Workspace/Governance outputs only through explicit generation or refresh commands.
