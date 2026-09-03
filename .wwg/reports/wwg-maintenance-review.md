# WWG Maintenance Review

WWG STATUS: Critical Alignment Break
Truth Alignment Status: RED / Critical Alignment Break
EXECUTION GATE: Stop

## Plain-English Summary

A recent change appears to conflict with Project Truth, reintroduce a regression, weaken required verification, or touch a high-risk area without proper documentation.

Recommended decision:
Regression / Quality Repair

Why:
- A high-severity finding touches tests, regression, or a high-risk product area.
- Recent docs use customer terminology not fully reflected in canonical terminology.
- Recent reports suggest documentation lag or stale context that may need Project Truth synchronization.
- Low-severity findings are present; review alongside Truth Alignment Status instead of treating them as harmful drift by default.

## Recommended Next Step

Stop implementation and resolve the truth conflict, regression, or verification gap before continuing.

## Recommended Natural Prompt

Tell the agent: "Treat this as a regression or quality gap. Add or update meaningful tests, document the issue, and repair the implementation."

## Backup CLI

wwg regression-check

## Summary

- Total findings: 46
- Critical: 1
- High: 1
- Medium: 2
- Low: 6
- Info: 36
- Safe-to-apply recommendations: 0
- Requires-user-confirmation: 40
- Archive candidates: 0
- Merge candidates: 0
- Rename candidates: 32
- Stale context candidates: 4
- Drift Score: 8/10
- Truth Alignment Status: Critical Alignment Break
- Interpretation: Drift Score 8/10 indicates a critical conflict, regression, missing verification, or high-risk change that needs planning/reconciliation before more implementation.

## Scope

- Target path: .
- Timestamp: 2026-06-29T01:44:07.621Z
- Command: `wwg maintain --target C:\Users\anoni\OneDrive\Desktop\PROJECT_TRUTH_HYPERV_FRESH --json`
- Dry-run status: true
- Safety: no deletes, moves, archives, renames, broad rewrites, or apply behavior were performed.

## Report Currency

This maintenance report is point-in-time evidence for the target path above. Findings are current as of the timestamp above. Do not read older maintain or doctor reports as current state without checking newer handoff, validation, upgrade, doctor, or maintenance artifacts.

Historical reports are preserved by policy and are not deleted automatically. If a later artifact created a missing handoff, refreshed validation, or completed an upgrade, that newer artifact supersedes the earlier missing-artifact finding.

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

- generated-artifact-freshness: 4
- gitignore-policy-drift: 1
- naming-drift: 33
- regression-governance: 4
- report-policy-drift: 2
- truth-loop-drift: 2

## Truth Alignment Findings

- Level: RED / Critical Alignment Break
- Execution Gate: stop / Stop
- Drift Score: 8/10
- Interpretation: Drift Score 8/10 indicates a critical conflict, regression, missing verification, or high-risk change that needs planning/reconciliation before more implementation.

Category findings:
- Requirement Evolution: none detected.
- Undocumented Requirement Change: none detected.
- Documentation Lag:
  - Recent reports suggest documentation lag or stale context that may need Project Truth synchronization.
  - Low-severity findings are present; review alongside Truth Alignment Status instead of treating them as harmful drift by default.
- Implementation Drift: none detected.
- Regression / Quality Drift:
  - A high-severity finding touches tests, regression, or a high-risk product area.
- Terminology Drift:
  - Recent docs use customer terminology not fully reflected in canonical terminology.

## Continuous Maintenance Awareness Findings

These findings are signals agents should notice during ordinary truth-loop work and either fix when directly related or record for follow-up.

