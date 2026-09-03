# WWG Upgrade Plan

## Summary

Dry-run completed without changing target files except reports.

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
- [ ] Source index missing (missing)
  - Reason: Source references exist, but no generated source index was detected.
  - Agent action: Review the source registry/index before relying on external truth.
  - CLI support: `wwg sources index`
  - Evidence: `.wwg/wiki/01-sources/source-index.md`, `.wwg/wiki/01-sources/source-index.json`, `wiki/01-sources/source-index.md`, `wiki/01-sources/source-index.json`
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
  - Reason: 2 Must Have item(s) are missing.
  - Agent action: Do not treat Other Features as blockers until Must Have readiness is clear.
  - CLI support: `wwg maintain`

Agents should follow Must Have items first. Missing Other Features are not blockers unless the current task depends on them.

## Command

`wwg upgrade --dry-run`

## Target

.

## Report Writing

- Target path: .
- Reports are written under target: true
- Markdown report: .wwg/reports/wwg-upgrade-plan.md
- JSON report: .wwg/reports/wwg-upgrade-plan.json

## Current Version

0.6.6

## Target Version

0.6.6

## Migration Chain

- No migration needed.

## Migration Discovery

- Latest installed template version source: package.json version (0.6.6)
- Supported starting versions: 0.1.0, 0.6.0, 0.6.1, 0.6.2, 0.6.3, 0.6.4, 0.6.5
- Missing migration edge: none

## Chain Classification

- None.

## Upgrade Path Classification

- no-op

## Operations Planned

- None.

## Files That Would Be Created

- None.

## Files That Would Be Updated

- None.

## Files That Would Be Skipped

- None.

## Files Created

- None.

## Files Updated

- None.

## Files Skipped

- None.

## Files Changed

- None.

## Metadata Updated

- None.

## Unsupported Operations

- None.

## Risks / Approval-Gated Items

- No version change required.
- TEMPLATE_MANIFEST.yaml version 0.6.4 differs from package.json version 0.6.6; package.json is the installed template version source of truth.

## Backups That Would Be Created

- None.

## Backups Created

- None.

## Registry Update Behavior

Registry/template metadata would be updated on apply: false

## Migration History Behavior

Upgrade/migration receipt history would be written on apply: true

## Candidate Workflow Recommendations

- Run `wwg audit --upgrade-candidates` to generate review-only compact-surface candidates and merge guidance.
- Apply missing reviewed compact surfaces only with `wwg upgrade --apply-safe-adds`.
- Apply generated marker updates only with `wwg upgrade --apply-generated-sections`.
- Do not use upgrade apply to rewrite Project Truth, Terminology, Drift Guard, accepted decisions, project-specific principles, changelog history, or `.vorter/` runtime evidence.

## Candidate Surfaces Detected

- .wwg/wiki/project-truth-summary.md: present; review before semantic update
- .wwg/wiki/terminology-summary.md: missing; candidate review recommended
- .wwg/workspace/context/project-context.md: missing; candidate review recommended
- .wwg/governance/drift-guard.md: present; review before semantic update
- AGENTS.md: present; review before semantic update

## Candidate Surfaces Not Applied

- .wwg/wiki/project-truth-summary.md: present; review before semantic update
- .wwg/wiki/terminology-summary.md: missing; candidate review recommended
- .wwg/workspace/context/project-context.md: missing; candidate review recommended
- .wwg/governance/drift-guard.md: present; review before semantic update
- AGENTS.md: present; review before semantic update

## Never-Overwrite Protections

- .wwg/wiki/project-truth.md
- .wwg/wiki/terminology.md
- .wwg/governance/drift-guard.md
- .wwg/wiki/04-decisions/**
- .wwg/wiki/principles/**
- AGENTS.md human-authored content outside WWG_GENERATED markers
- CHANGELOG.md project history
- .vorter/** runtime evidence

## Agent Handoff

Agent Handoff required: false

## Rollback Guidance

Automatic rollback is not implemented in Phase 2F.

Backups were written to:
- reports/backups/... when apply modifies existing files

To rollback manually:
1. Review the upgrade report.
2. Restore affected files from backups.
3. Restore `wwg.project.yaml` from its backup.
4. Re-run `wwg validate`.
5. Re-run `wwg audit`.

## Recommended Next Command

- `wwg upgrade --to 0.6.6 --apply`

## WWG Truth Synchronization

- Task mode: upgrade dry run
- New truth detected: NO
- Wiki updated: NO / N/A
- Workspace updated: NO
- Governance review completed: YES
- Drift status: LOW
- Canonical files changed:
  - None; upgrade and migration reports are generated command evidence, not canonical Wiki Truth.
- Implementation discoveries synced:
  - None; migration candidate surfaces remain review-only.
- Remaining stale context:
  - Review candidate surfaces before any semantic truth promotion.
- Generated By: WWG
- Generated At: 2026-07-17T00:39:46.562Z
- Canonical Truth Impact: none; report evidence does not rewrite `.wwg/wiki`.
- Requires Review: review findings or candidates before promoting any semantic truth.
- Vorter runtime evidence accepted as WWG truth: NO