- LOW Expected context or readiness artifact is missing (.wwg/governance/quality-gates.md): This pass reports missing artifacts only; generation or handoff refresh should be explicit.
- LOW Expected context or readiness artifact is missing (.wwg/workspace/context/project-context.md): This pass reports missing artifacts only; generation or handoff refresh should be explicit.
- LOW Expected context or readiness artifact is missing (.wwg/workspace/skills/skill-index.md): This pass reports missing artifacts only; generation or handoff refresh should be explicit.
- LOW Report policy drift (.gitignore): Add a narrow ignore rule for `.wwg/reports/backups/` or `.wwg/.gitignore` `reports/backups/`.
- LOW Changelog project memory is missing (CHANGELOG.md): Run `wwg changelog generate --target . --from-git --weekly --dry-run` before creating or applying changelog history.
- LOW README front door needs governance review (README.md): Run `wwg readme preview --target .` and `wwg readme route-docs --target . --dry-run`.
- INFO Skill Manifest is not generated (.wwg/config/skill-manifest.yaml): Run `wwg refresh-skills --target .` when governed project skill state should be refreshed.
- INFO Report policy drift: Run `wwg reports --target .` and review the Ambiguous / Needs Review section.
- INFO Ambiguous JSON reports need classification (.wwg/reports/adoption-regression-report.json): JSON reports are not promoted by default; classify as compatibility JSON, promoted JSON, routine generated JSON, transient JSON, or ambiguous JSON before committing policy decisions.

## Explicit Maintenance Review Findings

These findings were produced by the explicit `wwg maintain` review. They are recommendations, not automatic cleanup actions or audit/validate hard failures.

- generated-artifact-freshness: 4
- gitignore-policy-drift: 1
- naming-drift: 33
- regression-governance: 4
- report-policy-drift: 2
- truth-loop-drift: 2

## Recommended Create/Edit/Merge/Move/Rename/Archive/Ignore/Delete/Keep Actions

| Path | Category | Issue | Recommended Action | Risk | Can Apply Safely? | Needs User Confirmation? | Reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| .wwg/governance/regression-gaps.md | regression-governance | Critical or high regression governance gaps remain open | review | medium | no | yes | Review `.wwg/governance/regression-gaps.md` and convert safe report-first candidates into real tests or checklists as part of normal implementation work. |
| .wwg/workspace/testing/regression-candidate-review.md | regression-governance | Regression candidates need confirmation evidence | review | low | no | yes | Review `.wwg/workspace/testing/regression-candidate-review.md` and record explicit manual/process, executable, or waiver evidence in `.wwg/workspace/testing/manual-verification-evidence.json`. |
| .wwg/governance/rule-traceability.md | regression-governance | Regression traceability remains uncovered or unknown | review | low | no | yes | Review `.wwg/governance/rule-traceability.md` and map uncovered behavior to confirmed evidence. |
| .wwg/workspace/testing/proposed-executable-tests.md | regression-governance | Executable test proposals are missing for high-priority technical candidates | create | low | no | yes | Run `wwg maintain propose-tests --target .` to create reviewable draft proposals. Proposals are not coverage and are not applied automatically. |
| .wwg/governance/quality-gates.md | generated-artifact-freshness | Expected context or readiness artifact is missing | refresh | low | no | no | This pass reports missing artifacts only; generation or handoff refresh should be explicit. |
| .wwg/workspace/context/project-context.md | generated-artifact-freshness | Expected context or readiness artifact is missing | refresh | low | no | no | This pass reports missing artifacts only; generation or handoff refresh should be explicit. |
| .wwg/workspace/skills/skill-index.md | generated-artifact-freshness | Expected context or readiness artifact is missing | refresh | low | no | no | This pass reports missing artifacts only; generation or handoff refresh should be explicit. |
| .gitignore | gitignore-policy-drift | Report policy drift | review | low | no | yes | Add a narrow ignore rule for `.wwg/reports/backups/` or `.wwg/.gitignore` `reports/backups/`. |
| CHANGELOG.md | truth-loop-drift | Changelog project memory is missing | create | low | no | no | Run `wwg changelog generate --target . --from-git --weekly --dry-run` before creating or applying changelog history. |
| README.md | truth-loop-drift | README front door needs governance review | review | low | no | no | Run `wwg readme preview --target .` and `wwg readme route-docs --target . --dry-run`. |
| .wwg/config/skill-manifest.yaml | generated-artifact-freshness | Skill Manifest is not generated | refresh | low | no | no | Run `wwg refresh-skills --target .` when governed project skill state should be refreshed. |
| .wwg/reports/adoption-audit.md | naming-drift | Report filename has unclear purpose suffix | review | low | no | yes | Ambiguous report names should be indexed or renamed only through a deliberate report policy pass. |
| docs/ARCHITECTURE.md | naming-drift | WWG-owned file is not lowercase kebab-case | rename-candidate | medium | no | yes | Naming changes should be reviewed for links, registry references, generated markers, and historical context. |
| docs/BNPI_DESEC_CLOUDFLARE_TUNNEL_STATUS_20260629.md | naming-drift | WWG-owned file is not lowercase kebab-case | rename-candidate | medium | no | yes | Naming changes should be reviewed for links, registry references, generated markers, and historical context. |
| docs/CLOUDFLARE_TRYCLOUDFLARE_TUNNEL_RUNBOOK.md | naming-drift | WWG-owned file is not lowercase kebab-case | rename-candidate | medium | no | yes | Naming changes should be reviewed for links, registry references, generated markers, and historical context. |
| docs/DEV_CURRENT_GCP_VDI_PROOF_RESULT.md | naming-drift | WWG-owned file is not lowercase kebab-case | rename-candidate | medium | no | yes | Naming changes should be reviewed for links, registry references, generated markers, and historical context. |
| docs/DEVOPS_RUNBOOK.md | naming-drift | WWG-owned file is not lowercase kebab-case | rename-candidate | medium | no | yes | Naming changes should be reviewed for links, registry references, generated markers, and historical context. |
| docs/GAPS_AND_NEXT_GOALS.md | naming-drift | WWG-owned file is not lowercase kebab-case | rename-candidate | medium | no | yes | Naming changes should be reviewed for links, registry references, generated markers, and historical context. |
| docs/GITOPS_CLIENT_ENV_SCALING.md | naming-drift | WWG-owned file is not lowercase kebab-case | rename-candidate | medium | no | yes | Naming changes should be reviewed for links, registry references, generated markers, and historical context. |
| docs/GITOPS_GH_WATCH_RUNBOOK.md | naming-drift | WWG-owned file is not lowercase kebab-case | rename-candidate | medium | no | yes | Naming changes should be reviewed for links, registry references, generated markers, and historical context. |
| docs/HEALTHCHECKS.md | naming-drift | WWG-owned file is not lowercase kebab-case | rename-candidate | medium | no | yes | Naming changes should be reviewed for links, registry references, generated markers, and historical context. |
| docs/HYPERV_FINAL_ARTIFACT_AND_DAY2_REPAIR.md | naming-drift | WWG-owned file is not lowercase kebab-case | rename-candidate | medium | no | yes | Naming changes should be reviewed for links, registry references, generated markers, and historical context. |
| docs/HYPERV_LAN_PROOF_20260622.md | naming-drift | WWG-owned file is not lowercase kebab-case | rename-candidate | medium | no | yes | Naming changes should be reviewed for links, registry references, generated markers, and historical context. |
| docs/IMAGE_FORMATS.md | naming-drift | WWG-owned file is not lowercase kebab-case | rename-candidate | medium | no | yes | Naming changes should be reviewed for links, registry references, generated markers, and historical context. |
| docs/INSTALLER_TEST_REPORT.md | naming-drift | WWG-owned file is not lowercase kebab-case | rename-candidate | medium | no | yes | Naming changes should be reviewed for links, registry references, generated markers, and historical context. |
| docs/LOGIN_VISUAL_PROOF_SELF_LOOP_PROMPT.md | naming-drift | WWG-owned file is not lowercase kebab-case | rename-candidate | medium | no | yes | Naming changes should be reviewed for links, registry references, generated markers, and historical context. |
| docs/OBSERVABILITY_PROOF_20260622.md | naming-drift | WWG-owned file is not lowercase kebab-case | rename-candidate | medium | no | yes | Naming changes should be reviewed for links, registry references, generated markers, and historical context. |
| docs/OPERATIONS.md | naming-drift | WWG-owned file is not lowercase kebab-case | rename-candidate | medium | no | yes | Naming changes should be reviewed for links, registry references, generated markers, and historical context. |
| docs/OVERNIGHT_DEV_CURRENT_GCP_VDI_PROOF_PROMPT.md | naming-drift | WWG-owned file is not lowercase kebab-case | rename-candidate | medium | no | yes | Naming changes should be reviewed for links, registry references, generated markers, and historical context. |
| docs/OVERNIGHT_DEVICE_EVENT_BRIDGE_DRY_RUN_PROMPT.md | naming-drift | WWG-owned file is not lowercase kebab-case | rename-candidate | medium | no | yes | Naming changes should be reviewed for links, registry references, generated markers, and historical context. |
| docs/OVERNIGHT_HARDCUTOVER_MINIO_DRIFT_REPAIR_PROMPT.md | naming-drift | WWG-owned file is not lowercase kebab-case | rename-candidate | medium | no | yes | Naming changes should be reviewed for links, registry references, generated markers, and historical context. |
| docs/OVERNIGHT_HYPERV_HEALTH_PROOF_PROMPT.md | naming-drift | WWG-owned file is not lowercase kebab-case | rename-candidate | medium | no | yes | Naming changes should be reviewed for links, registry references, generated markers, and historical context. |
| docs/OVERNIGHT_SOURCE_INPUTS_GCP_IMAGE_DRY_RUN_PROMPT.md | naming-drift | WWG-owned file is not lowercase kebab-case | rename-candidate | medium | no | yes | Naming changes should be reviewed for links, registry references, generated markers, and historical context. |
| docs/OVERNIGHT_TERRAFORM_HYPERV_FRESH_REPO_PROMPT.md | naming-drift | WWG-owned file is not lowercase kebab-case | rename-candidate | medium | no | yes | Naming changes should be reviewed for links, registry references, generated markers, and historical context. |
| docs/OVERNIGHT_VIRTUALBOX_GCP_APPLIANCE_PROOF_PROMPT.md | naming-drift | WWG-owned file is not lowercase kebab-case | rename-candidate | medium | no | yes | Naming changes should be reviewed for links, registry references, generated markers, and historical context. |
| docs/OVERNIGHT_ZKTECO_PROJECT_TRUTH_BRIDGE_PROMPT.md | naming-drift | WWG-owned file is not lowercase kebab-case | rename-candidate | medium | no | yes | Naming changes should be reviewed for links, registry references, generated markers, and historical context. |
| docs/OVERNIGHT_ZKTECO_RUNTIME_TRUTH_PROMPT.md | naming-drift | WWG-owned file is not lowercase kebab-case | rename-candidate | medium | no | yes | Naming changes should be reviewed for links, registry references, generated markers, and historical context. |
| docs/SELF_HEALING_AND_DRIFT_RECOVERY.md | naming-drift | WWG-owned file is not lowercase kebab-case | rename-candidate | medium | no | yes | Naming changes should be reviewed for links, registry references, generated markers, and historical context. |
| docs/SHORTCUTS.md | naming-drift | WWG-owned file is not lowercase kebab-case | rename-candidate | medium | no | yes | Naming changes should be reviewed for links, registry references, generated markers, and historical context. |
| docs/TERRAFORM_HYPERV_ARCHITECTURE.md | naming-drift | WWG-owned file is not lowercase kebab-case | rename-candidate | medium | no | yes | Naming changes should be reviewed for links, registry references, generated markers, and historical context. |
| docs/USER_JOURNEY_PROOF.md | naming-drift | WWG-owned file is not lowercase kebab-case | rename-candidate | medium | no | yes | Naming changes should be reviewed for links, registry references, generated markers, and historical context. |
| docs/UZARO_CLOUDFLARE_CUTOVER_20260629.md | naming-drift | WWG-owned file is not lowercase kebab-case | rename-candidate | medium | no | yes | Naming changes should be reviewed for links, registry references, generated markers, and historical context. |
| docs/V3_GCP_HYPERV_STORAGE_PROOF_20260625.md | naming-drift | WWG-owned file is not lowercase kebab-case | rename-candidate | medium | no | yes | Naming changes should be reviewed for links, registry references, generated markers, and historical context. |
| docs/ZKTECO_RUNTIME_TRUTH.md | naming-drift | WWG-owned file is not lowercase kebab-case | rename-candidate | medium | no | yes | Naming changes should be reviewed for links, registry references, generated markers, and historical context. |
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

- LOW Report policy drift (.gitignore): Add a narrow ignore rule for `.wwg/reports/backups/` or `.wwg/.gitignore` `reports/backups/`.
- INFO Report policy drift: Run `wwg reports --target .` and review the Ambiguous / Needs Review section.
- INFO Ambiguous JSON reports need classification (.wwg/reports/adoption-regression-report.json): JSON reports are not promoted by default; classify as compatibility JSON, promoted JSON, routine generated JSON, transient JSON, or ambiguous JSON before committing policy decisions.

## Naming Drift

- INFO Report filename has unclear purpose suffix (.wwg/reports/adoption-audit.md): Ambiguous report names should be indexed or renamed only through a deliberate report policy pass.
- INFO WWG-owned file is not lowercase kebab-case (docs/ARCHITECTURE.md): Naming changes should be reviewed for links, registry references, generated markers, and historical context.
- INFO WWG-owned file is not lowercase kebab-case (docs/BNPI_DESEC_CLOUDFLARE_TUNNEL_STATUS_20260629.md): Naming changes should be reviewed for links, registry references, generated markers, and historical context.
- INFO WWG-owned file is not lowercase kebab-case (docs/CLOUDFLARE_TRYCLOUDFLARE_TUNNEL_RUNBOOK.md): Naming changes should be reviewed for links, registry references, generated markers, and historical context.
- INFO WWG-owned file is not lowercase kebab-case (docs/DEV_CURRENT_GCP_VDI_PROOF_RESULT.md): Naming changes should be reviewed for links, registry references, generated markers, and historical context.
- INFO WWG-owned file is not lowercase kebab-case (docs/DEVOPS_RUNBOOK.md): Naming changes should be reviewed for links, registry references, generated markers, and historical context.
- INFO WWG-owned file is not lowercase kebab-case (docs/GAPS_AND_NEXT_GOALS.md): Naming changes should be reviewed for links, registry references, generated markers, and historical context.
- INFO WWG-owned file is not lowercase kebab-case (docs/GITOPS_CLIENT_ENV_SCALING.md): Naming changes should be reviewed for links, registry references, generated markers, and historical context.
- INFO WWG-owned file is not lowercase kebab-case (docs/GITOPS_GH_WATCH_RUNBOOK.md): Naming changes should be reviewed for links, registry references, generated markers, and historical context.
- INFO WWG-owned file is not lowercase kebab-case (docs/HEALTHCHECKS.md): Naming changes should be reviewed for links, registry references, generated markers, and historical context.
- INFO WWG-owned file is not lowercase kebab-case (docs/HYPERV_FINAL_ARTIFACT_AND_DAY2_REPAIR.md): Naming changes should be reviewed for links, registry references, generated markers, and historical context.
- INFO WWG-owned file is not lowercase kebab-case (docs/HYPERV_LAN_PROOF_20260622.md): Naming changes should be reviewed for links, registry references, generated markers, and historical context.
- INFO WWG-owned file is not lowercase kebab-case (docs/IMAGE_FORMATS.md): Naming changes should be reviewed for links, registry references, generated markers, and historical context.
- INFO WWG-owned file is not lowercase kebab-case (docs/INSTALLER_TEST_REPORT.md): Naming changes should be reviewed for links, registry references, generated markers, and historical context.
- INFO WWG-owned file is not lowercase kebab-case (docs/LOGIN_VISUAL_PROOF_SELF_LOOP_PROMPT.md): Naming changes should be reviewed for links, registry references, generated markers, and historical context.
- INFO WWG-owned file is not lowercase kebab-case (docs/OBSERVABILITY_PROOF_20260622.md): Naming changes should be reviewed for links, registry references, generated markers, and historical context.
- INFO WWG-owned file is not lowercase kebab-case (docs/OPERATIONS.md): Naming changes should be reviewed for links, registry references, generated markers, and historical context.
- INFO WWG-owned file is not lowercase kebab-case (docs/OVERNIGHT_DEV_CURRENT_GCP_VDI_PROOF_PROMPT.md): Naming changes should be reviewed for links, registry references, generated markers, and historical context.
- INFO WWG-owned file is not lowercase kebab-case (docs/OVERNIGHT_DEVICE_EVENT_BRIDGE_DRY_RUN_PROMPT.md): Naming changes should be reviewed for links, registry references, generated markers, and historical context.
- INFO WWG-owned file is not lowercase kebab-case (docs/OVERNIGHT_HARDCUTOVER_MINIO_DRIFT_REPAIR_PROMPT.md): Naming changes should be reviewed for links, registry references, generated markers, and historical context.
- ... 13 more.

## Context and Skill Freshness

- LOW Expected context or readiness artifact is missing (.wwg/governance/quality-gates.md): This pass reports missing artifacts only; generation or handoff refresh should be explicit.
- LOW Expected context or readiness artifact is missing (.wwg/workspace/context/project-context.md): This pass reports missing artifacts only; generation or handoff refresh should be explicit.
- LOW Expected context or readiness artifact is missing (.wwg/workspace/skills/skill-index.md): This pass reports missing artifacts only; generation or handoff refresh should be explicit.
- INFO Skill Manifest is not generated (.wwg/config/skill-manifest.yaml): Run `wwg refresh-skills --target .` when governed project skill state should be refreshed.

## Governed Skill State

- Skill manifest: not present
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
- Preserved protected: 0
- Reference-only: 6
- Already clean: 5
- Manual review required: 0
- Preserve required: 0
- Needs manual review: 0
- Already reference-only: 6
- Not applicable: 5
- Recommendation: Cleanup is not required now.
- Apply mode: available through explicit `--apply-skill-cleanup`.

## Principle and Truth Loop Review

- LOW Changelog project memory is missing (CHANGELOG.md): Run `wwg changelog generate --target . --from-git --weekly --dry-run` before creating or applying changelog history.
- LOW README front door needs governance review (README.md): Run `wwg readme preview --target .` and `wwg readme route-docs --target . --dry-run`.

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
- [ ] Recommendation Registry present (missing)
  - Agent action: Complete the missing WWG-owned structure before relying on the project as agent-ready.
  - CLI support: `wwg generate-governance`
  - Evidence: `.wwg/governance/recommendation-registry.md`
- [x] Reports directory present (present)
  - Evidence: `.wwg/reports`
- [x] Root AGENTS.md present (present)
  - Evidence: `AGENTS.md`
- [ ] Test enforcement governance present (missing)
  - Agent action: Complete the missing WWG-owned structure before relying on the project as agent-ready.
  - CLI support: `wwg generate-governance`
  - Evidence: `.wwg/governance/test-enforcement.md`
- [ ] Regression guardrail governance present (missing)
  - Agent action: Complete the missing WWG-owned structure before relying on the project as agent-ready.
  - CLI support: `wwg generate-governance`
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
- [ ] Infrastructure readiness not checked (available)
  - Reason: Build, deploy, env, or infrastructure indicators were detected.
  - Agent action: Inspect infrastructure readiness before deployment-related work.
  - CLI support: `wwg infra check`
  - Evidence: `.env.example`, `.github/workflows`
- [ ] GitHub publishing readiness not checked (available)
  - Reason: Git or GitHub context exists.
  - Agent action: Do not publish without explicit approval; review readiness and secret safety first.
  - CLI support: `wwg publish github --dry-run`
  - Evidence: `.git`, `.github`, `package.json repository`
- [ ] Current version, optional candidate review (available)
  - Reason: Workspace is current. Optional semantic/candidate review artifacts exist; run only if adopting candidate surfaces.
  - Agent action: Treat candidate/review artifacts as optional review surfaces unless the user asks to promote them.
  - CLI support: `wwg audit --upgrade-candidates`
  - Evidence: `.wwg/reports/generated-project-upgrade-review.md`

### Recommended Next

- [ ] Complete Must Have readiness first (available)
  - Reason: 3 Must Have item(s) are missing.
  - Agent action: Do not treat Other Features as blockers until Must Have readiness is clear.
  - CLI support: `wwg maintain`

Agents should follow Must Have items first. Missing Other Features are not blockers unless the current task depends on them.

## Regression Governance Readiness

- Regression baseline: present
- CI readiness: partial
- Open regression gaps: 2 (1 critical, 0 high)
- Traceability: 0 covered, 6 partial, 0 uncovered, 1 unknown
- Safe report-first candidates: 14 (not counted as coverage)
- Regression candidates: 14 total, 14 proposed, 0 confirmed, 0 waived
- Manual evidence confirmed: 0
- Executable evidence detected: 2651
- Candidate-only evidence: 14
- Proposed executable tests: 0 (0 eligible to apply, 0 blocked/unsafe)
- Recommended action: Run `wwg maintain propose-tests --target .` to create reviewable executable test proposals for safe technical candidates; proposals are drafts, not coverage.
- Warnings: 2 open regression gap(s) remain.; Some behavior traceability remains uncovered or unknown.

## Recommendation Registry Review

- Registry found: No
- Policy found: No
- Suggested action: run or re-run governance generation to restore `.wwg/governance/recommendation-registry.md`.

## Follow-Up Modes

- Update truth/governance now
- Create a cleanup prompt
- Archive/move only after approval
- Ignore as intentional
- Convert into a principle/governance rule

## Suggested Next Actions

- Run `wwg maintain propose-tests --target .` to create reviewable executable test proposals for safe technical candidates; proposals are drafts, not coverage.
- Review medium-or-higher findings before treating the project as freshly maintained.
- Review `.wwg/reports/skill-cleanup-review.md` before applying legacy copied compatibility-domain cleanup.
- Keep all archive, move, rename, delete, and merge recommendations manual unless a dedicated explicit apply flag exists for that workflow.
- Run `wwg reports --target .` before any report archive or promotion work.
- Run `wwg brief --target .` if generic or compatibility agent brief readiness is missing.
- Refresh Workspace/Governance outputs only through explicit generation or refresh commands.

## WWG Truth Synchronization

- Task mode: generated maintenance review report.
- New truth detected: no; this report records maintenance findings and suggested follow-up actions only.
- Wiki updated: no.
- Workspace updated: no.
- Governance review completed: yes; report contract reviewed during 2026-07-01 validation repair.
- Drift status: low; historical generated report needed required truth-sync fields.
- Canonical files changed:
  - `.wwg/reports/wwg-maintenance-review.md`
- Implementation discoveries synced:
  - None; no implementation changes were made by this report.
- Remaining stale context:
  - This report remains maintenance-review evidence. Current runtime truth is governed by `.wwg/wiki/project-truth.md`, `.wwg/wiki/project-truth-summary.md`, `.wwg/workspace/current-task.md`, and newer runtime reports.
